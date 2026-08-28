/**
 * @jest-environment node
 *
 * `@lets-park/contract`'s barrel also pulls in `@orpc/client` at runtime
 * (through the oRPC procedure builders), which references the web
 * `TransformStream` global that jsdom — this project's default test
 * environment, needed by `provider.spec.tsx` — does not provide. This file
 * never touches the DOM, so it runs under plain Node instead.
 */
import { ERROR_CODES, type ErrorCode } from '@lets-park/contract';
import { csMessages } from './messages';
import { translateErrorCode } from './errors';

describe('translateErrorCode', () => {
  it('has a non-empty Czech message for every contract error code', () => {
    // Total coverage, checked structurally rather than by eyeballing the
    // catalog: a future task that adds a code to ERROR_CODES without adding
    // a translation here fails this test instead of shipping the raw enum
    // member into the UI.
    for (const code of ERROR_CODES) {
      const message = translateErrorCode(code);
      expect(typeof message).toBe('string');
      expect(message.length).toBeGreaterThan(0);
      // A missing next-intl message falls back to `${namespace}.${key}` —
      // guard against that silently passing as "a string".
      expect(message).not.toBe(`errors.${code}`);
      expect(message).not.toBe(code);
    }
  });

  it('gives every code a distinct message', () => {
    const messages = ERROR_CODES.map((code) => translateErrorCode(code));
    expect(new Set(messages).size).toBe(ERROR_CODES.length);
  });

  it('reads through csMessages, not a second copy of the catalog', () => {
    for (const code of ERROR_CODES) {
      expect(translateErrorCode(code)).toBe(csMessages.errors[code]);
    }
  });

  it('distinguishes OUT_OF_HORIZON (not yet open) from RESERVATIONS_LOCKED (already closed)', () => {
    // The entire reason the contract has two window error codes instead of
    // one (`doc/decision/0004-*`) — collapsing them to the same Czech
    // sentence would defeat the point.
    const notYetOpen = translateErrorCode('OUT_OF_HORIZON');
    const alreadyLocked = translateErrorCode('RESERVATIONS_LOCKED');
    expect(notYetOpen).not.toBe(alreadyLocked);
    expect(notYetOpen.toLowerCase()).toMatch(/neotevřely/);
    expect(alreadyLocked.toLowerCase()).toMatch(/uzamčené/);
  });

  it('type-checks against the full ErrorCode union', () => {
    // Compile-time half of the coverage guarantee: this only compiles if
    // CzechErrorMessages remains Record<ErrorCode, string>.
    const sample: ErrorCode = 'CONFLICT';
    expect(translateErrorCode(sample)).toBeTruthy();
  });
});
