# query

`@lets-park/query` — the wrapper lib that owns `@tanstack/react-query`. It is the only place
in the workspace allowed to import that package.

Usage, the caching and retry policy, and contract-derived query keys:
**`doc/wrappers.md`** (section "`libs/query` — TanStack Query").

## Running unit tests

Run `nx test query` to execute the unit tests via [Jest](https://jestjs.io).

The tests run on a custom Jest environment (`jest-environment-web.cjs`) because they drive a
real oRPC link and jsdom implements no `fetch` — see `doc/decision/0037-*`.
