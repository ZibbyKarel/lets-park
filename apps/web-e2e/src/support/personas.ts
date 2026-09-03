/**
 * The three people the end-to-end suite signs in as.
 *
 * Each one is a **seeded** account (`libs/database/src/lib/seed-data.ts`), and
 * the fields below have to keep matching it: `subject` is that row's `oktaId`,
 * `claims.email` its `email`. That is what makes `admin` an admin — the role
 * lives on the database row, not in the token, and nothing here can grant it.
 *
 * The values are re-stated rather than imported: `libs/database` is tagged
 * `scope:api` and this app is `scope:web`, so the module boundary forbids the
 * import (see `apps/web-e2e/src/support/global-setup.ts` for the same
 * constraint solved the other way, with a subprocess). `identity.spec.ts`
 * pins the pairing at run time instead — it signs each persona in and asserts
 * the application shows the seeded name and, for the admin, the admin section.
 *
 * ## Why `claims` exists at all
 *
 * `mock-oauth2-server` runs without a `JSON_CONFIG`, and its default token
 * carries only `aud, azp, exp, iat, iss, jti, nbf, sub, tid` — **no `email`,
 * no `name`**. Its sign-in form has an *Optional claims JSON* field, and this
 * object is what the login helper types into it, so that the token the API
 * receives carries exactly the claims a real Okta token would
 * (`OKTA_SCOPES = 'openid profile email offline_access'`).
 *
 * Supplying them is not a convenience. `AuthUserService.findOrProvision`
 * refuses to provision a subject it has never seen without an `email`
 * (401, "The token does not identify a provisionable user."), so a run against
 * an unseeded database would fail at the first request. With the claims in
 * place the suite exercises the real just-in-time provisioning path.
 * See `doc/decision/0180-*`.
 */

/** One sign-in identity. */
export interface Persona {
  /** Stable key; also the basename of the persona's `storageState` file. */
  readonly key: string;
  /** The OIDC `sub`. Typed into the mock server's "user/subject" field. */
  readonly subject: string;
  /** Typed into the mock server's *Optional claims JSON* field, verbatim. */
  readonly claims: Readonly<Record<string, string>>;
  /** The name the application shows for this person, from the seeded row. */
  readonly displayName: string;
  /** Whether the seeded row carries `role: 'ADMIN'`. */
  readonly isAdmin: boolean;
}

export const ADMIN: Persona = {
  key: 'admin',
  subject: 'dev-admin',
  claims: { email: 'admin@example.com', name: 'Dev Admin' },
  displayName: 'Dev Admin',
  isAdmin: true,
};

export const USER: Persona = {
  key: 'user',
  subject: 'dev-user',
  claims: { email: 'user@example.com', name: 'Dev User' },
  displayName: 'Dev User',
  isAdmin: false,
};

export const USER_TWO: Persona = {
  key: 'user-two',
  subject: 'dev-user-2',
  claims: { email: 'user2@example.com', name: 'Dev User Two' },
  displayName: 'Dev User Two',
  isAdmin: false,
};

export const PERSONAS: readonly Persona[] = [ADMIN, USER, USER_TWO];

/**
 * Where a signed-in persona's cookies are cached between the `setup` project
 * and the specs.
 *
 * These files hold a live Auth.js session cookie and the mock issuer's own
 * session cookie. They are rewritten by the `setup` project on every run, so a
 * token that expired since the last run is never reused, and `.gitignore`'s
 * `storage-state*.json` keeps them out of the repository wherever they land.
 *
 * **Where they land is not where this string reads.** The path is relative, and
 * both callers resolve it against `process.cwd()` — `storageState({ path })` in
 * `auth.setup.ts` and `browser.newContext({ storageState })` in `fixtures.ts`,
 * neither of which is the config-directory resolution Playwright applies to
 * `use.storageState`. Nx runs the executor with the cwd set to the *project*
 * root, so the files are written to `apps/web-e2e/apps/web-e2e/.auth/`. Ugly,
 * harmless, and identical on both sides — which is why it works. Recorded
 * rather than quietly renamed: changing it would move the files for anyone who
 * invokes `playwright test` from a different directory, and nothing here needs
 * that today.
 */
export function storageStatePath(persona: Persona): string {
  return `apps/web-e2e/.auth/storage-state-${persona.key}.json`;
}
