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
 * `doc/decision/0018-mapovani-error-kontraktu-na-orpc.md`. `defined` is `false`
 * because an error that reached this filter is by definition one the procedure
 * did not declare.
 *
 * Transport-level failures (an unmatched route, a throttled request, a body
 * over the size limit) keep Nest's `{ statusCode, message }` shape: they are
 * not domain errors and the closed enum has no member for them. See
 * `doc/decision/0030-*`.
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
import type { Response } from 'express';
import { PinoLogger, InjectPinoLogger } from 'nestjs-pino';
import type { ErrorCode, ErrorDetails } from '@lets-park/contract';
import { ERROR_DEFINITIONS } from '@lets-park/contract';
import { Prisma } from '@lets-park/database';
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

/**
 * Normalises P2002's `meta.target`, which Prisma reports as the constraint
 * name, an array of column names, or (with some drivers) a single string.
 */
function uniqueConstraintTarget(meta: Record<string, unknown> | undefined): string[] {
  const target = meta?.['target'];
  if (Array.isArray(target)) {
    return target.filter((entry): entry is string => typeof entry === 'string');
  }
  if (typeof target === 'string') {
    return [target];
  }
  return [];
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
  // Prisma's own naming for a composite unique index: `Table_col1_col2_key`.
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
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof DomainError) {
      // Expected: a rule was violated. `warn`, not `error` — this is not a
      // defect, and logging it at `error` would drown the ones that are.
      this.logger.warn(
        { err: exception, errorCode: exception.code, details: exception.details },
        'Domain rule violated'
      );
      response.status(exception.status).json(contractErrorBody(exception.code, exception.details));
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
      response.status(ERROR_DEFINITIONS[code].status).json(contractErrorBody(code));
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
      this.logger.warn({ err: exception, statusCode: status }, 'Request rejected');
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
