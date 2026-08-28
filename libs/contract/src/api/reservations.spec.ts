import {
  DATE_A,
  INVALID_DATE,
  NOT_A_UUID,
  TIMESTAMP,
  UUID_A,
  UUID_B,
} from '../__fixtures__/fixtures';
import {
  cancelReservationInputSchema,
  cancelReservationOutputSchema,
  createReservationInputSchema,
  createReservationOutputSchema,
} from './reservations';

describe('createReservationInputSchema', () => {
  const valid = { parkingSpotId: UUID_B, date: DATE_A };

  it('accepts a spot and a day', () => {
    expect(createReservationInputSchema.parse(valid)).toEqual(valid);
  });

  it('is derived from the entity — the client cannot set id, userId or createdAt', () => {
    const parsed = createReservationInputSchema.parse({
      ...valid,
      id: UUID_A,
      userId: UUID_A,
      createdAt: TIMESTAMP,
    });
    expect(parsed).toEqual(valid);
  });

  it.each([
    ['parkingSpotId', NOT_A_UUID],
    ['date', INVALID_DATE],
    ['date', '15. 9. 2026'],
  ])('rejects an invalid %s (%p)', (field, value) => {
    expect(createReservationInputSchema.safeParse({ ...valid, [field]: value }).success).toBe(
      false
    );
  });

  it('rejects a missing field', () => {
    expect(createReservationInputSchema.safeParse({ date: DATE_A }).success).toBe(false);
  });
});

describe('createReservationOutputSchema', () => {
  it('returns the whole reservation entity', () => {
    const reservation = {
      id: UUID_A,
      parkingSpotId: UUID_B,
      userId: UUID_A,
      date: DATE_A,
      createdAt: TIMESTAMP,
    };
    expect(createReservationOutputSchema.parse(reservation)).toEqual(reservation);
  });

  it('rejects a Date instance where an ISO timestamp is expected', () => {
    // doc/decision/0015: timestamps travel as ISO strings, not Date objects.
    expect(
      createReservationOutputSchema.safeParse({
        id: UUID_A,
        parkingSpotId: UUID_B,
        userId: UUID_A,
        date: DATE_A,
        createdAt: new Date(TIMESTAMP),
      }).success
    ).toBe(false);
  });
});

describe('cancelReservationInputSchema', () => {
  it('accepts a reservation id', () => {
    expect(cancelReservationInputSchema.parse({ reservationId: UUID_A })).toEqual({
      reservationId: UUID_A,
    });
  });

  it('rejects a non-uuid id and a missing id', () => {
    expect(cancelReservationInputSchema.safeParse({ reservationId: NOT_A_UUID }).success).toBe(
      false
    );
    expect(cancelReservationInputSchema.safeParse({}).success).toBe(false);
  });
});

describe('cancelReservationOutputSchema', () => {
  const valid = {
    reservationId: UUID_A,
    date: DATE_A,
    parkingSpotId: UUID_B,
    promoted: false,
  };

  it('echoes the day and spot plus whether the queue absorbed the spot', () => {
    expect(cancelReservationOutputSchema.parse(valid)).toEqual(valid);
    expect(cancelReservationOutputSchema.parse({ ...valid, promoted: true }).promoted).toBe(true);
  });

  it('requires promoted — the client must not have to guess', () => {
    const withoutPromoted: Record<string, unknown> = { ...valid };
    delete withoutPromoted['promoted'];
    expect(cancelReservationOutputSchema.safeParse(withoutPromoted).success).toBe(false);
  });

  it('rejects a non-boolean promoted flag', () => {
    expect(cancelReservationOutputSchema.safeParse({ ...valid, promoted: 'yes' }).success).toBe(
      false
    );
  });
});
