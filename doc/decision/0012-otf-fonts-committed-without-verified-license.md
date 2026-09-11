# 0012 – `.otf` fonts are committed without a verified license, with a mandatory fallback

**Date:** 2026-08-28 · **Status:** accepted (temporary) · **Risk:** licensing

## What

8 weights of `NHaasGroteskDSPro-*.otf` are copied from `doc/design/ds/fonts/` into
`libs/shared/design-system/tokens/assets/fonts/` and are committed to git. `FONT_FACES` in
`typography.ts` uses them for `@font-face` in the generated `tokens.css`.
`FONT_FAMILIES.sans` has a working fallback stack behind `NHaasGroteskDS` (`Neue
Haas Grotesk, Helvetica Neue, Inter, Arial, system-ui, sans-serif`).

**Side finding:** `colors_and_type.css` declares 9 `@font-face` rules (including
weight 700 italic, file `NHaasGroteskDSPro-76BdIt.otf`), but `doc/design/ds/fonts/`
contains only 8 files – this weight was never exported (`doc/design/README.md`
itself says "8 weights"). `FONT_FACES` therefore **omits** the entry for weight 700
italic (a comment in `typography.ts` explains why) – otherwise `@font-face` would
reference a non-existent file and the browser would just silently 404. Bold italic
text still renders (the browser synthesizes italics from weight 700 normal), it
just isn't a real drawn weight. The test `generate-css.spec.ts` ("every declared
font face file actually exists") guards against `FONT_FACES` and the files actually
present in `assets/fonts/` drifting apart again.

## Why

`doc/design/README.md` explicitly warns: "Verify the Neue Haas Grotesk Display Pro
license before deploying to production." I have no means to verify a license within
this task (it requires purchasing/checking a contract that isn't available to an
agent), and the Task 6 brief nonetheless asks for "`@font-face` declarations for
NHaasGroteskDS with a fallback stack; copy the fonts from `doc/design/ds/fonts/`
into the lib's assets" – i.e. commit the fonts, rather than let the license question
block the whole task.

## How

- The fonts live in `assets/fonts/*.otf`; the `@font-face` blocks are generated
  from `FONT_FACES`.
- `FONT_FAMILIES.sans`'s fallback ensures the app looks reasonable even without
  these files (e.g. in an environment that would have to drop them for licensing
  reasons).
- This decision is "temporary": until the license is verified, the fonts stay in
  place purely for design fidelity during development.

## Risk if this is wrong

If it turns out Neue Haas Grotesk Display Pro can't be deployed to production
without a license: (1) delete `assets/fonts/*.otf` and the `@font-face` block from
the generator, (2) `FONT_FAMILIES.sans` keeps working unchanged on the fallback,
(3) no other token or consumer (primitives/compounds) depends on the physical
presence of the `.otf` files — only on `--font-sans`. The impact is therefore
visual (a different font), not functional.
