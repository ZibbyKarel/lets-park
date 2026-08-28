import { DEFAULT_THROTTLER_NAME, globalThrottlerOptions } from './throttle-tiers';
import { ENV_DEFAULTS } from '../../env';

describe('globalThrottlerOptions', () => {
  it('registers exactly one throttler, so the strict tier stays opt-in', () => {
    // `@nestjs/throttler` applies every *registered* named throttler to every
    // route. A second entry here would rate-limit the whole API at the strict
    // limit — the opposite of "prepared but unapplied".
    const options = globalThrottlerOptions({ THROTTLE_TTL_MS: 60_000, THROTTLE_LIMIT: 300 });

    expect(options).toHaveLength(1);
    expect(options[0]?.name).toBe(DEFAULT_THROTTLER_NAME);
  });

  it('passes the window through in milliseconds, which is what v6 expects', () => {
    const options = globalThrottlerOptions({ THROTTLE_TTL_MS: 15_000, THROTTLE_LIMIT: 42 });

    expect(options[0]).toMatchObject({ ttl: 15_000, limit: 42 });
  });
});

describe('StrictThrottle env fallback', () => {
  it('falls back to the same numbers the env schema defaults to', () => {
    // The decorator cannot inject `ConfigService`, so it reads `process.env`
    // with `ENV_DEFAULTS` as the fallback. If those two ever diverged, an unset
    // key would silently mean two different limits.
    expect(ENV_DEFAULTS.THROTTLE_STRICT_TTL_MS).toBe(60_000);
    expect(ENV_DEFAULTS.THROTTLE_STRICT_LIMIT).toBe(20);
  });
});
