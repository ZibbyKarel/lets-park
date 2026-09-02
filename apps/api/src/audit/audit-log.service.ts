/**
 * The append-only audit trail.
 *
 * Every admin action and every mutation that changes who may park where writes
 * one row here. That matters most for the operations that leave **no trace in
 * the data**: cancelling a reservation is a hard delete (`doc/decision/0027-*`),
 * so without an entry the row simply stops existing and nobody can say who
 * removed it or when.
 *
 * ## Append-only is enforced below this class, not by it
 *
 * There is deliberately no `update` and no `delete` here, but that is a
 * convenience, not the guarantee: two database triggers created by the init
 * migration reject `UPDATE`, `DELETE` and `TRUNCATE` against `AuditLog`
 * (`doc/decision/0027-*`). A service method is a rule anybody can route around
 * with `prisma.client.auditLog.deleteMany`; the trigger is not. What this class
 * owns is the *shape* of what goes in.
 *
 * ## Why `record` takes the client
 *
 * Task 13 writes its audit entries **inside** the interactive transaction that
 * cancels a reservation and promotes the next person in the queue: if the
 * transaction rolls back, the entry claiming it happened must roll back with it.
 * So the write runs on whatever client the caller is holding — the request-scoped
 * `PrismaService.client` by default, or a `Prisma.TransactionClient` when there
 * is one. That is why `record` is not simply `this.prisma.client.auditLog.create`.
 */

import { Injectable } from '@nestjs/common';
import type { AuditLogAction } from '@lets-park/contract';
import type { Prisma, PrismaClient } from '@lets-park/database';
import { PrismaService } from '../database/prisma.service';

/**
 * The subset of a Prisma client an audit write needs.
 *
 * Structural rather than nominal so that both `PrismaClient` and the
 * `Prisma.TransactionClient` handed to `$transaction`'s callback satisfy it,
 * without this module having to name the transaction type.
 */
export type AuditLogWriter = Pick<PrismaClient, 'auditLog'>;

/**
 * Entity kinds that can be audited. Narrower than the contract's
 * `entityType: z.string().min(1)` on purpose: a typo in a free string would
 * silently split one entity's history into two, and nothing would fail.
 */
export const AUDIT_ENTITY_TYPES = [
  'Reservation',
  'WaitlistEntry',
  'User',
  'ParkingSpot',
  'ReservationWindowSettings',
] as const;

export type AuditEntityType = (typeof AUDIT_ENTITY_TYPES)[number];

export interface AuditEntry {
  /**
   * Who performed the action. A system action (waitlist auto-promotion) is
   * attributed to the user whose request triggered it — the audit log has a
   * non-null FK to `User` and there is no "system" row to point at.
   */
  actorUserId: string;
  action: AuditLogAction;
  entityType: AuditEntityType;
  entityId: string;
  /**
   * Free-form detail; its shape depends on `action`. Keep it to what the row
   * cannot recover on its own — the before/after of a changed field, the day a
   * deleted reservation was for.
   *
   * Typed as Prisma's JSON **input** object rather than the contract's
   * `Record<string, unknown>`: the column is `JSONB`, and a value that cannot be
   * serialised (a `Date`, a class instance, `undefined`) has no representation
   * in it. `Record<string, unknown>` would accept all three and fail at runtime.
   * Reading the log back still yields the contract's shape.
   */
  payload: Prisma.InputJsonObject;
}

@Injectable()
export class AuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Appends one entry.
   *
   * @param entry  what happened
   * @param writer the client to write through; defaults to the request's own.
   *               Pass the transaction client to make the entry share the fate
   *               of the change it describes.
   */
  async record(entry: AuditEntry, writer: AuditLogWriter = this.prisma.client): Promise<void> {
    await writer.auditLog.create({
      data: {
        actorUserId: entry.actorUserId,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        payload: entry.payload,
      },
    });
  }
}
