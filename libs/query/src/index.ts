/**
 * `@lets-park/query` — the wrapper lib that owns `@tanstack/react-query`.
 *
 * Everything a feature needs to read or write through the API is re-exported
 * here, so no application file ever names the wrapped package
 * (`doc/wrappers.md`, `eslint.config.mjs` → `WRAPPED_LIBRARIES`):
 *
 * - `createQueryClient` / `QueryProvider` — the app's one client and its
 *   provider, with the project's caching and retry policy already applied;
 * - `createApiQueryUtils` — contract-derived query keys and query functions
 *   for every procedure, built on `@lets-park/api-client`;
 * - the three TanStack hooks `apps/web` uses, re-exported unchanged.
 *
 * Errors keep flowing through `@lets-park/api-client`: a component reads a
 * failure with `toContractError` and switches on a member of `ERROR_CODES`.
 * That helper is not re-exported here — it belongs to the transport, and one
 * import path per concept is easier to follow than two names for the same
 * function.
 */

export { createApiQueryUtils } from './lib/api-query';
export type { ApiQueryUtils } from './lib/api-query';

/**
 * The policy constants `createQueryClient` is built from — `DEFAULT_*`,
 * `MAX_QUERY_RETRIES`, `shouldRetryQuery` — stay inside the lib. They are the
 * client's implementation, not a second dial an application turns, and their
 * own specs read them from `./lib/query-client` and `./lib/retry` already.
 */
export { createQueryClient } from './lib/query-client';

export { QueryProvider } from './lib/provider';
export type { QueryProviderProps } from './lib/provider';

/**
 * TanStack Query's own hooks, re-exported so components wrapped in
 * `QueryProvider` never need a second, direct import of the package.
 *
 * These three are the ones `apps/web` uses. `useInfiniteQuery`,
 * `useIsFetching`, `useIsMutating` and `useSuspenseQuery` were here too, on
 * the theory that a wrapper which is the only legal import site has to
 * anticipate its consumers — but a guess about the future reads exactly like
 * a hook the app already depends on, and there is no way to tell them apart
 * from here. Re-adding one is a single line, in the commit that needs it.
 */
export { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

/**
 * `UseQueryResult` — the type `useQuery` returns, needed wherever a component
 * passes a query result down (`screen-state.tsx`, `use-current-user.ts`).
 * TanStack's option and result types for the hooks above are not here: none is
 * named anywhere, and each one published is another shape a reader has to
 * decide is not part of this lib's vocabulary.
 */
export type { UseQueryResult } from '@tanstack/react-query';

/**
 * `QueryClient` is exported as a **type only**, deliberately.
 *
 * Application code needs to *name* the type — `QueryProvider` takes one as a
 * prop, and an app-level factory annotates its return — but it must never
 * construct one. `new QueryClient()` would produce a client with TanStack's
 * defaults instead of this project's (`createQueryClient`): three retries on
 * everything, including the 4xx domain errors that are decisions rather than
 * hiccups, and `refetchOnWindowFocus` on. That bypass would pass the ESLint
 * wrapper ban, because the class would have come from `@lets-park/query`.
 *
 * A type-only export makes it a compile error rather than a convention.
 * `createQueryClient` is the only way to get an instance.
 */
export type { QueryClient } from '@tanstack/react-query';
