/**
 * Parking spots: one read for everybody, three mutations for admins.
 *
 * The rule that shapes this whole file is that **a spot is never deleted**.
 * `Reservation` and `WaitlistEntry` reference it with `ON DELETE RESTRICT`, and
 * `AuditLog` entries name it by id, so retiring one is `active: false`
 * (`doc/decision/0027-*`). Everything else follows from that: `spot.list`
 * filters on `active`, and `deactivate` has to refuse while the spot still holds
 * reservations somebody is counting on.
 */

import { Injectable } from '@nestjs/common';
import type {
  AdminListSpotsInput,
  CreateSpotInput,
  DeactivateSpotInput,
  ParkingSpot,
  UpdateSpotInput,
} from '@lets-park/contract';
import type { ParkingSpot as ParkingSpotRow, Prisma } from '@lets-park/database';
import type { DateOnly } from '@lets-park/shared-types';
import { todayInPrague } from '@lets-park/shared-types';
import { AuditLogService } from '../audit/audit-log.service';
import { DomainError } from '../common/errors/domain-error';
import { toContractSpot, toDateColumn } from '../common/prisma-mapping';
import { PrismaService } from '../database/prisma.service';

/**
 * A stable order for every listing: group first (the `IT` block is a real,
 * physically separate part of the lot), then the painted label.
 *
 * Stable ordering is not cosmetic here — the day overview renders spots as a
 * grid, and a grid whose cells move between two reads of the same day is
 * unusable.
 */
const SPOT_ORDER: Prisma.ParkingSpotOrderByWithRelationInput[] = [
  { group: 'asc' },
  { label: 'asc' },
];

@Injectable()
export class SpotsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService
  ) {}

  /** Active spots only. What the preferred-spot picker and the day grid read. */
  async listActive(): Promise<ParkingSpot[]> {
    const rows = await this.prisma.client.parkingSpot.findMany({
      where: { active: true },
      orderBy: SPOT_ORDER,
    });
    return rows.map(toContractSpot);
  }

  /** The admin table: optionally including retired spots, optionally one group. */
  async adminList(input: AdminListSpotsInput): Promise<ParkingSpot[]> {
    const rows = await this.prisma.client.parkingSpot.findMany({
      where: {
        ...(input.includeInactive ? {} : { active: true }),
        ...(input.group === undefined ? {} : { group: input.group }),
      },
      orderBy: SPOT_ORDER,
    });
    return rows.map(toContractSpot);
  }

  /**
   * Adds a spot.
   *
   * A duplicate `label` is left to the unique index rather than pre-checked: a
   * read-then-write would still lose a race against a concurrent create, and the
   * constraint is what actually decides. P2002 arrives at the client as
   * `CONFLICT` through `toOrpcError`.
   */
  async create(input: CreateSpotInput, actorUserId: string): Promise<ParkingSpot> {
    const row = await this.prisma.client.parkingSpot.create({
      data: { label: input.label, group: input.group },
    });

    await this.audit.record({
      actorUserId,
      action: 'SPOT_UPDATED',
      entityType: 'ParkingSpot',
      entityId: row.id,
      payload: { change: 'created', label: row.label, group: row.group },
    });

    return toContractSpot(row);
  }

  /**
   * Changes a spot's label, group or activity.
   *
   * Deactivating through here is the same operation as {@link deactivate} and is
   * held to the same rule — otherwise `update({ active: false })` would be a way
   * around the check, which is how a spot ends up retired with people still
   * holding reservations for it.
   */
  async update(input: UpdateSpotInput, actorUserId: string): Promise<ParkingSpot> {
    const { id, ...changes } = input;
    const existing = await this.requireSpot(id);

    if (changes.active === false && existing.active) {
      await this.requireNoFutureReservations(id);
    }

    // Spread the present fields only. `exactOptionalPropertyTypes` is on, so
    // `{ label: undefined }` is a different type from `{}` — and to Prisma it
    // would also be a different statement.
    const data: Prisma.ParkingSpotUpdateInput = {
      ...(changes.label === undefined ? {} : { label: changes.label }),
      ...(changes.group === undefined ? {} : { group: changes.group }),
      ...(changes.active === undefined ? {} : { active: changes.active }),
    };
    const row = await this.prisma.client.parkingSpot.update({ where: { id }, data });

    await this.audit.record({
      actorUserId,
      action: 'SPOT_UPDATED',
      entityType: 'ParkingSpot',
      entityId: row.id,
      payload: {
        change: 'updated',
        before: { label: existing.label, group: existing.group, active: existing.active },
        after: { label: row.label, group: row.group, active: row.active },
      },
    });

    return toContractSpot(row);
  }

  /**
   * Retires a spot.
   *
   * Idempotent: a spot that is already inactive comes back unchanged and writes
   * no audit entry, because nothing happened. Auditing a no-op would put noise
   * into the one table that is supposed to answer "what actually changed".
   */
  async deactivate(input: DeactivateSpotInput, actorUserId: string): Promise<ParkingSpot> {
    const existing = await this.requireSpot(input.id);
    if (!existing.active) {
      return toContractSpot(existing);
    }

    await this.requireNoFutureReservations(input.id);

    const row = await this.prisma.client.parkingSpot.update({
      where: { id: input.id },
      data: { active: false },
    });

    await this.audit.record({
      actorUserId,
      action: 'SPOT_UPDATED',
      entityType: 'ParkingSpot',
      entityId: row.id,
      payload: { change: 'deactivated', label: row.label },
    });

    return toContractSpot(row);
  }

  private async requireSpot(id: string): Promise<ParkingSpotRow> {
    const spot = await this.prisma.client.parkingSpot.findUnique({ where: { id } });
    if (spot === null) {
      throw new DomainError('NOT_FOUND', { message: 'No such parking spot.' });
    }
    return spot;
  }

  /**
   * Refuses while somebody still holds this spot for today or a later day.
   *
   * "Today" is a Europe/Prague calendar day, and the comparison is `>=` rather
   * than `>`: a reservation for *today* is one somebody has already parked on.
   * Silently retiring the spot under them would leave them believing they have a
   * place — which is why this is a `CONFLICT` the admin has to resolve first,
   * not a warning.
   */
  private async requireNoFutureReservations(spotId: string, today?: DateOnly): Promise<void> {
    const from = toDateColumn(today ?? todayInPrague());
    const blocking = await this.prisma.client.reservation.count({
      where: { parkingSpotId: spotId, date: { gte: from } },
    });

    if (blocking > 0) {
      throw new DomainError('CONFLICT', {
        message: 'The spot still has reservations from today onwards.',
        details: { reservations: blocking },
      });
    }
  }
}
