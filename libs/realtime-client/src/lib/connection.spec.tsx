/**
 * The provider, the day room, and the rule that nothing reaches a component
 * before it has been parsed by its contract schema.
 *
 * `../lib/socket` is mocked with a factory that still calls the **real**
 * `createRealtimeSocket` — it only forces `autoConnect: false` and hands the
 * resulting socket to `attachOfflineTransport`, so `useRealtimeConnection`
 * builds and drives a genuine `socket.io-client` socket and this file gets a
 * handle on it. Nothing about the client's API or protocol is faked; see
 * `src/__fixtures__/offline-transport.ts`.
 */

import { act, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import {
  currentOfflineSocket,
  offlineSocketCount,
  resetOfflineSockets,
} from '../__fixtures__/offline-transport';
import {
  API_URL,
  DATE,
  OTHER_DATE,
  SPOT_ID,
  USER_SUMMARY,
  settle,
} from '../__fixtures__/realtime-fixtures';
import { RealtimeProvider, useDayRoom, useRealtime, useRealtimeEvent } from './connection';
import type { InvalidRealtimePayload } from './validation';

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

afterEach(() => {
  resetOfflineSockets();
});

function Providers({
  children,
  onInvalidPayload,
}: {
  children: ReactNode;
  onInvalidPayload?: (report: InvalidRealtimePayload) => void;
}) {
  return (
    <RealtimeProvider
      url={API_URL}
      getAccessToken={() => 'jwt-value'}
      {...(onInvalidPayload === undefined ? {} : { onInvalidPayload })}
    >
      {children}
    </RealtimeProvider>
  );
}

/** Open the transport and let the server accept the handshake. */
async function connect(): Promise<void> {
  await act(async () => {
    currentOfflineSocket().open();
    await settle();
  });
  await act(async () => {
    currentOfflineSocket().acceptConnection();
  });
}

function StatusProbe({ onStatus }: { onStatus: (status: string) => void }) {
  onStatus(useRealtime().status);
  return null;
}

describe('useRealtime', () => {
  it('refuses to work outside a provider rather than silently doing nothing', () => {
    const Orphan = () => {
      useRealtime();
      return null;
    };
    // React logs the thrown error; silence just that, so the suite output stays
    // clean without hiding anything else.
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => render(<Orphan />)).toThrow(
      'useRealtime must be used inside a <RealtimeProvider>'
    );
    consoleError.mockRestore();
  });
});

describe('useRealtimeConnection', () => {
  it('opens exactly one socket and follows its status', async () => {
    const statuses: string[] = [];
    render(
      <Providers>
        <StatusProbe onStatus={(status) => statuses.push(status)} />
      </Providers>
    );

    expect(offlineSocketCount()).toBe(1);
    expect(statuses.at(-1)).toBe('connecting');

    await connect();
    expect(statuses.at(-1)).toBe('connected');

    await act(async () => {
      currentOfflineSocket().drop();
    });
    expect(statuses.at(-1)).toBe('disconnected');
  });

  it('closes the socket when the tree unmounts', async () => {
    const view = render(
      <Providers>
        <StatusProbe onStatus={() => undefined} />
      </Providers>
    );
    await connect();
    const offline = currentOfflineSocket();
    expect(offline.socket.connected).toBe(true);

    act(() => {
      view.unmount();
    });

    expect(offline.socket.connected).toBe(false);
  });
});

describe('useRealtimeEvent', () => {
  function Listener({
    onEvent,
  }: {
    onEvent: (payload: { date: string; parkingSpotId: string; waitlistCount: number }) => void;
  }) {
    useRealtimeEvent('waitlist:updated', onEvent);
    return null;
  }

  const validPayload = { date: DATE, parkingSpotId: SPOT_ID, waitlistCount: 3 };

  it('hands the handler a payload that parsed against the contract schema', async () => {
    const onEvent = jest.fn();
    render(
      <Providers>
        <Listener onEvent={onEvent} />
      </Providers>
    );
    await connect();

    await act(async () => {
      currentOfflineSocket().deliver('waitlist:updated', validPayload);
    });

    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent).toHaveBeenCalledWith(validPayload);
  });

  it('drops a payload that fails its schema instead of passing it on', async () => {
    const onEvent = jest.fn();
    const onInvalidPayload = jest.fn();
    render(
      <Providers onInvalidPayload={onInvalidPayload}>
        <Listener onEvent={onEvent} />
      </Providers>
    );
    await connect();

    await act(async () => {
      // `waitlistCount` is `z.int().nonnegative()` in the contract. A server
      // one deploy ahead, or a mangled frame, produces exactly this: a value
      // TypeScript swears is a `WaitlistUpdatedEvent` and is not.
      currentOfflineSocket().deliver('waitlist:updated', { ...validPayload, waitlistCount: -1 });
    });

    expect(onEvent).not.toHaveBeenCalled();
    expect(onInvalidPayload).toHaveBeenCalledWith({
      event: 'waitlist:updated',
      issues: ['waitlistCount: Too small: expected number to be >=0'],
    });
  });

  it('drops a payload whose id is not a uuid', async () => {
    const onEvent = jest.fn();
    const onInvalidPayload = jest.fn();
    render(
      <Providers onInvalidPayload={onInvalidPayload}>
        <Listener onEvent={onEvent} />
      </Providers>
    );
    await connect();

    await act(async () => {
      currentOfflineSocket().deliver('waitlist:updated', {
        ...validPayload,
        parkingSpotId: 'not-a-uuid',
      });
    });

    expect(onEvent).not.toHaveBeenCalled();
    expect(onInvalidPayload).toHaveBeenCalledTimes(1);
  });

  it('strips keys the contract does not declare rather than forwarding them', async () => {
    const onEvent = jest.fn();
    render(
      <Providers>
        <Listener onEvent={onEvent} />
      </Providers>
    );
    await connect();

    await act(async () => {
      currentOfflineSocket().deliver('waitlist:updated', {
        ...validPayload,
        lockedBy: USER_SUMMARY,
      });
    });

    // Parsed, not merely checked: the extra key is gone.
    expect(onEvent).toHaveBeenCalledWith(validPayload);
  });

  it('stops listening when the component unmounts', async () => {
    const onEvent = jest.fn();
    const view = render(
      <Providers>
        <Listener onEvent={onEvent} />
      </Providers>
    );
    await connect();
    const offline = currentOfflineSocket();

    act(() => {
      view.unmount();
    });
    act(() => {
      offline.deliver('waitlist:updated', validPayload);
    });

    expect(onEvent).not.toHaveBeenCalled();
  });
});

describe('useDayRoom', () => {
  function Watcher({ date }: { date: string | null }) {
    useDayRoom(date);
    return null;
  }

  it('joins the day room once connected, and rejoins after a reconnect', async () => {
    render(
      <Providers>
        <Watcher date={DATE} />
      </Providers>
    );
    await connect();
    const offline = currentOfflineSocket();

    expect(offline.emitted()).toEqual([['day:subscribe', { date: DATE }]]);

    await act(async () => {
      offline.drop();
    });
    await act(async () => {
      offline.open();
      await settle();
    });
    await act(async () => {
      offline.acceptConnection();
    });

    // A dropped socket loses its server-side room membership, so the
    // subscription has to be re-sent on the new connection.
    expect(offline.emitted()).toEqual([
      ['day:subscribe', { date: DATE }],
      ['day:subscribe', { date: DATE }],
    ]);
  });

  it('leaves the old room when the day changes', async () => {
    const view = render(
      <Providers>
        <Watcher date={DATE} />
      </Providers>
    );
    await connect();
    const offline = currentOfflineSocket();

    await act(async () => {
      view.rerender(
        <Providers>
          <Watcher date={OTHER_DATE} />
        </Providers>
      );
    });

    expect(offline.emitted()).toEqual([
      ['day:subscribe', { date: DATE }],
      ['day:unsubscribe', { date: DATE }],
      ['day:subscribe', { date: OTHER_DATE }],
    ]);
  });

  it('subscribes to nothing while there is no day to watch', async () => {
    render(
      <Providers>
        <Watcher date={null} />
      </Providers>
    );
    await connect();

    expect(currentOfflineSocket().emitted()).toEqual([]);
  });
});
