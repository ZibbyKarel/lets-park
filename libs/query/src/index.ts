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
 * - the hooks themselves, re-exported unchanged.
 *
 * Errors keep flowing through `@lets-park/api-client`: a component reads a
 * failure with `toContractError` and switches on a member of `ERROR_CODES`.
 * That helper is not re-exported here — it belongs to the transport, and one
 * import path per concept is easier to follow than two names for the same
 * function.
 */

export { createApiQueryUtils } from './lib/api-query';
export type { ApiQueryUtils } from './lib/api-query';

export {
  createQueryClient,
  DEFAULT_GC_TIME_MS,
  DEFAULT_MUTATION_OPTIONS,
  DEFAULT_QUERY_OPTIONS,
  DEFAULT_STALE_TIME_MS,
} from './lib/query-client';

export { MAX_QUERY_RETRIES, shouldRetryQuery } from './lib/retry';

export { QueryProvider } from './lib/provider';
export type { QueryProviderProps } from './lib/provider';

/**
 * TanStack Query's own hooks and client type, re-exported so components wrapped
 * in `QueryProvider` never need a second, direct import of the package.
 */
export {
  QueryClient,
  useInfiniteQuery,
  useIsFetching,
  useIsMutating,
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query';

export type {
  DefaultError,
  QueryClientConfig,
  QueryKey,
  UseInfiniteQueryResult,
  UseMutationOptions,
  UseMutationResult,
  UseQueryOptions,
  UseQueryResult,
  UseSuspenseQueryResult,
} from '@tanstack/react-query';
