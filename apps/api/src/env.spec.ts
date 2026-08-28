import { validateApiEnv } from './env';

/** A minimal, fully valid environment matching `.env.example`'s dev values. */
function validEnv(
  overrides: Record<string, string | undefined> = {}
): Record<string, string | undefined> {
  return {
    NODE_ENV: 'development',
    PORT: '3000',
    DATABASE_URL: 'postgresql://lets_park:lets_park@localhost:5432/lets_park',
    AUTH_OKTA_ISSUER: 'http://localhost:8080/default',
    AUTH_OKTA_AUDIENCE: 'api://default',
    CORS_ALLOWED_ORIGINS: 'http://localhost:4200,http://localhost:3000',
    LOG_LEVEL: 'info',
    ...overrides,
  };
}

describe('validateApiEnv', () => {
  it('accepts a valid environment and returns typed, parsed values', () => {
    const env = validateApiEnv(validEnv());

    expect(env).toEqual({
      NODE_ENV: 'development',
      PORT: 3000,
      DATABASE_URL: 'postgresql://lets_park:lets_park@localhost:5432/lets_park',
      AUTH_OKTA_ISSUER: 'http://localhost:8080/default',
      AUTH_OKTA_AUDIENCE: 'api://default',
      CORS_ALLOWED_ORIGINS: ['http://localhost:4200', 'http://localhost:3000'],
      LOG_LEVEL: 'info',
    });
  });

  it('throws naming a missing required variable, without ever printing a value', () => {
    const env = validEnv();
    delete env.DATABASE_URL;

    let thrown: unknown;
    try {
      validateApiEnv(env);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    const message = (thrown as Error).message;
    expect(message).toContain('DATABASE_URL');
    // No other variable's value should be echoed back either.
    expect(message).not.toContain('lets_park:lets_park@localhost');
  });

  it('throws naming an invalid variable without leaking its value', () => {
    const secretLookingValue = 'not-a-valid-issuer-url-9f3c7a1b';
    const env = validEnv({ AUTH_OKTA_ISSUER: secretLookingValue });

    let thrown: unknown;
    try {
      validateApiEnv(env);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    const message = (thrown as Error).message;
    expect(message).toContain('AUTH_OKTA_ISSUER');
    expect(message).not.toContain(secretLookingValue);
  });

  it('rejects an out-of-range PORT and a malformed CORS_ALLOWED_ORIGINS together', () => {
    const env = validEnv({ PORT: '99999', CORS_ALLOWED_ORIGINS: 'not-a-url' });

    let thrown: unknown;
    try {
      validateApiEnv(env);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    const message = (thrown as Error).message;
    expect(message).toContain('PORT');
    expect(message).toContain('CORS_ALLOWED_ORIGINS');
  });
});
