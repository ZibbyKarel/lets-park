import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createApiClient } from '@lets-park/api-client';
import { ERROR_DEFINITIONS } from '@lets-park/contract';
import { IntlProvider } from '@lets-park/i18n';
import { ScreenError, ScreenLoading } from './screen-state';

/**
 * Every error under test here is produced by a **real** `RPCLink`: a client
 * built with `createApiClient`, a real procedure called on it, and only the
 * `fetch` at the bottom replaced. Nothing constructs an `ORPCError` by hand.
 *
 * That is the point rather than thoroughness for its own sake. `ScreenError`'s
 * whole job is reading a failure that came off the wire, and a hand-built
 * error object would assert this file's idea of the wire shape instead of the
 * transport's — which is exactly the mistake that let `SPOT_ALREADY_RESERVED`
 * ship unreachable once already. It is also why `@orpc/client` is not imported
 * here: `apps/web` may not, and it does not need to.
 */

const API_URL = 'https://api.test/rpc';

/** Answers every request with one canned status and body. */
function transportAnswering(status: number, body: unknown) {
  return async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
}

/** oRPC's success/error envelope. The payload is not at the top level. */
function rpcPayload(value: unknown) {
  return { json: value, meta: [] };
}

/**
 * A domain failure in oRPC's wire shape (`ORPCErrorJSON`). `defined: false`
 * because `apps/api`'s global filter serialises every domain error that way —
 * `doc/decision/0033-*`, and the reason `toContractError` reads the code and
 * not oRPC's `defined` flag.
 */
function contractErrorBody(code: string, status: number, message: string) {
  return { defined: false as const, code, status, message };
}

/** Drives one real call and returns what it threw. */
async function failureFrom(fetchImpl: () => Promise<Response>): Promise<unknown> {
  const client = createApiClient({ url: API_URL, fetch: fetchImpl });
  const marker = Symbol('resolved');
  const outcome = await client.me.get().then(
    () => marker,
    (error: unknown) => error
  );
  if (outcome === marker) {
    throw new Error('expected the call to reject, but it resolved');
  }
  return outcome;
}

function renderWithIntl(node: ReactNode) {
  render(<IntlProvider>{node}</IntlProvider>);
}

describe('ScreenLoading', () => {
  it('announces itself as a status with the Czech label', () => {
    renderWithIntl(<ScreenLoading />);

    expect(screen.getByRole('status')).toHaveTextContent('Načítá se…');
  });

  it('lets a screen supply its own label', () => {
    renderWithIntl(<ScreenLoading label="Načítám parkoviště…" />);

    expect(screen.getByRole('status')).toHaveTextContent('Načítám parkoviště…');
  });
});

describe('ScreenError', () => {
  it('shows the Czech sentence for a contract error code', async () => {
    const error = await failureFrom(
      transportAnswering(
        409,
        rpcPayload(
          contractErrorBody(
            'SPOT_ALREADY_RESERVED',
            409,
            ERROR_DEFINITIONS.SPOT_ALREADY_RESERVED.message
          )
        )
      )
    );

    renderWithIntl(<ScreenError error={error} />);

    expect(screen.getByText('Něco se nepovedlo')).toBeInTheDocument();
    expect(
      screen.getByText('Toto parkovací místo je na daný den už rezervované.')
    ).toBeInTheDocument();
  });

  it('never shows the error’s own developer-facing message', async () => {
    const developerMessage = ERROR_DEFINITIONS.RESERVATION_LIMIT_REACHED.message;
    const error = await failureFrom(
      transportAnswering(
        409,
        rpcPayload(contractErrorBody('RESERVATION_LIMIT_REACHED', 409, developerMessage))
      )
    );

    renderWithIntl(<ScreenError error={error} />);

    expect(screen.queryByText(developerMessage)).not.toBeInTheDocument();
    expect(
      screen.getByText('Na tento den už máte rezervaci — na den je povolená jen jedna.')
    ).toBeInTheDocument();
  });

  it('falls back to one generic sentence for a transport failure', async () => {
    const error = await failureFrom(() => {
      throw new TypeError('Failed to fetch');
    });

    renderWithIntl(<ScreenError error={error} />);

    expect(screen.getByText('Zkuste to prosím znovu za chvíli.')).toBeInTheDocument();
    expect(screen.queryByText(/Failed to fetch/)).not.toBeInTheDocument();
  });

  it('falls back for a code outside the contract’s closed enum', async () => {
    // A backend answering with something the contract never declared must not
    // put an unknown enum name in front of a user.
    const error = await failureFrom(
      transportAnswering(400, rpcPayload(contractErrorBody('SOMETHING_NEW', 400, 'nope')))
    );

    renderWithIntl(<ScreenError error={error} />);

    expect(screen.getByText('Zkuste to prosím znovu za chvíli.')).toBeInTheDocument();
    expect(screen.queryByText(/SOMETHING_NEW/)).not.toBeInTheDocument();
  });

  it('offers no retry control when there is nothing to retry', () => {
    renderWithIntl(<ScreenError error={new Error('boom')} />);

    expect(screen.queryByRole('button', { name: 'Zkusit znovu' })).not.toBeInTheDocument();
  });

  it('runs the retry callback when one is supplied', async () => {
    const onRetry = jest.fn();
    const user = userEvent.setup();

    renderWithIntl(<ScreenError error={new Error('boom')} onRetry={onRetry} />);
    await user.click(screen.getByRole('button', { name: 'Zkusit znovu' }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('renders the title as a heading only when the page asks for one', () => {
    const { unmount } = render(
      <IntlProvider>
        <ScreenError error={new Error('boom')} />
      </IntlProvider>
    );
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
    unmount();

    renderWithIntl(<ScreenError error={new Error('boom')} headingLevel={2} />);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Něco se nepovedlo');
  });
});
