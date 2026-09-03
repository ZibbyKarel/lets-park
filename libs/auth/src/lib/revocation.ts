/**
 * What makes a sign-out durable: a record of *when* each subject signed out,
 * consulted on every session read.
 *
 * ## Why this exists at all
 *
 * Under `strategy: 'jwt'` the session lives entirely in the cookie, and Auth.js
 * **re-issues that cookie on every request that reads the session** — every
 * page render, every RSC prefetch, every `auth()` call in the proxy. Measured
 * against this application (Task 33): a single navigation to `/` produced three
 * different session cookies in under two milliseconds, one per render pass.
 *
 * That turns sign-out into a race it cannot reliably win. `POST
 * /api/auth/signout` clears the cookie, but any request that was already in
 * flight carrying the old cookie will answer with a freshly issued one, and the
 * browser applies whichever `Set-Cookie` arrives last. The clear is not last
 * whenever a concurrent render finishes after it — which is exactly what
 * `doc/decision/0189-*` observed under load.
 *
 * No amount of client-side ordering closes that: the application does not
 * control when Next.js's prefetcher issues a request, and it cannot cancel a
 * response already on the wire. The only fix that does not depend on winning a
 * race is to make the surviving token **invalid**, which is what this module
 * does.
 *
 * ## Why the key is the subject and a cutoff, not the token id
 *
 * The obvious design — remember the `jti` of the token that signed out — does
 * not work here, and the reason is worth stating because it is not obvious:
 * `@auth/core`'s `encode()` calls `setJti(crypto.randomUUID())` on **every**
 * issue, so the token re-installed by a racing render has a *different* `jti`
 * from the one that was signed out. Revoking one id would leave the other
 * working.
 *
 * So the record is per **subject** (`sub`, the stable Okta user id) and holds a
 * cutoff in Unix seconds: every session for that subject issued *at or before*
 * the cutoff is dead.
 *
 * `<=` rather than `<` is load-bearing. The racing render encodes its token
 * before the sign-out records the cutoff, so its `iat` (whole seconds, floored)
 * is necessarily *less than or equal to* the cutoff second — never greater. A
 * strict `<` would let a token issued in the same second as the sign-out
 * survive, which is precisely the token the race produces.
 *
 * The mirror case needs no separate handling: if the racing render reaches the
 * `jwt` callback *after* the cutoff is recorded, it sees the incoming (older)
 * token as revoked and returns `null`, and `@auth/core` answers that by
 * clearing the cookie instead of re-issuing it.
 *
 * ## Scope, and the upgrade path
 *
 * The store is **in-process**, which is sound for the stated single-instance
 * deployment and nothing more — the same posture, and the same reasoning, as
 * `LockService` on the API side. Two consequences, both accepted deliberately
 * and recorded in `doc/decision/0230-*`:
 *
 * - **A restart of the Next.js server forgets every cutoff.** A token that
 *   survived a sign-out would work again after a restart, until it expires.
 * - **A second instance would not see the first's sign-outs.** Running more
 *   than one web instance requires moving this behind a shared store (Redis, or
 *   a table) — the interface below is deliberately small enough that only this
 *   file changes.
 *
 * Nothing here is logged: a subject id is a user identifier and a cutoff says
 * when they signed out. Neither belongs in a log line, and no token value is
 * ever passed to this module in the first place — only `sub` and `iat`.
 */

/** The fields of an Auth.js JWT this module reads. Nothing else is needed. */
export interface RevocableToken {
  /** The stable subject id. Auth.js sets it from the provider's `sub` claim. */
  readonly sub?: string | undefined;
  /** Unix seconds at which this token was issued. Set by `@auth/core`'s `encode`. */
  readonly iat?: number | undefined;
}

export interface SignOutRegistry {
  /**
   * Records that this subject signed out now. Every session of theirs issued at
   * or before the current second is invalid from this point on.
   */
  readonly revoke: (token: RevocableToken) => void;
  /** True when this token was issued at or before the subject's cutoff. */
  readonly isRevoked: (token: RevocableToken) => boolean;
  /**
   * Forgets a subject's cutoff, so their next session is honoured.
   *
   * Called when a *new* sign-in completes: the fresh token is younger than the
   * cutoff, so nothing would reject it, but keeping a stale entry around would
   * grow the map for the life of the process for no benefit.
   */
  readonly forget: (token: RevocableToken) => void;
  /** Number of subjects currently holding a cutoff. For tests and diagnostics. */
  readonly size: () => number;
}

export interface SignOutRegistryOptions {
  /**
   * How long a cutoff is kept, in seconds. Must be at least as long as a
   * session cookie can live: once no token issued before the cutoff can still
   * be valid, the entry has nothing left to reject.
   */
  readonly retentionSeconds: number;
  /** Clock seam, in Unix **seconds**, to match a JWT's `iat`. */
  readonly now?: () => number;
  /**
   * Where the cutoffs live. Defaults to a private map, which is what a test
   * wants; the application passes {@link sharedCutoffStore} — see there for why
   * that is not optional in Next.js.
   */
  readonly cutoffs?: Map<string, number>;
}

const unixSeconds = (): number => Math.floor(Date.now() / 1000);

/**
 * The key under which the cutoffs hang off `globalThis`.
 *
 * `Symbol.for` rather than `Symbol`: the global symbol registry is shared by
 * everything in the realm, so two copies of this module resolve it to the same
 * symbol. A plain `Symbol()` would be a different key in each copy, which is
 * the whole problem this exists to solve.
 */
const CUTOFFS_KEY = Symbol.for('@lets-park/auth:sign-out-cutoffs');

interface GlobalWithCutoffs {
  [CUTOFFS_KEY]?: Map<string, number>;
}

/**
 * The one cutoff map for the whole Node process.
 *
 * **This indirection is not defensive style; without it the feature does not
 * work at all.** Next.js compiles the proxy, the `/api/auth/*` route handlers
 * and the server components into *separate bundles*, each with its own module
 * registry — so `createAuth()` runs once per bundle and a module-level `Map`
 * would give each of them a private one. Measured on this application (Task
 * 33): a single `next start` process logged **three** distinct
 * `createAuthConfig` instances, the sign-out event reached exactly one of them,
 * and every later authorization check ran against a different, empty registry.
 * Sign-out looked revoked from the endpoint that performed it and honoured
 * everywhere it mattered.
 *
 * `globalThis` crosses that boundary because all three bundles run in the same
 * V8 realm — which is true here precisely because the proxy runs on the Node.js
 * runtime (`doc/decision/0100-*`). Were it ever moved to the Edge runtime it
 * would be a separate isolate and this would silently stop sharing, which is
 * the strongest of the several reasons that decision must stay as it is.
 */
export function sharedCutoffStore(): Map<string, number> {
  const container = globalThis as GlobalWithCutoffs;
  container[CUTOFFS_KEY] ??= new Map<string, number>();
  return container[CUTOFFS_KEY];
}

/**
 * Builds a registry over a cutoff map.
 *
 * The registry object itself is per Auth.js configuration; the *map* it reads
 * is whatever the caller supplies. `createAuthConfig` supplies
 * {@link sharedCutoffStore} so that every bundle Next.js builds sees the same
 * sign-outs; a test supplies nothing and gets a private map.
 */
export function createSignOutRegistry(options: SignOutRegistryOptions): SignOutRegistry {
  const { retentionSeconds, now = unixSeconds, cutoffs = new Map<string, number>() } = options;

  /**
   * Drops entries that can no longer reject anything.
   *
   * Run on write rather than on a timer: a timer would keep the process alive
   * and would run forever in a test, and the map only grows on a sign-out —
   * which is exactly when this is called.
   */
  const prune = (current: number): void => {
    for (const [subject, cutoff] of cutoffs) {
      if (cutoff + retentionSeconds <= current) cutoffs.delete(subject);
    }
  };

  return {
    revoke: (token) => {
      const subject = token.sub;
      // No subject means no way to key the record. That is not a silent pass:
      // such a token cannot identify a user, so `isAuthorized` already refuses
      // it — there is nothing to revoke.
      if (subject === undefined || subject === '') return;
      const current = now();
      prune(current);
      // `Math.max` so that two sign-outs in flight cannot move the cutoff
      // backwards and resurrect a session the later one killed.
      cutoffs.set(subject, Math.max(cutoffs.get(subject) ?? 0, current));
    },

    isRevoked: (token) => {
      const subject = token.sub;
      if (subject === undefined || subject === '') return false;
      const cutoff = cutoffs.get(subject);
      if (cutoff === undefined) return false;
      // A token with no `iat` cannot be placed relative to the cutoff. It is
      // treated as revoked rather than as fresh: failing closed is the only
      // safe direction for a check whose whole job is to refuse.
      if (typeof token.iat !== 'number') return true;
      return token.iat <= cutoff;
    },

    forget: (token) => {
      const subject = token.sub;
      if (subject === undefined || subject === '') return;
      cutoffs.delete(subject);
    },

    size: () => cutoffs.size,
  };
}
