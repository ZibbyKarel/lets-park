/**
 * Rooms, the editing hold, and what reaches whose browser — over real
 * WebSockets, against the assembled application.
 *
 * The suite runs against a **short** `REALTIME_LOCK_TTL_MS` so that a hold
 * lapsing is something a test can watch rather than something it has to
 * believe. That is a value, not a branch: `apps/api/src/realtime/**` contains no
 * `NODE_ENV` check and no test flag, and `realtime-no-backdoor.spec.ts` asserts
 * it stays that way.
 *
 * Every test uses its **own cell**, and every wait matches on the payload as
 * well as the event name: with a sub-second TTL the server is legitimately
 * emitting `cell:unlocked` for cells earlier tests abandoned, and an assertion
 * that accepted any of them would pass for the wrong reason.
 */

import { randomUUID } from 'node:crypto';
import 'reflect-metadata';
import { MESSAGE_METADATA } from '@nestjs/websockets/constants';
import type { Server } from 'socket.io';
import {
  CLIENT_TO_SERVER_EVENT_SCHEMAS,
  SERVER_TO_CLIENT_EVENT_SCHEMAS,
  roomForDate,
} from '@lets-park/contract/realtime';
import type { CellLockAck } from '@lets-park/contract/realtime';
import { DomainEventPublisher } from '../reservations/reservation-events';
import { GracefulShutdownService } from '../shutdown/graceful-shutdown.service';
import { RealtimeDomainEventPublisher } from './realtime.publisher';
import { MAX_DAY_ROOMS_PER_SOCKET, RealtimeGateway } from './realtime.gateway';
import { RealtimeTestClient } from './testing/realtime-test-client';
import type { RealtimeTestApp } from './testing/realtime-test-app';
import { seedEmployee, startRealtimeTestApp } from './testing/realtime-test-app';

const LOCK_TTL_MS = 800;
const DAY = '2026-09-15';
const OTHER_DAY = '2026-09-16';

interface Employee {
  id: string;
  name: string;
  licensePlate: string | null;
  oktaId: string;
}

describe('the realtime gateway', () => {
  let harness: RealtimeTestApp;
  let alice: Employee;
  let bob: Employee;
  const open: RealtimeTestClient[] = [];
  const originalEnv = { ...process.env };

  /** A cell no other test in this file touches. */
  function freshCell(date = DAY): { date: string; parkingSpotId: string } {
    return { date, parkingSpotId: randomUUID() };
  }

  async function connectAs(employee: Employee): Promise<RealtimeTestClient> {
    const client = await RealtimeTestClient.connect({
      baseUrl: harness.baseUrl,
      token: harness.tokenFor({ subject: employee.oktaId }),
    });
    expect(client.isConnected).toBe(true);
    open.push(client);
    return client;
  }

  /**
   * The `socket.io` `Server` the gateway is holding.
   *
   * Reached through the gateway's `@WebSocketServer()` field rather than
   * through a getter added to production code for the tests' benefit. It is
   * used only to *observe* — room membership — never to drive anything: every
   * command in this file travels over a real socket.
   */
  function ioServer(): Server {
    return (harness.app.get(RealtimeGateway) as unknown as { server: Server }).server;
  }

  /** How many sockets the server has in a day's room. */
  function roomSize(date: string): number {
    return ioServer().sockets.adapter.rooms.get(roomForDate(date))?.size ?? 0;
  }

  /**
   * Joins a day room and waits until the server has actually put the socket in
   * it.
   *
   * `day:subscribe` has no acknowledgement — the contract declares one only for
   * `cell:lock` — so a test that emitted and then immediately broadcast would
   * race the join and fail for a reason that has nothing to do with its claim.
   * Reading the server's own room map is reading its answer, rather than
   * sleeping on a guess.
   */
  async function watch(client: RealtimeTestClient, date: string): Promise<void> {
    const before = roomSize(date);
    client.emit('day:subscribe', { date });
    await waitFor(() => roomSize(date) > before, `a socket to join ${roomForDate(date)}`);
  }

  async function waitFor(condition: () => boolean, what: string, timeoutMs = 2000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (!condition()) {
      if (Date.now() > deadline) {
        throw new Error(`Timed out after ${timeoutMs}ms waiting for ${what}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  beforeAll(async () => {
    harness = await startRealtimeTestApp({ lockTtlMs: LOCK_TTL_MS });
    alice = seedEmployee(harness.double, {
      oktaId: 'okta-alice',
      name: 'Alice',
      licensePlate: '1AB 2345',
    });
    bob = seedEmployee(harness.double, { oktaId: 'okta-bob', name: 'Bob' });
  });

  afterEach(async () => {
    await Promise.all(open.splice(0).map((client) => client.disconnect()));
  });

  afterAll(async () => {
    await harness?.close();
    process.env = originalEnv;
  });

  describe('day rooms', () => {
    it('delivers a broadcast to a client that subscribed to that day', async () => {
      const client = await connectAs(alice);
      const cell = freshCell();
      await watch(client, DAY);

      publish('waitlist:updated', { ...cell, waitlistCount: 3 });

      await expect(
        client.waitForEvent(
          'waitlist:updated',
          (p: { parkingSpotId: string }) => p.parkingSpotId === cell.parkingSpotId
        )
      ).resolves.toEqual({ ...cell, waitlistCount: 3 });
    });

    it('delivers nothing to a client watching a different day', async () => {
      // The negative half, and the one that makes the positive half mean
      // something: a gateway that broadcast to every socket would pass the test
      // above and fail this one.
      const watcher = await connectAs(alice);
      const bystander = await connectAs(bob);
      const cell = freshCell();
      await watch(watcher, DAY);
      await watch(bystander, OTHER_DAY);

      publish('waitlist:updated', { ...cell, waitlistCount: 1 });

      await watcher.waitForEvent(
        'waitlist:updated',
        (p: { parkingSpotId: string }) => p.parkingSpotId === cell.parkingSpotId
      );
      expect(bystander.received.filter((event) => event.name === 'waitlist:updated')).toHaveLength(
        0
      );
    });

    it('delivers nothing to a client that subscribed to nothing', async () => {
      const watcher = await connectAs(alice);
      const silent = await connectAs(bob);
      const cell = freshCell();
      await watch(watcher, DAY);

      publish('waitlist:updated', { ...cell, waitlistCount: 1 });

      await watcher.waitForEvent(
        'waitlist:updated',
        (p: { parkingSpotId: string }) => p.parkingSpotId === cell.parkingSpotId
      );
      expect(silent.received).toHaveLength(0);
    });

    it('stops delivering after day:unsubscribe', async () => {
      const client = await connectAs(alice);
      const keptWatching = await connectAs(bob);
      await watch(client, DAY);
      await watch(keptWatching, DAY);

      client.emit('day:unsubscribe', { date: DAY });
      // Wait for the leave to be visible on the server before broadcasting.
      await settle();
      const cell = freshCell();
      publish('waitlist:updated', { ...cell, waitlistCount: 9 });

      await keptWatching.waitForEvent(
        'waitlist:updated',
        (p: { parkingSpotId: string }) => p.parkingSpotId === cell.parkingSpotId
      );
      expect(client.received.filter((event) => event.name === 'waitlist:updated')).toHaveLength(0);
    });

    it('caps how many day rooms one socket may join', async () => {
      const client = await connectAs(alice);
      // One more than the cap, all valid dates.
      for (let index = 0; index <= MAX_DAY_ROOMS_PER_SOCKET; index += 1) {
        const day = new Date(Date.UTC(2027, 0, 1 + index)).toISOString().slice(0, 10);
        client.emit('day:subscribe', { date: day });
      }
      await settle();

      // `client.rooms` also holds the socket's own id room, so the ceiling is
      // the cap plus that one.
      expect(socketRoomCount(client)).toBeLessThanOrEqual(MAX_DAY_ROOMS_PER_SOCKET + 1);
    });
  });

  describe('an invalid inbound payload', () => {
    it('does not join a room when the date is not a date', async () => {
      const client = await connectAs(alice);
      const watcher = await connectAs(bob);
      await watch(watcher, DAY);

      client.emit('day:subscribe', { date: 'tomorrow' });
      await settle();
      const cell = freshCell();
      publish('waitlist:updated', { ...cell, waitlistCount: 1 });

      await watcher.waitForEvent(
        'waitlist:updated',
        (p: { parkingSpotId: string }) => p.parkingSpotId === cell.parkingSpotId
      );
      expect(client.received).toHaveLength(0);
    });

    it('rejects a stray key, because dayRoomCommandSchema is strict', async () => {
      const client = await connectAs(alice);
      const watcher = await connectAs(bob);
      await watch(watcher, DAY);

      // `strictObject`, deliberately: a stray key is a client that disagrees
      // with the contract about what a subscription is, and stripping it would
      // hide the disagreement.
      client.emit('day:subscribe', { date: DAY, sneaky: true });
      await settle();
      const cell = freshCell();
      publish('waitlist:updated', { ...cell, waitlistCount: 1 });

      await watcher.waitForEvent(
        'waitlist:updated',
        (p: { parkingSpotId: string }) => p.parkingSpotId === cell.parkingSpotId
      );
      expect(client.received).toHaveLength(0);
    });

    it('does not acknowledge a cell:lock the contract refuses', async () => {
      const client = await connectAs(alice);

      // No error acknowledgement exists in `cellLockAckSchema`, so the honest
      // answer is silence — which the client's own `socket.timeout()` turns
      // into one retry and then `idle`, rather than a form stuck at
      // "requesting" forever.
      await expect(
        client.emitWithAck('cell:lock', { date: DAY, parkingSpotId: 'not-a-uuid' }, 400)
      ).rejects.toThrow(/No acknowledgement/);
    });

    it('does not take a hold when the payload is refused', async () => {
      const client = await connectAs(alice);
      const other = await connectAs(bob);
      const cell = freshCell();

      await expect(client.emitWithAck('cell:lock', { ...cell, extra: 1 }, 400)).rejects.toThrow(
        /No acknowledgement/
      );

      // The cell must still be free.
      const ack = (await other.emitWithAck('cell:lock', cell)) as CellLockAck;
      expect(ack.result).toBe('ACQUIRED');
    });

    it('every command in the contract has a handler, so none can be half-implemented', () => {
      // The registry is the gateway's validation table, and `accept()` is the
      // only path from a frame to a handler body — so validation cannot be
      // forgotten for a command that *has* a handler. What can be forgotten is
      // the handler: a command added to the contract with no
      // `@SubscribeMessage` is silently ignored, which on the wire is
      // indistinguishable from "validated and dropped".
      //
      // `MESSAGE_METADATA` is read from `@nestjs/websockets`' own constant and
      // off the method function, which is where the decorator puts it
      // (`decorators/subscribe-message.decorator.js`), rather than off a name
      // this file guesses.
      const prototype = Object.getPrototypeOf(harness.app.get(RealtimeGateway)) as Record<
        string,
        unknown
      >;
      const subscribed = Object.getOwnPropertyNames(prototype)
        // `@WebSocketServer()` puts a `null` on the prototype, and
        // `Reflect.getMetadata` throws on a non-object target.
        .filter((key) => typeof prototype[key] === 'function')
        .map((key) => Reflect.getMetadata(MESSAGE_METADATA, prototype[key] as object) as unknown)
        .filter((value): value is string => typeof value === 'string');

      expect(subscribed.sort()).toEqual(Object.keys(CLIENT_TO_SERVER_EVENT_SCHEMAS).sort());
    });
  });

  describe('the cell lock', () => {
    it('acknowledges the first asker with a deadline one TTL out', async () => {
      const client = await connectAs(alice);
      const cell = freshCell();
      const before = Date.now();

      const ack = (await client.emitWithAck('cell:lock', cell)) as CellLockAck;

      expect(ack.result).toBe('ACQUIRED');
      const expiresAt = Date.parse(ack.expiresAt);
      expect(expiresAt).toBeGreaterThanOrEqual(before + LOCK_TTL_MS);
      expect(expiresAt).toBeLessThan(before + LOCK_TTL_MS + 2000);
    });

    it('tells the second asker who has it, with the plate the tile renders', async () => {
      const holder = await connectAs(alice);
      const rival = await connectAs(bob);
      const cell = freshCell();
      await holder.emitWithAck('cell:lock', cell);

      const ack = (await rival.emitWithAck('cell:lock', cell)) as CellLockAck;

      expect(ack).toMatchObject({
        result: 'HELD_BY_OTHER',
        lockedBy: { id: alice.id, name: 'Alice', licensePlate: '1AB 2345' },
      });
    });

    it('never puts a secret in the lockedBy of an acknowledgement', async () => {
      // This test found a real gap. `userSummarySchema` is a three-field pick
      // precisely because this payload crosses to *another user's* browser, and
      // the row next to it carries `email`, `oktaId` and `icsToken` — the secret
      // in a personal calendar-feed URL. The broadcast path was already safe
      // (it validates outbound); the acknowledgement path was not, and now is.
      const holder = await connectAs(alice);
      const rival = await connectAs(bob);
      const cell = freshCell();
      await holder.emitWithAck('cell:lock', cell);

      const ack = (await rival.emitWithAck('cell:lock', cell)) as CellLockAck;

      expect(Object.keys((ack as { lockedBy: object }).lockedBy).sort()).toEqual([
        'id',
        'licensePlate',
        'name',
      ]);
      expect(JSON.stringify(ack)).not.toContain('icsToken');
    });

    it('never puts a secret in the lockedBy of a broadcast either', async () => {
      const holder = await connectAs(alice);
      const neighbour = await connectAs(bob);
      const cell = freshCell();
      await watch(neighbour, DAY);

      await holder.emitWithAck('cell:lock', cell);

      const payload = (await neighbour.waitForEvent(
        'cell:locked',
        (p: { parkingSpotId: string }) => p.parkingSpotId === cell.parkingSpotId
      )) as { lockedBy: object };
      expect(Object.keys(payload.lockedBy).sort()).toEqual(['id', 'licensePlate', 'name']);
      expect(Object.keys(payload).sort()).toEqual([
        'date',
        'expiresAt',
        'lockedBy',
        'parkingSpotId',
      ]);
    });

    it('extends the hold when its own holder asks again', async () => {
      const client = await connectAs(alice);
      const cell = freshCell();
      const first = (await client.emitWithAck('cell:lock', cell)) as CellLockAck;
      await new Promise((resolve) => setTimeout(resolve, LOCK_TTL_MS / 2));

      const renewed = (await client.emitWithAck('cell:lock', cell)) as CellLockAck;

      expect(renewed.result).toBe('ACQUIRED');
      expect(Date.parse(renewed.expiresAt)).toBeGreaterThan(Date.parse(first.expiresAt));
    });

    it('tells the rest of the day room, but not the holder', async () => {
      const holder = await connectAs(alice);
      const neighbour = await connectAs(bob);
      const cell = freshCell();
      await watch(holder, DAY);
      await watch(neighbour, DAY);

      await holder.emitWithAck('cell:lock', cell);

      await expect(
        neighbour.waitForEvent(
          'cell:locked',
          (p: { parkingSpotId: string }) => p.parkingSpotId === cell.parkingSpotId
        )
      ).resolves.toMatchObject({ ...cell, lockedBy: { id: alice.id } });
      // The holder already knows — that is what the acknowledgement is. A
      // client that heard its own hold as a broadcast would render "somebody
      // else is editing" over its own open form.
      expect(
        holder.received.filter(
          (event) =>
            event.name === 'cell:locked' &&
            (event.payload as { parkingSpotId: string }).parkingSpotId === cell.parkingSpotId
        )
      ).toHaveLength(0);
    });

    it('announces a release to the room', async () => {
      const holder = await connectAs(alice);
      const neighbour = await connectAs(bob);
      const cell = freshCell();
      await watch(neighbour, DAY);
      await holder.emitWithAck('cell:lock', cell);

      holder.emit('cell:unlock', cell);

      await expect(
        neighbour.waitForEvent(
          'cell:unlocked',
          (p: { parkingSpotId: string }) => p.parkingSpotId === cell.parkingSpotId
        )
      ).resolves.toEqual(cell);
    });

    it('refuses to let one user release another’s hold', async () => {
      const holder = await connectAs(alice);
      const rival = await connectAs(bob);
      const cell = freshCell();
      await holder.emitWithAck('cell:lock', cell);

      rival.emit('cell:unlock', cell);
      await settle();

      const ack = (await rival.emitWithAck('cell:lock', cell)) as CellLockAck;
      expect(ack.result).toBe('HELD_BY_OTHER');
    });
  });

  describe('a hold that nobody gives back', () => {
    it('is broadcast as cell:unlocked when it lapses', async () => {
      // The failure this test exists for: `useCellLock` puts a contended cell
      // into `held-by-other` and then **sits still** — it deliberately does not
      // poll. Without this broadcast, a user who closes their laptop mid-edit
      // leaves "právě upravuje …" on every other tile until the page is
      // reloaded. It was parked at Task 21 to be confirmed here.
      const holder = await connectAs(alice);
      const neighbour = await connectAs(bob);
      const cell = freshCell();
      await watch(neighbour, DAY);
      await holder.emitWithAck('cell:lock', cell);

      await expect(
        neighbour.waitForEvent(
          'cell:unlocked',
          (p: { parkingSpotId: string }) => p.parkingSpotId === cell.parkingSpotId
        )
      ).resolves.toEqual(cell);
    });

    it('is actually free afterwards, not merely announced', async () => {
      const holder = await connectAs(alice);
      const rival = await connectAs(bob);
      const cell = freshCell();
      await holder.emitWithAck('cell:lock', cell);

      await new Promise((resolve) => setTimeout(resolve, LOCK_TTL_MS + 200));

      const ack = (await rival.emitWithAck('cell:lock', cell)) as CellLockAck;
      expect(ack.result).toBe('ACQUIRED');
    });

    it('is not announced early', async () => {
      const holder = await connectAs(alice);
      const neighbour = await connectAs(bob);
      const cell = freshCell();
      await watch(neighbour, DAY);
      await holder.emitWithAck('cell:lock', cell);

      await new Promise((resolve) => setTimeout(resolve, LOCK_TTL_MS / 2));

      expect(
        neighbour.received.filter(
          (event) =>
            event.name === 'cell:unlocked' &&
            (event.payload as { parkingSpotId: string }).parkingSpotId === cell.parkingSpotId
        )
      ).toHaveLength(0);
    });

    it('is released, and announced, when the holder’s socket drops', async () => {
      // The other half of the same guarantee, and the one `useCellLock` relies
      // on when it sends no `cell:unlock` across a connection gap.
      const holder = await connectAs(alice);
      const neighbour = await connectAs(bob);
      const cell = freshCell();
      await watch(neighbour, DAY);
      await holder.emitWithAck('cell:lock', cell);

      await holder.disconnect();

      await expect(
        neighbour.waitForEvent(
          'cell:unlocked',
          (p: { parkingSpotId: string }) => p.parkingSpotId === cell.parkingSpotId
        )
      ).resolves.toEqual(cell);
    });
  });

  describe('the after-commit publisher', () => {
    it('is the realtime one in the assembled application', () => {
      // Task 13 bound this token to `NoopDomainEventPublisher` and said Task 15
      // would swap it. Without this assertion every broadcast test in this file
      // could pass while the reservation services still published into a void.
      expect(harness.app.get(DomainEventPublisher)).toBeInstanceOf(RealtimeDomainEventPublisher);
    });

    it('delivers a committed reservation into its day room and no other', async () => {
      const watcher = await connectAs(alice);
      const bystander = await connectAs(bob);
      await watch(watcher, DAY);
      await watch(bystander, OTHER_DAY);
      const cell = freshCell();

      harness.app.get(DomainEventPublisher).publish([
        {
          name: 'reservation:created',
          payload: {
            ...cell,
            reservation: {
              id: randomUUID(),
              createdAt: new Date().toISOString(),
              user: { id: alice.id, name: 'Alice', licensePlate: '1AB 2345' },
            },
          },
        },
      ]);

      await watcher.waitForEvent(
        'reservation:created',
        (p: { parkingSpotId: string }) => p.parkingSpotId === cell.parkingSpotId
      );
      expect(bystander.received.filter((e) => e.name === 'reservation:created')).toHaveLength(0);
    });

    it('publishes each event of a batch independently', async () => {
      const watcher = await connectAs(alice);
      await watch(watcher, DAY);
      const cell = freshCell();

      harness.app.get(DomainEventPublisher).publish([
        { name: 'reservation:cancelled', payload: { ...cell, reservationId: randomUUID() } },
        { name: 'waitlist:updated', payload: { ...cell, waitlistCount: 0 } },
      ]);

      await watcher.waitForEvent(
        'reservation:cancelled',
        (p: { parkingSpotId: string }) => p.parkingSpotId === cell.parkingSpotId
      );
      await watcher.waitForEvent(
        'waitlist:updated',
        (p: { parkingSpotId: string }) => p.parkingSpotId === cell.parkingSpotId
      );
    });

    it('refuses to broadcast a payload the contract does not describe', async () => {
      const watcher = await connectAs(alice);
      await watch(watcher, DAY);
      const cell = freshCell();

      harness.app.get(DomainEventPublisher).publish([
        // A `waitlistCount` the schema forbids. Reaching a browser, this would
        // be dropped silently by `useRealtimeEvent`; here it must not leave the
        // server at all.
        { name: 'waitlist:updated', payload: { ...cell, waitlistCount: -1 } } as never,
      ]);
      await settle();

      expect(
        watcher.received.filter(
          (event) =>
            (event.payload as { parkingSpotId?: string }).parkingSpotId === cell.parkingSpotId
        )
      ).toHaveLength(0);
    });

    it('never throws, whatever the gateway does', () => {
      // `reservation-events.ts`: a failure to broadcast must never turn a
      // successful cancellation into an error the user sees.
      const publisher = harness.app.get(DomainEventPublisher);

      expect(() =>
        publisher.publish([
          // `roomForDate` throws a `TypeError` on a date that is not a calendar
          // date, which is the realistic way this path raises.
          {
            name: 'waitlist:updated',
            payload: { date: 'nope', parkingSpotId: randomUUID(), waitlistCount: 0 },
          } as never,
        ])
      ).not.toThrow();
    });
  });

  describe('graceful shutdown', () => {
    it('registers the socket server’s close under the name the shutdown service documents', () => {
      // Socket.io does not close itself: a live WebSocket is not an in-flight
      // request, so without this the process hangs until the orchestrator's
      // kill timeout.
      expect(harness.app.get(GracefulShutdownService).registeredClosers()).toContain('socket.io');
    });
  });

  /** Publishes through the real seam, which is what the services use. */
  function publish(name: string, payload: unknown): void {
    harness.app.get(DomainEventPublisher).publish([{ name, payload } as never]);
  }

  /** Every room the server has this client's socket in, its own id room included. */
  function socketRoomCount(client: RealtimeTestClient): number {
    const socket = ioServer().sockets.sockets.get(client.socketId ?? '');
    if (socket === undefined) {
      throw new Error('The server does not know this socket');
    }
    return socket.rooms.size;
  }

  /**
   * A window for a fire-and-forget emit to have been processed.
   *
   * Used only where the claim is a **negative** one ("this did not happen"),
   * and every such test pairs it with a positive assertion on another client —
   * so a window that was too short would fail the positive half first rather
   * than passing the negative one by accident.
   */
  async function settle(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
});

describe('the contract registries', () => {
  it('cover every event the gateway can emit', () => {
    // A payload validated on the way out needs a schema to validate against;
    // this is the assertion that the registry the gateway indexes is the one
    // the client parses with.
    expect(Object.keys(SERVER_TO_CLIENT_EVENT_SCHEMAS).sort()).toEqual([
      'cell:locked',
      'cell:unlocked',
      'reservation:cancelled',
      'reservation:created',
      'reservation:reassigned',
      'waitlist:updated',
    ]);
  });
});
