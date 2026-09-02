/**
 * `@lets-park/realtime-client` — the wrapper lib that owns `socket.io-client`.
 *
 * No application or feature file may import `socket.io-client` directly
 * (`eslint.config.mjs` → `WRAPPED_LIBRARIES`, `doc/wrappers.md`); everything a
 * feature needs to watch a day, hold a cell or read a broadcast is here:
 *
 * - `RealtimeProvider` / `useRealtimeConnection` — the one connection, its
 *   handshake token and its reconnect behaviour;
 * - `useRealtimeEvent` / `useDayRoom` — subscribing to a day and to the events
 *   broadcast into it, each payload parsed against its contract schema first;
 * - `useCellLock` — the editing hold, renewed while a form is open and
 *   released when it closes.
 *
 * Every event name and payload type comes from `@lets-park/contract/realtime`.
 * There is no way to emit or listen for something the contract does not
 * declare, and no payload shape is written down twice.
 *
 * `createRealtimeSocket` is exported for the app's own composition (and for
 * tests that need to drive a socket without React); components should reach
 * for the provider instead.
 */

export { DEFAULT_SOCKET_PATH, createRealtimeSocket, toHandshakeAuth } from './lib/socket';
export type { RealtimeHandshakeAuth, RealtimeSocket, RealtimeSocketOptions } from './lib/socket';

export {
  REJECTED_RETRY_DELAYS_MS,
  RealtimeProvider,
  useDayRoom,
  useRealtime,
  useRealtimeConnection,
  useRealtimeEvent,
} from './lib/connection';
export type {
  RealtimeConnection,
  RealtimeConnectionOptions,
  RealtimeProviderProps,
  RealtimeStatus,
} from './lib/connection';

export {
  CELL_LOCK_ACK_ATTEMPTS,
  CELL_LOCK_ACK_TIMEOUT_MS,
  CELL_LOCK_RENEW_FRACTION,
  MIN_CELL_LOCK_RENEW_DELAY_MS,
  renewDelayMs,
  useCellLock,
} from './lib/cell-lock';
export type {
  CellLockHolder,
  CellLockState,
  CellLockStatus,
  UseCellLockOptions,
} from './lib/cell-lock';

export { parseAck, parseServerEvent } from './lib/validation';
export type {
  AckPayload,
  InvalidPayloadHandler,
  InvalidRealtimePayload,
  ParseResult,
  ServerEventPayload,
} from './lib/validation';

/**
 * The token seam, re-exported from `@lets-park/api-client` rather than
 * redeclared.
 *
 * `libs/auth`'s `useAccessTokenProvider()` returns one of these and it feeds
 * both the HTTP client's `Authorization` header and this lib's handshake. One
 * definition means the two can never drift into "the socket takes a string,
 * the client takes a function", which is precisely the drift that would make a
 * long-lived socket pin an expired token.
 */
export type { AccessTokenProvider } from '@lets-park/api-client';
