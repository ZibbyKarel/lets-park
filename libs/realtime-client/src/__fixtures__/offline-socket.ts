/**
 * A real `socket.io-client` socket with the network taken away.
 *
 * ## Why not a mock socket
 *
 * A hand-written `{ on, off, emit, disconnect }` double would let this suite
 * assert whatever it decided the client's API is. That is the failure mode
 * this project has already shipped: a test double that fabricates a
 * dependency's shape produces a suite that is green and wrong. So nothing here
 * stands in for Socket.io's behaviour or its protocol. The object under test
 * is the socket `createRealtimeSocket` really returns, running its real
 * `onopen` / `onpacket` / `onclose` / `emit` implementations.
 *
 * Exactly two seams are replaced, and both are *transport*, not protocol:
 *
 * - `manager.open()` — a no-op, so no engine and no HTTP request is created;
 * - `manager._packet()` — captures the encoded packets the socket would have
 *   put on the wire.
 *
 * Everything else is driven the way the real manager drives it: the manager's
 * own `open` / `close` / `packet` events, which is literally what
 * `Socket.subEvents()` subscribes to. A reconnect here is the same event the
 * reconnect timer fires in production.
 *
 * ## Why the packet type codes are discovered, not written down
 *
 * Feeding an inbound packet means naming socket.io-parser's numeric packet
 * types. Hard-coding `2` for EVENT would be exactly the invented-protocol
 * problem again — a number this file believes, that nothing checks. Instead
 * {@link discoverPacketTypes} makes the installed client *emit* one of each
 * and reads the codes off its own output, so the fixture cannot disagree with
 * the library it is driving.
 */

import { io } from 'socket.io-client';
import type { RealtimeSocket, RealtimeSocketOptions } from '../lib/socket';
import { createRealtimeSocket } from '../lib/socket';

/** A decoded Socket.io packet, as `Manager._packet` receives it. */
export interface ProtocolPacket {
  type: number;
  nsp: string;
  id?: number;
  data?: unknown;
}

/** The manager members this fixture reaches for. All exist at runtime. */
interface ManagerInternals {
  open(): unknown;
  _packet(packet: ProtocolPacket): void;
  emit(event: string, ...args: unknown[]): void;
}

function managerOf(socket: RealtimeSocket): ManagerInternals {
  return socket.io as unknown as ManagerInternals;
}

interface PacketTypes {
  readonly connect: number;
  readonly event: number;
  readonly ack: number;
}

let packetTypes: PacketTypes | undefined;

/**
 * Reads the numeric packet type codes off the installed client.
 *
 * - CONNECT — the packet a socket sends when its engine opens;
 * - EVENT — the packet `emit` produces;
 * - ACK — the packet the socket sends back when it acknowledges an inbound
 *   event that carried an id.
 *
 * Each one is produced by the real client, so this cannot drift from
 * socket.io-parser the way a copied constant could.
 */
function discoverPacketTypes(): PacketTypes {
  if (packetTypes !== undefined) return packetTypes;

  const sent: ProtocolPacket[] = [];
  const probe = io('http://packet-type.probe/', {
    autoConnect: false,
    forceNew: true,
    // Object form, so the CONNECT packet is produced synchronously.
    auth: {},
  });
  const manager = managerOf(probe);
  manager.open = () => probe;
  manager._packet = (packet) => sent.push(packet);

  probe.connect();
  manager.emit('open');
  const connect = expectPacket(sent, 0, 'CONNECT').type;

  // The socket has to be connected before `emit` writes rather than buffers,
  // and before an inbound event is dispatched rather than queued.
  manager.emit('packet', { type: connect, nsp: '/', data: { sid: 'probe-sid' } });

  (probe as unknown as { emit(ev: string, payload: unknown): void }).emit('probe', {});
  const event = expectPacket(sent, 1, 'EVENT').type;

  probe.on('probe' as never, ((_payload: unknown, ack: () => void) => ack()) as never);
  manager.emit('packet', { type: event, nsp: '/', id: 7, data: ['probe', {}] });
  const ack = expectPacket(sent, 2, 'ACK').type;

  probe.disconnect();
  packetTypes = { connect, event, ack };
  return packetTypes;
}

function expectPacket(sent: readonly ProtocolPacket[], index: number, what: string): ProtocolPacket {
  const packet = sent[index];
  if (packet === undefined) {
    throw new Error(
      `socket.io-client produced no ${what} packet (saw ${sent.length}). The fixture's ` +
        `assumptions about the client no longer hold — fix the fixture, not the test.`
    );
  }
  return packet;
}

export interface OfflineSocket {
  /** The socket under test — a real one, from `createRealtimeSocket`. */
  readonly socket: RealtimeSocket;
  /** Every packet the socket tried to put on the wire, in order. */
  readonly sent: readonly ProtocolPacket[];
  /**
   * The `auth` payload of each CONNECT packet — one per (re)connection, which
   * is what makes "a reconnect re-sends the token" observable.
   */
  handshakes(): readonly Record<string, unknown>[];
  /** `[eventName, payload]` for each event the socket emitted. */
  emitted(): readonly [string, unknown][];
  /** The engine opened: drives the real `Socket.onopen`, which sends CONNECT. */
  open(): void;
  /** The server accepted the handshake: the socket becomes `connected`. */
  acceptConnection(sid?: string): void;
  /** The transport dropped: drives the real `Socket.onclose`. */
  drop(reason?: string): void;
  /** The server broadcast an event into a room this socket is in. */
  deliver(event: string, payload: unknown): void;
  /** The server answered the most recent emit of `event` with `payload`. */
  acknowledge(event: string, payload: unknown): void;
  /** Close the socket and release the manager. */
  dispose(): void;
}

export type OfflineSocketOptions = Omit<RealtimeSocketOptions, 'autoConnect' | 'forceNew'>;

/**
 * Builds a socket with {@link createRealtimeSocket} and wires it to this
 * fixture instead of to a network.
 *
 * `connect()` is called for you, so the socket's real `subEvents()` has run
 * and the manager's events reach it — but nothing is open until {@link
 * OfflineSocket.open} is called.
 */
export function createOfflineSocket(options: OfflineSocketOptions): OfflineSocket {
  const types = discoverPacketTypes();
  const sent: ProtocolPacket[] = [];

  const socket = createRealtimeSocket({ ...options, autoConnect: false, forceNew: true });
  const manager = managerOf(socket);
  manager.open = () => socket;
  manager._packet = (packet) => sent.push(packet);

  socket.connect();

  const nsp = () => (socket as unknown as { nsp: string }).nsp;

  const eventPackets = () => sent.filter((packet) => packet.type === types.event);

  return {
    socket,
    sent,
    handshakes: () =>
      sent
        .filter((packet) => packet.type === types.connect)
        .map((packet) => (packet.data ?? {}) as Record<string, unknown>),
    emitted: () =>
      eventPackets().map((packet) => {
        const [name, payload] = packet.data as [string, unknown];
        return [name, payload];
      }),
    open: () => manager.emit('open'),
    acceptConnection: (sid = 'offline-sid') =>
      manager.emit('packet', { type: types.connect, nsp: nsp(), data: { sid } }),
    drop: (reason = 'transport close') => manager.emit('close', reason),
    deliver: (event, payload) =>
      manager.emit('packet', { type: types.event, nsp: nsp(), data: [event, payload] }),
    acknowledge: (event, payload) => {
      const packet = [...eventPackets()]
        .reverse()
        .find((candidate) => (candidate.data as [string])[0] === event);
      if (packet === undefined || packet.id === undefined) {
        throw new Error(`No acknowledged "${event}" packet was sent.`);
      }
      manager.emit('packet', { type: types.ack, nsp: nsp(), id: packet.id, data: [payload] });
    },
    dispose: () => {
      socket.disconnect();
    },
  };
}
