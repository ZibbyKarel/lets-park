# TODO

- [ ] tlačítko "Zkusit znovu" po neúspěšném přihlášení nic nedělá. Mělo by přesměrovat zpět na login

- [ ] jsem přihlášen jako dev-admin ale nevidím odkaz na stránku /sprava v menu pod user avatarem

- [ ] `libs/design-system` should be one package rather than three nested ones.

- [ ] `libs/shared-types` → `czech-holidays`: is there a library for this? The
      whole file is unsatisfying.

- [ ] Cap registered parking spots at 5 per user per month.

- [ ] ~~Drop `libs/query` and import TanStack Query directly in the
      application.~~ **Not actionable as written — it is the opposite of a
      binding rule.** `plan.md`'s mandatory-wrapper table requires that app and
      feature code reach `@tanstack/react-query` only through `libs/query`, and
      `eslint.config.mjs` enforces it (probed: an import of
      `@tanstack/react-query` from `apps/web` is an error). Doing this would
      mean changing `plan.md` first, with the user's agreement, and removing
      the ESLint rule deliberately rather than as a side effect. Kept on the
      list because the underlying question — is the wrapper earning its keep? —
      is a fair one; the answer is not "delete the enforcement".

- [ ] `apps/web`: all routes and URLs should be in English. Note that the URLs
      are Czech today because the interface is (`doc/decision/0029-*`), and the
      e2e page objects address them by name, so this is a product decision plus
      a migration rather than a rename.

- [ ] projdi celou code-base a použij skill codebase-design pr-review-toolkit (code-simplifier a silent-failure-hunter) na její refaktoring.
