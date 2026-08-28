/**
 * Fail-fast environment schema for apps/api.
 *
 * This is the single source of truth for which environment variables the API
 * needs and what shape they must have. It is wired into Nest via
 * `ConfigModule.forRoot({ validate: validateApiEnv })` in `app.module.ts`,
 * which calls `validateApiEnv` once during module initialization — before the
 * application starts listening — so a missing or malformed variable crashes
 * the process immediately with a readable error instead of failing later at
 * an arbitrary call site.
 *
 * Dev, e2e and production all run this exact same validation; only the
 * values differ (see `.env.example` and `doc/environment.md`).
 *
 * The schema is deliberately minimal for this phase (Fáze 0) and is designed
 * to grow additively: later phases add Slack, ICS and throttler variables as
 * new keys on this object, never by relaxing existing ones.
 */
import * as z from 'zod';

const nodeEnvSchema = z.enum(['development', 'test', 'production']);

/** Levels accepted by nestjs-pino / pino (excludes `silent`, which is not a useful default). */
const logLevelSchema = z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']);

/**
 * A comma-separated list of allowed CORS origins, e.g.
 * `http://localhost:4200,http://localhost:3000`. Parsed into a non-empty
 * array of absolute origin URLs — there is no wildcard escape hatch.
 */
const corsAllowedOriginsSchema = z
  .string()
  .min(1, 'must not be empty')
  .transform((value) =>
    value
      .split(',')
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0)
  )
  .pipe(z.array(z.url()).min(1, 'must contain at least one valid origin URL'));

export const apiEnvSchema = z.object({
  NODE_ENV: nodeEnvSchema,
  PORT: z.coerce.number().int().min(1).max(65535),
  DATABASE_URL: z.url(),
  AUTH_OKTA_ISSUER: z.url(),
  AUTH_OKTA_AUDIENCE: z.string().min(1),
  CORS_ALLOWED_ORIGINS: corsAllowedOriginsSchema,
  LOG_LEVEL: logLevelSchema,
});

export type ApiEnv = z.infer<typeof apiEnvSchema>;

/**
 * Formats a `ZodError` into a multi-line, human-readable message that names
 * every offending variable and states what is wrong with it. It never
 * includes the invalid value itself: Zod's own issue messages for the checks
 * used in this schema (missing/empty, wrong type, bad enum member, bad URL,
 * out-of-range number) describe the *expectation*, not the input — so this
 * formatter is safe to print to logs or a terminal that other people can see.
 */
function formatEnvValidationError(appName: string, error: z.ZodError): string {
  const lines = error.issues.map((issue) => {
    const variable = issue.path.join('.') || '(root)';
    return `  - ${variable}: ${issue.message}`;
  });
  return [
    `Invalid or missing environment variables for ${appName}. Fix these and restart:`,
    ...lines,
  ].join('\n');
}

/**
 * Validates `process.env` (or a stand-in, e.g. in tests) against
 * {@link apiEnvSchema}. Intended to be passed as `validate` to
 * `ConfigModule.forRoot`, whose contract is: return the validated config, or
 * throw to abort bootstrap.
 */
export function validateApiEnv(config: Record<string, unknown>): ApiEnv {
  const result = apiEnvSchema.safeParse(config);
  if (!result.success) {
    throw new Error(formatEnvValidationError('api', result.error));
  }
  return result.data;
}
