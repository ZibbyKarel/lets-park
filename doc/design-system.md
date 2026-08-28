# Design system – tokens and primitives

Tasks 6 and 7 from `doc/implementation-plan.md`. This document describes the
two bottom layers of the design system:

1. **tokens** (`libs/design-system/tokens`) – values,
2. **primitives** (`libs/design-system/primitives`) – the smallest components,
   built exclusively from those values.

The third layer (`compounds`, e.g. DataTable) is created in a later task. The
dependency direction `tokens → primitives → compounds` is enforced by ESLint
(see `doc/workspace.md`, the `ds:*` dimension); **compounds may import
primitives, never the other way around**.

The design system is **domain-free**: nothing in `libs/design-system/**` may
know about `ParkingSpot`/`Reservation`/users – not in prop names, not in
stories. Tokens are purely presentational values; primitives are purely
presentational components.

## Source of truth

`doc/design/ds/colors_and_type.css` ("Shoptet Design System — Foundations").
Every color, `--fs-*`, `--lh-*`, `--tracking-*`, `--space-*`, `--radius-*`,
`--shadow-*`, `--dur-*`, `--ease-*`, and `--container*` in the TS source is a
**1:1** copy of this file – no rounding, renaming, or "improving" the values.
The triple `#fcaf00`/`#00e25a`/`#3b88ff` (colors of cars on occupied spots) is
from `plan.md` / `doc/design/README.md` – it's a separate group of tokens and
is **not** part of the general palette (see below).

Two token groups are **derived, not copied**, from `colors_and_type.css`, and
their file headers say so: `BREAKPOINTS` in `layout.ts`
(`doc/decision/0011-breakpoints-are-derived.md`) and `CONTROLS` in
`controls.ts` – control heights and switch geometry, read from the exported
design (`doc/decision/0011-derived-control-tokens-and-rounding.md`).

## How the tokens are put together

```
libs/design-system/tokens/
  src/
    lib/
      colors.ts          – brand, neutrals, semantic surface/fg/line/status
      car-palette.ts      – CAR_COLOR_PALETTE (car color only, a separate namespace)
      typography.ts        – font families, @font-face metadata, type scale, lh, tracking
      spacing.ts            – --space-*
      radius.ts              – --radius-*
      controls.ts             – --control-h-*, --switch-* (DERIVED, see 0011)
      shadows.ts               – --shadow-*
      motion.ts                 – --ease-*, --dur-*
      layout.ts                  – --container*, BREAKPOINTS (derived, see 0011)
      tokens.ts                   – DESIGN_TOKENS = everything above, combined
      generate-css.ts               – generateTokensCss(tokens) -> CSS text (a pure function)
      generate-css.spec.ts           – test that the committed tokens.css == generateTokensCss(...)
    index.ts                          – public API (@lets-park/design-system/tokens)
  scripts/
    build-tokens-css.ts                 – writes generateTokensCss(...) into assets/tokens.css
  assets/
    tokens.css                            – GENERATED (see below), committed
    theme.css                              – HAND-WRITTEN Tailwind v4 bridge
    fonts/*.otf                             – Neue Haas Grotesk Display Pro (8 weights)
```

**The single source of truth in code is TS** (`DESIGN_TOKENS` in `tokens.ts`).
Everything else (`tokens.css`, the mapping in `theme.css`) is derived from it.

## Why `tokens.css` is generated and committed

See `doc/decision/0010-generated-tokens-css-is-committed.md`. In short: it's
committed so the app works right after `npm ci` with no extra build step, and
it's excluded from Prettier because it faithfully copies the style of the
source `colors_and_type.css` (uppercase hex, no spaces in `rgba()`), which
Prettier would otherwise rewrite.

### Aliases are preserved

`colors_and_type.css` defines part of the tokens not as a value, but as a
reference (`--bg: var(--neutral-0)`, `--fg: var(--text)`,
`--success: var(--brand-green)`, `--radius-pill: var(--radius-cta)`,
`--brand-blue-100: var(--brand-light)`). The generator does **not** flatten
this chain into a literal – it writes it out as `var(...)`, because this is
exactly how future theming works (redirect the target and every consumer
moves with it).

The TS objects, however, hold already-resolved values (`SURFACE_COLORS.bg` is
the string `#FFFFFF`, not a reference), so the data and the emitted alias
could drift apart. This is guarded by the `alias()` function in
`generate-css.ts`: at generation time it compares the token's value against
the target's value and, on a mismatch, **throws** instead of writing
`--bg: var(--neutral-0)` for a token that no longer holds white.

The **drift test** (`generate-css.spec.ts`) guards against the TS source and
the committed file drifting apart: it reads `assets/tokens.css` from disk and
compares it with `toBe()` against what `generateTokensCss(DESIGN_TOKENS)`
would generate right now. Change a token in TS without running
`nx run design-system-tokens:generate-css`, and the test fails in CI.

## How to add a new token

1. Add the value to the relevant `src/lib/*.ts` file (or create a new one for
   a new category) and wire it into `DESIGN_TOKENS` in `tokens.ts`.
2. Add the corresponding line to `generateTokensCss` in `generate-css.ts` (the
   same `--custom-property` name it should have in `colors_and_type.css` /
   the design).
3. Run `npx nx run design-system-tokens:generate-css` and commit the changed
   `assets/tokens.css`.
4. If the token makes sense as a Tailwind utility (color, spacing, radius,
   shadow, font, tracking/leading, ease/duration), add a mapping line to
   `assets/theme.css` (`@theme inline { --tailwind-namespace-*: var(--your-token); }`).
   The namespace follows Tailwind's documentation (`--color-*`, `--spacing-*`,
   `--radius-*`, `--shadow-*`, `--font-*`, `--text-*`, `--leading-*`,
   `--tracking-*`, `--ease-*`, `--duration-*`, `--breakpoint-*`).
5. `npm run test` (runs the drift test) + `npm run lint` + `npm run typecheck`.

Never write a value by hand in two places (TS **and** CSS) – one must always
be derived from the other (the generator), or you get exactly the drift the
test exists to catch.

## Wiring into Tailwind v4

`assets/theme.css` is the entry CSS file for consumers. The first consumer is
the primitives' Storybook, which imports it via a **relative path** –
`@import '../../tokens/assets/theme.css'` in `.storybook/preview.css`. Reason:
`@lets-park/design-system/tokens` is only a TS `tsconfig` path alias for
module resolution in JS/TS; neither CSS `@import` nor bundlers understand it
automatically. How `theme.css` reaches `apps/web`'s output CSS (a relative
path vs. an `exports` mapping in the lib's `package.json`) is decided by
whichever task first styles the web app:

```css
@import 'tailwindcss';
@import './tokens.css';

@theme {
  /* breakpoints – literal values, Tailwind needs them for @media */
  --breakpoint-sm: 640px;
  /* ... */
}

@theme inline {
  /* every line is a var() reference to a custom property from tokens.css,
     never a duplicated literal value */
  --color-brand-blue: var(--brand-blue);
  /* ... */
}
```

- `@import "tailwindcss"` + `@theme inline` is the current (Tailwind v4)
  CSS-first syntax – no `tailwind.config.js` (verified via Context7/official
  docs, not from memory, per global constraint 10).
- `@theme inline` maps custom properties from `tokens.css` onto Tailwind theme
  variables (`--color-*`, `--text-*`, `--spacing-*`, ...), so Tailwind
  generates utilities (`bg-brand-blue`, `text-fg-2`, `rounded-md`,
  `shadow-lg`, `duration-base`, ...) with the same value the CSS variable
  has. `inline` is required because `--theme-*` variables otherwise cannot
  reference other custom properties defined outside a `@theme` block
  (without `inline`, Tailwind would freeze the value at parse time, not
  runtime).
- `--breakpoint-*` sits in the (non-`inline`) `@theme` block, because
  Tailwind needs breakpoints as literal values to generate `@media` –
  `var()` can't be substituted into a media query.
- `--container` / `--container-wide` (content max-width, not container
  queries) **are not** mapped into Tailwind's `--container-*` namespace –
  that's reserved for `@container` query breakpoints, a different concept.
  Use them directly as a CSS variable, e.g. `max-w-[var(--container)]`.
- `tailwindcss` and `@tailwindcss/vite` are already in the repo (added by
  Task 7 for Storybook). The PostCSS/Next.js pipeline in `apps/web` is still
  outside the scope of this document – it belongs to the task that touches
  `apps/web`.

## The occupied-spot car color – why it lives elsewhere

`CAR_COLOR_PALETTE` (`car-palette.ts`) and `--palette-car-1/2/3` in
`tokens.css` / `--color-car-1/2/3` in `theme.css` are **deliberately**
separated from the general palette (`COLORS`). The design
(`doc/design/README.md`) defines them only for the color of a car on an
occupied parking spot – no other UI component (button, badge, status) should
use them. The tokens carry only the raw data (three colors); the
deterministic choice of "which user gets which color" is domain logic (it
needs the concept of a "user"), so it doesn't live in the design system.

## Fonts and licensing

The 8 weights of Neue Haas Grotesk Display Pro (`.otf`) are copied into
`assets/fonts/` and used in the generated `@font-face` blocks. **The
production-deployment license is not verified** (see `doc/design/README.md`
and `doc/decision/0012-*`) – which is why `FONT_FAMILIES.sans` always has a
working fallback (`Neue Haas Grotesk` → `Helvetica Neue` → `Inter` → `Arial`
→ `system-ui` → `sans-serif`), so the app still looks reasonable even if the
`.otf` files had to be dropped from a production build.

---

# Primitives (`libs/design-system/primitives`)

The package `@lets-park/design-system/primitives`, tags `type:ui`,
`scope:web`, `ds:primitives`. Nine components, each with a **story alongside
the component** and a Jest + Testing Library test (84 tests total).

```
libs/design-system/primitives/
  .storybook/
    main.ts         – Storybook 10 + @storybook/react-vite, viteFinal → @tailwindcss/vite
    preview.ts      – parameters, backgrounds
    preview.css     – @import theme.css from the tokens lib + @source '../src'
  src/
    lib/
      cx.ts               – a class-name joiner (no clsx, three lines)
      control-size.ts     – the shared sm|md|lg|xl scale + FOCUS_RING, PRESS_FEEDBACK
      field.tsx           – useFieldIds() + <Field> (label / hint / error around an element)
      button.tsx    badge.tsx    avatar.tsx
      input.tsx     select.tsx   checkbox.tsx   radio.tsx
      switch.tsx    stepper.tsx
      *.stories.tsx        – a story for every component
      *.spec.tsx            – a test for every component
    index.ts                 – the public API
```

## Rules that apply across every primitive

- **No hand-written value.** Colors, spacing, radii, and font sizes come from
  tokens via Tailwind utilities (`bg-brand-blue`, `px-4`, `rounded-cta`,
  `text-sm`); control heights via `h-[var(--control-h-lg)]`. Rounding
  dimensions from the design is covered in `doc/decision/0011-*`.
- **Native elements.** Input/Select/Checkbox/Radio are real `<input>` /
  `<select>` elements, only restyled. Keyboard behavior comes from the
  platform, not our code (`doc/decision/0012-*`).
- **A uniform focus ring** (`FOCUS_RING`) on every focusable element – 2px
  `--brand-blue` via `:focus-visible`. The design doesn't specify one, see
  `doc/decision/0012-*`.
- **The disabled state doesn't override, it replaces.** Two utilities that
  set the same property (`bg-bg` and `bg-bg-muted`, `text-fg` and
  `text-fg-3`) have the same specificity – whichever Tailwind emits later in
  the stylesheet wins, not whichever comes later in `className`. Adding
  disabled colors *on top of* the enabled ones therefore works by luck for
  any given pair, or silently doesn't. Enabled-state colors therefore belong
  in the enabled branch of a ternary, so an element never carries both halves
  of a pair at once. The same applies to `checked:` – that variant overrides
  both plain utilities, so a disabled, checked Checkbox has to recolor its
  `checked:` fill too, or it lights up brand blue.
  jsdom applies no stylesheet at all, so no render test catches this – the
  invariant is guarded by `disabled-styling.spec.tsx`.
- **The error state is a message.** The `error` prop doesn't exist as a
  boolean: the error text *is* the state. It sets `aria-invalid`, the red
  border, and `role="alert"` together, so they can't drift apart.
- **UI copy in Czech** (e.g. the Stepper's default button labels),
  **identifiers and comments in English.**

## Inventory and API

Shared types: `ControlSize = 'sm' | 'md' | 'lg' | 'xl'` (36/40/48/56 px). Form
elements additionally accept `label`, `hint`, `error` (the `FieldOwnProps`
type).

### `Button`

| prop | type | default | description |
| --- | --- | --- | --- |
| `variant` | `'primary' \| 'secondary' \| 'outline' \| 'danger' \| 'ghost'` | `'primary'` | visual weight |
| `size` | `ControlSize` | `'md'` | height |
| `loading` | `boolean` | `false` | spinner + `aria-busy` + `disabled` |
| `fullWidth` | `boolean` | `false` | stretches to the parent's width |
| `startAdornment` / `endAdornment` | `ReactNode` | – | content before/after the label |
| `type` | `'button' \| 'submit' \| 'reset'` | `'button'` | defaults to `button`, so it never accidentally submits a form |

Plus every native `<button>` attribute. `ref` points at the `<button>`.

The variants are derived from the design: `primary` is the blue pill CTA
(hover `--brand-blue-700` + `--shadow-blue`), `secondary` is white with a
border, `outline` is transparent with a dark border (hover inverts to solid
dark), `danger` is the "Delete" style – light red, solid red on hover.

### `Input`

`size`, `fullWidth` (default `true`), `label`, `hint`, `error`,
`wrapperClassName`, plus every native `<input>` attribute except `size`
(overridden by the scale – a character-count `size` has no place in the
design system). `ref` points at the `<input>`.

### `Select`

Same props as `Input` (`size` overridden again), `children` are `<option>`
elements. The arrow is an `aria-hidden` SVG; the element stays a native
`<select>`.

### `Checkbox`

`label`, `hint`, `error`, `indeterminate`, `wrapperClassName`, plus every
native `<input>` attribute except `type` and `size`. `indeterminate` is set
via a ref, since it exists only on the DOM node, not as an HTML attribute.

### `Radio` and `RadioGroup`

`Radio` has the same props as `Checkbox` (minus `indeterminate`).
**It deliberately has no `aria-invalid`** – `role="radio"` doesn't support it;
the group carries validity instead.

`RadioGroup` (`<fieldset>`): `legend` (required, the group's accessible name),
`hint`, `error`, `horizontal`.

### `Badge`

`tone: 'neutral' | 'info' | 'success' | 'warning' | 'danger'` (default
`neutral`) plus `<span>` attributes. No role – it's a label, not a control.
When a badge carries information not present in the surrounding text, the
caller must expose it itself.

### `Avatar`

| prop | type | default |
| --- | --- | --- |
| `initials` | `string` | – (required) |
| `label` | `string` | – |
| `tone` | `'dark' \| 'info' \| 'neutral' \| 'warning'` | `'neutral'` |
| `size` | `'sm' \| 'md' \| 'lg'` (24/32/40 px) | `'md'` |

With `label` it's `role="img"` with an accessible name; without it,
`aria-hidden` – the assumption is that a name is written next to it.
**The application computes the initials**, not the design system: that
requires knowing what the name is, which is domain logic.

### `Switch`

`checked` / `defaultChecked` / `onCheckedChange`, `label`, `aria-label`,
`tone: 'info' | 'success'`, `disabled`, `id`, `name`. Both controlled and
uncontrolled modes. It's a `<button type="button" role="switch">`, so Enter
and Space work by virtue of the element itself, and it never submits a form.

### `Stepper`

| prop | type | default |
| --- | --- | --- |
| `value` / `defaultValue` / `onValueChange` | `number` / `(v: number) => void` | uncontrolled, starting at `min` |
| `min` / `max` / `step` | `number` | `0` / `MAX_SAFE_INTEGER` / `1` |
| `label` | `string` | – (required) |
| `formatValue` | `(v: number) => string` | – |
| `decrementLabel` / `incrementLabel` | `string` | `'Snížit'` ("Decrease") / `'Zvýšit'` ("Increase") |

The value has `role="spinbutton"`, so it's reachable via Tab and operable
with the arrow keys, Home, and End – the buttons are a mouse convenience, not
the only way in. `formatValue` also becomes `aria-valuetext`, so the unit
gets read out too.

## Storybook

```bash
npx nx run design-system-primitives:storybook         # dev server, port 4400
npx nx run design-system-primitives:build-storybook   # static build into dist/
```

The configuration is written by hand, without `@nx/storybook` and without
addons – why, is covered in `doc/decision/0013-*`. Note: `build-storybook` is
**not** part of `npm run build`; it has to be added to CI separately.

`preview.css` imports `theme.css` (not `tokens.css` – that alone gives
variables but no Tailwind utilities) and adds `@source '../src'` so Tailwind
scans the components; it looks starting from the directory of the CSS file
that contains `@import "tailwindcss"`, which lives in the tokens lib.

## How to add a primitive

1. `src/lib/<name>.tsx` – the component. Dimensions from the scale in
   `control-size.ts`, colors from Tailwind utilities wired to tokens. A
   native element, whenever one exists.
2. `src/lib/<name>.stories.tsx` – **at the same time**, not afterward. States
   that make sense: default, variants, sizes, disabled, error, loading.
3. `src/lib/<name>.spec.tsx` – **at the same time**. Tests `role`, accessible
   name, Tab reachability, keyboard, and interaction; not appearance.
4. Export it from `src/index.ts`.
5. `npm run lint && npm run typecheck && npm run test` and
   `npx nx run design-system-primitives:build-storybook`.
