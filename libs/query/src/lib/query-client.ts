/**
 * The one `QueryClient` configuration the app runs on.
 *
 * `libs/query` owns `@tanstack/react-query` (`eslint.config.mjs`,
 * `WRAPPED_LIBRARIES`), so this is the only place these defaults can be set —
 * which is the point: caching and retry behaviour is a product decision, not
 * something each feature re-derives at its own call site.
 */

import { QueryClient } from '@tanstack/react-query';
import type { DefaultOptions, QueryClientConfig } from '@tanstack/react-query';
import { shouldRetryQuery } from './retry';

/**
 * How long a fetched result is served without a refetch.
 *
 * Reservation data changes when *someone else* books a spot, and that arrives
 * over Socket.io (`libs/realtime-client`, Task 21) rather than by polling — so
 * this is about avoiding a refetch storm when a user moves between screens,
 * not about freshness.
 */
export const DEFAULT_STALE_TIME_MS = 30_000;

/** How long an unused result stays in the cache before it is dropped. */
export const DEFAULT_GC_TIME_MS = 5 * 60_000;

export const DEFAULT_QUERY_OPTIONS = {
  staleTime: DEFAULT_STALE_TIME_MS,
  gcTime: DEFAULT_GC_TIME_MS,
  /**
   * Off: with realtime invalidation in place, refetching every screen each time
   * the tab regains focus is redundant traffic. TanStack's default is `true`.
   */
  refetchOnWindowFocus: false,
  retry: shouldRetryQuery,
} satisfies DefaultOptions['queries'];

/**
 * Mutations are **not** retried, which is also TanStack's default and is
 * restated here so it reads as a decision rather than an omission.
 *
 * Every mutation in this contract writes something a person did on purpose —
 * booking, cancelling, joining a queue. A silent second attempt after an
 * ambiguous failure risks a duplicate write the user never asked for, and the
 * unique constraints that make double-booking impossible would turn the retry
 * into a *different* error than the original.
 */
export const DEFAULT_MUTATION_OPTIONS = {
  retry: false,
} satisfies DefaultOptions['mutations'];

/**
 * Builds the app's `QueryClient`.
 *
 * `overrides` is merged one level deep into `defaultOptions`, so a caller (in
 * practice: a test that wants `retryDelay: () => 0`) can change one option
 * without silently dropping the rest of the defaults — which is what passing a
 * whole `defaultOptions` object to `new QueryClient` would do.
 */
export function createQueryClient(overrides: QueryClientConfig = {}): QueryClient {
  const { defaultOptions, ...rest } = overrides;
  const { queries, mutations, ...otherDefaults } = defaultOptions ?? {};

  return new QueryClient({
    ...rest,
    defaultOptions: {
      ...otherDefaults,
      queries: { ...DEFAULT_QUERY_OPTIONS, ...queries },
      mutations: { ...DEFAULT_MUTATION_OPTIONS, ...mutations },
    },
  });
}
