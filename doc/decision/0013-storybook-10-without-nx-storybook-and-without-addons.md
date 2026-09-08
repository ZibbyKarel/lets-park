# 0013 – Storybook 10 configured by hand, without `@nx/storybook` and without addons

## What

Storybook 10 for `libs/design-system/primitives` is set up **by hand**:

- `.storybook/main.ts` – `@storybook/react-vite`, `viteFinal` adds
  `@tailwindcss/vite`, `addons: []`,
- `.storybook/preview.css` – imports `theme.css` from the tokens lib and adds
  `@source '../src'`,
- The Nx targets `storybook` and `build-storybook` are plain `nx:run-commands`
  calling `storybook dev` / `storybook build`.

The repo gained **neither** `@nx/storybook` **nor** any addon (including
`@storybook/addon-a11y` and testing addons).

## Why

**No `@nx/storybook`.** All it would add are executors for two targets that
`nx:run-commands` can do in one line. In exchange it would add a dependency
whose support for Storybook 10 has to be re-verified on every upgrade – a
generator tuned for an older major can produce a configuration shape that no
longer applies. The manual configuration is fifteen lines and reads directly
against the official documentation (global constraint 10: the API of these
libraries is never written from memory).

**No addons.** The accessibility bar in this task is **functional**: every
component has a Jest + Testing Library test for `role`, accessible name, focus
and keyboard behavior. Those run in `npm run test` and fail CI. `addon-a11y`, by
contrast, is a panel someone has to look at — it enforces nothing. Testing
addons (the vitest addon / test-runner) would also drag a second test runner
into the repo alongside Jest, which `plan.md` doesn't want.

**Why `theme.css`, not `tokens.css`.** The task brief says "import `tokens.css`
in `preview.ts`". What's actually imported is `theme.css`, because **that is the
documented entry point for consumers** (see `doc/design-system.md`), and it
imports `tokens.css` itself. If Storybook only pulled in `tokens.css`, it would
have CSS variables but no Tailwind utilities to spend them with – the
components would be unstyled.

## How

- `viteFinal` **adds** the plugin to the existing array (`[...(plugins ?? []),
  tailwindcss()]`) rather than overwriting it – otherwise plugins Storybook set
  up itself would disappear.
- Tailwind v4 looks for source files starting from the directory of the CSS
  file that contains `@import "tailwindcss"`. That file lives in the tokens
  lib, so the primitives would never get scanned – hence the explicit
  `@source '../src'` in `preview.css`.
- Verified empirically, not by assumption: a static build (`nx run
  design-system-primitives:build-storybook`) succeeds, and the resulting CSS
  contains both variables (`--control-h-md`, `--switch-knob-shadow`) and
  utilities including arbitrary values (`.h-\[var\(--control-h-lg\)\]`),
  variants (`.hover\:shadow-blue`, `.peer-indeterminate\:opacity-100`,
  `.active\:not-disabled\:scale-\[0\.97\]`), and `@font-face` blocks.
- `tsconfig.storybook.json` covers `.storybook/**` and `*.stories.tsx`, so the
  configuration and stories get type-checked – `tsconfig.lib.json`, conversely,
  excludes them so stories don't end up in the lib's public API.

## Risk

- **The manual configuration will age.** Nobody migrates it automatically on a
  Storybook upgrade. But it's small, and `build-storybook` fails immediately in
  CI if it breaks.
- **No a11y panel.** There's no automatic contrast/ARIA check in the browser.
  Once Phase 7 has e2e tests, an axe check belongs there instead (it runs
  against the real application, not isolated stories). Until then, unit tests
  and `eslint-plugin-jsx-a11y` (enabled in the lint config) cover it.
- **`storybook build` isn't part of `npm run build`.** It's a separate target,
  so `npm run build` doesn't run it; it must be added explicitly to CI (`nx
  run-many -t build-storybook`), otherwise broken stories would only be
  noticed manually.
