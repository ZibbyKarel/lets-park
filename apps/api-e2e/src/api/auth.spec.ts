/**
 * What the API does with a request that has no business being answered.
 *
 * This is the half of authentication a browser suite cannot reach.
 * `apps/web-e2e` always arrives holding a session Auth.js minted, so every
 * request it makes is a *good* one; nothing there ever asks what happens to a
 * missing, malformed or foreign token. That is what this file is for, and it
 * asks over plain HTTP, which is the only way to send a header nobody would
 * write on purpose.
 *
 * Two properties are asserted throughout, and both are security properties
 * rather than behaviour:
 *
 * - **A rejection is a 401, never a 500.** A stack trace out of the verifier
 *   would say which check failed and how far a token got.
 * - **A rejection says nothing.** No claim, no key id, no exception name, no
 *   `at ` frame. `contract-exception.filter.ts` owns that; these are the
 *   end-to-end proof that it is still in the chain.
 *
 * `POST /api/rpc/me/get` is the probe: it is the smallest authenticated
 * procedure, it takes no input, and it is behind the same global `JwtAuthGuard`
 * every other one is — so what it refuses, they all refuse.
 */
import axios from 'axios';

/** The oRPC transport sits at `/api/rpc`, not at `/api`. */
const ME_GET = '/api/rpc/me/get';

/** oRPC's request envelope. Its shape is irrelevant here — the guard runs first. */
const EMPTY_INPUT = { json: {} };

const anyStatus = { validateStatus: () => true } as const;

/**
 * A syntactically valid, correctly signed-looking JWT for an issuer this API
 * does not trust. It is **not** a credential and cannot become one: the
 * signature is the literal string `not-a-signature`, so it fails verification
 * before any claim in it is read. Written out rather than minted so that this
 * repository contains no key material of any kind.
 */
const FOREIGN_TOKEN = [
  // {"alg":"RS256","kid":"default","typ":"JWT"}
  'eyJhbGciOiJSUzI1NiIsImtpZCI6ImRlZmF1bHQiLCJ0eXAiOiJKV1QifQ',
  // {"sub":"nobody","iss":"https://evil.example.com","aud":"default","exp":9999999999}
  'eyJzdWIiOiJub2JvZHkiLCJpc3MiOiJodHRwczovL2V2aWwuZXhhbXBsZS5jb20iLCJhdWQiOiJkZWZhdWx0IiwiZXhwIjo5OTk5OTk5OTk5fQ',
  'not-a-signature',
].join('.');

/** No token, no key id, no claim, and no stack frame may appear in a body. */
function expectSaysNothing(data: unknown): void {
  const body = JSON.stringify(data);
  expect(body).not.toContain('at ');
  expect(body).not.toContain('kid');
  expect(body).not.toContain('evil.example.com');
  expect(body).not.toContain('not-a-signature');
}

describe('an authenticated procedure without a usable token', () => {
  it('refuses a request with no Authorization header', async () => {
    const res = await axios.post(ME_GET, EMPTY_INPUT, anyStatus);

    expect(res.status).toBe(401);
    expectSaysNothing(res.data);
  });

  it('refuses a bearer token that is not a JWT at all', async () => {
    const res = await axios.post(ME_GET, EMPTY_INPUT, {
      ...anyStatus,
      headers: { authorization: 'Bearer not.a.jwt' },
    });

    expect(res.status).toBe(401);
    expectSaysNothing(res.data);
  });

  it('refuses a well-formed JWT from an issuer it does not trust', async () => {
    const res = await axios.post(ME_GET, EMPTY_INPUT, {
      ...anyStatus,
      headers: { authorization: `Bearer ${FOREIGN_TOKEN}` },
    });

    // 401, not 500: the signature check failed, which is an authentication
    // outcome, not an error in the API.
    expect(res.status).toBe(401);
    expectSaysNothing(res.data);
  });

  it('refuses a token offered in a scheme that is not Bearer', async () => {
    const res = await axios.post(ME_GET, EMPTY_INPUT, {
      ...anyStatus,
      headers: { authorization: `Basic ${Buffer.from('user:password').toString('base64')}` },
    });

    expect(res.status).toBe(401);
    expectSaysNothing(res.data);
  });
});

describe('the ICS feed hides whether a token exists', () => {
  /**
   * The whole security model of the feed is the secret in its path, so the
   * response to a wrong one must be indistinguishable from the response to a
   * path that matches no route at all — otherwise the status code alone is an
   * oracle for enumerating valid tokens (`doc/decision/0080-*`).
   */
  it('answers an unknown token exactly as it answers an unrouted path', async () => {
    const unknownToken = await axios.get('/api/calendar/there-is-no-such-token.ics', anyStatus);
    const unrouted = await axios.get('/api/there-is-no-such-route', anyStatus);

    expect(unknownToken.status).toBe(404);
    expect(unknownToken.status).toBe(unrouted.status);
    // No `text/calendar`, no `Content-Disposition`, no `Cache-Control` — the
    // successful response's headers are set inside the handler, after the
    // lookup, precisely so that they cannot leak out of a 404.
    expect(unknownToken.headers['content-type']).toBe(unrouted.headers['content-type']);
    expect(unknownToken.headers['content-disposition']).toBeUndefined();
    expect(unknownToken.headers['cache-control']).toBe(unrouted.headers['cache-control']);
    expectSaysNothing(unknownToken.data);
  });
});
