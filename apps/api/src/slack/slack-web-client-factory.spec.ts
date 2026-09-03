/**
 * `DefaultSlackWebClientFactory` — the only shipped `WebClient` construction,
 * and the one nothing else in this file set exercised.
 *
 * Every other Slack spec builds its *own* factory, hand-copying the same four
 * options (`timeout`, `retryConfig`, `rejectRateLimitedCalls`,
 * `attachOriginalToWebAPIRequestError`) to point the real SDK at a local test
 * server. That is the right shape for testing `SlackClient`'s retry and
 * redaction behaviour honestly, but it means the *shipped* factory — the one
 * that actually runs in production — was asserted only by
 * `slack.module.spec.ts`'s "constructs a `WebClient` in exactly one shipped
 * file", which checks that the call exists, not what it is called with.
 * Flipping `retryConfig`, `rejectRateLimitedCalls` and
 * `attachOriginalToWebAPIRequestError` all at once left every other Slack test
 * green (task-16-task-review.md, finding I2).
 *
 * This file mocks the SDK's `WebClient` constructor directly, so it can assert
 * the shipped factory's actual call — the option object a maintainer would
 * have to touch to weaken any of the three safety properties
 * `doc/slack.md` §5.1 and the class comment on `DefaultSlackWebClientFactory`
 * describe.
 */

jest.mock('@slack/web-api', () => ({ WebClient: jest.fn() }));

import { WebClient } from '@slack/web-api';
import { DefaultSlackWebClientFactory } from './slack-client.service';

const MockWebClient = WebClient as unknown as jest.Mock;

describe('DefaultSlackWebClientFactory', () => {
  afterEach(() => {
    MockWebClient.mockClear();
  });

  it('constructs the SDK client with the token, the timeout, and the three safety-relevant options', () => {
    new DefaultSlackWebClientFactory().create({ token: 'xoxb-configured-token', timeoutMs: 4321 });

    expect(MockWebClient).toHaveBeenCalledTimes(1);
    expect(MockWebClient).toHaveBeenCalledWith('xoxb-configured-token', {
      timeout: 4321,
      // Ours, not the SDK's ten-retries-over-thirty-minutes default.
      retryConfig: { retries: 0 },
      // A 429 surfaces as `RateLimitedError` instead of the SDK sleeping
      // silently inside the call.
      rejectRateLimitedCalls: true,
      // The first line of defence against the bot token reaching a log — see
      // `./slack-token-redaction.ts`.
      attachOriginalToWebAPIRequestError: false,
    });
  });

  it('passes no token through when Slack is configured with none', () => {
    new DefaultSlackWebClientFactory().create({ token: undefined, timeoutMs: 1_000 });

    expect(MockWebClient).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({ timeout: 1_000 })
    );
  });
});
