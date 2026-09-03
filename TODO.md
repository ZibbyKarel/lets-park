# TODO

Ideas and open questions, not approved work. Nothing on this list has been
agreed against `plan.md`; an entry that would need `plan.md` to change says so
on its own line, because a backlog item read on its own reads as an instruction.

English, like every other document here — `CLAUDE.md` reserves Czech for
`plan.md` and for UI copy.

- [x] Copy the `codebase-design`, `graphify` and `pr-review-toolkit` skills and
      the `format-changed` and `review-before-commit` hooks over from
      `../shoptet-partner-cli`, and check they behave correctly in this repo.

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
