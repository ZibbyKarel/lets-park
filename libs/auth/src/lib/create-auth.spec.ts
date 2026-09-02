/**
 * The single `NextAuth()` call.
 *
 * There is not much logic here to test — the rules live in `config.ts` — but
 * two properties are worth pinning, because both would fail silently: that the
 * instance actually constructs against the installed Auth.js (a v4 idiom would
 * throw or hand back a different shape), and that it reads nothing from the
 * environment behind `apps/web/src/env.ts`'s back.
 */

import { createAuth } from '../index';
import type { AuthOptions } from '../index';

const OPTIONS: AuthOptions = {
  issuer: 'https://example.okta.test/oauth2/default',
  clientId: 'lets-park-web',
  clientSecret: 'super-secret',
  secret: 'a'.repeat(32),
};

/** Every variable Auth.js would otherwise infer for itself. */
const INFERRED_VARIABLES = [
  'AUTH_SECRET',
  'AUTH_URL',
  'NEXTAUTH_SECRET',
  'NEXTAUTH_URL',
  'AUTH_OKTA_ID',
  'AUTH_OKTA_SECRET',
  'AUTH_OKTA_ISSUER',
];

describe('createAuth', () => {
  it('produces the App Router surface: handlers, auth, signIn, signOut', () => {
    const auth = createAuth(OPTIONS);

    // `handlers` is `{ GET, POST }` in v5 — the shape
    // `app/api/auth/[...nextauth]/route.ts` re-exports.
    expect(typeof auth.handlers.GET).toBe('function');
    expect(typeof auth.handlers.POST).toBe('function');
    expect(typeof auth.auth).toBe('function');
    expect(typeof auth.signIn).toBe('function');
    expect(typeof auth.signOut).toBe('function');
  });

  it('exposes an access token provider for @lets-park/api-client', () => {
    expect(typeof createAuth(OPTIONS).getAccessToken).toBe('function');
  });

  it('constructs with every Auth.js environment variable removed', () => {
    // Auth.js infers `AUTH_SECRET`, `AUTH_OKTA_ID`/`_SECRET` and friends from
    // the environment when they are present. This lib passes everything
    // explicitly instead, so that `apps/web/src/env.ts` stays the one schema
    // that decides which variables exist — and so that no value can be picked
    // up implicitly in one environment and missing in another.
    const saved = new Map(INFERRED_VARIABLES.map((name) => [name, process.env[name]]));
    for (const name of INFERRED_VARIABLES) delete process.env[name];

    try {
      expect(() => createAuth(OPTIONS)).not.toThrow();
    } finally {
      for (const [name, value] of saved) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
    }
  });
});
