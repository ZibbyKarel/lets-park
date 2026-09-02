/**
 * The editing hold on one cell of the day × spot grid.
 *
 * A cell lock is a **courtesy, not an authorization step** (see
 * `libs/contract/src/realtime/commands.ts`): holding it does not book
 * anything, and a client that skips it gets a `CONFLICT` from
 * `reservation.create` instead of a nicer message. What it buys is the "právě
 * upravuje …" state on everybody else's tile while one user has a form open.
 *
 * Three things have to be true for that state not to get stuck, and this hook
 * exists to make all three automatic:
 *
 * 1. **The hold has to be renewed.** The server's TTL is short (~30 s) on
 *    purpose — a browser that closes mid-edit must not freeze a tile — so a
 *    form that stays open longer than that has to say so. There is no separate
 *    heartbeat command: re-sending `cell:lock` for a cell you already hold
 *    extends it, which is the whole heartbeat. See {@link renewDelayMs} for
 *    when.
 * 2. **The hold has to be given back.** On unmount, on `enabled` going false,
 *    and on the cell changing — every one of them is the same effect cleanup,
 *    so there is no path that closes the form without a `cell:unlock`.
 *
 *    With one measured exception, which is React's rather than this hook's:
 *    when the **whole provider tree** is deleted at once, React runs a
 *    deletion's cleanups parent-first, so `useRealtimeConnection` has already
 *    disconnected the socket by the time this cleanup runs and there is
 *    nothing left to say `cell:unlock` on. That is not a leak — a dropped
 *    socket is exactly how the gateway learns to release a hold, and it is the
 *    same path a closed tab takes — but it does mean the emit is guaranteed
 *    for the case that matters (a form closing on a live page) and redundant
 *    for the case it is not. `cell-lock.spec.tsx` tests the first;
 *    `connection.spec.tsx` asserts the socket really is closed for the second.
 * 3. **The hold has to be re-taken after a reconnect.** A dropped socket drops
 *    the server's lock with it, so the hook re-requests on the new connection
 *    rather than believing the state it had.
 */

import { useEffect, useRef, useState } from 'react';
import type { CellLockAck, CellLockCommand } from '@lets-park/contract/realtime';
import { useRealtime } from './connection';
import { parseAck } from './validation';

/**
 * Fraction of the remaining TTL after which the hold is renewed.
 *
 * Half, so a renewal that is lost in flight still leaves a second attempt
 * inside the same TTL. Derived from the server's `expiresAt` rather than from
 * a TTL constant copied onto the client: the client is then correct for
 * whatever TTL the gateway is configured with, and there is no second number
 * to keep in sync across two tasks.
 */
export const CELL_LOCK_RENEW_FRACTION = 0.5;

/**
 * Floor on the renewal delay.
 *
 * Without it, an `expiresAt` that is already in the past — a clock skew, a
 * slow round trip — schedules a zero-delay timer that re-requests the lock as
 * fast as the event loop allows. A one-second floor turns the worst case into
 * one request per second instead of a busy loop against the gateway.
 */
export const MIN_CELL_LOCK_RENEW_DELAY_MS = 1_000;

/** Who is holding a cell somebody else asked for, derived from the ack. */
export type CellLockHolder = Extract<CellLockAck, { result: 'HELD_BY_OTHER' }>['lockedBy'];

/**
 * - `idle` — not asked for (disabled, or no connection).
 * - `requesting` — asked, no answer yet.
 * - `held` — this client holds it, and is renewing it.
 * - `held-by-other` — somebody else has it; {@link CellLockState.lockedBy} says who.
 */
export type CellLockStatus = 'idle' | 'requesting' | 'held' | 'held-by-other';

export interface CellLockState {
  readonly status: CellLockStatus;
  /** When the hold lapses, ISO UTC. Set for `held` and `held-by-other`. */
  readonly expiresAt: string | null;
  /** Only ever set for `held-by-other`. */
  readonly lockedBy: CellLockHolder | null;
}

const IDLE: CellLockState = { status: 'idle', expiresAt: null, lockedBy: null };

export interface UseCellLockOptions extends CellLockCommand {
  /**
   * Ask for the hold. `false` (the default is `true`) releases one already
   * held — this is what a closing form flips.
   */
  readonly enabled?: boolean;
}

/**
 * How long to wait before renewing a hold that expires at `expiresAt`.
 *
 * Pure and exported so it can be tested on its own: the interesting cases are
 * an expiry already in the past and an unparseable one, both of which have to
 * come out as the floor rather than as `NaN` — `setTimeout(NaN)` fires
 * immediately, which is the busy loop {@link MIN_CELL_LOCK_RENEW_DELAY_MS}
 * exists to prevent.
 */
export function renewDelayMs(expiresAt: string, now: number): number {
  const remaining = Date.parse(expiresAt) - now;
  if (!Number.isFinite(remaining)) return MIN_CELL_LOCK_RENEW_DELAY_MS;
  return Math.max(remaining * CELL_LOCK_RENEW_FRACTION, MIN_CELL_LOCK_RENEW_DELAY_MS);
}

/**
 * Takes, renews and releases the editing hold on one cell.
 *
 * The whole lifecycle lives in a single effect, which is what makes the three
 * guarantees above structural rather than remembered: every way of leaving the
 * cell — unmount, `enabled: false`, a different cell, a lost connection — is
 * the same cleanup, and every way of arriving at one is the same setup.
 */
export function useCellLock(options: UseCellLockOptions): CellLockState {
  const { date, parkingSpotId, enabled = true } = options;
  const { socket, status: connectionStatus, reportInvalidPayload } = useRealtime();
  const [state, setState] = useState<CellLockState>(IDLE);

  // The current state, readable from inside the effect without making the
  // effect depend on it — a dependency would tear the lock down and re-take it
  // on every status change the effect itself caused.
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    if (socket === null || !enabled || connectionStatus !== 'connected') {
      setState(IDLE);
      return;
    }

    const cell: CellLockCommand = { date, parkingSpotId };
    let disposed = false;
    let held = false;
    let renewal: ReturnType<typeof setTimeout> | undefined;

    const request = () => {
      if (stateRef.current.status === 'idle') {
        setState({ status: 'requesting', expiresAt: null, lockedBy: null });
      }

      socket.emit('cell:lock', cell, (raw) => {
        // The effect may have been cleaned up while the ack was in flight —
        // the form closed, the socket dropped. Answering it would resurrect a
        // hold nobody is going to release.
        if (disposed) return;

        const parsed = parseAck('cell:lock', raw);
        if (!parsed.ok) {
          reportInvalidPayload(parsed.report);
          held = false;
          setState(IDLE);
          return;
        }

        const ack = parsed.data;
        if (ack.result === 'ACQUIRED') {
          held = true;
          setState({ status: 'held', expiresAt: ack.expiresAt, lockedBy: null });
          renewal = setTimeout(request, renewDelayMs(ack.expiresAt, Date.now()));
          return;
        }

        // Somebody else has it. No retry loop: the `cell:unlocked` broadcast
        // (and `expiresAt` running out) is how a client learns the cell is
        // free again, and polling a contended cell from every open tab is
        // exactly the traffic the broadcast exists to avoid.
        held = false;
        setState({ status: 'held-by-other', expiresAt: ack.expiresAt, lockedBy: ack.lockedBy });
      });
    };

    request();

    return () => {
      disposed = true;
      if (renewal !== undefined) clearTimeout(renewal);
      // Only a hold this client actually has, and only while there is still a
      // socket to say it on: the server releases the lock by itself when the
      // connection drops.
      if (held && socket.connected) socket.emit('cell:unlock', cell);
      setState(IDLE);
    };
  }, [socket, connectionStatus, enabled, date, parkingSpotId, reportInvalidPayload]);

  return state;
}
