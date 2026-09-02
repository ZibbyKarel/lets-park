/**
 * The retry policy, exercised rather than asserted.
 *
 * Every test here counts the requests that reached the transport, so what is
 * verified is what a real `QueryClient` did with a real error from a real
 * `RPCLink` — not what `shouldRetryQuery` returns when handed a hand-built
 * object.
 */

import type { QueryClient } from '@tanstack/react-query';
import { ERROR_CODES, ERROR_DEFINITIONS } from '@lets-park/contract';
import {
  createQueryClient,
  DEFAULT_GC_TIME_MS,
  DEFAULT_STALE_TIME_MS,
  MAX_QUERY_RETRIES,
  createApiQueryUtils,
} from '../index';
import {
  contractErrorResponse,
  rpcPayload,
  stubApi,
  transportErrorResponse,
  unreachableApi,
} from '../__fixtures__/stub-api';
import type { StubbedApi, StubbedResponse } from '../__fixtures__/stub-api';

/**
 * A client with the shipped defaults, minus the wait between retries.
 *
 * Only `retryDelay` is overridden — `retry` stays the function under test.
 * That the rest of the defaults survive this call is itself asserted below.
 */
function testQueryClient(): QueryClient {
  return createQueryClient({ defaultOptions: { queries: { retryDelay: () => 0 } } });
}

/** Runs one query to completion (success or failure) and reports the attempts. */
async function attemptsFor(api: StubbedApi): Promise<number> {
  const utils = createApiQueryUtils(api.client);
  const client = testQueryClient();

  await client
    .fetchQuery(utils.overview.day.queryOptions({ input: { date: '2026-09-15' } }))
    .catch(() => undefined);

  return api.requests.length;
}

function alwaysRespond(response: StubbedResponse): StubbedApi {
  return stubApi(() => response);
}

describe('createQueryClient defaults', () => {
  it('applies the project-wide caching policy', () => {
    const queries = testQueryClient().getDefaultOptions().queries;

    expect(queries?.staleTime).toBe(DEFAULT_STALE_TIME_MS);
    expect(queries?.gcTime).toBe(DEFAULT_GC_TIME_MS);
    expect(queries?.refetchOnWindowFocus).toBe(false);
    // The retry function survived the `retryDelay` override — the merge is one
    // level deep, so a caller cannot silently drop the rest of the defaults.
    expect(typeof queries?.retry).toBe('function');
  });

  it('does not retry mutations', () => {
    expect(createQueryClient().getDefaultOptions().mutations?.retry).toBe(false);
  });

  it('lets a caller override a single default without losing the others', () => {
    const queries = createQueryClient({
      defaultOptions: { queries: { staleTime: 1 } },
    })
      .getDefaultOptions().queries;

    expect(queries?.staleTime).toBe(1);
    expect(queries?.gcTime).toBe(DEFAULT_GC_TIME_MS);
    expect(queries?.refetchOnWindowFocus).toBe(false);
  });
});

describe('query retry', () => {
  it('does not repeat a 4xx domain error', async () => {
    const api = alwaysRespond(contractErrorResponse('SPOT_ALREADY_RESERVED'));

    expect(await attemptsFor(api)).toBe(1);
  });

  it('does not repeat RESERVATIONS_LOCKED, whose status is 423', async () => {
    // 423 is inside the 4xx band but outside the statuses people think of as
    // "client errors"; it is the one most likely to be dropped by a later edit.
    expect(ERROR_DEFINITIONS.RESERVATIONS_LOCKED.status).toBe(423);

    const api = alwaysRespond(contractErrorResponse('RESERVATIONS_LOCKED'));

    expect(await attemptsFor(api)).toBe(1);
  });

  it.each(ERROR_CODES)('does not repeat %s', async (code) => {
    // Every domain error is a decision, not a hiccup — none of the twelve is
    // worth asking again. Guards a future code whose status falls outside 4xx.
    const api = alwaysRespond(contractErrorResponse(code));

    expect(await attemptsFor(api)).toBe(1);
  });

  it('does not repeat a throttled request, which carries no contract code', async () => {
    const api = alwaysRespond(
      transportErrorResponse(429, 'ThrottlerException: Too Many Requests')
    );

    expect(await attemptsFor(api)).toBe(1);
  });

  it('repeats a 5xx up to the configured limit', async () => {
    const api = alwaysRespond(transportErrorResponse(500, 'Internal server error'));

    expect(await attemptsFor(api)).toBe(1 + MAX_QUERY_RETRIES);
  });

  it('repeats a request that never reached a server', async () => {
    const api = unreachableApi();
    const utils = createApiQueryUtils(api.client);
    const client = testQueryClient();

    await client
      .fetchQuery(utils.overview.day.queryOptions({ input: { date: '2026-09-15' } }))
      .catch(() => undefined);

    expect(api.requests).toHaveLength(1 + MAX_QUERY_RETRIES);
  });

  it('stops repeating as soon as a retry succeeds', async () => {
    const api = stubApi((callIndex) =>
      callIndex === 0
        ? transportErrorResponse(503, 'Service unavailable')
        : { status: 200, body: rpcPayload({ ok: true }) }
    );
    const utils = createApiQueryUtils(api.client);

    await testQueryClient()
      .fetchQuery(utils.overview.day.queryOptions({ input: { date: '2026-09-15' } }))
      .catch(() => undefined);

    expect(api.requests).toHaveLength(2);
  });
});
