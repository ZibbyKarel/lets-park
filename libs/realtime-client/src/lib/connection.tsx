/**
 * The connection: who owns the socket, how its lifetime is bounded, and how a
 * component subscribes to a contract event without ever naming
 * `socket.io-client`.
 *
 * Three pieces, and the split is deliberate:
 *
 * - {@link useRealtimeConnection} **creates** the socket and owns its
 *   lifetime. Exactly one call per app.
 * - {@link RealtimeProvider} is that hook plus a context, so the rest of the
 *   tree can reach the same connection. It is what `apps/web` renders
 *   (Task 23), alongside `QueryProvider`, `AuthProvider` and `IntlProvider`.
 * - {@link useRealtimeEvent}, {@link useDayRoom} and `useCellLock` **read**
 *   the context. They never create a socket, so no feature can accidentally
 *   open a second connection by rendering a component twice.
 *
 * Like `QueryProvider` and `AuthProvider`, this file carries no `'use client'`
 * directive: `apps/web` marks its own provider boundary as a client component
 * and composes all of them there.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { DayRoomCommand, ServerToClientEventName } from '@lets-park/contract/realtime';
import type { AccessTokenProvider } from '@lets-park/api-client';
import { DEFAULT_SOCKET_PATH, createRealtimeSocket } from './socket';
import type { RealtimeSocket } from './socket';
import { parseServerEvent } from './validation';
import type { InvalidPayloadHandler, ServerEventPayload } from './validation';

/**
 * What the connection looks like to a component.
 *
 * `connecting` covers both the first attempt and every retry: Socket.io's
 * reconnection loop reports failures as `connect_error` and keeps trying, and
 * a UI that distinguished "still connecting" from "retrying after a failure"
 * would be showing the user a difference they cannot act on.
 */
export type RealtimeStatus = 'connecting' | 'connected' | 'disconnected';

export interface RealtimeConnection {
  /** `null` until the connection effect has run, and while disabled. */
  readonly socket: RealtimeSocket | null;
  readonly status: RealtimeStatus;
  /**
   * Reports a payload that failed its schema. Referentially stable, so an
   * effect may depend on it. Calls whatever `onInvalidPayload` the provider
   * was last rendered with.
   */
  readonly reportInvalidPayload: InvalidPayloadHandler;
}

export interface RealtimeConnectionOptions {
  /** Origin of the API, e.g. `https://api.example.test`. */
  readonly url: string;
  /** Socket.io endpoint path. Defaults to {@link DEFAULT_SOCKET_PATH}. */
  readonly path?: string;
  /** Where the handshake token comes from — `libs/auth`'s provider. */
  readonly getAccessToken: AccessTokenProvider;
  /**
   * Hold the connection closed. The app passes `status === 'authenticated'`:
   * connecting before a session exists just spends a handshake the gateway is
   * going to refuse.
   */
  readonly enabled?: boolean;
  /** Called for each payload that fails its contract schema. */
  readonly onInvalidPayload?: InvalidPayloadHandler;
}

/**
 * Creates and owns one connection for as long as the calling component is
 * mounted.
 *
 * The socket is built inside an effect rather than during render, and torn
 * down by that effect's cleanup: a socket opened in a render body would leak
 * one connection per discarded render, and React's development double-invoke
 * would leave the first one open forever.
 *
 * `getAccessToken` and `onInvalidPayload` are read through refs, so passing an
 * inline arrow — which every caller will — does not tear the socket down and
 * rebuild it on every render. Only `url`, `path` and `enabled` do that, which
 * is right: they are the connection's identity.
 */
export function useRealtimeConnection(options: RealtimeConnectionOptions): RealtimeConnection {
  const { url, path = DEFAULT_SOCKET_PATH, getAccessToken, enabled = true, onInvalidPayload } = options;

  const getAccessTokenRef = useRef(getAccessToken);
  const onInvalidPayloadRef = useRef(onInvalidPayload);

  // Written during render on purpose, the same way `libs/auth`'s
  // `useAccessTokenProvider` does it: neither ref is read while rendering,
  // only from a callback, and an effect would leave the socket one commit
  // behind — long enough for a reconnect to present the previous token.
  getAccessTokenRef.current = getAccessToken;
  onInvalidPayloadRef.current = onInvalidPayload;

  const [socket, setSocket] = useState<RealtimeSocket | null>(null);
  const [status, setStatus] = useState<RealtimeStatus>('disconnected');

  useEffect(() => {
    if (!enabled) return;

    const next = createRealtimeSocket({
      url,
      path,
      autoConnect: true,
      // This hook owns the socket's lifetime, so it must not be handed one out
      // of Socket.io's per-origin manager cache: a cached manager outlives the
      // component that disconnected it, and a remount would revive a socket
      // whose listeners belong to an unmounted tree.
      forceNew: true,
      getAccessToken: () => getAccessTokenRef.current(),
    });

    const onConnect = () => setStatus('connected');
    const onDisconnect = () => setStatus('disconnected');
    // Socket.io keeps retrying after a failed attempt, so a connect error is
    // still "connecting" as far as the UI is concerned. The error itself is
    // deliberately neither logged nor surfaced: for an auth failure it is the
    // gateway's rejection of the token that just travelled, and this lib does
    // not put anything from that exchange into a log.
    const onConnectError = () => setStatus('connecting');

    next.on('connect', onConnect);
    next.on('disconnect', onDisconnect);
    next.on('connect_error', onConnectError);

    setSocket(next);
    setStatus(next.connected ? 'connected' : 'connecting');

    return () => {
      next.off('connect', onConnect);
      next.off('disconnect', onDisconnect);
      next.off('connect_error', onConnectError);
      next.disconnect();
      setSocket(null);
      setStatus('disconnected');
    };
  }, [url, path, enabled]);

  const reportInvalidPayload = useCallback<InvalidPayloadHandler>((report) => {
    onInvalidPayloadRef.current?.(report);
  }, []);

  return useMemo(
    () => ({ socket, status, reportInvalidPayload }),
    [socket, status, reportInvalidPayload]
  );
}

const RealtimeContext = createContext<RealtimeConnection | null>(null);

export interface RealtimeProviderProps extends RealtimeConnectionOptions {
  readonly children: ReactNode;
}

/** The single place components attach to the realtime connection. */
export function RealtimeProvider({ children, ...options }: RealtimeProviderProps) {
  const connection = useRealtimeConnection(options);
  return <RealtimeContext.Provider value={connection}>{children}</RealtimeContext.Provider>;
}

/**
 * The connection a {@link RealtimeProvider} ancestor established.
 *
 * Throws rather than returning `null` when there is no provider: a component
 * that silently does nothing because it is outside the tree is a bug that only
 * shows up as "realtime updates stopped working" in production.
 */
export function useRealtime(): RealtimeConnection {
  const connection = useContext(RealtimeContext);
  if (connection === null) {
    throw new Error('useRealtime must be used inside a <RealtimeProvider>.');
  }
  return connection;
}

/**
 * Subscribes to one server → client event for as long as the component is
 * mounted, handing the handler a payload that has been through the contract
 * schema (`./validation`). A payload that fails is dropped and reported; the
 * handler is not called with it.
 *
 * `handler` is read through a ref, so an inline arrow does not re-subscribe on
 * every render.
 */
export function useRealtimeEvent<K extends ServerToClientEventName>(
  event: K,
  handler: (payload: ServerEventPayload<K>) => void
): void {
  const { socket, reportInvalidPayload } = useRealtime();
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (socket === null) return;

    const listener = (payload: unknown) => {
      const result = parseServerEvent(event, payload);
      if (!result.ok) {
        reportInvalidPayload(result.report);
        return;
      }
      handlerRef.current(result.data);
    };

    socket.on(event, listener as never);
    return () => {
      socket.off(event, listener as never);
    };
  }, [socket, event, reportInvalidPayload]);
}

/**
 * Joins the room of one day, and rejoins it after every reconnect.
 *
 * Rejoining is not extra logic — it falls out of the effect depending on
 * `status`. A dropped socket loses its server-side room membership, so the
 * subscription has to be re-sent on the new connection or the client goes
 * quietly deaf. Gating on `connected` (rather than emitting eagerly and
 * letting Socket.io buffer) is what makes the re-send happen at all: a
 * buffered `day:subscribe` from the *previous* connection is flushed on the
 * new one, which looks the same until the buffer was cleared by the
 * disconnect.
 *
 * `date` is `null` when there is no day to watch — a page still deciding which
 * one to show.
 */
export function useDayRoom(date: DayRoomCommand['date'] | null): void {
  const { socket, status } = useRealtime();

  useEffect(() => {
    if (socket === null || date === null || status !== 'connected') return;

    socket.emit('day:subscribe', { date });
    return () => {
      // Only while the socket is still up: once it is down the room is gone
      // anyway, and Socket.io would buffer the `day:unsubscribe` and deliver
      // it on the next connection, where it means something else entirely.
      if (socket.connected) socket.emit('day:unsubscribe', { date });
    };
  }, [socket, status, date]);
}
