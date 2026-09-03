/**
 * Czech date formatting, matching `doc/design/screens/07-lot.png` and
 * `05-admin-window.png` exactly:
 *
 * - full date:        `pondělí 28. září 2026`   (weekday + day + month + year)
 * - day, month, year: `28. srpna 2026`          (no weekday; "dnes je …")
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

/**
 * `28. srpna 2026` — day, genitive month and year, **without** the weekday.
 *
 * Distinct from {@link formatFullDate} rather than derived from it: the
 * reservation-window tab's "dnes je 28. srpna 2026"
 * (`doc/design/screens/05-admin-window.png`) is a parenthetical inside a longer
 * sentence, where a weekday would be noise. Stripping one from the long form by
 * hand would mean cutting a locale-formatted string apart, which is exactly the
 * thing `Intl` exists to avoid.
 *
 * The genitive month (`srpna`, not `srpen`) comes from `day` being part of the
 * same format call — see the module docs.
 */
export function formatDayMonthAndYear(date: DateOnly): string {
  return formatter.dateTime(toUtcMidnight(date), {
    timeZone: 'UTC',
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
