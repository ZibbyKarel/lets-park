/**
 * The Socket.io gateway: the server half of `doc/realtime.md`.
 *
 * `libs/realtime-client` (Task 21) shipped first and holds guarantees this file
 * is responsible for honouring. Four of them are not obvious from the contract
 * and each is called out where it is implemented:
 *
 * 1. **The token is read from `socket.handshake.auth.token`, and nowhere else.**
 *    Not the query string (it lands verbatim in every proxy access log), not a
 *    header (the browser `WebSocket` API cannot set one, so Socket.io would
 *    apply it to the polling transport only and a socket that upgraded would
 *    silently stop presenting its credential). `doc/decision/0060-*`.
 * 2. **A refusal must arrive as a CONNECT_ERROR, which means middleware.**
 *    See {@link RealtimeGateway.afterInit}.
 * 3. **`cell:lock` must be acknowledged.** See {@link RealtimeGateway.cellLock}.
 * 4. **A lapsed hold must be broadcast.** See {@link RealtimeGateway.onModuleInit}
 *    and `doc/decision/0111-*`.
 *
 * ## Every inbound payload is validated, and the validation cannot be forgotten
 *
 * `CLIENT_TO_SERVER_EVENT_SCHEMAS` is the gateway's validation table, and every
 * handler below reaches it through the single {@link RealtimeGateway.accept}
 * call — there is no second path from a socket frame to a handler body. An
 * event whose payload fails is **dropped**: no state changes, and for the one
 * acknowledged command no acknowledgement is sent, so the client's own ack
 * timeout resolves it. `realtime.gateway.spec.ts` walks the registry and
 * asserts a handler exists for every key, so a command added to the contract
 * cannot be half-implemented here.
 *
 * ## Nothing is broadcast from inside a transaction
 *
 * The gateway is never called from inside one. Reservation and waitlist facts
 * arrive through `DomainEventPublisher`, whose implementations are only ever
 * invoked after `await $transaction(...)` has resolved — see
 * `reservations/reservation-events.ts` and `realtime.publisher.ts`.
 */

import { Injectable } from '@nestjs/common';
import type { OnModuleInit } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit } from '@nestjs/websockets';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import type { Server, Socket } from 'socket.io';
import * as z from 'zod';
import type { UserSummary } from '@lets-park/contract';
import type {
  CellLockAck,
  CellLockedEvent,
  CellUnlockedEvent,
  ClientToServerEventName,
  ClientToServerEvents,
  ServerToClientEventName,
  ServerToClientEvents,
} from '@lets-park/contract/realtime';
import {
  CLIENT_TO_SERVER_ACK_SCHEMAS,
  CLIENT_TO_SERVER_EVENT_SCHEMAS,
  SERVER_TO_CLIENT_EVENT_SCHEMAS,
  roomForDate,
} from '@lets-park/contract/realtime';
import { AuthUserService } from '../auth/auth-user.service';
import { JwksVerifierService } from '../auth/jwks-verifier.service';
import { DomainError } from '../common/errors/domain-error';
import { PrismaService } from '../database/prisma.service';
import type { DomainEvent } from '../reservations/reservation-events';
import { GracefulShutdownService } from '../shutdown/graceful-shutdown.service';
import { LockService } from './lock.service';

/**
 * How many day rooms one socket may be in at once.
 *
 * The parking screen watches one day, and a client prefetching a week or a
 * month around it is well inside this. The cap exists because `day:subscribe`
 * accepts any calendar-valid date, so without one an authenticated socket could
 * ask to join millions of rooms and make the adapter's room map grow without
 * bound — the websocket path has no `ThrottlerGuard` in front of it. Refusing
 * quietly rather than erroring: a client that hits this is misbehaving, and
 * there is no contract error to tell it so with.
 */
export const MAX_DAY_ROOMS_PER_SOCKET = 64;

/**
 * The message every refused handshake carries to the client.
 *
 * One string for every rejection reason, deliberately: the four *operator*
 * problems behind an auth failure are already separated in the logs by
 * `JwksVerifierService`, and telling an unauthenticated caller which of "no
 * token", "bad signature", "wrong audience" and "deactivated account" applies
 * to them is an oracle. `socket.io` puts this in the CONNECT_ERROR packet's
 * `message`; the `data` field is left unset, because whatever goes in it is
 * sent to a caller who has just failed to authenticate.
 */
export const HANDSHAKE_REJECTION_MESSAGE = 'Unauthorized';

/**
 * What the gateway keeps on an authenticated socket.
 *
 * `user` is the `UserSummary` a `cell:locked` broadcast carries, resolved once
 * during the handshake rather than per lock request: it changes about as often
 * as somebody buys a car, and re-reading it fifteen times a minute per open
 * form would be a query per heartbeat.
 */
export interface RealtimeSocketData {
  readonly user: UserSummary;
}

/** A connection, typed from the contract in the direction the server sees it. */
export type RealtimeServerSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  RealtimeSocketData
>;

type RealtimeServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  RealtimeSocketData
>;

/**
 * The handshake credential.
 *
 * Deliberately **not** in `@lets-park/contract/realtime`, and that is not a
 * contract-first exception: the contract's realtime entry point declares
 * *events and their payloads*, and this is Socket.io's connection-level auth
 * object, which exists before any event does. `libs/realtime-client` makes the
 * same call — it declares `RealtimeHandshakeAuth` locally rather than in the
 * contract.
 *
 * `looseObject`, not `strictObject`: `handshake.auth` is where Socket.io's own
 * connection-state-recovery machinery puts `pid` and `offset`, so an object
 * with extra keys is the library working, not a client disagreeing.
 */
const handshakeAuthSchema = z.looseObject({
  token: z.string().min(1),
});

/** Why a handshake was refused. Reaches the logs; never the client. */
type HandshakeRejectionReason =
  | 'no-token'
  | 'token-rejected'
  | 'user-refused'
  | 'unexpected-error';

@Injectable()
@WebSocketGateway()
export class RealtimeGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect, OnModuleInit
{
  @WebSocketServer()
  private readonly server!: RealtimeServer;

  constructor(
    private readonly verifier: JwksVerifierService,
    private readonly users: AuthUserService,
    private readonly prisma: PrismaService,
    private readonly locks: LockService,
    private readonly shutdown: GracefulShutdownService,
    @InjectPinoLogger(RealtimeGateway.name) private readonly logger: PinoLogger
  ) {}

  /**
   * Subscribes to lapsed holds.
   *
   * In `onModuleInit` rather than `afterInit` so the subscription exists before
   * any socket does — a lock cannot lapse before it is taken, but a listener
   * registered on a path that also has to have run first is a listener that can
   * be missed.
   */
  onModuleInit(): void {
    this.locks.onExpired((cell) => {
      // The whole point of `doc/decision/0111-*`: `useCellLock` puts a
      // contended cell into `held-by-other` and then sits still, so a hold that
      // lapses with nothing said leaves every other tile reading "právě
      // upravuje …" for somebody who closed their laptop.
      this.emitCellUnlocked(cell);
    });
  }

  /**
   * Installs handshake authentication, and registers the socket server's close.
   *
   * **Authentication is namespace middleware, and it has to be.** The obvious
   * alternative — accept the connection, check the token in
   * {@link handleConnection}, and `socket.disconnect()` — produces the wrong
   * wire behaviour, and the client is built around the difference:
   *
   * - `Namespace._add` calls `run()`, and a middleware that calls `next(err)`
   *   makes it emit a **CONNECT_ERROR** packet
   *   (`node_modules/socket.io/dist/namespace.js`). On the client,
   *   `Socket.onpacket`'s CONNECT_ERROR branch calls `destroy()` *before*
   *   emitting `connect_error`, which clears `subs` and leaves
   *   `socket.active === false`. `libs/realtime-client` reads exactly that
   *   field to tell a refusal from a dropped transport, and answers a refusal
   *   with the bounded `REJECTED_RETRY_DELAYS_MS` policy plus a
   *   user-actionable `rejected` status.
   * - A disconnect after a *successful* connect is an ordinary transport
   *   failure. `socket.active` stays `true`, so the client would report
   *   `connecting` and retry forever against a credential the gateway has
   *   already refused — the grid silently stops updating and only a reload
   *   fixes it.
   *
   * `realtime.handshake.spec.ts` drives a real `socket.io-client` against this
   * server and asserts the `connect_error` / `socket.active === false` pair,
   * because that claim is a property of two libraries composed and not of any
   * line here.
   */
  afterInit(server: RealtimeServer): void {
    server.use((socket, next) => {
      void this.authenticate(socket as RealtimeServerSocket).then(
        () => {
          next();
        },
        (error: unknown) => {
          next(error instanceof Error ? error : new Error(HANDSHAKE_REJECTION_MESSAGE));
        }
      );
    });

    // Socket.io does not close itself: a live WebSocket is not an "in-flight
    // request", so Nest's HTTP shutdown never touches it and the process hangs
    // until the orchestrator's kill timeout. This is the hook
    // `GracefulShutdownService`'s comment asks for by name.
    this.shutdown.registerCloser('socket.io', async () => {
      await server.close();
    });
  }

  handleConnection(client: RealtimeServerSocket): void {
    // Only reached once the middleware above has resolved a user, so `user` is
    // always set. Logged at `debug`: one line per browser tab per reconnect is
    // more than an operator wants at `info`.
    this.logger.debug({ socketId: client.id, userId: client.data.user.id }, 'Socket connected');
  }

  handleDisconnect(client: RealtimeServerSocket): void {
    // The guarantee `libs/realtime-client` leans on twice: "a dropped socket
    // drops the server's lock with it" is why `useCellLock` sends no
    // `cell:unlock` across a connection gap, and why a closed tab does not
    // freeze a tile.
    for (const cell of this.locks.releaseSocket(client.id)) {
      this.emitCellUnlocked(cell);
    }
    this.logger.debug({ socketId: client.id }, 'Socket disconnected');
  }

  @SubscribeMessage('day:subscribe')
  daySubscribe(
    @ConnectedSocket() client: RealtimeServerSocket,
    @MessageBody() raw: unknown
  ): void {
    const payload = this.accept('day:subscribe', raw);
    if (payload === null) {
      return;
    }
    const room = roomForDate(payload.date);
    if (client.rooms.has(room)) {
      return;
    }
    // `client.rooms` always contains the socket's own id room, which is why the
    // comparison is `>` against the cap plus that one.
    if (client.rooms.size > MAX_DAY_ROOMS_PER_SOCKET) {
      this.logger.warn(
        { socketId: client.id, userId: client.data.user.id, rooms: client.rooms.size },
        'Refused a day subscription: this socket is in too many rooms'
      );
      return;
    }
    void client.join(room);
  }

  @SubscribeMessage('day:unsubscribe')
  dayUnsubscribe(
    @ConnectedSocket() client: RealtimeServerSocket,
    @MessageBody() raw: unknown
  ): void {
    const payload = this.accept('day:unsubscribe', raw);
    if (payload === null) {
      return;
    }
    void client.leave(roomForDate(payload.date));
  }

  /**
   * Takes, or extends, the editing hold on one cell.
   *
   * **The return value is the acknowledgement.** Nest's `IoAdapter` calls the
   * client's ack callback with whatever a handler returns, provided it is not
   * `null`/`undefined` and carries no `event` key
   * (`@nestjs/platform-socket.io/adapters/io-adapter.js`, `bindMessageHandlers`).
   * That "not nullish" filter is what makes dropping an invalid payload also
   * mean *not acknowledging it*: `useCellLock` sends through
   * `socket.timeout(CELL_LOCK_ACK_TIMEOUT_MS)`, so a command the gateway
   * refuses to answer resolves on the client as a lost ack — one retry, then
   * `idle` — rather than as a form stuck at `requesting` forever. There is no
   * error variant in `cellLockAckSchema` to answer with instead, and inventing
   * one would be a contract change.
   *
   * The `cell:locked` broadcast excludes the asker. It already knows —
   * that is what this acknowledgement is — and a client that heard its own hold
   * as a broadcast would render "somebody else is editing" over its own open
   * form. A *second tab* of the same user is a different socket and does hear
   * it, which is correct: from that tab's point of view somebody else has the
   * cell.
   */
  @SubscribeMessage('cell:lock')
  cellLock(
    @ConnectedSocket() client: RealtimeServerSocket,
    @MessageBody() raw: unknown
  ): CellLockAck | undefined {
    const cell = this.accept('cell:lock', raw);
    if (cell === null) {
      return undefined;
    }

    const grant = this.locks.acquire(cell, { user: client.data.user, socketId: client.id });
    const expiresAt = grant.expiresAt.toISOString();

    if (grant.outcome === 'HELD_BY_OTHER') {
      return this.acknowledge({ result: 'HELD_BY_OTHER', lockedBy: grant.holder, expiresAt });
    }

    this.emitCellLocked({ ...cell, lockedBy: grant.holder, expiresAt }, client);
    return this.acknowledge({ result: 'ACQUIRED', expiresAt });
  }

  /**
   * Gives a hold back.
   *
   * No acknowledgement — the contract declares one only for `cell:lock` — so a
   * release that names a cell this user does not hold is simply nothing
   * happening. `LockService.release` is what enforces that a client cannot drop
   * somebody else's hold; the client is documented not to try, and the server
   * does not take its word for it.
   */
  @SubscribeMessage('cell:unlock')
  cellUnlock(
    @ConnectedSocket() client: RealtimeServerSocket,
    @MessageBody() raw: unknown
  ): void {
    const cell = this.accept('cell:unlock', raw);
    if (cell === null) {
      return;
    }
    if (this.locks.release(cell, client.data.user.id)) {
      this.emitCellUnlocked(cell);
    }
  }

  /**
   * Broadcasts one committed domain fact into its day room.
   *
   * Called by `RealtimeDomainEventPublisher`, i.e. strictly after `COMMIT`.
   * A discriminated union in, so there is no `switch` and no per-event method:
   * an event added to `@lets-park/contract/realtime` is broadcastable here
   * without a line changing.
   */
  broadcastDomainEvent(event: DomainEvent): void {
    this.emitToDay(event.name, event.payload);
  }

  /**
   * Verifies a handshake and resolves who is on the other end.
   *
   * Same code in dev, e2e and production; only `AUTH_OKTA_ISSUER` differs.
   * There is no `NODE_ENV` branch and no bypass flag, which is why the
   * integration specs stand up a real in-process OIDC issuer and sign real
   * RS256 tokens rather than stubbing this out.
   *
   * `JwksVerifierService.verifyToken` is the *same* verifier, with the same
   * single `JwksClient` and the same `JwtVerificationRules`, that the HTTP
   * guard reaches through `passport-jwt` — `doc/decision/0042-*`. A second
   * `jwks-rsa` client here would mean two key caches, two rate limiters and two
   * rotation moments.
   */
  private async authenticate(socket: RealtimeServerSocket): Promise<void> {
    // `handshake.auth`, never `handshake.query` and never a header.
    const auth = handshakeAuthSchema.safeParse(socket.handshake.auth);
    if (!auth.success) {
      // `libs/realtime-client` sends `{}` — an object with no `token` key at
      // all — when there is no session, precisely so this branch is reached
      // rather than a present-but-null credential.
      throw this.rejectHandshake('no-token');
    }

    let user: Awaited<ReturnType<AuthUserService['resolve']>>;
    try {
      const claims = await this.verifier.verifyToken(auth.data.token);
      user = await this.users.resolve(claims);
    } catch (error) {
      // `DomainError` is the deactivated-user case and is the one rejection an
      // *authenticated* caller can reach, so it keeps its stack — the same call
      // `ContractExceptionFilter` makes for a `DomainError` over HTTP.
      if (error instanceof DomainError) {
        this.logger.warn({ err: error, errorCode: error.code }, 'Refused a Socket.io handshake');
        throw new Error(HANDSHAKE_REJECTION_MESSAGE);
      }
      // Everything `verifyToken` raises is a token this API was never going to
      // accept: a malformed JWT, an unknown `kid`, a bad signature, a wrong
      // issuer or audience, an expired token. `JwksVerifierService` has already
      // classified and rate-limited its own diagnosis, so this line carries no
      // `err` — forwarding a stack for something an anonymous caller can
      // trigger at will is the log-flood vector `ContractExceptionFilter`
      // refuses for the same reason, and a refused handshake is *retried* by
      // the client at 1 s / 5 s / 30 s.
      //
      // **And no token.** Not the raw JWT, not `handshake.auth`, not the
      // error's message (a `ZodError` from the claims parse can carry input).
      throw this.rejectHandshake('token-rejected');
    }

    // The whole object, not a field of it: `data` is written exactly once, by
    // this middleware, before the socket is connected and before any handler
    // can read it.
    socket.data = { user: await this.loadUserSummary(user.id, user.name) };
  }

  /**
   * The `UserSummary` a broadcast carries.
   *
   * `AuthenticatedUser` is a token claim short of the row — it has no
   * `licensePlate`, which `userSummarySchema` requires — so the plate is read
   * once here. A row that vanished between the auth resolve and this read
   * cannot happen (users are deactivated, never deleted:
   * `doc/decision/0027-*`), but the fallback is the authenticated name rather
   * than a throw, because failing a handshake over a missing plate would be a
   * refusal the client retries three times and then surfaces to the user.
   */
  private async loadUserSummary(userId: string, name: string): Promise<UserSummary> {
    const row = await this.prisma.client.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, licensePlate: true },
    });
    if (row === null) {
      return { id: userId, name, licensePlate: null };
    }
    // The three fields, named. Not `row` and not a spread: the `select` above
    // is a *query* narrowing, and the object it produces is one refactor (or
    // one stand-in that does not honour `select`) away from carrying `email`,
    // `oktaId` and `icsToken` into a payload bound for another user's browser.
    // The outbound schemas strip them either way — this is so there is nothing
    // to strip.
    return { id: row.id, name: row.name, licensePlate: row.licensePlate };
  }

  /**
   * Logs a refusal and builds the error the middleware hands to `next()`.
   *
   * Returns rather than throws, so every call site reads `throw
   * this.rejectHandshake(…)` and control flow is obvious to a reader and to
   * TypeScript alike.
   */
  private rejectHandshake(reason: HandshakeRejectionReason): Error {
    this.logger.debug({ reason }, 'Refused a Socket.io handshake');
    return new Error(HANDSHAKE_REJECTION_MESSAGE);
  }

  /**
   * The single gate every inbound payload passes through.
   *
   * The schema is fetched from `CLIENT_TO_SERVER_EVENT_SCHEMAS` **by lookup**,
   * not by a `switch`: a command added to the contract is validated the moment
   * it is added, and there is no second list to forget. A failure is dropped
   * and reported at `debug` with Zod's path/message list and nothing else —
   * deliberately not the payload, which names users and dates, and which is
   * attacker-controlled input on its way into a log.
   */
  private accept<K extends ClientToServerEventName>(
    event: K,
    raw: unknown
  ): z.infer<(typeof CLIENT_TO_SERVER_EVENT_SCHEMAS)[K]> | null {
    const parsed = CLIENT_TO_SERVER_EVENT_SCHEMAS[event].safeParse(raw);
    if (!parsed.success) {
      this.logger.debug(
        {
          event,
          issues: parsed.error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        },
        'Dropped a realtime command with an invalid payload'
      );
      return null;
    }
    // `safeParse` widens to the schema's own output; the mapped-type index is
    // what the registry guarantees and what the callers rely on.
    return parsed.data as z.infer<(typeof CLIENT_TO_SERVER_EVENT_SCHEMAS)[K]>;
  }

  /**
   * Emits one server → client event into the room of its own `date`.
   *
   * The payload is validated **on the way out** as well, against the registry
   * the client parses it with. It costs a `safeParse` of a five-key object and
   * it turns "the gateway broadcast something the contract does not describe"
   * from a defect every connected browser discovers — `useRealtimeEvent` drops
   * an unparseable payload silently — into a server-side `error` line naming
   * the event. It is on in every environment for that reason: the failure it
   * catches is exactly the one that only shows up in production.
   *
   * A failure is dropped, never thrown: this runs on the request's way out,
   * after `COMMIT`, and a broadcast that throws must not turn a successful
   * cancellation into an error the user sees (`reservation-events.ts`).
   */
  private emitToDay(
    event: ServerToClientEventName,
    payload: { readonly date: string },
    except?: RealtimeServerSocket
  ): void {
    const schema: z.ZodType = SERVER_TO_CLIENT_EVENT_SCHEMAS[event];
    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      this.logger.error(
        { event, issues: parsed.error.issues.map((issue) => issue.message) },
        'Refused to broadcast a payload the contract does not describe'
      );
      return;
    }
    if (this.server === undefined) {
      // Only reachable if a lock lapsed before the gateway was initialised,
      // which needs a socket that cannot have existed. Guarded rather than
      // asserted because the alternative is a `TypeError` on a timer callback.
      return;
    }

    const room = roomForDate(payload.date);
    const target = except === undefined ? this.server.to(room) : except.to(room);
    // `emit` is typed per event name by `ServerToClientEvents`; this function is
    // deliberately the one place that is not, because it is the *shared*
    // machinery — validation, room derivation, the never-throw guarantee —
    // behind the typed wrappers below. Those wrappers are what callers use, and
    // they pin the payload to the contract's own inferred type.
    (target.emit as (name: string, data: unknown) => void)(event, parsed.data);
  }

  /**
   * Validates an acknowledgement on the way out, the way a broadcast is.
   *
   * **This is not belt-and-braces, it is the belt.** `cellLockAckSchema` is a
   * closed shape and Zod strips what it does not declare, so `lockedBy` leaves
   * this server as `userSummarySchema`'s three-field pick and nothing else —
   * regardless of what shape the `UserSummary` handed to `LockService` actually
   * had. The ack crosses to *another user's* browser, and `userSchema` next to
   * it carries `email`, `oktaId` and `icsToken`, the secret in a personal
   * calendar-feed URL.
   *
   * A spec caught this: with a Prisma stand-in whose `select` is not honoured,
   * the acknowledgement carried the whole user row. The broadcast on the same
   * path was already safe, because {@link emitToDay} validates — which is what
   * made the asymmetry visible and is the reason the ack now goes through the
   * same gate.
   *
   * A payload the contract refuses is dropped rather than sent: the client's
   * `parseAck` would refuse it anyway, and an unacknowledged `cell:lock`
   * resolves there as a lost ack rather than as a corrupt one.
   */
  private acknowledge(ack: CellLockAck): CellLockAck | undefined {
    const parsed = CLIENT_TO_SERVER_ACK_SCHEMAS['cell:lock'].safeParse(ack);
    if (!parsed.success) {
      this.logger.error(
        { issues: parsed.error.issues.map((issue) => issue.message) },
        'Refused to acknowledge cell:lock with a payload the contract does not describe'
      );
      return undefined;
    }
    return parsed.data;
  }

  /**
   * Typed façades over {@link emitToDay}.
   *
   * They exist so that a caller cannot pair `'cell:locked'` with a
   * `cell:unlocked` payload: `CellLockedEvent` and `CellUnlockedEvent` are the
   * contract's own `z.infer` types, so these signatures change the moment the
   * schemas do.
   */
  private emitCellLocked(payload: CellLockedEvent, except: RealtimeServerSocket): void {
    this.emitToDay('cell:locked', payload, except);
  }

  private emitCellUnlocked(payload: CellUnlockedEvent): void {
    this.emitToDay('cell:unlocked', payload);
  }
}
