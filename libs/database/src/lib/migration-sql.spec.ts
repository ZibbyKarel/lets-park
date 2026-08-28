/**
 * The init migration is the only artefact that states the constraints the
 * reservation flow depends on, and it cannot be regenerated from
 * `schema.prisma` alone — the singleton CHECK, the range CHECK and the
 * append-only trigger are hand-written on the end of it.
 *
 * Without a database these can still be asserted as SQL: what follows is not a
 * test of the schema file's prose but of the exact DDL that will be executed.
 * Every constraint the brief lists appears here by name.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS_DIR = join(__dirname, '..', '..', 'prisma', 'migrations');

function readInitMigration(): string {
  const directories = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const initDirectory = directories[0];
  if (initDirectory === undefined) {
    throw new Error(`No migration directory found in ${MIGRATIONS_DIR}`);
  }
  return readFileSync(join(MIGRATIONS_DIR, initDirectory, 'migration.sql'), 'utf8');
}

const sql = readInitMigration();

/** Collapses whitespace so assertions do not depend on line wrapping. */
const flat = sql.replace(/\s+/g, ' ');

describe('init migration — tables and enums', () => {
  it.each(['ParkingGroup', 'UserRole', 'ReservationLockMode', 'AuditLogAction'])(
    'creates the %s enum type',
    (enumName) => {
      expect(sql).toContain(`CREATE TYPE "${enumName}" AS ENUM`);
    }
  );

  it.each([
    'User',
    'ParkingSpot',
    'Reservation',
    'WaitlistEntry',
    'AuditLog',
    'ReservationWindowSettings',
  ])('creates the %s table', (table) => {
    expect(sql).toContain(`CREATE TABLE "${table}"`);
  });
});

describe('init migration — date-only columns', () => {
  // A timestamp here would silently reintroduce the timezone bugs Task 3 spent
  // its whole test suite eliminating.
  it.each(['Reservation', 'WaitlistEntry'])('%s.date is DATE, not a timestamp', (table) => {
    const createTable = flat.match(new RegExp(`CREATE TABLE "${table}" \\((.*?)\\);`))?.[1];
    expect(createTable).toBeDefined();
    expect(createTable).toContain('"date" DATE NOT NULL');
    expect(createTable).not.toMatch(/"date" TIMESTAMP/);
  });
});

describe('init migration — uniqueness that makes double-booking impossible', () => {
  it('one reservation per spot and day', () => {
    // Task 10 maps this constraint's P2002 onto SPOT_ALREADY_RESERVED.
    expect(flat).toContain(
      'CREATE UNIQUE INDEX "Reservation_parkingSpotId_date_key" ON "Reservation"("parkingSpotId", "date")'
    );
  });

  it('one reservation per user and day', () => {
    expect(flat).toContain(
      'CREATE UNIQUE INDEX "Reservation_userId_date_key" ON "Reservation"("userId", "date")'
    );
  });

  it('one waitlist entry per spot, user and day', () => {
    expect(flat).toContain(
      'CREATE UNIQUE INDEX "WaitlistEntry_parkingSpotId_userId_date_key" ON "WaitlistEntry"("parkingSpotId", "userId", "date")'
    );
  });

  it.each([
    ['User_email_key', '"User"("email")'],
    ['User_oktaId_key', '"User"("oktaId")'],
    ['User_icsToken_key', '"User"("icsToken")'],
    ['ParkingSpot_label_key', '"ParkingSpot"("label")'],
  ])('%s is unique', (indexName, target) => {
    expect(flat).toContain(`CREATE UNIQUE INDEX "${indexName}" ON ${target}`);
  });
});

describe('init migration — indexes', () => {
  it.each([
    ['Reservation_date_idx', '"Reservation"("date")'],
    ['WaitlistEntry_date_idx', '"WaitlistEntry"("date")'],
  ])('%s covers the per-day lookup', (indexName, target) => {
    expect(flat).toContain(`CREATE INDEX "${indexName}" ON ${target}`);
  });

  it('the waitlist queue order is indexed', () => {
    expect(flat).toContain(
      'CREATE INDEX "WaitlistEntry_parkingSpotId_date_createdAt_id_idx" ON "WaitlistEntry"("parkingSpotId", "date", "createdAt", "id")'
    );
  });
});

describe('init migration — foreign keys', () => {
  it('User.preferredParkingSpotId is nullable and set to NULL when a spot is deleted', () => {
    expect(flat).toContain('"preferredParkingSpotId" UUID,');
    expect(flat).toContain(
      'ALTER TABLE "User" ADD CONSTRAINT "User_preferredParkingSpotId_fkey" FOREIGN KEY ("preferredParkingSpotId") REFERENCES "ParkingSpot"("id") ON DELETE SET NULL'
    );
  });

  it.each([
    ['Reservation_parkingSpotId_fkey'],
    ['Reservation_userId_fkey'],
    ['WaitlistEntry_parkingSpotId_fkey'],
    ['WaitlistEntry_userId_fkey'],
    ['AuditLog_actorUserId_fkey'],
  ])('%s restricts deletion of the referenced row', (constraintName) => {
    expect(flat).toMatch(
      new RegExp(`ADD CONSTRAINT "${constraintName}" FOREIGN KEY [^;]*ON DELETE RESTRICT`)
    );
  });
});

describe('init migration — hand-written constraints', () => {
  it('enforces the ReservationWindowSettings singleton with a CHECK on the primary key', () => {
    expect(flat).toContain(
      'ADD CONSTRAINT "ReservationWindowSettings_singleton_check" CHECK ("id" = 1)'
    );
    expect(flat).toContain('CONSTRAINT "ReservationWindowSettings_pkey" PRIMARY KEY ("id")');
  });

  it('bounds openDaysBefore the way the contract does', () => {
    expect(flat).toContain(
      'ADD CONSTRAINT "ReservationWindowSettings_openDaysBefore_range_check" CHECK ("openDaysBefore" BETWEEN 1 AND 31)'
    );
  });

  it('seeds the singleton row so the table is never empty', () => {
    expect(flat).toContain('INSERT INTO "ReservationWindowSettings"');
    expect(flat).toContain('ON CONFLICT ("id") DO NOTHING');
  });

  it('makes AuditLog append-only with a BEFORE UPDATE OR DELETE trigger', () => {
    expect(flat).toContain('CREATE TRIGGER "AuditLog_append_only" BEFORE UPDATE OR DELETE ON');
    expect(flat).toContain('"AuditLog" FOR EACH ROW EXECUTE FUNCTION "auditlog_reject_mutation"()');
    expect(flat).toContain('RAISE EXCEPTION');
  });

  it('also seals TRUNCATE, which row-level triggers do not see', () => {
    // Without this statement-level trigger a single `TRUNCATE "AuditLog";`
    // would erase the entire audit trail — the only record that a hard-deleted
    // reservation ever existed.
    expect(flat).toContain('CREATE TRIGGER "AuditLog_append_only_truncate" BEFORE TRUNCATE ON');
    expect(flat).toContain(
      '"AuditLog" FOR EACH STATEMENT EXECUTE FUNCTION "auditlog_reject_mutation"()'
    );
  });
});

describe('init migration — column types the contract depends on', () => {
  it('AuditLog.payload is JSONB, not TEXT or JSON', () => {
    // `schema-contract-parity.spec.ts` defers the "JSONB NOT NULL" claim here,
    // because Prisma's `Json` type cannot express the distinction.
    const createTable = flat.match(/CREATE TABLE "AuditLog" \((.*?)\);/)?.[1];
    expect(createTable).toBeDefined();
    expect(createTable).toContain('"payload" JSONB NOT NULL');
    expect(createTable).not.toMatch(/"payload" (TEXT|JSON\b)/);
  });

  it.each(['User', 'ParkingSpot', 'Reservation', 'WaitlistEntry', 'AuditLog'])(
    '%s.id is UUID (decision 0025 — UUID v7 primary keys)',
    (table) => {
      const createTable = flat.match(new RegExp(`CREATE TABLE "${table}" \\((.*?)\\);`))?.[1];
      expect(createTable).toBeDefined();
      expect(createTable).toContain('"id" UUID NOT NULL');
    }
  );

  it('ReservationWindowSettings.id is the INTEGER singleton key, not a UUID', () => {
    const createTable = flat.match(/CREATE TABLE "ReservationWindowSettings" \((.*?)\);/)?.[1];
    expect(createTable).toBeDefined();
    expect(createTable).toContain('"id" INTEGER NOT NULL DEFAULT 1');
  });
});

describe('migration_lock.toml', () => {
  it('pins the provider to postgresql', () => {
    const lock = readFileSync(join(MIGRATIONS_DIR, 'migration_lock.toml'), 'utf8');
    expect(lock).toContain('provider = "postgresql"');
  });
});
