/**
 * Calendar-day helpers that are not locale-dependent.
 *
 * The locale-dependent half — every `Intl`-backed formatter — moved to
 * `./date-formatters.ts` when the app gained a second language; what stays here
 * is the `DateOnly` plumbing and `MONTH_LOCATIVE_CS`, the one Czech form
 * `Intl` cannot produce.
 */

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
export const MONTH_LOCATIVE_CS = [
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
