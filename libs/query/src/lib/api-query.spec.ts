/**
 * The contract-derived query utilities: keys and delegation.
 *
 * Query keys are the thing nobody notices is wrong until a cache entry quietly
 * fails to invalidate, so these tests check the properties that matter — the
 * same input yields the same key, a different input does not, and a branch key
 * really does match its leaves through the cache's own matcher, not through a
 * hand-written prefix comparison.
 */

import { createApiQueryUtils, createQueryClient } from '../index';
import { rpcPayload, stubApi } from '../__fixtures__/stub-api';

const DAY = { date: '2026-09-15' };
const OTHER_DAY = { date: '2026-09-16' };

const DAY_OVERVIEW = {
  date: DAY.date,
  window: null,
  canReserve: true,
  spots: [],
  myReservation: null,
};

function utilsWith(body: unknown = DAY_OVERVIEW) {
  const api = stubApi(() => ({ status: 200, body: rpcPayload(body) }));
  return { api, utils: createApiQueryUtils(api.client) };
}

describe('createApiQueryUtils keys', () => {
  it('is stable for the same procedure and input', () => {
    const { utils } = utilsWith();

    expect(utils.overview.day.queryKey({ input: DAY })).toEqual(
      utils.overview.day.queryKey({ input: DAY })
    );
  });

  it('is stable across two separately built util trees', () => {
    // The key must depend on the contract path and the input, never on the
    // client instance — otherwise a second `createApiQueryUtils` (SSR vs.
    // browser, or a re-render) would miss the cache entry the first one wrote.
    expect(utilsWith().utils.overview.day.queryKey({ input: DAY })).toEqual(
      utilsWith().utils.overview.day.queryKey({ input: DAY })
    );
  });

  it('differs for a different input', () => {
    const { utils } = utilsWith();

    expect(utils.overview.day.queryKey({ input: DAY })).not.toEqual(
      utils.overview.day.queryKey({ input: OTHER_DAY })
    );
  });

  it('differs between two procedures', () => {
    const { utils } = utilsWith();

    expect(utils.overview.day.queryKey({ input: DAY })).not.toEqual(
      utils.spot.list.queryKey({ input: {} })
    );
  });

  it('starts with the procedure path from the contract router', () => {
    const { utils } = utilsWith();
    const [path] = utils.overview.day.queryKey({ input: DAY });

    expect(path).toEqual(['overview', 'day']);
  });

  it('lets a branch key invalidate its leaves', async () => {
    const { api, utils } = utilsWith();
    const client = createQueryClient();
    const options = utils.overview.day.queryOptions({ input: DAY });

    await client.fetchQuery(options);
    expect(api.requests).toHaveLength(1);

    // Partial match on the branch — this is how a feature invalidates
    // "everything about the day overview" without naming each input.
    await client.invalidateQueries({ queryKey: utils.overview.key() });
    await client.fetchQuery(options);

    expect(api.requests).toHaveLength(2);
  });

  it('does not let an unrelated branch key invalidate them', async () => {
    const { api, utils } = utilsWith();
    const client = createQueryClient();
    const options = utils.overview.day.queryOptions({ input: DAY });

    await client.fetchQuery(options);
    await client.invalidateQueries({ queryKey: utils.admin.key() });
    await client.fetchQuery(options);

    // Still fresh (`staleTime`), so the second fetch is served from cache.
    expect(api.requests).toHaveLength(1);
  });
});

describe('createApiQueryUtils delegation', () => {
  it('sends the query through the contract procedure it was built from', async () => {
    const { api, utils } = utilsWith();

    const result = await createQueryClient().fetchQuery(
      utils.overview.day.queryOptions({ input: DAY })
    );

    expect(api.requests[0]?.url).toBe('https://api.test/rpc/overview/day');
    expect(JSON.parse(await (api.requests[0] as Request).text())).toEqual({ json: DAY });
    expect(result).toEqual(DAY_OVERVIEW);
  });

  it('exposes the plain client call on the same node', async () => {
    const { api, utils } = utilsWith();

    await utils.overview.day.call(DAY);

    expect(api.requests[0]?.url).toBe('https://api.test/rpc/overview/day');
  });
});
