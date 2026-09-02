import { AuditLogService } from './audit-log.service';
import { PrismaDouble } from '../testing/prisma-double';

describe('AuditLogService', () => {
  let double: PrismaDouble;
  let audit: AuditLogService;

  beforeEach(() => {
    double = new PrismaDouble();
    audit = new AuditLogService(double.asPrismaService());
  });

  it('appends the entry it was given, field for field', async () => {
    await audit.record({
      actorUserId: 'actor-1',
      action: 'SPOT_UPDATED',
      entityType: 'ParkingSpot',
      entityId: 'spot-1',
      payload: { change: 'created', label: 'E2.92' },
    });

    expect(double.auditLogs).toHaveLength(1);
    expect(double.auditLogs[0]).toMatchObject({
      actorUserId: 'actor-1',
      action: 'SPOT_UPDATED',
      entityType: 'ParkingSpot',
      entityId: 'spot-1',
      payload: { change: 'created', label: 'E2.92' },
    });
  });

  it('appends rather than replaces — the log is a history, not a latest-value', async () => {
    await audit.record({
      actorUserId: 'actor-1',
      action: 'USER_UPDATED',
      entityType: 'User',
      entityId: 'user-1',
      payload: { step: 1 },
    });
    await audit.record({
      actorUserId: 'actor-1',
      action: 'USER_UPDATED',
      entityType: 'User',
      entityId: 'user-1',
      payload: { step: 2 },
    });

    expect(double.auditLogs.map((row) => row.payload)).toEqual([{ step: 1 }, { step: 2 }]);
  });

  it('writes through the client it is handed, so a caller in a transaction stays in it', async () => {
    // Task 13 passes the `$transaction` client so the entry rolls back with the
    // change it describes. Modelled here as a second, separate store: if `record`
    // ignored its `writer` argument the row would land in the default one.
    const transaction = new PrismaDouble();

    await audit.record(
      {
        actorUserId: 'actor-1',
        action: 'RESERVATION_CANCELLED',
        entityType: 'Reservation',
        entityId: 'reservation-1',
        payload: {},
      },
      transaction.asPrismaService().client
    );

    expect(transaction.auditLogs).toHaveLength(1);
    expect(double.auditLogs).toHaveLength(0);
  });

  it('exposes no way to change or remove an entry', () => {
    // The real guarantee is a pair of database triggers (`doc/decision/0027-*`);
    // this only pins that the service does not offer a shortcut past them.
    const methods = Object.getOwnPropertyNames(AuditLogService.prototype).filter(
      (name) => name !== 'constructor'
    );

    expect(methods).toEqual(['record', 'recordMany']);
  });
});
