import {
  DATE_A,
  INVALID_DATE,
  NOT_A_UUID,
  TIMESTAMP,
  UUID_A,
  UUID_B,
} from './__fixtures__/fixtures';
import {
  joinWaitlistInputSchema,
  joinWaitlistOutputSchema,
  leaveWaitlistInputSchema,
  leaveWaitlistOutputSchema,
} from './waitlist';

describe('joinWaitlistInputSchema', () => {
  const valid = { parkingSpotId: UUID_B, date: DATE_A };

  it('accepts a spot and a day', () => {
    expect(joinWaitlistInputSchema.parse(valid)).toEqual(valid);
  });

  it('strips server-owned fields, being derived from the entity', () => {
    expect(joinWaitlistInputSchema.parse({ ...valid, id: UUID_A, userId: UUID_A })).toEqual(valid);
  });

  it.each([
    ['parkingSpotId', NOT_A_UUID],
    ['date', INVALID_DATE],
  ])('rejects an invalid %s (%p)', (field, value) => {
    expect(joinWaitlistInputSchema.safeParse({ ...valid, [field]: value }).success).toBe(false);
  });
});

describe('joinWaitlistOutputSchema', () => {
  const valid = {
    entry: {
      id: UUID_A,
      parkingSpotId: UUID_B,
      userId: UUID_A,
      date: DATE_A,
      createdAt: TIMESTAMP,
    },
    position: 1,
  };

  it('returns the entry and a 1-based position', () => {
    expect(joinWaitlistOutputSchema.parse(valid)).toEqual(valid);
  });

  it('rejects a zero or fractional position', () => {
    expect(joinWaitlistOutputSchema.safeParse({ ...valid, position: 0 }).success).toBe(false);
    expect(joinWaitlistOutputSchema.safeParse({ ...valid, position: 1.5 }).success).toBe(false);
  });
});

describe('leaveWaitlistInputSchema', () => {
  it('accepts an entry id', () => {
    expect(leaveWaitlistInputSchema.parse({ waitlistEntryId: UUID_A })).toEqual({
      waitlistEntryId: UUID_A,
    });
  });

  it('rejects a non-uuid id', () => {
    expect(leaveWaitlistInputSchema.safeParse({ waitlistEntryId: NOT_A_UUID }).success).toBe(false);
  });
});

describe('leaveWaitlistOutputSchema', () => {
  const valid = { waitlistEntryId: UUID_A, parkingSpotId: UUID_B, date: DATE_A };

  it('echoes the spot and day so the client can invalidate precisely', () => {
    expect(leaveWaitlistOutputSchema.parse(valid)).toEqual(valid);
  });

  it('rejects a missing date', () => {
    const withoutDate: Record<string, unknown> = { ...valid };
    delete withoutDate['date'];
    expect(leaveWaitlistOutputSchema.safeParse(withoutDate).success).toBe(false);
  });
});
