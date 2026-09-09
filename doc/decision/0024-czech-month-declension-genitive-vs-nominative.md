# 0024 – Czech month declension: genitive vs. nominative in `libs/i18n`

**Date:** 2026-08-28 · **Status:** accepted

## What

The `libs/i18n` formatting functions (`formatFullDate`, `formatDayAndMonth`,
`formatMonthAndYear`, `formatMonthName`) don't share a single
`Intl.DateTimeFormat` call — they use two different option combinations,
because Czech declines month names, and the design
(`doc/design/screens/07-lot.png`, `05-admin-window.png`) uses both forms side
by side:

| form | example | when |
| --- | --- | --- |
| genitive | `25. srpna` ("the 25th of August"), `pondělí 28. září 2026` ("Monday, September 28, 2026") | the day is part of the same formatting call |
| nominative | `srpen` ("August"), `srpen 2026` ("August 2026") | the day is **not** part of the call |

## Why

`Intl.DateTimeFormat('cs-CZ', …)` doesn't by itself produce one fixed form — it
produces whatever ICU's `cs-CZ` data assigns to that specific combination of
fields. Verified in Node (see the comment in `dates.ts` and the tests in
`dates.spec.ts`):

```
{ month: 'long' }                                    -> "srpen"       (nominative)
{ month: 'long', year: 'numeric' }                   -> "srpen 2026"  (nominative)
{ day: 'numeric', month: 'long' }                     -> "25. srpna"   (genitive)
{ weekday: 'long', day: 'numeric', month: 'long', … } -> "pondělí 28. září 2026" (genitive)
```

For September the genitive coincides with the nominative ("září" in both),
so a naive test on a single month wouldn't reveal the difference — which is
why `dates.spec.ts` deliberately also covers August (`srpen` / `srpna`) and
October (`říjen` / `října`), where the two forms differ.

## How

- `formatFullDate` and `formatDayAndMonth` always format the date with `day`
  in the options → genitive.
- `formatMonthAndYear` and `formatMonthName` never combine the date with
  `day` → nominative.
- All four go through next-intl (`createFormatter({ locale: 'cs', timeZone: 'UTC'
  })`), not through raw `Intl.DateTimeFormat` — next-intl is only a thin layer
  over the same ICU behavior here, but `libs/i18n` is the only place allowed
  to import `next-intl` (`eslint.config.mjs`), so the formatting code has to go
  through it here too.
- `timeZone: 'UTC'` in both formatters is independent of `PRAGUE_TIME_ZONE`,
  which `IntlProvider` uses — the input to these functions is always a
  `DateOnly` (a calendar day with no timezone, `doc/decision/0014-*`), converted
  to UTC midnight, so no Europe/Prague shift is allowed to occur.

## Risk if this is wrong

If the ICU data for `cs-CZ` changed between Node/ICU versions (e.g. stopped
offering the genitive), `dates.spec.ts` would fail immediately — the tests
assert an exact string, not just "some month". The fix would then live in
`dates.ts` itself (an explicit table of declined forms), not in the API that
`libs/i18n` exports outward.

> **Note (0303):** `formatFullDate` / `formatDayAndMonth` / `formatMonthAndYear` / `formatMonthName` were renamed to methods `fullDate` / `dayAndMonth` / `monthAndYear` / `monthName` on `createDateFormatters(locale)` by `doc/decision/0303-*`. The Czech genitive-vs-nominative reasoning above is unaffected.
