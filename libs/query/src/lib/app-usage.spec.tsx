/**
 * What a feature component actually writes.
 *
 * This file is the wrapper's reason for being, stated as a running example: a
 * component reads and writes the API through `@lets-park/query` and
 * `@lets-park/api-client` only — no `@tanstack/react-query` import, no
 * `@orpc/client` import — and the last test in this file reads this file's own
 * source to prove it, rather than trusting that nobody adds one later.
 */

import { readFileSync } from 'node:fs';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toContractError } from '@lets-park/api-client';
import type { ApiClient } from '@lets-park/api-client';
import {
  createApiQueryUtils,
  createQueryClient,
  QueryProvider,
  useMutation,
  useQuery,
  useQueryClient,
} from '../index';
import type { ApiQueryUtils } from '../index';
import {
  contractErrorResponse,
  rpcPayload,
  stubApi,
  transportErrorResponse,
} from '../__fixtures__/stub-api';
import type { StubbedApi, StubbedResponse } from '../__fixtures__/stub-api';

const DAY = { date: '2026-09-15' };
const SPOT_ID = '22222222-2222-4222-8222-222222222222';

const DAY_OVERVIEW = {
  date: DAY.date,
  window: null,
  canReserve: true,
  spots: [],
  myReservation: null,
};

/** Renders `ui` inside the app's provider, exactly as `apps/web` will. */
function renderWithApi(client: ApiClient, ui: (utils: ApiQueryUtils) => React.ReactElement) {
  const utils = createApiQueryUtils(client);
  const queryClient = createQueryClient({
    defaultOptions: { queries: { retryDelay: () => 0 } },
  });

  return render(<QueryProvider client={queryClient}>{ui(utils)}</QueryProvider>);
}

function DayOverview({ utils }: { utils: ApiQueryUtils }) {
  const { data, error, isPending } = useQuery(utils.overview.day.queryOptions({ input: DAY }));

  if (isPending) {
    return <p>Načítám…</p>;
  }
  if (error) {
    // The whole point of the error contract: a component switches on a member
    // of `ERROR_CODES`, never on an HTTP status or an oRPC type.
    return <p role="alert">{toContractError(error)?.code ?? 'UNKNOWN'}</p>;
  }
  return <p>{data.date}</p>;
}

function ReserveButton({ utils }: { utils: ApiQueryUtils }) {
  const queryClient = useQueryClient();
  const create = useMutation({
    ...utils.reservation.create.mutationOptions(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: utils.overview.key() }),
  });

  return (
    <>
      <button type="button" onClick={() => create.mutate({ parkingSpotId: SPOT_ID, ...DAY })}>
        Rezervovat
      </button>
      {create.error ? <p role="alert">{toContractError(create.error)?.code}</p> : null}
    </>
  );
}

function alwaysRespond(response: StubbedResponse): StubbedApi {
  return stubApi(() => response);
}

describe('a feature component using only the wrapper libs', () => {
  it('renders data fetched through a contract procedure', async () => {
    const api = alwaysRespond({ status: 200, body: rpcPayload(DAY_OVERVIEW) });

    renderWithApi(api.client, (utils) => <DayOverview utils={utils} />);

    expect(await screen.findByText('2026-09-15')).toBeInTheDocument();
    expect(api.requests[0]?.url).toBe('https://api.test/rpc/overview/day');
  });

  it('surfaces a domain failure as a contract error code', async () => {
    const api = alwaysRespond(contractErrorResponse('FORBIDDEN'));

    renderWithApi(api.client, (utils) => <DayOverview utils={utils} />);

    expect(await screen.findByRole('alert')).toHaveTextContent('FORBIDDEN');
    // Not retried: a 4xx is an answer, and the user sees it immediately.
    expect(api.requests).toHaveLength(1);
  });

  it('reports a failure with no contract code as unknown rather than inventing one', async () => {
    const api = alwaysRespond(transportErrorResponse(429, 'ThrottlerException'));

    renderWithApi(api.client, (utils) => <DayOverview utils={utils} />);

    expect(await screen.findByRole('alert')).toHaveTextContent('UNKNOWN');
  });

  it('sends a mutation once and does not retry it', async () => {
    const api = alwaysRespond(contractErrorResponse('SPOT_ALREADY_RESERVED'));

    renderWithApi(api.client, (utils) => <ReserveButton utils={utils} />);
    await userEvent.click(screen.getByRole('button', { name: 'Rezervovat' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('SPOT_ALREADY_RESERVED');
    expect(api.requests).toHaveLength(1);
  });

  it('refetches the overview after a successful mutation invalidates it', async () => {
    const api = stubApi((callIndex) =>
      callIndex === 1
        ? { status: 200, body: rpcPayload({ id: 'r1' }) }
        : { status: 200, body: rpcPayload(DAY_OVERVIEW) }
    );

    renderWithApi(api.client, (utils) => (
      <>
        <DayOverview utils={utils} />
        <ReserveButton utils={utils} />
      </>
    ));

    await screen.findByText('2026-09-15');
    expect(api.requests).toHaveLength(1);

    await userEvent.click(screen.getByRole('button', { name: 'Rezervovat' }));

    // overview, mutation, overview again — the invalidation reached the query
    // through the branch key, with no key written by hand anywhere above.
    await waitFor(() => expect(api.requests).toHaveLength(3));
    expect(api.requests.map((request) => new URL(request.url).pathname)).toEqual([
      '/rpc/overview/day',
      '/rpc/reservation/create',
      '/rpc/overview/day',
    ]);
  });

  it('needs neither @tanstack/react-query nor @orpc/* imported directly', () => {
    const source = readFileSync(__filename, 'utf8');

    expect(source).not.toMatch(/from\s+['"]@tanstack\//);
    expect(source).not.toMatch(/from\s+['"]@orpc\//);
    expect(source).not.toMatch(/require\(\s*['"]@(?:tanstack|orpc)\//);
  });
});
