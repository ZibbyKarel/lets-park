/**
 * The global exception filter — the last thing between a thrown value and the
 * client.
 *
 * Three responsibilities, in this order of importance:
 *
 * 1. **A stack trace is logged, never sent.** Every branch below builds its
 *    response body from a fixed set of fields; the original error only ever
 *    reaches `this.logger`.
 * 2. **Domain failures come out as contract error codes** from the closed
 *    `ERROR_CODES` enum, with the status `ERROR_DEFINITIONS` assigns them.
 *    Nothing here invents a code or a status.
 * 3. **A Prisma constraint violation becomes the domain error it actually is.**
 *    `Reservation (parkingSpotId, date)` is unique in the database, which is
 *    what makes double-booking impossible under concurrency; without the P2002
 *    mapping below, the losing request of that race would surface as a 500.
 *
 * ## Response shapes
 *
 * Domain errors use oRPC's error JSON (`ORPCErrorJSON` in `@orpc/client`):
 * `{ defined, code, status, message, data? }`. The frontend reads errors
 * through the oRPC client, which only understands that shape, so a filter that
 * emitted anything else would be unreadable to it. `data` is the contract's
 * `details` under oRPC's name for the same field — see
 * `doc/decision/0018-mapping-error-contract-to-orpc.md`. `defined` is `false`
 * because an error that reached this filter is by definition one the procedure
 * did not declare.
 *
 * Transport-level failures (an unmatched route, a throttled request, a body
 * over the size limit) keep Nest's `{ statusCode, message }` shape: they are
 * not domain errors and the closed enum has no member for them. See
 * `doc/decision/0033-*`.
 *
 * Two of those arrive as something other than an `HttpException` and are
 * handled explicitly below — see {@link asExposedClientError} (the body
 * parser's 413, which used to come out as a 500) and
 * {@link isHealthCheckResult} (terminus' 503 payload, which used to be
 * overwritten). Both were found by probing a running server; neither is
 * reachable from a unit test that calls a controller method directly.
 */

import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import { Catch, HttpException, HttpStatus, ServiceUnavailableException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { PinoLogger, InjectPinoLogger } from 'nestjs-pino';
import type { ErrorCode, ErrorDetails } from '@lets-park/contract';
import { ERROR_DEFINITIONS } from '@lets-park/contract';
import { Prisma } from '@lets-park/database';
import { redactIcsToken } from '../../logging/redact-ics-token';
import { RPC_PATH_PREFIX } from '../../orpc/rpc-route';
import { DomainError } from '../errors/domain-error';

/**
 * oRPC's on-the-wire error JSON. Declared structurally rather than imported:
 * `@orpc/client` is a frontend dependency and the backend has no other reason
 * to pull it in. Keep in sync with `ORPCErrorJSON` if oRPC ever changes it —
 * `contract-exception.filter.spec.ts` pins every field.
 */
export interface ContractErrorBody {
  /** Always `false` here: the procedure did not declare this error. */
  defined: false;
  code: ErrorCode;
  status: number;
  message: string;
  data?: ErrorDetails;
}

/** The shape used for failures that are not domain errors. */
export interface TransportErrorBody {
  statusCode: number;
  message: string;
}

/**
 * What the client is told when nothing matched. Deliberately constant: any
 * detail here is a detail about the server's internals.
 */
const INTERNAL_ERROR_BODY: TransportErrorBody = {
  statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
  message: 'Internal server error',
};

/** Prisma error codes this filter recognises. Anything else is a 500. */
const PRISMA_RECORD_NOT_FOUND = 'P2025';
const PRISMA_UNIQUE_CONSTRAINT = 'P2002';
const PRISMA_FOREIGN_KEY_CONSTRAINT = 'P2003';

/** Narrows an unknown to a plain object without asserting its contents. */
function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/**
 * Reads the constraint out of the driver adapter's own error, which is where
 * `@prisma/adapter-pg` puts it — and the **only** place it appears.
 *
 * Prisma 7 with a driver adapter does not populate the documented `meta.target`
 * at all. What a real `(parkingSpotId, date)` collision produces is:
 *
 * ```
 * code: 'P2002'
 * meta: { modelName: 'Reservation', driverAdapterError: { cause: {
 *          originalCode: '23505', kind: 'UniqueConstraintViolation',
 *          constraint: { index: 'Reservation_parkingSpotId_date_key' },
 *          table: 'Reservation' } } }
 * ```
 *
 * `constraint` is a tagged union: Postgres reports the index it violated
 * (`{ index }`), while other drivers report the columns (`{ fields }`). Both are
 * read, because both feed the same matcher — an index name is one of the two
 * forms `targetMatches` already accepts.
 *
 * Verified against PostgreSQL 17 in `database-contract.db.spec.ts`, which
 * asserts this shape *and* that `meta.target` is absent. That spec is the reason
 * the fallback exists: `PrismaDouble` fabricated a `target` key, so every unit
 * test of this mapping passed while every real unique violation degraded to
 * `CONFLICT`.
 */
function driverAdapterConstraint(meta: Record<string, unknown> | undefined): string[] {
  const constraint = asRecord(
    asRecord(asRecord(meta?.['driverAdapterError'])?.['cause'])?.['constraint']
  );
  if (constraint === undefined) {
    return [];
  }
  const index = constraint['index'];
  if (typeof index === 'string') {
    return [index];
  }
  const fields = constraint['fields'];
  if (Array.isArray(fields)) {
    return fields.filter((entry): entry is string => typeof entry === 'string');
  }
  return [];
}

/**
 * Normalises P2002's constraint identity to a list of names.
 *
 * `meta.target` is what Prisma documents — the constraint name, an array of
 * column names, or a single string — and is what the query-engine-backed client
 * emits. It is checked first so that this keeps working if the adapter is ever
 * dropped. The driver-adapter path below it is what actually fires today.
 */
function uniqueConstraintTarget(meta: Record<string, unknown> | undefined): string[] {
  const target = meta?.['target'];
  if (Array.isArray(target)) {
    return target.filter((entry): entry is string => typeof entry === 'string');
  }
  if (typeof target === 'string') {
    return [target];
  }
  return driverAdapterConstraint(meta);
}

/**
 * True when `target` names exactly this constraint — either as the full set of
 * its columns, or as the index name Prisma generates for it.
 *
 * The comparison is by **exact set**, not substring. An earlier version joined
 * the columns and used `includes`, which matched any future column merely
 * containing the name (`dateFrom`, `updatedDate` both satisfy a test for
 * `date`) and treated a superset as a match, so the check order carried the
 * correctness rather than the check itself.
 */
function targetMatches(target: string[], table: string, columns: readonly string[]): boolean {
  const normalised = target.map((entry) => entry.toLowerCase()).sort();
  const expectedColumns = columns.map((column) => column.toLowerCase()).sort();
  if (
    normalised.length === expectedColumns.length &&
    normalised.every((entry, index) => entry === expectedColumns[index])
  ) {
    return true;
  }
  // Prisma's own naming for a unique index: `Table_col1_col2_key`, columns in
  // the order the `@@unique` block declares them. Checked against the generated
  // migration SQL rather than assumed — all seven unique indexes in this schema
  // follow it, none carries a `map:` override, and `database-contract.db.spec.ts`
  // provokes each one against a real server:
  //
  //   User_email_key, User_oktaId_key, User_icsToken_key, ParkingSpot_label_key,
  //   Reservation_parkingSpotId_date_key, Reservation_userId_date_key,
  //   WaitlistEntry_parkingSpotId_userId_date_key
  //
  // A future `@@unique([...], map: "…")` would break this path silently, which
  // is why the db spec asserts the literal index name and not just the mapping.
  const indexName = `${table}_${columns.join('_')}_key`.toLowerCase();
  return normalised.length === 1 && normalised[0] === indexName;
}

/**
 * Maps a unique-constraint violation to the domain error it means.
 *
 * A blanket `P2002 → SPOT_ALREADY_RESERVED` would mislabel two real
 * constraints: `Reservation (userId, date)` is the *one reservation per person
 * per day* rule (`RESERVATION_LIMIT_REACHED`), and `User_email_key` /
 * `ParkingSpot_label_key` are not about reservations at all. So the constraint
 * is read from `meta.target`, and anything unrecognised degrades to the
 * deliberately vague `CONFLICT` — also a 409, so the caller still learns it
 * lost a race rather than that the server broke.
 */
export function mapUniqueConstraintViolation(meta: Record<string, unknown> | undefined): ErrorCode {
  const target = uniqueConstraintTarget(meta);

  // Each entry names its table, so these are exact identifications rather than
  // an ordered sequence of increasingly loose guesses. They must stay in step
  // with the `@@unique` blocks in `libs/database/prisma/schema.prisma`.
  if (targetMatches(target, 'WaitlistEntry', ['parkingSpotId', 'userId', 'date'])) {
    return 'ALREADY_IN_WAITLIST';
  }
  if (targetMatches(target, 'Reservation', ['parkingSpotId', 'date'])) {
    return 'SPOT_ALREADY_RESERVED';
  }
  if (targetMatches(target, 'Reservation', ['userId', 'date'])) {
    return 'RESERVATION_LIMIT_REACHED';
  }
  return 'CONFLICT';
}

/**
 * Maps a known Prisma request error to a contract code, or `undefined` when
 * this filter has nothing meaningful to say — in which case it is a 500 and the
 * cause goes to the log, not to the client.
 */
export function mapPrismaErrorCode(
  error: Prisma.PrismaClientKnownRequestError
): ErrorCode | undefined {
  switch (error.code) {
    case PRISMA_UNIQUE_CONSTRAINT:
      return mapUniqueConstraintViolation(error.meta);
    case PRISMA_RECORD_NOT_FOUND:
      return 'NOT_FOUND';
    case PRISMA_FOREIGN_KEY_CONSTRAINT:
      // Every foreign key in this schema is ON DELETE RESTRICT, so this is
      // always "something still references the row you tried to remove".
      return 'CONFLICT';
    default:
      return undefined;
  }
}

/**
 * The RPC protocol's envelope.
 *
 * `@orpc/client`'s `RPCLink` deserialises a response by reading `json` out of
 * this wrapper; a body written at the top level deserialises to `undefined`,
 * fails oRPC's `isORPCErrorJson`, and the client then **synthesises a code from
 * the HTTP status** — so a 409 `SPOT_ALREADY_RESERVED` used to arrive as
 * `CONFLICT`, which is also a member of `ERROR_CODES` and therefore did not fail
 * closed: the UI would have shown the wrong domain error, confidently. Recorded
 * as known-and-unguarded in `doc/decision/0039-*`, which routed the fix to
 * whoever owned `apps/api` next; that is Task 12.
 *
 * There is deliberately **no `meta` key**. `meta` is oRPC's list of type
 * annotations for values JSON cannot carry (dates, bigints, sets); an error body
 * has none, and oRPC's own serialiser drops the key entirely when the list is
 * empty (`StandardRPCSerializer#serialize`: `meta_.length === 0 ? undefined :
 * meta_`), which the client compensates for on the way back in
 * (`data.meta ?? []`). Emitting `meta: []` here would work too, but this way the
 * filter's body is byte-identical to what `RPCHandler` produces for the same
 * error — and "identical to the transport" is a property that can be checked,
 * whereas "close enough for the deserialiser" is a claim about someone else's
 * code. `orpc-pipeline.spec.ts` compares the two shapes against a live server.
 */
export interface RpcEnvelope<T> {
  json: T;
}

function rpcEnvelope<T>(body: T): RpcEnvelope<T> {
  return { json: body };
}

/**
 * True for a request that will be read by an oRPC client.
 *
 * Scoped by path rather than applied everywhere on purpose: the health probes
 * and the ICS feed (Task 14) are read by an orchestrator and by calendar
 * clients, neither of which knows what a `{ json, meta }` envelope is.
 */
function isRpcRequest(request: Request): boolean {
  const path = request.path;
  return path === RPC_PATH_PREFIX || path.startsWith(`${RPC_PATH_PREFIX}/`);
}

/** Builds the wire body for a contract error code. */
export function contractErrorBody(code: ErrorCode, details?: ErrorDetails): ContractErrorBody {
  const definition = ERROR_DEFINITIONS[code];
  return {
    defined: false,
    code,
    status: definition.status,
    message: definition.message,
    ...(details === undefined ? {} : { data: details }),
  };
}

/**
 * True for a `@nestjs/terminus` health-check result.
 *
 * This is the **only** 5xx body the filter forwards instead of replacing with
 * {@link INTERNAL_ERROR_BODY}, so the check is deliberately narrow: the shape is
 * built by terminus from our own indicators' `up()`/`down()` payloads, contains
 * no `Error` and no stack, and *is* the point of the endpoint — a readiness
 * probe whose body says "internal server error" tells the operator nothing.
 *
 * Everything else at 5xx still gets the constant body. In particular
 * `new InternalServerErrorException(err.message)` — the usual way an internal
 * detail escapes — produces `{ statusCode, message, error }`, which fails this
 * check on all four keys. `contract-exception.filter.spec.ts` pins that.
 */
function isHealthCheckResult(body: unknown): boolean {
  if (typeof body !== 'object' || body === null || body instanceof Error) {
    return false;
  }
  const result = body as Record<string, unknown>;
  const status = result['status'];
  return (
    (status === 'ok' || status === 'error' || status === 'shutting_down') &&
    isPlainObject(result['info']) &&
    isPlainObject(result['error']) &&
    isPlainObject(result['details'])
  );
}

function isPlainObject(value: unknown): boolean {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Recognises an `http-errors`-shaped rejection raised *before* routing — the
 * body parser's `PayloadTooLargeError` (413) being the one this application
 * actually produces, when a request body exceeds `BODY_LIMIT`.
 *
 * These are not `HttpException`s, so without this they fell through to the
 * "unhandled defect" arm and came back as **500 with a logged stack** — a wrong
 * status class for a client input error, and a log-flood vector for an
 * unauthenticated caller. (Nest converts `SyntaxError`-with-`body` and
 * `URIError` into `BadRequestException` itself, which is why malformed JSON
 * already answered 400 correctly and oversized bodies did not.)
 *
 * `expose` is `http-errors`' own signal for "this message is safe to show the
 * client" — it sets it `true` for 4xx and `false` for 5xx. Keying on it rather
 * than on the status alone means a third-party 4xx that marks its message
 * internal is not forwarded either.
 */
function asExposedClientError(exception: unknown): TransportErrorBody | undefined {
  if (typeof exception !== 'object' || exception === null) {
    return undefined;
  }
  const candidate = exception as Record<string, unknown>;
  const status = candidate['status'] ?? candidate['statusCode'];
  if (
    candidate['expose'] !== true ||
    typeof status !== 'number' ||
    status < HttpStatus.BAD_REQUEST ||
    status >= HttpStatus.INTERNAL_SERVER_ERROR ||
    typeof candidate['message'] !== 'string'
  ) {
    return undefined;
  }
  return { statusCode: status, message: candidate['message'] };
}

@Catch()
export class ContractExceptionFilter implements ExceptionFilter {
  constructor(
    @InjectPinoLogger(ContractExceptionFilter.name)
    private readonly logger: PinoLogger
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<Response>();
    // Only contract errors are enveloped. Transport failures keep Nest's shape
    // even on an RPC path (`doc/decision/0033-*`): the closed enum has no member
    // for "no such route" or "too many requests", and dressing one up as an
    // oRPC error would hand the frontend a code it has no copy for. The oRPC
    // client falls back to the HTTP status for those, which is correct.
    const wrap = <T>(body: T): T | RpcEnvelope<T> =>
      isRpcRequest(http.getRequest<Request>()) ? rpcEnvelope(body) : body;

    if (exception instanceof DomainError) {
      // Expected: a rule was violated. `warn`, not `error` — this is not a
      // defect, and logging it at `error` would drown the ones that are.
      this.logger.warn(
        { err: exception, errorCode: exception.code, details: exception.details },
        'Domain rule violated'
      );
      response
        .status(exception.status)
        .json(wrap(contractErrorBody(exception.code, exception.details)));
      return;
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      const code = mapPrismaErrorCode(exception);
      if (code === undefined) {
        this.logger.error({ err: exception, prismaCode: exception.code }, 'Unmapped Prisma error');
        response.status(HttpStatus.INTERNAL_SERVER_ERROR).json(INTERNAL_ERROR_BODY);
        return;
      }
      this.logger.warn(
        { err: exception, prismaCode: exception.code, errorCode: code },
        'Database constraint mapped to a contract error'
      );
      // `exception.meta` is not forwarded as `data`: it names constraints and
      // columns, which is server internals.
      response.status(ERROR_DEFINITIONS[code].status).json(wrap(contractErrorBody(code)));
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body: TransportErrorBody = { statusCode: status, message: exception.message };
      if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
        const payload = exception.getResponse();
        if (exception instanceof ServiceUnavailableException && isHealthCheckResult(payload)) {
          // A failing health probe. Logged at `warn` and **without** `err`: during
          // a database outage this fires once per probe interval forever, and a
          // stack per probe is noise, not signal. The reason is already in the
          // payload.
          this.logger.warn({ healthCheck: payload }, 'Health check reported not ready');
          response.status(status).json(payload);
          return;
        }
        this.logger.error({ err: exception }, 'Server-side HTTP exception');
        response.status(status).json(INTERNAL_ERROR_BODY);
        return;
      }
      // A 4xx the framework produced: no such route, a malformed body, a
      // throttled caller. Logged **without** `err`, for the same reason the
      // oversized-body branch below drops it — the stack is ten frames of
      // `@nestjs/core` router internals with no diagnostic value, and 404 is the
      // most common status on any public endpoint, so a scanner walking URLs
      // would otherwise write a multi-kilobyte log line per probe. The method
      // and path are what actually answer "what were they asking for", and they
      // are what is kept.
      //
      // Unlike `DomainError` above, which keeps its stack: there the frames name
      // the service and the rule that rejected the request, which is exactly the
      // question a reader has, and only an authenticated caller can trigger one.
      const request = http.getRequest<Request>();
      // Both string fields go through `redactIcsToken`, because both carry the
      // ICS feed's token on the path this branch is *most* likely to run for.
      // `path` obviously; `reason` less so — Nest's message for an unrouted URL
      // is `Cannot GET <url>`, so a token one character away from a valid one
      // (no `.ics`, say) arrives here embedded in the message.
      this.logger.warn(
        {
          statusCode: status,
          method: request.method,
          path: redactIcsToken(request.path),
          reason: redactIcsToken(exception.message),
        },
        'Request rejected'
      );
      response.status(status).json(body);
      return;
    }

    const clientError = asExposedClientError(exception);
    if (clientError !== undefined) {
      // A client input error caught before routing (an oversized body). `warn`,
      // and no `err`: forwarding the stack of something an anonymous caller can
      // trigger at will turns a client mistake into a log-flood vector.
      this.logger.warn(
        { statusCode: clientError.statusCode, errorType: (exception as { type?: unknown }).type },
        'Request rejected before routing'
      );
      response.status(clientError.statusCode).json(clientError);
      return;
    }

    // Anything else is a defect. The closed contract enum has no member for
    // "the server broke", and inventing one would let a bug masquerade as a
    // domain outcome the frontend knows how to explain.
    this.logger.error({ err: exception }, 'Unhandled exception');
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json(INTERNAL_ERROR_BODY);
  }
}
