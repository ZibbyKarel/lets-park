# 0269 – The hand-written Tailwind bridge is guarded by a drift test, and the colour list is derived

## What

`assets/theme.css` — the `@theme inline` bridge that turns `tokens.css`'s custom
properties into Tailwind utilities — is hand-written and says so at the top of
itself. `tokens.css` is generated and compared byte-for-byte by
`generate-css.spec.ts`; the bridge had nothing checking it at all.

New: `libs/shared/design-system/tokens/src/lib/theme-css.spec.ts`, which asserts

1. every `--x` declared in `tokens.css` is either referenced as `var(--x)` by
   `theme.css` or named in an explicit `UNMAPPED_ON_PURPOSE` list (25 tokens,
   each with the reason it has no Tailwind namespace to map into);
2. nothing on that list has since been deleted from `tokens.css`;
3. `theme.css` never references a `var(--x)` that `tokens.css` does not declare;
4. `theme.css`'s `--color-*` block is exactly the set named by the new
   `COLOR_UTILITIES` map, in both directions;
5. `theme.css`'s five literal `--breakpoint-*` values equal `BREAKPOINTS` from
   `layout.ts`;
6. the file compiles, and its spacing and colour utilities resolve to tokens
   (see `0268`).

Also new: `libs/shared/design-system/tokens/src/lib/color-utilities.ts`, exporting
`COLOR_UTILITIES` — every colour the bridge maps, keyed by the name that appears
in a utility (`brand-blue-100`, `fg-2`, `scrim`, `car-1`) and valued with the CSS
colour it resolves to. It is derived from the token modules, not transcribed.

## Why

- **The two failure modes were both silent.** Add a token to `colors.ts` and it
  is generated into `tokens.css` and then simply gets no utility — no error,
  just a class that does not exist. Rename one and the bridge keeps emitting
  `var(--gone)`, which is valid CSS that resolves to nothing.
- **`BREAKPOINTS` was the sharpest case.** It is exported from `layout.ts`,
  never rendered into `tokens.css` (Tailwind resolves `--breakpoint-*` at build
  time inside `@media`, and a custom property cannot be substituted into a media
  query), and its five literals were re-typed by hand into `theme.css`. Two
  copies of the same numbers with nothing comparing them.
- **The prose was already the list.** `theme.css` enumerated its exclusions in
  three paragraphs of comment at the bottom. Turning that prose into a
  `Record<string, string>` cost nothing and made it checkable — and the check
  found nothing wrong, which is the outcome that was worth confirming.
- **Comments had to be stripped before scanning, and that is not a detail.**
  `theme.css` documents each unmapped token by showing how to consume it
  (`max-w-[var(--modal-w-sm)]`, `z-[var(--z-overlay)]`, `h-[var(--control-h-lg)]`).
  Counting those as references made six of the twenty-five look mapped. The
  first version of this test passed vacuously for exactly the tokens it was
  meant to be strictest about; stripping comments is what makes it real.
- **`COLOR_UTILITIES` exists because two specs were maintaining the same list by
  hand and both were wrong the same way.** `disabled-styling.spec.tsx` carried
  34 colour names and was missing `scrim` and every `neutral-*` step, so
  `bg-scrim` (`modal.tsx`) and `text-neutral-600` (`data-table.tsx`) were
  invisible to it. A derived map cannot fall behind, and assertion 4 above keeps
  it equal to what the bridge actually mints.

## How

- `theme-css.spec.ts` reads both asset files from disk and compiles `theme.css`
  with `compile()` from `tailwindcss` — the same package version the app builds
  with, not a re-implementation. A full compile takes ~11 ms.
- It locates `tailwindcss/index.css` by walking up from `__dirname` rather than
  with `require.resolve`, because Jest's resolver maps `*.css` to a JavaScript
  stub and the compiler then dies on `Invalid declaration: 'var Reflect'`.
- Falsified by four mutations of `theme.css` at once — deleting
  `--color-scrim`, misspelling `var(--fg-2)` as `var(--fg-two)`, changing
  `--breakpoint-lg` to `1023px`, deleting `--spacing-4`. Five assertions fired;
  restoring the file returned it to 17 passing.

## Risk

- **`UNMAPPED_ON_PURPOSE` is still a hand-written list, and that is the honest
  shape of it** — "this token deliberately has no utility" is a judgement, not
  something derivable. The two directions of assertion mean it cannot rot
  silently: a token added to `tokens.css` fails until someone decides, and a
  token removed fails until the entry goes.
- **The compile assertions pin literal rule text** (`.p-4 { padding:
  var(--space-4); }`). A Tailwind upgrade that changes its output formatting
  will fail them. That is a fair trade for a test that reads the real emitted
  CSS instead of trusting a comment, and the failure will be obvious.
- **`COLOR_UTILITIES` is now a public export of the tokens lib** used only by
  tests. It is a reasonable thing for the lib to publish — the set of colour
  utilities it defines — but it is API surface that exists because tests needed
  it.
