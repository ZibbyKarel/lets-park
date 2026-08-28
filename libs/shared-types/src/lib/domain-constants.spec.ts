import {
  CELL_LOCK_RESULTS,
  DEFAULT_OPEN_DAYS_BEFORE,
  DEFAULT_RESERVATION_LOCK_MODE,
  MAX_BULK_BOOKING_DAYS,
  MAX_MONTH_WINDOW_SPAN,
  MAX_OPEN_DAYS_BEFORE,
  MIN_OPEN_DAYS_BEFORE,
  MONTH_LOCK_STATES,
  PARKING_GROUPS,
  RESERVATION_LOCK_MODES,
  RESERVATION_REASSIGN_CAUSES,
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

describe('realtime enumerations', () => {
  it('has exactly one reassignment cause, because only one thing emits one', () => {
    // An `ADMIN_REASSIGNMENT` member would be a cause nothing can produce: the
    // API contract has no procedure that moves a reservation between users.
    // See doc/decision/0021-* and doc/decision/0022-*.
    expect(RESERVATION_REASSIGN_CAUSES).toEqual(['WAITLIST_PROMOTION']);
  });

  it('lists both outcomes of a cell-lock request', () => {
    expect(CELL_LOCK_RESULTS).toEqual(['ACQUIRED', 'HELD_BY_OTHER']);
  });
});

describe('structural caps', () => {
  it('caps a month-window range at two years', () => {
    expect(MAX_MONTH_WINDOW_SPAN).toBe(24);
  });

  it('caps a bulk booking at a calendar month', () => {
    expect(MAX_BULK_BOOKING_DAYS).toBe(31);
  });

  it('states both caps as positive integers the contract can enforce structurally', () => {
    // Both exist so the limit lives in the schema instead of being discovered
    // by rejection (doc/decision/0021-*).
    for (const cap of [MAX_MONTH_WINDOW_SPAN, MAX_BULK_BOOKING_DAYS]) {
      expect(Number.isInteger(cap) && cap > 0).toBe(true);
    }
  });
});
