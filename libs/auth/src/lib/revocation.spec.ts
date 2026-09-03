/**
 * The sign-out registry: what makes a sign-out outlive the cookie that carried
 * it.
 *
 * The case that matters most is the one the boundary test pins — a token issued
 * **in the same second** as the sign-out. That is not a contrived edge: it is
 * precisely the token the race produces, because the racing render encodes its
 * cookie microseconds before the sign-out records its cutoff and `iat` has
 * one-second resolution. A registry that used `<` instead of `<=` would pass
 * every other test in this file and still leave the defect in place.
 */

import { createSignOutRegistry } from './revocation';
import type { SignOutRegistry } from './revocation';

const SUBJECT = 'okta-user-1';
const RETENTION = 30 * 24 * 60 * 60;

/** A registry on a clock the test moves by hand. */
function registryAt(start: number): { registry: SignOutRegistry; setNow: (t: number) => void } {
  let current = start;
  const registry = createSignOutRegistry({
    retentionSeconds: RETENTION,
    now: () => current,
  });
  return { registry, setNow: (t) => (current = t) };
}

describe('createSignOutRegistry', () => {
  it('lets an untouched subject through', () => {
    const { registry } = registryAt(1000);

    expect(registry.isRevoked({ sub: SUBJECT, iat: 900 })).toBe(false);
  });

  it('revokes a session issued before the sign-out', () => {
    const { registry } = registryAt(1000);

    registry.revoke({ sub: SUBJECT, iat: 900 });

    expect(registry.isRevoked({ sub: SUBJECT, iat: 900 })).toBe(true);
  });

  it('revokes a session issued in the very second of the sign-out', () => {
    // The race's own token: re-issued by a render that was already in flight,
    // so its `iat` lands on the same whole second as the sign-out. `<=`, not
    // `<`, is what catches it.
    const { registry } = registryAt(1000);

    registry.revoke({ sub: SUBJECT, iat: 999 });

    expect(registry.isRevoked({ sub: SUBJECT, iat: 1000 })).toBe(true);
  });

  it('honours a session issued after the sign-out', () => {
    const { registry } = registryAt(1000);

    registry.revoke({ sub: SUBJECT, iat: 900 });

    expect(registry.isRevoked({ sub: SUBJECT, iat: 1001 })).toBe(false);
  });

  it('does not revoke a different subject', () => {
    const { registry } = registryAt(1000);

    registry.revoke({ sub: SUBJECT, iat: 900 });

    expect(registry.isRevoked({ sub: 'okta-user-2', iat: 900 })).toBe(false);
  });

  it('fails closed on a token with no issued-at', () => {
    // Such a token cannot be placed relative to the cutoff. Refusing it is the
    // only safe direction for a check whose entire job is to refuse.
    const { registry } = registryAt(1000);

    registry.revoke({ sub: SUBJECT, iat: 900 });

    expect(registry.isRevoked({ sub: SUBJECT })).toBe(true);
  });

  it('records nothing for a token with no subject', () => {
    const { registry } = registryAt(1000);

    registry.revoke({ iat: 900 });

    expect(registry.size()).toBe(0);
    expect(registry.isRevoked({ iat: 900 })).toBe(false);
  });

  it('never moves a cutoff backwards', () => {
    // Two sign-outs racing each other must not let the earlier one resurrect
    // what the later one killed.
    const { registry, setNow } = registryAt(2000);
    registry.revoke({ sub: SUBJECT, iat: 1900 });

    setNow(1000);
    registry.revoke({ sub: SUBJECT, iat: 900 });

    expect(registry.isRevoked({ sub: SUBJECT, iat: 1500 })).toBe(true);
  });

  it('forgets a subject when they sign in again', () => {
    const { registry } = registryAt(1000);
    registry.revoke({ sub: SUBJECT, iat: 900 });

    registry.forget({ sub: SUBJECT });

    expect(registry.size()).toBe(0);
    expect(registry.isRevoked({ sub: SUBJECT, iat: 900 })).toBe(false);
  });

  it('drops a cutoff once no session that old could still be valid', () => {
    const { registry, setNow } = registryAt(1000);
    registry.revoke({ sub: SUBJECT, iat: 900 });
    expect(registry.size()).toBe(1);

    // Pruning happens on write, so a later sign-out by anyone is what sweeps.
    setNow(1000 + RETENTION);
    registry.revoke({ sub: 'okta-user-2', iat: 1000 });

    expect(registry.size()).toBe(1);
    expect(registry.isRevoked({ sub: SUBJECT, iat: 900 })).toBe(false);
  });

  it('keeps a cutoff for as long as a session cookie can live', () => {
    const { registry, setNow } = registryAt(1000);
    registry.revoke({ sub: SUBJECT, iat: 900 });

    setNow(1000 + RETENTION - 1);
    registry.revoke({ sub: 'okta-user-2', iat: 1000 });

    expect(registry.isRevoked({ sub: SUBJECT, iat: 900 })).toBe(true);
  });
});
