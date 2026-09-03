import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { createApiClient } from '@lets-park/api-client';
import { contract, ERROR_CODES, ERROR_DEFINITIONS } from '@lets-park/contract';
import type { ErrorCode } from '@lets-park/contract';
import { csMessages, IntlProvider } from '@lets-park/i18n';
import { ADMIN_WRITE_MESSAGES, useAdminWriteError, type AdminWrite } from './admin-errors';

/**
 * Failures are produced by a **real** `RPCLink` — a client built with
 * `createApiClient`, one real procedure called on it, only `fetch` replaced —
 * exactly as `settings-screen.spec.tsx` does, and for the same reason: a
 * hand-built `ORPCError` would assert this file's idea of the wire shape
 * instead of the transport's, and `apps/web` may not import `@orpc/client` at
 * all to build one directly.
 */
const API_URL = 'https://api.test/rpc';

async function failureWithCode(code: ErrorCode): Promise<unknown> {
  // The status the contract itself assigns the code, not a guess: `RPCLink`
  // derives a *different* code from the status when the body cannot be read,
  // so a mismatched pair here would silently test the wrong error.
  const status = ERROR_DEFINITIONS[code].status;
  const body = {
    json: { defined: false as const, code, status, message: 'developer-facing' },
    meta: [],
  };
  const client = createApiClient({
    url: API_URL,
    fetch: async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
  });

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

function wrapper({ children }: { children: ReactNode }) {
  return <IntlProvider>{children}</IntlProvider>;
}

function describeWith(): (write: AdminWrite, failure: unknown) => string | null {
  const { result } = renderHook(() => useAdminWriteError(), { wrapper });
  return result.current;
}

/** Reads a key out of the real catalog, so the expectations are not a copy. */
function copy(key: keyof typeof csMessages.admin): string {
  return csMessages.admin[key];
}

describe('useAdminWriteError', () => {
  it('says nothing when nothing failed', () => {
    const describe_ = describeWith();

    expect(describe_('userUpdate', null)).toBeNull();
    expect(describe_('userUpdate', undefined)).toBeNull();
  });

  describe('the same code, a different sentence per operation', () => {
    it('reads CONFLICT as the last-admin rule on a user change', async () => {
      const describe_ = describeWith();

      expect(describe_('userUpdate', await failureWithCode('CONFLICT'))).toBe(
        copy('errUserConflict')
      );
    });

    it('reads CONFLICT as a duplicate label when creating a spot', async () => {
      const describe_ = describeWith();

      expect(describe_('spotCreate', await failureWithCode('CONFLICT'))).toBe(
        copy('spotsDuplicateLabel')
      );
    });

    it('reads CONFLICT as a live reservation when retiring a spot', async () => {
      const describe_ = describeWith();

      expect(describe_('spotRetire', await failureWithCode('CONFLICT'))).toBe(
        copy('spotsDeleteConflict')
      );
    });

    it('refuses to guess a cause for CONFLICT when switching a spot back on', async () => {
      // Reviving collides with nothing — `SpotsService.update` only checks
      // reservations on the way *off*, and the label is unchanged. Claiming a
      // duplicate label here would be inventing a reason.
      const describe_ = describeWith();

      expect(describe_('spotRevive', await failureWithCode('CONFLICT'))).toBe(
        copy('errFallbackSpot')
      );
    });

    it('never reuses the reservation wording for VALIDATION_FAILED', async () => {
      // `errors.VALIDATION_FAILED` is "Požadavek porušuje pravidlo rezervací
      // (např. víkend nebo svátek)." — true of a booking, nonsense on a role
      // change, a spot rename or a stepper.
      const describe_ = describeWith();
      const failure = await failureWithCode('VALIDATION_FAILED');

      for (const write of Object.keys(ADMIN_WRITE_MESSAGES) as AdminWrite[]) {
        expect(describe_(write, failure)).not.toBe(csMessages.errors.VALIDATION_FAILED);
      }

      expect(describe_('userUpdate', failure)).toBe(copy('errUserValidation'));
      expect(describe_('spotRename', failure)).toBe(copy('errSpotValidation'));
      expect(describe_('windowUpdate', failure)).toBe(copy('errWindowValidation'));
    });
  });

  describe('the fallback', () => {
    it('is used for a transport failure, which carries no code at all', () => {
      const describe_ = describeWith();

      expect(describe_('spotCreate', new Error('connection refused'))).toBe(
        copy('errFallbackSpot')
      );
      expect(describe_('windowUpdate', new Error('connection refused'))).toBe(
        copy('errFallbackWindow')
      );
    });

    it('never leaks the thrown error’s own message', () => {
      const describe_ = describeWith();

      expect(describe_('userUpdate', new Error('ECONNREFUSED 127.0.0.1:3000'))).not.toMatch(
        /ECONNREFUSED/u
      );
    });

    it('is used for every code the operation has no sentence for', async () => {
      const describe_ = describeWith();

      // `SPOT_ALREADY_RESERVED` is a booking failure; no admin write declares
      // it, so every operation must fall back rather than translate it.
      const failure = await failureWithCode('SPOT_ALREADY_RESERVED');
      expect(describe_('userUpdate', failure)).toBe(copy('errFallbackUser'));
      expect(describe_('spotRetire', failure)).toBe(copy('errFallbackSpot'));
    });
  });

  describe('the table itself', () => {
    it('answers a non-empty Czech sentence for every operation and every code', async () => {
      const describe_ = describeWith();

      for (const code of ERROR_CODES) {
        const failure = await failureWithCode(code);
        for (const write of Object.keys(ADMIN_WRITE_MESSAGES) as AdminWrite[]) {
          const message = describe_(write, failure);
          expect(message).toBeTruthy();
          // A missing catalog key would come back as the key name; next-intl
          // does not throw for one.
          expect(message).not.toMatch(/^admin\./u);
        }
      }
    });

    it('names only codes the contract actually declares', () => {
      const declared = new Set<string>(ERROR_CODES);

      for (const { byCode } of Object.values(ADMIN_WRITE_MESSAGES)) {
        for (const code of Object.keys(byCode)) {
          expect(declared.has(code)).toBe(true);
        }
      }
    });

    it('covers every code the admin procedures can raise', () => {
      // The point of the table is that the *declared* failures each get a
      // sentence of their own; anything else is allowed to fall back. Read off
      // the contract rather than restated, so adding an error code to a
      // procedure fails here until the copy is written.
      const declaredOn = (procedure: unknown): ErrorCode[] =>
        Object.keys(
          (procedure as { '~orpc': { errorMap: Record<string, unknown> } })['~orpc'].errorMap
        ) as ErrorCode[];

      // Every write, including the ones that map nothing new. Leaving one out
      // of this list is how a gap becomes invisible.
      const expectations: [AdminWrite, ErrorCode[]][] = [
        ['userUpdate', declaredOn(contract.admin.user.update)],
        ['spotCreate', declaredOn(contract.admin.spot.create)],
        ['spotRename', declaredOn(contract.admin.spot.update)],
        ['spotRetire', declaredOn(contract.admin.spot.deactivate)],
        ['spotRevive', declaredOn(contract.admin.spot.update)],
        ['windowUpdate', declaredOn(contract.admin.window.update)],
      ];

      /**
       * Codes a write deliberately leaves to the fallback, because it has no
       * true sentence for them. Declared rather than quietly skipped: an
       * exemption that has to be written down is one somebody can argue with.
       */
      const unmapped: Partial<Record<AdminWrite, readonly ErrorCode[]>> = {
        // Switching a spot back on collides with nothing (`SpotsService.update`
        // only checks reservations on the way off) and sends neither a label
        // nor a group, so neither code has a cause to name.
        spotRevive: ['CONFLICT', 'VALIDATION_FAILED'],
      };

      for (const [write, codes] of expectations) {
        expect(codes.length).toBeGreaterThan(0);
        const exempt = unmapped[write] ?? [];
        for (const code of codes) {
          if (exempt.includes(code)) {
            expect(ADMIN_WRITE_MESSAGES[write].byCode[code]).toBeUndefined();
          } else {
            expect(ADMIN_WRITE_MESSAGES[write].byCode[code]).toBeDefined();
          }
        }
        // An exemption for a code the procedure no longer declares is dead
        // text, and dead text is how a stale reason outlives its reason.
        for (const code of exempt) {
          expect(codes).toContain(code);
        }
      }
    });
  });
});
