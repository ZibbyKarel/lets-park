# 0002 – Visual design: downloaded locally, tokens from the Shoptet DS

**Date:** 2026-08-28 · **Status:** accepted

## What

The design from the Claude Design link in `plan.md` was opened and **fully downloaded**
into `doc/design/` (the source `.dc.html`, `ds/colors_and_type.css`, fonts, 16
screenshots). `libs/shared/design-system/tokens` is derived **from
`doc/design/ds/colors_and_type.css`**, not from the textual fallback in `plan.md`.

## Why

- `plan.md` says: try to open the design; only if it's completely unreachable, use the
  textual fallback. The design is reachable, so the fallback does not apply.
- `WebFetch` on the link returns 403 (Cloudflare), but **Playwright with a logged-in
  claude.ai session opens it fine**. A 403 from `WebFetch` is therefore not evidence of
  unreachability.
- The fallback description in `plan.md` lists accents `#fcaf00 / #00e25a / #3b88ff`. The
  actual design is built on the Shoptet DS palette with primary `#008FFF`. Had we gone by
  the fallback, the entire design system would have had the wrong colors.

## How

- Download: Playwright's `page.request.get` against `…claudeusercontent.com/…/serve/…`
  (cookie `__Host-omelette-preview` holds the session) → POST to a local Node "sink"
  server that writes the file to disk. This keeps the 86 kB HTML out of the model's
  context.
- Subagents for Phases 2/3/6 receive absolute paths into `doc/design/` in their brief.
- The `.otf` fonts are kept for fidelity; verify the license before production — tokens
  must still have a working fallback stack.

## Risk if this is wrong

If `colors_and_type.css` turned out not to be the current version of the company DS, the
tokens would need regenerating – the change is localized to a single lib
(`libs/shared/design-system/tokens`), since everything else reads only the tokens, never the raw
values.
