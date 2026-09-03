import {
  formatDayAndMonth,
  formatDayMonthAndYear,
  formatFullDate,
  formatMonthAndYear,
  formatMonthName,
  formatYear,
} from './dates';

describe('formatFullDate', () => {
  it('matches the design exactly: weekday, day with an ordinal dot, genitive month, year', () => {
    // doc/design/screens/07-lot.png
    expect(formatFullDate('2026-09-28')).toBe('pondělí 28. září 2026');
  });

  it('uses the genitive month form even when it differs from the nominative', () => {
    // "srpen" (nominative) vs. "srpna" (genitive) — getting this wrong is the
    // whole point of the task's warning about Czech month declension.
    expect(formatFullDate('2026-08-25')).toBe('úterý 25. srpna 2026');
  });

  it('is correct at a year boundary', () => {
    expect(formatFullDate('2026-01-01')).toBe('čtvrtek 1. ledna 2026');
    expect(formatFullDate('2025-12-31')).toBe('středa 31. prosince 2025');
  });
});

describe('formatDayAndMonth', () => {
  it('formats day and genitive month without a year', () => {
    // doc/design/screens/05-admin-window.png — "otevřeno 25. srpna – 31. srpna"
    expect(formatDayAndMonth('2026-08-25')).toBe('25. srpna');
    expect(formatDayAndMonth('2026-08-31')).toBe('31. srpna');
  });

  it('uses the genitive form that happens to equal the nominative for září', () => {
    expect(formatDayAndMonth('2026-09-24')).toBe('24. září');
  });

  it('uses the genitive form for říjen (října), distinct from its nominative', () => {
    expect(formatDayAndMonth('2026-10-25')).toBe('25. října');
  });
});

describe('formatDayMonthAndYear', () => {
  it('matches the design exactly: day, genitive month, year, and no weekday', () => {
    // doc/design/screens/05-admin-window.png — "dnes je 28. srpna 2026"
    expect(formatDayMonthAndYear('2026-08-28')).toBe('28. srpna 2026');
  });

  it('omits the weekday that formatFullDate includes', () => {
    // The two differ by exactly one component; asserting the pair is what
    // stops this from being re-implemented as `formatFullDate` by mistake.
    expect(formatFullDate('2026-09-28')).toBe('pondělí 28. září 2026');
    expect(formatDayMonthAndYear('2026-09-28')).toBe('28. září 2026');
  });

  it('keeps the genitive month, unlike formatMonthAndYear', () => {
    expect(formatDayMonthAndYear('2026-08-01')).toBe('1. srpna 2026');
    expect(formatMonthAndYear('2026-08-01')).toBe('srpen 2026');
  });

  it('is correct at a year boundary', () => {
    expect(formatDayMonthAndYear('2025-12-31')).toBe('31. prosince 2025');
    expect(formatDayMonthAndYear('2026-01-01')).toBe('1. ledna 2026');
  });
});

describe('formatMonthAndYear', () => {
  it('formats the nominative month with the year — the month-status heading', () => {
    // doc/design/screens/05-admin-window.png — "srpen 2026", "září 2026", …
    expect(formatMonthAndYear('2026-08-01')).toBe('srpen 2026');
    expect(formatMonthAndYear('2026-09-15')).toBe('září 2026');
    expect(formatMonthAndYear('2026-11-30')).toBe('listopad 2026');
  });
});

describe('formatMonthName', () => {
  it('returns the standalone nominative month name for every month of the year', () => {
    const expected = [
      'leden',
      'únor',
      'březen',
      'duben',
      'květen',
      'červen',
      'červenec',
      'srpen',
      'září',
      'říjen',
      'listopad',
      'prosinec',
    ];
    for (let month = 1; month <= 12; month += 1) {
      expect(formatMonthName(month)).toBe(expected[month - 1]);
    }
  });
});

describe('formatYear', () => {
  it('renders a plain four-digit year with no thousands separator', () => {
    expect(formatYear(2026)).toBe('2026');
  });
});
