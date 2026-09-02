/**
 * How a failure that came back over the wire is read as a contract error.
 *
 * Every case here goes through a real `RPCLink` with a stubbed `fetch`, so what
 * is asserted is what the transport actually produces — not what an oRPC error
 * object constructed by hand would look like.
 */

import { ERROR_CODES, ERROR_DEFINITIONS } from '@lets-park/contract';
import type { ErrorCode } from '@lets-park/contract';
import { createApiClient, errorStatus, toContractError } from '../index';
import { failingTransport, rpcPayload, stubTransport } from '../__fixtures__/stub-transport';

const URL_BASE = 'https://api.test/rpc';

/**
 * The body `apps/api`'s global filter builds for a domain error
 * (`contractErrorBody()` in `contract-exception.filter.ts`,
 * `doc/decision/0033-*`): oRPC's `ORPCErrorJSON`, with `defined: false` because
 * an error that reached the filter is one the procedure did not declare.
 */
function contractErrorBody(code: ErrorCode, data?: Record<string, unknown>) {
  const definition = ERROR_DEFINITIONS[code];
  return {
    defined: false as const,
    code,
    status: definition.status,
    message: definition.message,
    ...(data === undefined ? {} : { data }),
  };
}

/** Calls one procedure through a real link and returns whatever it threw. */
async function failedCall(response: { status: number; body: unknown }): Promise<unknown> {
  const transport = stubTransport(() => response);
  const client = createApiClient({ url: URL_BASE, fetch: transport.fetch });
  return rejectionOf(
    client.reservation.create({
      parkingSpotId: '22222222-2222-4222-8222-222222222222',
      date: '2026-09-15',
    })
  );
}

/** The reason a promise rejected. Fails the test if it resolves instead. */
async function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
  const marker = Symbol('resolved');
  const outcome = await promise.then(
    () => marker,
    (error: unknown) => error
  );
  if (outcome === marker) {
    throw new Error('expected the call to reject, but it resolved');
  }
  return outcome;
}

describe('toContractError', () => {
  it('maps a domain error from the wire onto its contract code, status and details', async () => {
    const error = await failedCall({
      status: 409,
      body: rpcPayload(contractErrorBody('SPOT_ALREADY_RESERVED', { reservationId: 'abc' })),
    });

    expect(toContractError(error)).toEqual({
      code: 'SPOT_ALREADY_RESERVED',
      status: 409,
      message: ERROR_DEFINITIONS.SPOT_ALREADY_RESERVED.message,
      details: { reservationId: 'abc' },
    });
  });

  it('does not narrow on oRPC’s `defined` flag, which this backend always sends as false', async () => {
    const error = await failedCall({
      status: 423,
      body: rpcPayload(contractErrorBody('RESERVATIONS_LOCKED')),
    });

    // `defined: false` is what `contractErrorBody()` writes for *every* domain
    // error. oRPC's own `isDefinedError` narrows on exactly that flag, so it
    // would reject this error; the code-based check does not.
    expect(toContractError(error)).toEqual({
      code: 'RESERVATIONS_LOCKED',
      status: 423,
      message: ERROR_DEFINITIONS.RESERVATIONS_LOCKED.message,
      details: undefined,
    });
  });

  it.each(ERROR_CODES)(
    'maps %s, so no code in the closed enum is left unreadable',
    async (code) => {
      const error = await failedCall({
        status: ERROR_DEFINITIONS[code].status,
        body: rpcPayload(contractErrorBody(code)),
      });

      expect(toContractError(error)?.code).toBe(code);
    }
  );

  it('leaves `details` undefined when the error carried none', async () => {
    const error = await failedCall({
      status: 404,
      body: rpcPayload(contractErrorBody('NOT_FOUND')),
    });

    expect(toContractError(error)?.details).toBeUndefined();
  });

  it('returns null for a code outside the closed enum', async () => {
    const error = await failedCall({
      status: 409,
      body: rpcPayload({
        defined: false,
        code: 'SOMETHING_NEW',
        status: 409,
        message: 'A code this frontend has never heard of.',
      }),
    });

    expect(toContractError(error)).toBeNull();
  });

  it('returns null for a transport failure the contract has no code for', async () => {
    // The throttler's 429 keeps Nest's `{ statusCode, message }` shape and
    // carries no `code` at all (`doc/decision/0033-*`).
    const error = await failedCall({
      status: 429,
      body: { statusCode: 429, message: 'ThrottlerException: Too Many Requests' },
    });

    expect(toContractError(error)).toBeNull();
  });

  it('returns null when the request never reached a server', async () => {
    const client = createApiClient({ url: URL_BASE, fetch: failingTransport() });
    const error = await rejectionOf(client.me.get({}));

    expect(error).toBeInstanceOf(TypeError);
    expect(toContractError(error)).toBeNull();
  });

  it('returns null for a plain thrown value', () => {
    expect(toContractError(new Error('boom'))).toBeNull();
    expect(toContractError('boom')).toBeNull();
    expect(toContractError(undefined)).toBeNull();
  });

  /**
   * A regression guard for a mismatch found by probing the link, not by reading
   * the code: `apps/api`'s filter writes `contractErrorBody()` at the **top
   * level** of the response (`response.status(...).json(body)`), but the RPC
   * protocol reads the payload out of `{ json, meta }`. A top-level body
   * therefore deserialises to `undefined`, fails oRPC's `isORPCErrorJson`, and
   * the client falls back to a code synthesised from the HTTP status — losing
   * the domain code entirely.
   *
   * This test pins the *broken* behaviour so that the day the server starts
   * wrapping the body (or the oRPC handler takes the response over), it fails
   * loudly and is deleted, rather than the mismatch being discovered in the UI.
   * See the task report for the raw probe output.
   */
  it('cannot read a domain code from a body that is not wrapped in the RPC envelope', async () => {
    const error = await failedCall({
      status: 409,
      body: contractErrorBody('SPOT_ALREADY_RESERVED', { reservationId: 'abc' }),
    });

    // 409 happens to map to the common oRPC code `CONFLICT`, which is *also* a
    // member of `ERROR_CODES` — so this does not even fail closed: it silently
    // reports the wrong domain error.
    expect(toContractError(error)?.code).toBe('CONFLICT');
    expect(toContractError(error)?.code).not.toBe('SPOT_ALREADY_RESERVED');
  });
});

describe('errorStatus', () => {
  it('reports the status of a domain error', async () => {
    const error = await failedCall({
      status: 423,
      body: rpcPayload(contractErrorBody('RESERVATIONS_LOCKED')),
    });

    expect(errorStatus(error)).toBe(423);
  });

  it('reports the status of a transport failure that carried no contract code', async () => {
    const error = await failedCall({
      status: 429,
      body: { statusCode: 429, message: 'ThrottlerException: Too Many Requests' },
    });

    expect(errorStatus(error)).toBe(429);
  });

  it('reports 500 for an unknown server failure', async () => {
    const error = await failedCall({
      status: 500,
      body: { statusCode: 500, message: 'Internal server error' },
    });

    expect(errorStatus(error)).toBe(500);
  });

  it('is undefined when there was no response at all', async () => {
    const client = createApiClient({ url: URL_BASE, fetch: failingTransport() });
    const error = await rejectionOf(client.me.get({}));

    expect(errorStatus(error)).toBeUndefined();
  });
});
