/**
 * The realtime path authenticates with the same code everywhere.
 *
 * `apps/api/src/auth`'s rule — "dev, e2e and production all run this exact same
 * validation; only the values differ" — extends to the gateway, and this spec
 * is what stops it becoming a comment. The gateway *is* configurable
 * (`REALTIME_LOCK_TTL_MS` is short in the specs), and a configurable module is
 * exactly where an `if (isTest)` grows: the distinction this file draws is that
 * a **value** may differ and a **branch** may not.
 *
 * Source is read from disk rather than asserted behaviourally because the claim
 * is about what is *not* there. A behavioural test can only probe the branches
 * somebody thought of.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const REALTIME_DIR = join(__dirname);

/**
 * Comments removed, so the scan reads *code*.
 *
 * Without this the suite would fail on a comment that says "there is no
 * `NODE_ENV` branch here" — which is the opposite of the property it is
 * checking, and would push the next author to delete the explanation rather
 * than keep the guarantee.
 */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/** Everything the application ships from this module — specs and their support excluded. */
function shippedSources(): { name: string; source: string }[] {
  return readdirSync(REALTIME_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
    .filter((entry) => !entry.name.endsWith('.spec.ts'))
    .map((entry) => ({
      name: entry.name,
      source: withoutComments(readFileSync(join(REALTIME_DIR, entry.name), 'utf8')),
    }));
}

describe('the realtime module has no environment-dependent behaviour', () => {
  it('ships the files this spec thinks it does', () => {
    // Without this, the whole suite passes vacuously the day somebody moves the
    // gateway into a subdirectory.
    expect(
      shippedSources()
        .map((file) => file.name)
        .sort()
    ).toEqual([
      'lock.service.ts',
      'realtime-io.adapter.ts',
      'realtime.gateway.ts',
      'realtime.module.ts',
      'realtime.publisher.ts',
    ]);
  });

  it.each(['NODE_ENV', 'JEST_WORKER_ID', 'CI', 'isTest', 'isDev', 'skipAuth', 'bypass'])(
    'never mentions %s',
    (needle) => {
      for (const file of shippedSources()) {
        expect(`${file.name}: ${file.source}`).not.toContain(needle);
      }
    }
  );

  it('reads exactly one environment key, and it is a duration', () => {
    const configReads = shippedSources()
      .flatMap((file) => [...file.source.matchAll(/configService\.get\('([A-Z_]+)'/g)])
      .map((match) => match[1]);

    expect(configReads).toEqual(['REALTIME_LOCK_TTL_MS']);
  });

  it('verifies tokens through the shared JwksVerifierService, not a second jwks client', () => {
    // `doc/decision/0042-*`: two `JwksClient`s would mean two key caches, two
    // rate limiters and two rotation moments, so a rotated key could be live
    // over HTTP and not yet over WebSocket.
    for (const file of shippedSources()) {
      expect(file.source).not.toContain('jwks-rsa');
      expect(file.source).not.toContain('JwksClient');
    }
    const gateway = shippedSources().find((file) => file.name === 'realtime.gateway.ts');
    expect(gateway?.source).toContain('this.verifier.verifyToken(');
  });
});
