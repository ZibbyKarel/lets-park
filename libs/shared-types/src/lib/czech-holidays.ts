/**
 * Czech public holidays ("státní svátky" and "ostatní svátky" as defined by
 * zákon č. 245/2000 Sb.), as a pure function of the year.
 *
 * Eleven of the thirteen are fixed calendar dates. The remaining two — Good
 * Friday and Easter Monday — move with Easter, so they are derived from a real
 * Easter algorithm (Meeus/Jones/Butcher for the Gregorian calendar) rather
 * than from a hard-coded table that would silently expire.
 *
 * The Czech names are domain data shown in the UI, so they stay Czech; the
 * stable `id` is what feature code and `libs/i18n` should key on.
 */

import { addDays, formatDateOnly, isWeekend, parseDateOnly, type DateOnly } from './date-only';

export const CZECH_HOLIDAY_IDS = [
  'NEW_YEAR',
  'GOOD_FRIDAY',
  'EASTER_MONDAY',
  'LABOUR_DAY',
  'VICTORY_DAY',
  'CYRIL_AND_METHODIUS',
  'JAN_HUS',
  'CZECH_STATEHOOD',
  'INDEPENDENT_CZECHOSLOVAK_STATE',
  'STRUGGLE_FOR_FREEDOM_AND_DEMOCRACY',
  'CHRISTMAS_EVE',
  'CHRISTMAS_DAY',
  'SECOND_CHRISTMAS_DAY',
] as const;

export type CzechHolidayId = (typeof CZECH_HOLIDAY_IDS)[number];

export interface CzechHoliday {
  readonly id: CzechHolidayId;
  readonly date: DateOnly;
  /** Official Czech name, as displayed in the UI. */
  readonly name: string;
}

/** Fixed-date holidays: `[month (1-based), day, id, Czech name]`. */
const FIXED_HOLIDAYS: readonly [number, number, CzechHolidayId, string][] = [
  [1, 1, 'NEW_YEAR', 'Nový rok'],
  [5, 1, 'LABOUR_DAY', 'Svátek práce'],
  [5, 8, 'VICTORY_DAY', 'Den vítězství'],
  [7, 5, 'CYRIL_AND_METHODIUS', 'Den slovanských věrozvěstů Cyrila a Metoděje'],
  [7, 6, 'JAN_HUS', 'Den upálení mistra Jana Husa'],
  [9, 28, 'CZECH_STATEHOOD', 'Den české státnosti'],
  [10, 28, 'INDEPENDENT_CZECHOSLOVAK_STATE', 'Den vzniku samostatného československého státu'],
  [11, 17, 'STRUGGLE_FOR_FREEDOM_AND_DEMOCRACY', 'Den boje za svobodu a demokracii'],
  [12, 24, 'CHRISTMAS_EVE', 'Štědrý den'],
  [12, 25, 'CHRISTMAS_DAY', '1. svátek vánoční'],
  [12, 26, 'SECOND_CHRISTMAS_DAY', '2. svátek vánoční'],
];

/**
 * Easter Sunday of the given Gregorian year (Meeus/Jones/Butcher algorithm).
 *
 * The algorithm is integer arithmetic only; the intermediate names follow the
 * published formulation so it can be checked against the source.
 */
export function easterSunday(year: number): DateOnly {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3 = March, 4 = April
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return formatDateOnly({ year, month, day });
}

/**
 * Good Friday — the Friday before Easter Sunday.
 *
 * This is the *calendar* date and is defined for every year. Whether it is a
 * public holiday is a separate question — see {@link GOOD_FRIDAY_FIRST_YEAR}.
 */
export function goodFriday(year: number): DateOnly {
  return addDays(easterSunday(year), -2);
}

/**
 * First year in which Good Friday was a Czech public holiday.
 *
 * It was added by the 2016 amendment of act 245/2000 Sb.; every other holiday in
 * {@link FIXED_HOLIDAYS} predates the app. A reservation app never looks
 * backwards, so this bound is documentation more than behaviour — but a pure
 * function of the year should not claim something the law did not say.
 */
export const GOOD_FRIDAY_FIRST_YEAR = 2016;

/** Easter Monday — the Monday after Easter Sunday. */
export function easterMonday(year: number): DateOnly {
  return addDays(easterSunday(year), 1);
}

/**
 * All Czech public holidays of the given year, ordered by date.
 *
 * Note that Easter Sunday itself is *not* a public holiday in Czechia; only
 * Good Friday and Easter Monday are — and Good Friday only from
 * {@link GOOD_FRIDAY_FIRST_YEAR} onwards, so years before that return one
 * holiday fewer.
 */
export function czechPublicHolidays(year: number): readonly CzechHoliday[] {
  const holidays: CzechHoliday[] = [
    ...(year >= GOOD_FRIDAY_FIRST_YEAR
      ? [{ id: 'GOOD_FRIDAY' as const, date: goodFriday(year), name: 'Velký pátek' }]
      : []),
    { id: 'EASTER_MONDAY', date: easterMonday(year), name: 'Velikonoční pondělí' },
    ...FIXED_HOLIDAYS.map(([month, day, id, name]) => ({
      id,
      date: formatDateOnly({ year, month, day }),
      name,
    })),
  ];
  return holidays.sort((left, right) =>
    left.date < right.date ? -1 : left.date > right.date ? 1 : 0
  );
}

/** The holiday falling on `date`, or `null` when it is an ordinary day. */
export function czechPublicHolidayOn(date: DateOnly): CzechHoliday | null {
  const { year } = parseDateOnly(date);
  return czechPublicHolidays(year).find((holiday) => holiday.date === date) ?? null;
}

/** True when `date` is a Czech public holiday. */
export function isCzechPublicHoliday(date: DateOnly): boolean {
  return czechPublicHolidayOn(date) !== null;
}

/**
 * True when `date` is a working day: not a weekend and not a public holiday.
 * Bulk booking may only select working days (see `doc/decision/0004-*`).
 */
export function isBusinessDay(date: DateOnly): boolean {
  return !isWeekend(date) && !isCzechPublicHoliday(date);
}
