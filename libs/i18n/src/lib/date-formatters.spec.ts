import { createDateFormatters } from './date-formatters';

describe('Czech formatters (unchanged behaviour)', () => {
  const cs = createDateFormatters('cs');

  it('formats the long date with a weekday and a genitive month', () => {
    expect(cs.fullDate('2026-09-28')).toBe('pondělí 28. září 2026');
  });

  it('formats day, genitive month and year without a weekday', () => {
    expect(cs.dayMonthAndYear('2026-08-28')).toBe('28. srpna 2026');
  });

  it('formats day and genitive month', () => {
    expect(cs.dayAndMonth('2026-08-25')).toBe('25. srpna');
  });

  it('formats a nominative month with a year', () => {
    expect(cs.monthAndYear('2026-08-01')).toBe('srpen 2026');
  });

  it('formats a standalone nominative month', () => {
    expect(cs.monthName(9)).toBe('září');
    expect(cs.monthName(8)).toBe('srpen');
  });

  it('formats the locative month used after a preposition', () => {
    expect(cs.monthLocative(9)).toBe('září');
    expect(cs.monthLocative(8)).toBe('srpnu');
  });

  // `formatMonthLocative` threw `RangeError` outside 1–12 and `dates.spec.ts`
  // asserts it ("throws rather than returning undefined outside 1–12"). That
  // assertion is preserved, so the replacement must throw too — never return
  // an empty string, which would put a hole in a sentence instead of a stack.
  it('throws rather than returning undefined outside 1–12', () => {
    expect(() => cs.monthLocative(0)).toThrow(RangeError);
    expect(() => cs.monthLocative(13)).toThrow(RangeError);
  });

  it('formats the year as digits', () => {
    expect(cs.year(2026)).toBe('2026');
  });
});

describe('English formatters', () => {
  const en = createDateFormatters('en');

  it('formats the long date the way English reads it', () => {
    expect(en.fullDate('2026-09-28')).toBe('Monday, September 28, 2026');
  });

  it('formats day, month and year without a weekday', () => {
    expect(en.dayMonthAndYear('2026-08-28')).toBe('August 28, 2026');
  });

  it('formats day and month', () => {
    expect(en.dayAndMonth('2026-08-25')).toBe('August 25');
  });

  it('formats a month with a year', () => {
    expect(en.monthAndYear('2026-08-01')).toBe('August 2026');
  });

  it('formats a standalone month', () => {
    expect(en.monthName(9)).toBe('September');
  });

  it('has no separate locative form — English does not decline months', () => {
    expect(en.monthLocative(9)).toBe('September');
    expect(en.monthLocative(8)).toBe('August');
  });

  it('rejects a month number outside 1–12, like the Czech table does', () => {
    expect(() => en.monthLocative(0)).toThrow(RangeError);
    expect(() => en.monthLocative(13)).toThrow(RangeError);
  });

  it('formats the weekday name', () => {
    expect(en.weekdayName('2026-09-28')).toBe('Monday');
  });
});

it('returns the same instance for the same locale', () => {
  expect(createDateFormatters('cs')).toBe(createDateFormatters('cs'));
  expect(createDateFormatters('cs')).not.toBe(createDateFormatters('en'));
});
