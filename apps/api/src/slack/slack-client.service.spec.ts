/**
 * `SlackClient` against a real `@slack/web-api` talking real HTTP to a fake
 * Slack (`./testing/slack-test-server.ts`).
 *
 * Three things this shape buys that a mocked SDK would not:
 *
 * 1. **Slack's protocol is modelled, not asserted.** `{"ok": false}` arrives
 *    with `200 OK` and the SDK classifies it; the spec only says what the
 *    client did about it.
 * 2. **Retries are counted on the wire.** `server.requests.length` is the
 *    number of HTTP requests actually sent, which a stubbed method call count
 *    only approximates.
 * 3. **The bot token is observable.** It goes out in a header, so a spec can
 *    check it went out *and* that it never came back in a log line.
 *
 * Log assertions read **real pino output at `trace`** (see
 * `./testing/capture-logs.ts`). No spec in this file pins `LOG_LEVEL: 'fatal'`,
 * because a redaction test that cannot see the log proves nothing.
 */

import { ErrorCode, WebClient } from '@slack/web-api';
import type { CapturedLogs } from './testing/capture-logs';
import { captureLogs } from './testing/capture-logs';
import type { RecordedSlackRequest, SlackTestServer } from './testing/slack-test-server';
import { SLACK_OK, slackNotOk, startSlackTestServer } from './testing/slack-test-server';
import { SlackClient, SlackWebClientFactory } from './slack-client.service';
import type { SlackEnv } from './slack.config';
import { SlackConfig } from './slack.config';

/** A token with the real `xoxb-` shape, so the redaction is exercised honestly. */
const BOT_TOKEN = 'xoxb-fake-slack-token';
const CHANNEL = 'C0PARKING';

const BASE_ENV: SlackEnv = {
  SLACK_ENABLED: true,
  SLACK_BOT_TOKEN: BOT_TOKEN,
  SLACK_CHANNEL_ID: CHANNEL,
  SLACK_REQUEST_TIMEOUT_MS: 250,
  SLACK_RETRY_ATTEMPTS: 3,
  // Small but non-zero: the elapsed-time assertion below needs a real wait to
  // observe, and 60/120 ms keeps the suite fast.
  SLACK_RETRY_BASE_DELAY_MS: 60,
  SLACK_DAILY_SUMMARY_AT: '08:00',
};

describe('SlackClient', () => {
  let server: SlackTestServer;
  let logs: CapturedLogs;

  beforeEach(async () => {
    server = await startSlackTestServer();
    logs = captureLogs();
  });

  afterEach(async () => {
    await server.close();
  });

  /** A client wired to the fake Slack, with `env` overriding the defaults. */
  function buildClient(env: Partial<SlackEnv> = {}): SlackClient {
    const config = SlackConfig.fromEnv({ ...BASE_ENV, ...env });
    const factory: SlackWebClientFactory = {
      create: ({ token, timeoutMs }) =>
        new WebClient(token, {
          slackApiUrl: server.apiUrl,
          timeout: timeoutMs,
          retryConfig: { retries: 0 },
          rejectRateLimitedCalls: true,
          attachOriginalToWebAPIRequestError: false,
        }),
    };
    return new SlackClient(config, logs.logger, factory);
  }

  /** Log lines at one level, in order. */
  function linesAt(level: string): Record<string, unknown>[] {
    return logs.lines().filter((line) => line['level'] === level);
  }

  /**
   * The nth line at a level, or a failure naming what was there instead.
   * `noUncheckedIndexedAccess` is on, and "there was no such line" is a more
   * useful failure than "cannot read property of undefined".
   */
  function lineAt(level: string, index = 0): Record<string, unknown> {
    const lines = linesAt(level);
    const line = lines[index];
    if (line === undefined) {
      throw new Error(`No ${level} line #${index}; got ${JSON.stringify(lines)}`);
    }
    return line;
  }

  /** The nth request the SDK put on the wire, or a failure naming the count. */
  function requestAt(index: number): RecordedSlackRequest {
    const request = server.requests[index];
    if (request === undefined) {
      throw new Error(`No request #${index}; only ${server.requests.length} were sent`);
    }
    return request;
  }

  describe('SLACK_ENABLED=false', () => {
    it('sends nothing, and says so without calling it a failure', async () => {
      const client = buildClient({ SLACK_ENABLED: false, SLACK_BOT_TOKEN: undefined });

      await expect(client.postToChannel('cokoli')).resolves.toBe('disabled');
      await expect(client.postDirectMessage('U1', 'cokoli')).resolves.toBe('disabled');
      await expect(client.lookupUserIdByEmail('a@example.test')).resolves.toBeUndefined();

      // The strongest form of "no call is made": nothing reached the network.
      expect(server.requests).toHaveLength(0);
      expect(client.enabled).toBe(false);
      // Not `error`, not `warn`: turning Slack off is a choice, not a fault.
      expect(linesAt('error')).toHaveLength(0);
      expect(linesAt('warn')).toHaveLength(0);
    });
  });

  describe('a message Slack accepts', () => {
    it('posts once, with the channel, the text and the bearer token', async () => {
      server.respondWith(() => SLACK_OK);

      await expect(buildClient().postToChannel('Uvolnilo se místo')).resolves.toBe('delivered');

      expect(server.requests).toHaveLength(1);
      const request = requestAt(0);
      expect(request.method).toBe('POST');
      expect(request.url).toContain('chat.postMessage');
      expect(request.authorization).toBe(`Bearer ${BOT_TOKEN}`);
      expect(request.body).toContain(encodeURIComponent(CHANNEL));
      expect(request.body).toContain(encodeURIComponent('Uvolnilo se místo'));
    });

    it('sends a direct message to the user id it is given, not to the channel', async () => {
      server.respondWith(() => SLACK_OK);

      await expect(buildClient().postDirectMessage('U0PROMOTED', 'Máte místo')).resolves.toBe(
        'delivered'
      );

      expect(requestAt(0).body).toContain('U0PROMOTED');
      expect(requestAt(0).body).not.toContain(CHANNEL);
    });
  });

  describe("Slack's 200 OK with ok:false", () => {
    it('is a failure, is not retried, and names the Slack error in the log', async () => {
      server.respondWith(() => slackNotOk('channel_not_found'));

      await expect(buildClient().postToChannel('ahoj')).resolves.toBe('failed');

      // The whole point: Slack understood us and said no. Asking again is
      // three wrong calls instead of one.
      expect(server.requests).toHaveLength(1);
      expect(lineAt('error')).toMatchObject({
        slackErrorCode: 'slack_webapi_platform_error',
        slackError: 'channel_not_found',
        operation: 'chat.postMessage',
        retryable: false,
        attempt: 1,
      });
    });
  });

  describe('a 5xx', () => {
    it('is retried with a doubling backoff and succeeds when Slack recovers', async () => {
      // Four attempts, three delays: [60, 120, 240]. Two delays ([60, 120])
      // cannot tell doubling from `base * attempt` — both produce 60 then
      // 120 — so a third point is required to pin the growth as
      // *exponential* rather than merely increasing.
      server.respondWith((attempt) =>
        attempt < 4 ? { status: 503, body: { ok: false, error: 'service_unavailable' } } : SLACK_OK
      );

      const startedAt = Date.now();
      await expect(buildClient({ SLACK_RETRY_ATTEMPTS: 4 }).postToChannel('ahoj')).resolves.toBe(
        'delivered'
      );
      const elapsed = Date.now() - startedAt;

      expect(server.requests).toHaveLength(4);
      expect(linesAt('warn').map((line) => line['delayMs'])).toEqual([60, 120, 240]);
      // The delays were awaited, not merely logged.
      expect(elapsed).toBeGreaterThanOrEqual(420);
      expect(linesAt('error')).toHaveLength(0);
    });

    it('gives up after exactly SLACK_RETRY_ATTEMPTS requests', async () => {
      server.respondWith(() => ({ status: 500, body: { ok: false, error: 'internal_error' } }));

      await expect(buildClient({ SLACK_RETRY_ATTEMPTS: 2 }).postToChannel('ahoj')).resolves.toBe(
        'failed'
      );

      expect(server.requests).toHaveLength(2);
      expect(lineAt('error')).toMatchObject({
        slackErrorCode: 'slack_webapi_http_error',
        statusCode: 500,
        attempt: 2,
      });
    });

    it('does not retry at all when SLACK_RETRY_ATTEMPTS is 1', async () => {
      server.respondWith(() => ({ status: 500, body: { ok: false, error: 'internal_error' } }));

      await expect(buildClient({ SLACK_RETRY_ATTEMPTS: 1 }).postToChannel('ahoj')).resolves.toBe(
        'failed'
      );

      expect(server.requests).toHaveLength(1);
    });
  });

  describe('a 4xx other than 429', () => {
    // The one row of `httpStatusIsRetryable`'s table that the rest of this file
    // exercised only through a hand-built error object in `slack-failure.spec.ts`
    // — added here so the claim in `doc/slack.md` ("every row … from a real HTTP
    // server") is actually true rather than merely true of five rows out of six.
    it('is ours, not a Slack decision, and is not retried', async () => {
      server.respondWith(() => ({ status: 404, body: { ok: false, error: 'not_found' } }));

      await expect(buildClient({ SLACK_RETRY_ATTEMPTS: 3 }).postToChannel('ahoj')).resolves.toBe(
        'failed'
      );

      expect(server.requests).toHaveLength(1);
      expect(lineAt('error')).toMatchObject({
        slackErrorCode: 'slack_webapi_http_error',
        statusCode: 404,
        retryable: false,
        attempt: 1,
      });
    });
  });

  describe('a 429', () => {
    it('waits the Retry-After Slack asked for rather than our own backoff', async () => {
      server.respondWith((attempt) =>
        attempt === 1
          ? {
              status: 429,
              // Slack sends seconds. 1s is the smallest value that is
              // distinguishable from the 60 ms backoff this config would
              // otherwise have used.
              headers: { 'retry-after': '1' },
              body: { ok: false, error: 'ratelimited' },
            }
          : SLACK_OK
      );

      await expect(buildClient().postToChannel('ahoj')).resolves.toBe('delivered');

      expect(server.requests).toHaveLength(2);
      expect(lineAt('warn')).toMatchObject({
        slackErrorCode: 'slack_webapi_rate_limited_error',
        statusCode: 429,
        retryAfterMs: 1_000,
        delayMs: 1_000,
      });
    });
  });

  describe('a Slack that never answers', () => {
    it('times out per attempt instead of hanging the caller', async () => {
      server.respondWith(() => 'hang');

      const startedAt = Date.now();
      await expect(
        buildClient({ SLACK_RETRY_ATTEMPTS: 1, SLACK_REQUEST_TIMEOUT_MS: 150 }).postToChannel(
          'ahoj'
        )
      ).resolves.toBe('failed');
      const elapsed = Date.now() - startedAt;

      expect(elapsed).toBeGreaterThanOrEqual(150);
      // Generously bounded: the assertion is "it stopped", not a benchmark.
      expect(elapsed).toBeLessThan(5_000);
      expect(lineAt('error')).toMatchObject({ slackErrorCode: 'slack_webapi_request_error' });
    });
  });

  describe('users.lookupByEmail', () => {
    it('returns the Slack user id', async () => {
      server.respondWith(() => ({ status: 200, body: { ok: true, user: { id: 'U0FOUND' } } }));

      await expect(buildClient().lookupUserIdByEmail('jan@example.test')).resolves.toBe('U0FOUND');
    });

    it('returns undefined for users_not_found without retrying', async () => {
      server.respondWith(() => slackNotOk('users_not_found'));

      await expect(
        buildClient().lookupUserIdByEmail('nikdo@example.test')
      ).resolves.toBeUndefined();

      expect(server.requests).toHaveLength(1);
      expect(lineAt('error')).toMatchObject({ slackError: 'users_not_found' });
    });

    it('keeps the looked-up email out of the log', async () => {
      server.respondWith(() => slackNotOk('users_not_found'));

      await buildClient().lookupUserIdByEmail('jan.novak@example.test');

      expect(logs.raw()).not.toContain('jan.novak@example.test');
    });
  });

  /**
   * The regression this module exists to avoid. Each case drives a *different*
   * failure path, because the leak an earlier task shipped was in the error
   * object, not in the happy path.
   */
  describe('the bot token never reaches the log', () => {
    it.each([
      ['a platform error', () => slackNotOk('invalid_auth')],
      ['an HTTP 500', () => ({ status: 500, body: { ok: false, error: 'internal_error' } })],
      ['a timeout', () => 'hang' as const],
    ])('%s', async (_name, reply) => {
      server.respondWith(reply);

      await buildClient({
        SLACK_RETRY_ATTEMPTS: 1,
        SLACK_REQUEST_TIMEOUT_MS: 150,
      }).postToChannel('ahoj');

      // The request really did carry the credential …
      expect(requestAt(0).authorization).toBe(`Bearer ${BOT_TOKEN}`);
      // … and not one character of it came back out in the log.
      expect(logs.raw()).not.toContain(BOT_TOKEN);
      expect(logs.raw()).not.toContain('xoxb-');
      // A log line was written, so this is not passing by writing nothing.
      expect(linesAt('error')).toHaveLength(1);
    });

    it('is caught by the redactor SlackClient wires in, not only by what the SDK happens to omit', async () => {
      // Every case above exercises `describeSlackFailure`'s scalar projection,
      // which never carries the token *regardless of redaction* — the real
      // Slack SDK simply never puts the token into `error.message` for these
      // failure shapes, so those tests cannot see the redactor's wiring being
      // removed. This one instead makes redaction itself the only thing
      // standing between the token and the log: a fake `WebClient` whose
      // failure message *contains* the configured token, the exact shape a
      // future SDK version (or a regression in
      // `attachOriginalToWebAPIRequestError`) could produce. If
      // `SlackClient`'s constructor ever stops calling
      // `createSlackTokenRedactor`, this is the test that notices.
      const leakyChatPostMessage = (): Promise<never> =>
        Promise.reject(
          Object.assign(
            new Error(`connect ECONNREFUSED to slack.com (Authorization: Bearer ${BOT_TOKEN})`),
            { code: ErrorCode.RequestError }
          )
        );
      const leaky = { chat: { postMessage: leakyChatPostMessage } } as unknown as WebClient;
      const factory: SlackWebClientFactory = { create: () => leaky };
      const client = new SlackClient(
        SlackConfig.fromEnv({ ...BASE_ENV, SLACK_RETRY_ATTEMPTS: 1 }),
        logs.logger,
        factory
      );

      await client.postToChannel('ahoj');

      expect(logs.raw()).not.toContain(BOT_TOKEN);
      expect(linesAt('error')).toHaveLength(1);
    });
  });
});
