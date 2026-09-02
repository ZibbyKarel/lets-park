/**
 * The editing hold: taking it, renewing it, and giving it back.
 *
 * Same harness as `connection.spec.tsx` — the socket is a real
 * `socket.io-client` socket with only its transport replaced, so a `cell:lock`
 * here is a genuine EVENT packet with a genuine ack id, answered through the
 * client's own acknowledgement registry.
 */

import { act, render } from '@testing-library/react';
import { currentOfflineSocket, resetOfflineSockets } from '../__fixtures__/offline-transport';
import type { OfflineSocket } from '../__fixtures__/offline-transport';
import {
  API_URL,
  DATE,
  OTHER_SPOT_ID,
  SPOT_ID,
  USER_SUMMARY,
  settle,
} from '../__fixtures__/realtime-fixtures';
import { RealtimeProvider } from './connection';
import { MIN_CELL_LOCK_RENEW_DELAY_MS, renewDelayMs, useCellLock } from './cell-lock';
import type { CellLockState } from './cell-lock';

jest.mock('./socket', () => {
  const actual = jest.requireActual('./socket');
  const transport = jest.requireActual('../__fixtures__/offline-transport');
  return {
    ...actual,
    createRealtimeSocket: (options: Record<string, unknown>) =>
      transport.recordOfflineSocket(
        transport.attachOfflineTransport(
          actual.createRealtimeSocket({ ...options, autoConnect: false, forceNew: true })
        )
      ).socket,
  };
});

/** `Date.now()` inside the tests, so `expiresAt` and the clock agree. */
const NOW = Date.parse('2026-09-15T08:00:00.000Z');
const TTL_MS = 30_000;
const EXPIRES_AT = new Date(NOW + TTL_MS).toISOString();

const cell = { date: DATE, parkingSpotId: SPOT_ID };

let states: CellLockState[] = [];

function Editor({
  parkingSpotId = SPOT_ID,
  enabled = true,
}: {
  parkingSpotId?: string;
  enabled?: boolean;
}) {
  states.push(useCellLock({ date: DATE, parkingSpotId, enabled }));
  return null;
}

interface TreeProps {
  parkingSpotId?: string;
  enabled?: boolean;
  /** `false` unmounts the editor while the connection stays up. */
  editorMounted?: boolean;
  onInvalidPayload?: (report: { event: string; issues: readonly string[] }) => void;
}

/**
 * The provider plus one editor.
 *
 * The editor is mounted and unmounted **inside** a provider that stays up,
 * which is the real shape of the scenario: a reservation form opens and closes
 * on a page whose socket lives as long as the tab. It also isolates the
 * behaviour under test — React runs a deletion's cleanups parent-first, so
 * unmounting the *whole* tree tears the socket down before `useCellLock` gets
 * to say anything, and the release then happens server-side instead (see the
 * note in `cell-lock.ts`). That case is covered by `connection.spec.tsx`,
 * which asserts the socket is closed on unmount.
 */
function Tree({ editorMounted = true, onInvalidPayload, ...editor }: TreeProps) {
  return (
    <RealtimeProvider
      url={API_URL}
      getAccessToken={() => 'jwt-value'}
      {...(onInvalidPayload === undefined ? {} : { onInvalidPayload })}
    >
      {editorMounted ? <Editor {...editor} /> : null}
    </RealtimeProvider>
  );
}

function renderEditor(props: TreeProps = {}) {
  const view = render(<Tree {...props} />);
  return {
    ...view,
    update: async (next: TreeProps) => {
      await act(async () => {
        view.rerender(<Tree {...next} />);
      });
    },
  };
}

async function connect(): Promise<OfflineSocket> {
  await act(async () => {
    currentOfflineSocket().open();
    await settle();
  });
  await act(async () => {
    currentOfflineSocket().acceptConnection();
  });
  return currentOfflineSocket();
}

/** Answer the outstanding `cell:lock` the way the gateway would. */
async function grant(offline: OfflineSocket, expiresAt = EXPIRES_AT): Promise<void> {
  await act(async () => {
    offline.acknowledge('cell:lock', { result: 'ACQUIRED', expiresAt });
  });
}

beforeEach(() => {
  states = [];
  jest.useFakeTimers();
  jest.setSystemTime(NOW);
});

afterEach(() => {
  jest.useRealTimers();
  resetOfflineSockets();
});

describe('renewDelayMs', () => {
  it('renews halfway through the remaining TTL', () => {
    expect(renewDelayMs(EXPIRES_AT, NOW)).toBe(TTL_MS / 2);
  });

  it('never schedules faster than the floor, even for an expiry in the past', () => {
    expect(renewDelayMs(new Date(NOW - 60_000).toISOString(), NOW)).toBe(
      MIN_CELL_LOCK_RENEW_DELAY_MS
    );
  });

  it('never returns NaN for an unparseable expiry', () => {
    expect(renewDelayMs('not-a-timestamp', NOW)).toBe(MIN_CELL_LOCK_RENEW_DELAY_MS);
  });
});

describe('useCellLock', () => {
  it('asks for the hold once the connection is up', async () => {
    renderEditor();
    expect(states.at(-1)).toEqual({ status: 'idle', expiresAt: null, lockedBy: null });

    const offline = await connect();

    expect(offline.emitted()).toEqual([['cell:lock', cell]]);
    expect(states.at(-1)).toEqual({ status: 'requesting', expiresAt: null, lockedBy: null });

    await grant(offline);
    expect(states.at(-1)).toEqual({ status: 'held', expiresAt: EXPIRES_AT, lockedBy: null });
  });

  it('extends the hold with a heartbeat before it expires', async () => {
    renderEditor();
    const offline = await connect();
    await grant(offline);

    expect(offline.emitted()).toHaveLength(1);

    // Halfway through the TTL — there is no separate heartbeat command, so the
    // renewal is a second `cell:lock` for the same cell (see the contract's
    // `cellLockCommandSchema`).
    await act(async () => {
      jest.advanceTimersByTime(TTL_MS / 2);
    });

    expect(offline.emitted()).toEqual([
      ['cell:lock', cell],
      ['cell:lock', cell],
    ]);
    // Renewing does not drop the component out of `held` and back to
    // `requesting` — the hold was never lost.
    expect(states.at(-1)).toEqual({ status: 'held', expiresAt: EXPIRES_AT, lockedBy: null });

    // And it keeps going: the second ack schedules a third request.
    const nextExpiry = new Date(NOW + TTL_MS / 2 + TTL_MS).toISOString();
    await grant(offline, nextExpiry);
    await act(async () => {
      jest.advanceTimersByTime(TTL_MS / 2);
    });

    expect(offline.emitted()).toHaveLength(3);
  });

  it('does not send a heartbeat before the renewal is due', async () => {
    renderEditor();
    const offline = await connect();
    await grant(offline);

    await act(async () => {
      jest.advanceTimersByTime(TTL_MS / 2 - 1);
    });

    expect(offline.emitted()).toHaveLength(1);
  });

  it('releases the hold when the component unmounts', async () => {
    const view = renderEditor();
    const offline = await connect();
    await grant(offline);

    await view.update({ editorMounted: false });

    expect(offline.emitted()).toEqual([
      ['cell:lock', cell],
      ['cell:unlock', cell],
    ]);
  });

  it('stops the heartbeat when the component unmounts', async () => {
    const view = renderEditor();
    const offline = await connect();
    await grant(offline);

    await view.update({ editorMounted: false });
    await act(async () => {
      jest.advanceTimersByTime(TTL_MS * 4);
    });

    // Two packets and no more: the lock, and the release. A timer that
    // outlived the component would keep re-taking a hold nobody can give back.
    expect(offline.emitted()).toHaveLength(2);
  });

  it('releases the hold when the form is disabled, without unmounting', async () => {
    const view = renderEditor();
    const offline = await connect();
    await grant(offline);

    await view.update({ enabled: false });

    expect(offline.emitted()).toEqual([
      ['cell:lock', cell],
      ['cell:unlock', cell],
    ]);
    expect(states.at(-1)).toEqual({ status: 'idle', expiresAt: null, lockedBy: null });
  });

  it('releases the old cell and takes the new one when the cell changes', async () => {
    const view = renderEditor();
    const offline = await connect();
    await grant(offline);

    await view.update({ parkingSpotId: OTHER_SPOT_ID });

    expect(offline.emitted()).toEqual([
      ['cell:lock', cell],
      ['cell:unlock', cell],
      ['cell:lock', { date: DATE, parkingSpotId: OTHER_SPOT_ID }],
    ]);
  });

  it('does not try to release a hold it never got', async () => {
    const view = renderEditor();
    const offline = await connect();
    await act(async () => {
      offline.acknowledge('cell:lock', {
        result: 'HELD_BY_OTHER',
        lockedBy: USER_SUMMARY,
        expiresAt: EXPIRES_AT,
      });
    });

    expect(states.at(-1)).toEqual({
      status: 'held-by-other',
      expiresAt: EXPIRES_AT,
      lockedBy: USER_SUMMARY,
    });

    await view.update({ editorMounted: false });

    expect(offline.emitted()).toEqual([['cell:lock', cell]]);
  });

  it('does not poll a cell somebody else is holding', async () => {
    renderEditor();
    const offline = await connect();
    await act(async () => {
      offline.acknowledge('cell:lock', {
        result: 'HELD_BY_OTHER',
        lockedBy: USER_SUMMARY,
        expiresAt: EXPIRES_AT,
      });
    });

    await act(async () => {
      jest.advanceTimersByTime(TTL_MS * 4);
    });

    expect(offline.emitted()).toHaveLength(1);
  });

  it('re-takes the hold after a reconnect, because the server dropped it', async () => {
    renderEditor();
    const offline = await connect();
    await grant(offline);

    await act(async () => {
      offline.drop();
    });
    expect(states.at(-1)).toEqual({ status: 'idle', expiresAt: null, lockedBy: null });

    await act(async () => {
      offline.open();
      await settle();
    });
    await act(async () => {
      offline.acceptConnection();
    });

    // No `cell:unlock` in between: the socket was already gone, so the server
    // released the hold itself and saying so would be a packet buffered onto
    // the *next* connection, where it means something else.
    expect(offline.emitted()).toEqual([
      ['cell:lock', cell],
      ['cell:lock', cell],
    ]);
  });

  it('drops an acknowledgement that fails its schema instead of scheduling on it', async () => {
    const onInvalidPayload = jest.fn();
    renderEditor({ onInvalidPayload });
    const offline = await connect();

    await act(async () => {
      // `expiresAt` is `z.iso.datetime()`. Unparsed, this reaches
      // `Date.parse` as `NaN` and schedules a timer that fires immediately.
      offline.acknowledge('cell:lock', { result: 'ACQUIRED', expiresAt: 'soon' });
    });

    expect(onInvalidPayload).toHaveBeenCalledWith({
      event: 'cell:lock',
      issues: expect.arrayContaining([expect.stringContaining('expiresAt')]),
    });
    expect(states.at(-1)).toEqual({ status: 'idle', expiresAt: null, lockedBy: null });

    await act(async () => {
      jest.advanceTimersByTime(TTL_MS * 4);
    });
    expect(offline.emitted()).toHaveLength(1);
  });
});
