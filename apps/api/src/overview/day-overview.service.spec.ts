import type { AuthenticatedUser } from '../auth/authenticated-user';
import { AuditLogService } from '../audit/audit-log.service';
import { PrismaDouble } from '../testing/prisma-double';
import { ReservationWindowService } from '../reservation-window/reservation-window.service';
import { SpotsService } from '../spots/spots.service';
import { DayOverviewService } from './day-overview.service';

/** 2026-09-02 is a Wednesday; 2026-09-05 a Saturday; 2026-09-28 a Czech holiday. */
const TODAY = '2026-09-02';

function authenticated(id: string, role: AuthenticatedUser['role'] = 'USER'): AuthenticatedUser {
  return { id, oktaId: `okta-${id}`, email: `${id}@example.test`, name: id, role, active: true };
}

describe('DayOverviewService', () => {
  let double: PrismaDouble;
  let overview: DayOverviewService;

  beforeEach(() => {
    double = new PrismaDouble();
    const prisma = double.asPrismaService();
    const audit = new AuditLogService(prisma);
    overview = new DayOverviewService(
      prisma,
      new SpotsService(prisma, audit),
      new ReservationWindowService(prisma, audit)
    );
    double.seedWindowSettings({ openDaysBefore: 7, lockMode: 'AUTO' });
  });

  it('returns every active spot, in the same order as the spot listing', async () => {
    double.seedSpot({ label: 'S1', group: 'SHARED' });
    double.seedSpot({ label: 'IT1', group: 'IT' });
    double.seedSpot({ label: 'GONE', active: false });

    const result = await overview.getDay({ date: TODAY }, authenticated('viewer'), TODAY);

    expect(result.spots.map((row) => row.spot.label)).toEqual(['IT1', 'S1']);
  });

  it('attaches the holder of each reserved spot, and nothing else about them', async () => {
    const spot = double.seedSpot({ label: 'A1' });
    const holder = double.seedUser({ name: 'Alice', licensePlate: '1AB 2345' });
    double.seedReservation({ parkingSpotId: spot.id, userId: holder.id, date: TODAY });

    const result = await overview.getDay({ date: TODAY }, authenticated('viewer'), TODAY);

    expect(result.spots[0]?.reservation).toMatchObject({
      user: { id: holder.id, name: 'Alice', licensePlate: '1AB 2345' },
    });
    // Everything else about the holder — above all the ICS token — stays here.
    expect(JSON.stringify(result)).not.toContain(holder.icsToken);
    expect(JSON.stringify(result)).not.toContain(holder.email);
  });

  it('leaves a free spot’s reservation null', async () => {
    double.seedSpot({ label: 'A1' });

    const result = await overview.getDay({ date: TODAY }, authenticated('viewer'), TODAY);

    expect(result.spots[0]?.reservation).toBeNull();
  });

  it('reads a reservation only for the day it was asked about', async () => {
    const spot = double.seedSpot({ label: 'A1' });
    const holder = double.seedUser();
    double.seedReservation({ parkingSpotId: spot.id, userId: holder.id, date: '2026-09-03' });

    const result = await overview.getDay({ date: TODAY }, authenticated('viewer'), TODAY);

    expect(result.spots[0]?.reservation).toBeNull();
  });

  describe('the queue', () => {
    it('counts everybody waiting for a spot on that day', async () => {
      const spot = double.seedSpot({ label: 'A1' });
      const other = double.seedSpot({ label: 'A2' });
      const [a, b, c] = [double.seedUser(), double.seedUser(), double.seedUser()];
      double.seedWaitlistEntry({ parkingSpotId: spot.id, userId: a.id, date: TODAY });
      double.seedWaitlistEntry({ parkingSpotId: spot.id, userId: b.id, date: TODAY });
      double.seedWaitlistEntry({ parkingSpotId: other.id, userId: c.id, date: TODAY });

      const result = await overview.getDay({ date: TODAY }, authenticated('viewer'), TODAY);

      expect(result.spots.map((row) => row.waitlistCount)).toEqual([2, 1]);
    });

    it('reports the viewer’s own entry and their 1-based position', async () => {
      const spot = double.seedSpot({ label: 'A1' });
      const first = double.seedUser();
      const viewer = double.seedUser();
      double.seedWaitlistEntry({
        parkingSpotId: spot.id,
        userId: first.id,
        date: TODAY,
        createdAt: new Date('2026-08-01T08:00:00.000Z'),
      });
      const mine = double.seedWaitlistEntry({
        parkingSpotId: spot.id,
        userId: viewer.id,
        date: TODAY,
        createdAt: new Date('2026-08-01T09:00:00.000Z'),
      });

      const result = await overview.getDay({ date: TODAY }, authenticated(viewer.id), TODAY);

      expect(result.spots[0]).toMatchObject({
        waitlistCount: 2,
        viewerWaitlistEntryId: mine.id,
        viewerWaitlistPosition: 2,
      });
    });

    it('orders the queue by createdAt with id as the tiebreaker, like Task 13 promotes', async () => {
      const spot = double.seedSpot({ label: 'A1' });
      const viewer = double.seedUser();
      const sameInstant = new Date('2026-08-01T08:00:00.000Z');
      double.seedWaitlistEntry({
        id: 'aaaaaaaa-0000-4000-8000-000000000000',
        parkingSpotId: spot.id,
        userId: double.seedUser().id,
        date: TODAY,
        createdAt: sameInstant,
      });
      double.seedWaitlistEntry({
        id: 'bbbbbbbb-0000-4000-8000-000000000000',
        parkingSpotId: spot.id,
        userId: viewer.id,
        date: TODAY,
        createdAt: sameInstant,
      });

      const result = await overview.getDay({ date: TODAY }, authenticated(viewer.id), TODAY);

      expect(result.spots[0]?.viewerWaitlistPosition).toBe(2);
    });

    it('reports null for a viewer who is not queued', async () => {
      const spot = double.seedSpot({ label: 'A1' });
      double.seedWaitlistEntry({
        parkingSpotId: spot.id,
        userId: double.seedUser().id,
        date: TODAY,
      });

      const result = await overview.getDay({ date: TODAY }, authenticated('outsider'), TODAY);

      expect(result.spots[0]).toMatchObject({
        viewerWaitlistEntryId: null,
        viewerWaitlistPosition: null,
      });
    });
  });

  it('names the viewer’s own reservation for that day', async () => {
    const spot = double.seedSpot({ label: 'A1' });
    const viewer = double.seedUser();
    const reservation = double.seedReservation({
      parkingSpotId: spot.id,
      userId: viewer.id,
      date: TODAY,
    });

    const result = await overview.getDay({ date: TODAY }, authenticated(viewer.id), TODAY);

    expect(result.viewerReservationId).toBe(reservation.id);
  });

  describe('the reservation window travels with the payload', () => {
    it('describes the month the requested day falls in', async () => {
      const result = await overview.getDay({ date: '2026-10-15' }, authenticated('v'), TODAY);

      expect(result.window).toMatchObject({
        month: '2026-10',
        state: 'NOT_YET_OPEN',
        lockMode: 'AUTO',
      });
    });

    it('is read under the stored settings, not under the defaults', async () => {
      double.seedWindowSettings({ openDaysBefore: 7, lockMode: 'FORCE_OPEN' });

      const result = await overview.getDay({ date: '2026-12-15' }, authenticated('v'), TODAY);

      expect(result.window.state).toBe('OPEN');
    });
  });

  describe('canReserve', () => {
    it('is false for a day in the past, admin included', async () => {
      await expect(
        overview.getDay({ date: '2026-09-01' }, authenticated('a', 'ADMIN'), TODAY)
      ).resolves.toMatchObject({ canReserve: false });
    });

    it('is false at the weekend', async () => {
      await expect(
        overview.getDay({ date: '2026-09-05' }, authenticated('a', 'ADMIN'), TODAY)
      ).resolves.toMatchObject({ canReserve: false });
    });

    it('is false on a Czech public holiday', async () => {
      // 2026-09-28 — St Wenceslas Day, a Monday.
      await expect(
        overview.getDay({ date: '2026-09-28' }, authenticated('a', 'ADMIN'), TODAY)
      ).resolves.toMatchObject({ canReserve: false });
    });

    it('is true for an admin on a locked business day — the window does not bind them', async () => {
      double.seedWindowSettings({ openDaysBefore: 7, lockMode: 'FORCE_LOCKED' });

      const result = await overview.getDay(
        { date: '2026-10-15' },
        authenticated('a', 'ADMIN'),
        TODAY
      );

      expect(result.window.state).toBe('LOCKED');
      expect(result.canReserve).toBe(true);
    });

    it('is false for an ordinary user when the month is not open', async () => {
      const result = await overview.getDay({ date: '2026-10-15' }, authenticated('u'), TODAY);

      expect(result.window.state).toBe('NOT_YET_OPEN');
      expect(result.canReserve).toBe(false);
    });

    it('is true for an ordinary user when the month is open', async () => {
      double.seedWindowSettings({ openDaysBefore: 40, lockMode: 'AUTO' });

      const result = await overview.getDay({ date: '2026-10-15' }, authenticated('u'), TODAY);

      expect(result.window.state).toBe('OPEN');
      expect(result.canReserve).toBe(true);
    });

    it('does not fold in the one-per-day rule — the screen reads that from viewerReservationId', async () => {
      double.seedWindowSettings({ openDaysBefore: 40, lockMode: 'AUTO' });
      const spot = double.seedSpot({ label: 'A1' });
      const viewer = double.seedUser();
      double.seedReservation({
        parkingSpotId: spot.id,
        userId: viewer.id,
        date: '2026-10-15',
      });

      const result = await overview.getDay({ date: '2026-10-15' }, authenticated(viewer.id), TODAY);

      expect(result.canReserve).toBe(true);
      expect(result.viewerReservationId).not.toBeNull();
    });
  });
});
