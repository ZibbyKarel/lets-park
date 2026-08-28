import {
  AUDIT_LOG_ACTIONS,
  auditLogActionSchema,
  auditLogSchema,
  parkingSpotSchema,
  reservationSchema,
  userSchema,
  waitlistEntrySchema,
} from './entities';

const ID = '6f9619ff-8b86-4d01-b42d-00cf4fc964ff';
const OTHER_ID = '2c0f1a5e-9a1b-4c3d-8e7f-0a1b2c3d4e5f';
const NOW = '2026-08-28T09:15:00.000Z';

const validUser = {
  id: ID,
  email: 'karel.zibar@team.blue',
  name: 'Karel Zíbar',
  licensePlate: '1AB 2345',
  role: 'USER',
  oktaId: 'okta|00u1234',
  active: true,
  icsToken: 'f2b1c3d4e5f6',
  preferredParkingSpotId: OTHER_ID,
  createdAt: NOW,
  updatedAt: NOW,
};

describe('userSchema', () => {
  it('accepts a complete user', () => {
    expect(userSchema.safeParse(validUser).success).toBe(true);
  });

  it('accepts null for the nullable fields', () => {
    const result = userSchema.safeParse({
      ...validUser,
      licensePlate: null,
      preferredParkingSpotId: null,
    });
    expect(result.success).toBe(true);
  });

  it('requires the nullable fields to be present', () => {
    const { licensePlate, preferredParkingSpotId, ...withoutNullables } = validUser;
    void licensePlate;
    void preferredParkingSpotId;
    expect(userSchema.safeParse(withoutNullables).success).toBe(false);
  });

  it.each([
    ['email', 'not-an-email'],
    ['email', ''],
    ['name', ''],
    ['role', 'SUPERADMIN'],
    ['oktaId', ''],
    ['icsToken', ''],
    ['active', 'true'],
    ['id', 'nope'],
    ['preferredParkingSpotId', 'nope'],
    ['createdAt', '2026-08-28'],
  ])('rejects an invalid %s (%p)', (field, value) => {
    expect(userSchema.safeParse({ ...validUser, [field]: value }).success).toBe(false);
  });

  it('strips unknown keys rather than failing', () => {
    const result = userSchema.safeParse({ ...validUser, passwordHash: 'nope' });
    expect(result.success).toBe(true);
    expect(result.success && 'passwordHash' in result.data).toBe(false);
  });
});

describe('parkingSpotSchema', () => {
  const validSpot = {
    id: ID,
    label: 'E2.92',
    group: 'IT',
    active: true,
    createdAt: NOW,
    updatedAt: NOW,
  };

  it('accepts a spot from each group', () => {
    expect(parkingSpotSchema.safeParse(validSpot).success).toBe(true);
    expect(parkingSpotSchema.safeParse({ ...validSpot, group: 'SHARED' }).success).toBe(true);
  });

  it.each([
    ['label', ''],
    ['group', 'GUEST'],
    ['active', null],
  ])('rejects an invalid %s (%p)', (field, value) => {
    expect(parkingSpotSchema.safeParse({ ...validSpot, [field]: value }).success).toBe(false);
  });
});

describe('reservationSchema / waitlistEntrySchema', () => {
  const valid = {
    id: ID,
    parkingSpotId: OTHER_ID,
    userId: ID,
    date: '2026-09-15',
    createdAt: NOW,
  };

  it.each([
    ['reservationSchema', reservationSchema],
    ['waitlistEntrySchema', waitlistEntrySchema],
  ] as const)('%s accepts a valid entry', (_name, schema) => {
    expect(schema.safeParse(valid).success).toBe(true);
  });

  it.each([
    ['reservationSchema', reservationSchema],
    ['waitlistEntrySchema', waitlistEntrySchema],
  ] as const)('%s keeps the day date-only', (_name, schema) => {
    expect(schema.safeParse({ ...valid, date: '2026-09-15T00:00:00.000Z' }).success).toBe(false);
    expect(schema.safeParse({ ...valid, date: '2026-09-31' }).success).toBe(false);
    expect(schema.safeParse({ ...valid, date: '2028-02-29' }).success).toBe(true);
  });

  it.each([
    ['reservationSchema', reservationSchema],
    ['waitlistEntrySchema', waitlistEntrySchema],
  ] as const)('%s does not judge the date against the horizon', (_name, schema) => {
    // Both the "not in the past" and the reservation-window checks live in the
    // service layer (Task 13), on top of monthLockState().
    expect(schema.safeParse({ ...valid, date: '2020-01-01' }).success).toBe(true);
    expect(schema.safeParse({ ...valid, date: '2099-12-31' }).success).toBe(true);
  });
});

describe('auditLogSchema', () => {
  const validEntry = {
    id: ID,
    actorUserId: OTHER_ID,
    action: 'RESERVATION_CREATED',
    entityType: 'Reservation',
    entityId: ID,
    payload: { parkingSpotId: OTHER_ID, date: '2026-09-15' },
    createdAt: NOW,
  };

  it('accepts a valid entry', () => {
    expect(auditLogSchema.safeParse(validEntry).success).toBe(true);
  });

  it('accepts an empty payload', () => {
    expect(auditLogSchema.safeParse({ ...validEntry, payload: {} }).success).toBe(true);
  });

  it.each([
    ['action', 'SOMETHING_ELSE'],
    ['entityType', ''],
    ['entityId', ''],
    ['payload', 'not-an-object'],
    ['payload', null],
    ['actorUserId', null],
  ])('rejects an invalid %s (%p)', (field, value) => {
    expect(auditLogSchema.safeParse({ ...validEntry, [field]: value }).success).toBe(false);
  });

  it('enumerates the actions named in the domain model', () => {
    expect([...AUDIT_LOG_ACTIONS]).toEqual([
      'RESERVATION_CREATED',
      'RESERVATION_CANCELLED',
      'RESERVATION_CANCELLED_BY_ADMIN',
      'WAITLIST_PROMOTED',
      'USER_UPDATED',
      'SPOT_UPDATED',
    ]);
    for (const action of AUDIT_LOG_ACTIONS) {
      expect(auditLogActionSchema.safeParse(action).success).toBe(true);
    }
  });
});
