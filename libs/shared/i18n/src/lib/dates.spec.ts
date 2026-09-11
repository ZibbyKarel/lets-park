import { createDateFormatters } from './date-formatters';

const cs = createDateFormatters('cs');

describe('cs.fullDate', () => {
  it('matches the design exactly: weekday, day with an ordinal dot, genitive month, year', () => {
    // doc/design/screens/07-lot.png
    expect(cs.fullDate('2026-09-28')).toBe('pondělí 28. září 2026');
  });

  it('uses the genitive month form even when it differs from the nominative', () => {
    // "srpen" (nominative) vs. "srpna" (genitive) — getting this wrong is the
    // whole point of the task's warning about Czech month declension.
    expect(cs.fullDate('2026-08-25')).toBe('úterý 25. srpna 2026');
  });

  it('is correct at a year boundary', () => {
    expect(cs.fullDate('2026-01-01')).toBe('čtvrtek 1. ledna 2026');
    expect(cs.fullDate('2025-12-31')).toBe('středa 31. prosince 2025');
  });
});

describe('cs.dayAndMonth', () => {
  it('formats day and genitive month without a year', () => {
    // doc/design/screens/05-admin-window.png — "otevřeno 25. srpna – 31. srpna"
    expect(cs.dayAndMonth('2026-08-25')).toBe('25. srpna');
    expect(cs.dayAndMonth('2026-08-31')).toBe('31. srpna');
  });

  it('uses the genitive form that happens to equal the nominative for září', () => {
    expect(cs.dayAndMonth('2026-09-24')).toBe('24. září');
  });

  it('uses the genitive form for říjen (října), distinct from its nominative', () => {
    expect(cs.dayAndMonth('2026-10-25')).toBe('25. října');
  });
});

describe('cs.dayMonthAndYear', () => {
  it('matches the design exactly: day, genitive month, year, and no weekday', () => {
    // doc/design/screens/05-admin-window.png — "dnes je 28. srpna 2026"
    expect(cs.dayMonthAndYear('2026-08-28')).toBe('28. srpna 2026');
  });

  it('omits the weekday that fullDate includes', () => {
    // The two differ by exactly one component; asserting the pair is what
    // stops this from being re-implemented as `fullDate` by mistake.
    expect(cs.fullDate('2026-09-28')).toBe('pondělí 28. září 2026');
    expect(cs.dayMonthAndYear('2026-09-28')).toBe('28. září 2026');
  });

  it('keeps the genitive month, unlike monthAndYear', () => {
    expect(cs.dayMonthAndYear('2026-08-01')).toBe('1. srpna 2026');
    expect(cs.monthAndYear('2026-08-01')).toBe('srpen 2026');
  });

  it('is correct at a year boundary', () => {
    expect(cs.dayMonthAndYear('2025-12-31')).toBe('31. prosince 2025');
    expect(cs.dayMonthAndYear('2026-01-01')).toBe('1. ledna 2026');
  });
});

describe('cs.monthAndYear', () => {
  it('formats the nominative month with the year — the month-status heading', () => {
    // doc/design/screens/05-admin-window.png — "srpen 2026", "září 2026", …
    expect(cs.monthAndYear('2026-08-01')).toBe('srpen 2026');
    expect(cs.monthAndYear('2026-09-15')).toBe('září 2026');
    expect(cs.monthAndYear('2026-11-30')).toBe('listopad 2026');
  });
});

describe('cs.monthName', () => {
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
      expect(cs.monthName(month)).toBe(expected[month - 1]);
    }
  });
});

describe('cs.year', () => {
  it('renders a plain four-digit year with no thousands separator', () => {
    expect(cs.year(2026)).toBe('2026');
  });
});

describe('cs.monthLocative', () => {
  it('names all twelve months in the locative, the case that follows “v”', () => {
    const expected = [
      'lednu',
      'únoru',
      'březnu',
      'dubnu',
      'květnu',
      'červnu',
      'červenci',
      'srpnu',
      'září',
      'říjnu',
      'listopadu',
      'prosinci',
    ];
    for (let month = 1; month <= 12; month += 1) {
      expect(cs.monthLocative(month)).toBe(expected[month - 1]);
    }
  });

  it('differs from the nominative for every month but září', () => {
    // The check that would have caught a table copied from `monthName`:
    // September is the only month whose two forms coincide.
    //
    // Its ceiling, stated so nobody over-trusts it: this does **not**
    // distinguish the locative from any other oblique case — a genitive table
    // (`ledna, února, …`) differs from the nominative for the same eleven
    // months and would pass. No unit test can check Czech declension; the
    // twelve strings above are held by review, and by the design's sentence
    // "Vyberte dny v září."
    for (let month = 1; month <= 12; month += 1) {
      if (month === 9) {
        expect(cs.monthLocative(month)).toBe(cs.monthName(month));
      } else {
        expect(cs.monthLocative(month)).not.toBe(cs.monthName(month));
      }
    }
  });

  it('throws rather than returning undefined outside 1–12', () => {
    expect(() => cs.monthLocative(0)).toThrow(RangeError);
    expect(() => cs.monthLocative(13)).toThrow(RangeError);
  });
});

describe('cs.weekdayName', () => {
  it('names every Czech weekday in the nominative, Monday first', () => {
    // 2026-09-28 is a Monday (doc/design/screens/07-lot.png), so this week
    // runs Monday to Sunday with no arithmetic of its own.
    const week = [
      '2026-09-28',
      '2026-09-29',
      '2026-09-30',
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
      '2026-10-04',
    ];
    expect(week.map(cs.weekdayName)).toEqual([
      'pondělí',
      'úterý',
      'středa',
      'čtvrtek',
      'pátek',
      'sobota',
      'neděle',
    ]);
  });

  it('reads the calendar day, not the host time zone', () => {
    // Would be the previous day anywhere west of UTC if `toUtcMidnight` built a
    // local midnight instead of a UTC one.
    //
    // **What actually holds this is the module formatter**, which is
    // `createFormatter({ locale: 'cs', timeZone: 'UTC' })` — not the per-call
    // `timeZone: 'UTC'` next to `weekday: 'long'`. Deleting that option is an
    // equivalent mutant: it survives under TZ=Europe/Prague and
    // TZ=America/New_York alike. The option is kept only so this function reads
    // the same as its four siblings; do not mistake it for the guard.
    expect(cs.weekdayName('2026-01-01')).toBe('čtvrtek');
  });
});
