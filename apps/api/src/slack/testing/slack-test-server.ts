/**
 * A stand-in for `slack.com/api`, spoken to over real HTTP by the real
 * `@slack/web-api` client.
 *
 * ## Why a server and not a mocked `WebClient`
 *
 * Slack signals an application-level failure with **`200 OK` and a body of
 * `{"ok": false, "error": "…"}`** — not with a 4xx, and not with a rejected
 * promise. The SDK is what turns that body into a `WebAPIPlatformError`, and
 * `SlackClient`'s whole retry policy hangs on telling that error apart from an
 * HTTP 500 and from a 429 carrying `Retry-After`. A double that rejected on
 * command would let a spec assert any mapping it liked, including a wrong one.
 * Talking real HTTP means the SDK does the classification the production code
 * depends on, and the spec asserts the outcome of the *actual* protocol.
 *
 * It also makes two things observable that a double hides: how many requests
 * were really sent (retries), and what headers went out (the bot token).
 */

import type { AddressInfo } from 'node:net';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createServer } from 'node:http';
import type { Server, Socket } from 'node:net';

/** One request the SDK actually put on the wire. */
export interface RecordedSlackRequest {
  readonly method: string;
  readonly url: string;
  readonly authorization: string | undefined;
  readonly body: string;
}

/** What the fake Slack answers with, or `'hang'` to never answer at all. */
export type SlackReply =
  | {
      readonly status: number;
      readonly body: unknown;
      readonly headers?: Record<string, string>;
    }
  | 'hang';

/**
 * Chooses the reply for request number `attempt` (1-based), so a spec can say
 * "fail twice, then succeed" without a mutable counter of its own.
 */
export type SlackResponder = (attempt: number) => SlackReply;

export interface SlackTestServer {
  /** Pass as `slackApiUrl`. Ends in `/`, as the SDK expects. */
  readonly apiUrl: string;
  /** Every request received, in order. */
  readonly requests: RecordedSlackRequest[];
  respondWith(responder: SlackResponder): void;
  close(): Promise<void>;
}

/** `{ ok: true }` — what Slack returns for an accepted `chat.postMessage`. */
export const SLACK_OK: SlackReply = { status: 200, body: { ok: true, ts: '1700000000.000100' } };

/**
 * `200 OK` with `ok: false` — Slack's application-level failure. **This is the
 * shape a double gets wrong**, which is why it is a named constant here.
 */
export function slackNotOk(error: string): SlackReply {
  return { status: 200, body: { ok: false, error } };
}

export async function startSlackTestServer(): Promise<SlackTestServer> {
  const requests: RecordedSlackRequest[] = [];
  let responder: SlackResponder = () => SLACK_OK;
  // A hung request holds its socket open; without tracking them, `close()`
  // waits forever and the spec times out on Jest's generic message instead of
  // its own.
  const sockets = new Set<Socket>();

  const server: Server = createServer((request: IncomingMessage, response: ServerResponse) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      const authorization = request.headers.authorization;
      requests.push({
        method: request.method ?? '',
        url: request.url ?? '',
        authorization: Array.isArray(authorization) ? authorization[0] : authorization,
        body: Buffer.concat(chunks).toString('utf8'),
      });

      const reply = responder(requests.length);
      if (reply === 'hang') {
        return;
      }
      response.writeHead(reply.status, {
        'content-type': 'application/json; charset=utf-8',
        ...reply.headers,
      });
      response.end(JSON.stringify(reply.body));
    });
  });

  server.on('connection', (socket: Socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address() as AddressInfo;

  return {
    apiUrl: `http://127.0.0.1:${port}/api/`,
    requests,
    respondWith(next: SlackResponder): void {
      responder = next;
    },
    async close(): Promise<void> {
      for (const socket of sockets) {
        socket.destroy();
      }
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}
