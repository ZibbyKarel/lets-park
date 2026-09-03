/**
 * Czech date formatting, matching `doc/design/screens/07-lot.png` and
 * `05-admin-window.png` exactly:
 *
 * - full date:        `pondělí 28. září 2026`   (weekday + day + month + year)
 * - day and month:     `25. srpna`               (used for window ranges)
 * - month and year:    `srpen 2026`              (used for the month list)
 * - standalone month:  `září`                    (used in the month selector)
 * - standalone year:   `2026`                    (used in the year selector)
 *
 * Czech month names decline: the day-and-month and full-date forms need the
 * *genitive* case (`25. srpna`, not `25. srpen`), while the standalone and
 * month-and-year forms need the *nominative* (`srpen`, not `srpna`). This is
 * not a hand-picked table — `Intl`'s `cs-CZ` locale data already produces the
 * genitive automatically whenever `day` is part of the same format call, and
 * the nominative whenever it is not. Verified against Node's ICU data (see
 * `dates.spec.ts`) rather than assumed; do not "simplify" this by combining
 * the two format option objects below into one.
 *
 * All inputs are `DateOnly` (`YYYY-MM-DD`, Europe/Prague-agnostic calendar
 * days — see `doc/decision/0014-*`), never an instant. Formatting therefore
 * builds a UTC-midnight `Date` from the parsed parts and formats it with an
 * explicit `timeZone: 'UTC'`, so the displayed day is always exactly the
 * calendar day the caller asked for, regardless of the host machine's zone
 * or of daylight-saving transitions.
 */

import { createFormatter } from 'next-intl';
import { parseDateOnly, type DateOnly } from '@lets-park/shared-types';

const CZECH_LOCALE = 'cs';

/**
 * A next-intl `Formatter` fixed to Czech and UTC.
 *
 * `timeZone: 'UTC'` is deliberate and unrelated to `PRAGUE_TIME_ZONE` used by
 * `IntlProvider` — this formatter never receives a real instant, only
 * UTC-midnight stand-ins for calendar days (see module docs above).
 */
const formatter = createFormatter({ locale: CZECH_LOCALE, timeZone: 'UTC' });

/** UTC-midnight `Date` standing in for a `DateOnly`'s calendar day. */
function toUtcMidnight(date: DateOnly): Date {
  const { year, month, day } = parseDateOnly(date);
  return new Date(Date.UTC(year, month - 1, day));
}

/** `pondělí 28. září 2026` — the long form used as the page's date heading. */
export function formatFullDate(date: DateOnly): string {
  return formatter.dateTime(toUtcMidnight(date), {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/** `25. srpna` — day and genitive month, no year (used for window ranges). */
export function formatDayAndMonth(date: DateOnly): string {
  return formatter.dateTime(toUtcMidnight(date), {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'long',
  });
}

/** `srpen 2026` — nominative month and year (used for the month-status list). */
export function formatMonthAndYear(date: DateOnly): string {
  return formatter.dateTime(toUtcMidnight(date), {
    timeZone: 'UTC',
    month: 'long',
    year: 'numeric',
  });
}

/**
 * `září` — the standalone nominative month name (used by the month selector).
 *
 * @param month 1-based (1 = leden … 12 = prosinec), matching `DateParts.month`.
 */
export function formatMonthName(month: number): string {
  // The reference year and day are irrelevant — only the month component is
  // read — but must be a real calendar date, so day 1 is used unconditionally.
  return formatter.dateTime(new Date(Date.UTC(2000, month - 1, 1)), {
    timeZone: 'UTC',
    month: 'long',
  });
}

/** `2026` — the standalone year (used by the year selector). No thousands separator applies to a 4-digit year. */
export function formatYear(year: number): string {
  return String(year);
}

/**
 * Czech month names in the **locative** case, 1-based, for the one sentence in
 * the UI that puts a month after a preposition: the bulk modal's
 * "Vyberte dny v září." (`doc/design/screens/10-modal-bulk.png`).
 *
 * A hand-written table, unlike everything else in this module, because `Intl`
 * genuinely cannot produce it. CLDR carries two Czech month forms — the
 * `format` (genitive: `září`, `srpna`) and the `stand-alone` (nominative:
 * `září`, `srpen`) — and neither is the locative (`září`, `srpnu`). There is no
 * option object that asks for a third. The alternative was to reword the
 * sentence around the case ("v měsíci září"), which the design does not say.
 *
 * September is the one month whose four cases are all `září`; the table is
 * therefore *not* verifiable against the design alone, and `dates.spec.ts`
 * pins all twelve.
 */
const CZECH_MONTHS_LOCATIVE = [
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
] as const;

/**
 * `září` — the month name in the locative, as it reads after `v`.
 *
 * @param month 1-based (1 = leden … 12 = prosinec), matching `DateParts.month`.
 */
export function formatMonthLocative(month: number): string {
  const name = CZECH_MONTHS_LOCATIVE[month - 1];
  if (name === undefined) {
    throw new RangeError(`Not a month number (1–12): ${String(month)}`);
  }
  return name;
}

/**
 * `čtvrtek` — the weekday name on its own, for a list that already prints the
 * date beside it (the bulk schedule's `datum · den v týdnu` rows).
 *
 * Deliberately not derived from {@link formatFullDate} by string surgery: the
 * long form is one ICU pattern whose parts are not separated by anything this
 * code may assume, and slicing it would break the moment the locale data
 * changes. Asking `Intl` for the weekday alone is the same question, answered
 * by the same data.
 */
export function formatWeekdayName(date: DateOnly): string {
  return formatter.dateTime(toUtcMidnight(date), { timeZone: 'UTC', weekday: 'long' });
}
