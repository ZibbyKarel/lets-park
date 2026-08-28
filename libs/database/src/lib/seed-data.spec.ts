/**
 * The seed cannot be run without a database, but the data it writes can be
 * checked here: that it is the exact car-park layout the brief prescribes, that
 * every row would satisfy the contract's own schemas, and that nothing in it
 * would violate a unique constraint or a foreign key.
 */

import { parkingSpotSchema, userSchema } from '@lets-park/contract';
import {
  DEFAULT_OPEN_DAYS_BEFORE,
  DEFAULT_RESERVATION_LOCK_MODE,
  MAX_OPEN_DAYS_BEFORE,
  MIN_OPEN_DAYS_BEFORE,
} from '@lets-park/shared-types';
import { SEED_PARKING_SPOTS, SEED_RESERVATION_WINDOW_SETTINGS, SEED_USERS } from './seed-data';

/** The contract describes entities as returned; the seed supplies the writable half. */
const seedSpotSchema = parkingSpotSchema.pick({ label: true, group: true, active: true });
const seedUserSchema = userSchema.pick({
  email: true,
  name: true,
  licensePlate: true,
  role: true,
  oktaId: true,
  active: true,
  icsToken: true,
});

describe('seeded parking spots', () => {
  it('is exactly the real office layout', () => {
    expect(SEED_PARKING_SPOTS.map((spot) => spot.label)).toEqual([
      'E2.92',
      'E2.93',
      'E2.94',
      'E2.95',
      'E2.96',
      'E2.65',
      'E2.66',
      'E2.61',
      'E2.62',
    ]);
  });

  it('assigns E2.92–E2.95 to IT and the rest to SHARED', () => {
    const byGroup = (group: string): string[] =>
      SEED_PARKING_SPOTS.filter((spot) => spot.group === group).map((spot) => spot.label);

    expect(byGroup('IT')).toEqual(['E2.92', 'E2.93', 'E2.94', 'E2.95']);
    expect(byGroup('SHARED')).toEqual(['E2.96', 'E2.65', 'E2.66', 'E2.61', 'E2.62']);
  });

  it('every spot satisfies the contract schema', () => {
    for (const spot of SEED_PARKING_SPOTS) {
      expect(() => seedSpotSchema.parse(spot)).not.toThrow();
    }
  });

  it('labels are unique, as the ParkingSpot_label_key index requires', () => {
    const labels = SEED_PARKING_SPOTS.map((spot) => spot.label);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe('seeded users', () => {
  it('every user satisfies the contract schema', () => {
    for (const user of SEED_USERS) {
      expect(() => seedUserSchema.parse(user)).not.toThrow();
    }
  });

  it.each([
    ['email', (): string[] => SEED_USERS.map((user) => user.email)],
    ['oktaId', (): string[] => SEED_USERS.map((user) => user.oktaId)],
    ['icsToken', (): string[] => SEED_USERS.map((user) => user.icsToken)],
  ])('%s is unique across the seed', (_field, values) => {
    const list = values();
    expect(new Set(list).size).toBe(list.length);
  });

  it('every preferred spot exists in the seeded layout', () => {
    const labels = new Set(SEED_PARKING_SPOTS.map((spot) => spot.label));
    for (const user of SEED_USERS) {
      if (user.preferredParkingSpotLabel !== null) {
        expect(labels).toContain(user.preferredParkingSpotLabel);
      }
    }
  });

  it('covers the roles and states dev needs: an admin, an active user, an inactive user', () => {
    expect(SEED_USERS.some((user) => user.role === 'ADMIN' && user.active)).toBe(true);
    expect(SEED_USERS.some((user) => user.role === 'USER' && user.active)).toBe(true);
    expect(SEED_USERS.some((user) => !user.active)).toBe(true);
  });

  it('uses obviously-fake example.com identities', () => {
    for (const user of SEED_USERS) {
      expect(user.email.endsWith('@example.com')).toBe(true);
    }
  });
});

describe('seeded reservation window settings', () => {
  it('is the documented default: 7 days, AUTO', () => {
    expect(SEED_RESERVATION_WINDOW_SETTINGS).toEqual({
      openDaysBefore: DEFAULT_OPEN_DAYS_BEFORE,
      lockMode: DEFAULT_RESERVATION_LOCK_MODE,
    });
    expect(DEFAULT_OPEN_DAYS_BEFORE).toBe(7);
    expect(DEFAULT_RESERVATION_LOCK_MODE).toBe('AUTO');
  });

  it('sits inside the range the CHECK constraint allows', () => {
    expect(SEED_RESERVATION_WINDOW_SETTINGS.openDaysBefore).toBeGreaterThanOrEqual(
      MIN_OPEN_DAYS_BEFORE
    );
    expect(SEED_RESERVATION_WINDOW_SETTINGS.openDaysBefore).toBeLessThanOrEqual(
      MAX_OPEN_DAYS_BEFORE
    );
  });
});
