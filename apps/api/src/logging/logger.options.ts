/**
 * Structured logging.
 *
 * Every log line is one JSON object on stdout — no `console.log` anywhere in
 * the app, and no pretty-printer even in development. A pretty transport runs
 * the formatter on a worker thread, which is one more thing to close during
 * graceful shutdown and one more way for the last lines before exit to be lost;
 * `nx serve api | npx pino-pretty` gives a developer the same output without
 * putting that in the process.
 *
 * ## Request correlation
 *
 * `genReqId` reuses an inbound `x-request-id` when there is one (so a value set
 * by a proxy or by the web app survives the hop) and mints a UUID otherwise.
 * The id is echoed back in the `x-request-id` response header, so a user
 * reporting a failure can quote something that is greppable in the logs.
 *
 * ## Redaction
 *
 * `authorization` and `cookie` carry bearer tokens and session cookies. They
 * are removed rather than masked so that no prefix of a token survives.
 */

import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Params as PinoParams } from 'nestjs-pino';
import type { ApiEnv } from '../env';
import { HEALTH_ROUTE_PREFIX } from '../health/health.controller';

/** The header a request id is read from and echoed back on. */
export const REQUEST_ID_HEADER = 'x-request-id';

export function buildLoggerOptions(env: Pick<ApiEnv, 'LOG_LEVEL' | 'NODE_ENV'>): PinoParams {
  return {
    pinoHttp: {
      level: env.LOG_LEVEL,

      genReqId(request: IncomingMessage, response: ServerResponse) {
        const existing = request.headers[REQUEST_ID_HEADER];
        const id = (Array.isArray(existing) ? existing[0] : existing) ?? randomUUID();
        response.setHeader(REQUEST_ID_HEADER, id);
        return id;
      },

      // Fixed keys so a log aggregator can index them without a per-field rule.
      messageKey: 'message',
      formatters: {
        level: (label: string) => ({ level: label }),
      },
      base: { app: 'api', env: env.NODE_ENV },

      redact: {
        paths: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
        remove: true,
      },

      // Severity of the per-request line: a 5xx or a thrown error is `error`, a
      // 4xx is `warn`, everything else `info`. Note this never fires for the
      // health probes — `exclude` below drops their request logging entirely.
      customLogLevel(_request, response, error) {
        if (error !== undefined || response.statusCode >= 500) {
          return 'error';
        }
        if (response.statusCode >= 400) {
          return 'warn';
        }
        return 'info';
      },
    },

    // `nestjs-pino`'s own per-request log line is suppressed for the probe
    // routes; the requests still reach the app and errors still surface through
    // the exception filter's logger.
    exclude: [`${HEALTH_ROUTE_PREFIX}/live`, `${HEALTH_ROUTE_PREFIX}/ready`],
  };
}
