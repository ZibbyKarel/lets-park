import {
  DEFAULT_OPEN_DAYS_BEFORE,
  DEFAULT_RESERVATION_LOCK_MODE,
  MAX_OPEN_DAYS_BEFORE,
  MIN_OPEN_DAYS_BEFORE,
  MONTH_LOCK_STATES,
  PARKING_GROUPS,
  RESERVATION_LOCK_MODES,
  USER_ROLES,
} from './domain-constants';

describe('domain enumerations', () => {
  it('lists the parking groups', () => {
    expect(PARKING_GROUPS).toEqual(['IT', 'SHARED']);
  });

  it('lists the user roles', () => {
    expect(USER_ROLES).toEqual(['USER', 'ADMIN']);
  });

  it('lists the reservation lock modes', () => {
    expect(RESERVATION_LOCK_MODES).toEqual(['AUTO', 'FORCE_OPEN', 'FORCE_LOCKED']);
  });

  it('lists the month lock states', () => {
    expect(MONTH_LOCK_STATES).toEqual(['NOT_YET_OPEN', 'OPEN', 'LOCKED']);
  });
});

describe('reservation window defaults', () => {
  it('matches doc/decision/0004', () => {
    expect(DEFAULT_OPEN_DAYS_BEFORE).toBe(7);
    expect(DEFAULT_RESERVATION_LOCK_MODE).toBe('AUTO');
    expect(MIN_OPEN_DAYS_BEFORE).toBe(1);
    expect(MAX_OPEN_DAYS_BEFORE).toBe(31);
  });

  it('keeps the default inside the accepted bounds', () => {
    expect(DEFAULT_OPEN_DAYS_BEFORE).toBeGreaterThanOrEqual(MIN_OPEN_DAYS_BEFORE);
    expect(DEFAULT_OPEN_DAYS_BEFORE).toBeLessThanOrEqual(MAX_OPEN_DAYS_BEFORE);
  });
});
