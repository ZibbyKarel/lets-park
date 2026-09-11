# 0011 – Breakpoints are derived, not sourced

**Date:** 2026-08-28 · **Status:** accepted

## What

`doc/design/ds/colors_and_type.css` defines no `--breakpoint-*` custom properties
at all. `libs/shared/design-system/tokens/src/lib/layout.ts` (`BREAKPOINTS`) and
`assets/theme.css` (`@theme { --breakpoint-* }`) therefore use Tailwind v4's
default values: `sm:640px, md:768px, lg:1024px, xl:1280px, 2xl:1536px`.

## Why

The Task 6 brief says: "Derive any breakpoints not explicit in the CSS from the
design and mark them with a comment." The source CSS file has no breakpoints at
all — only two content widths, `--container`/`--container-wide` (1200px/1320px).
The screenshots in `doc/design/screens/` show individual states, not the
intermediate widths where the layout actually breaks. Without access to a live
`.dc.html` render (which would require Playwright), there's no way to "measure"
breakpoints precisely – so I chose the Tailwind v4 defaults, because:

- `xl` (1280px) sits between `--container` (1200px) and `--container-wide`
  (1320px) – a reasonable point where the container stops being the limiting
  factor.
- `2xl` (1536px) is above both containers.
- `sm`/`md` cover the ordinary mobile→tablet transition that the design (the
  mobile-first type scale in `colors_and_type.css`, commented "bumped at md via
  utilities") assumes.

## How

- TS source: `BREAKPOINTS` in `layout.ts`, with a "DERIVED" comment.
- CSS: `assets/theme.css`, the `@theme { ... }` block (not `@theme inline` –
  breakpoints must be literal values; Tailwind evaluates them into `@media`, where
  `var()` cannot be used).

## Risk if this is wrong

Once real widths from the `.dc.html` are available (a task on `primitives`/
`compounds`, or a design review), the fix is local: change `BREAKPOINTS` in
`layout.ts` and the corresponding lines in `theme.css`. Nothing else in `tokens`
depends on the specific breakpoint values.
