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
 */

import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import { Catch, HttpException, HttpStatus } from '@nestjs/common';
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

/** True when the violated unique constraint covers every one of `columns`. */
function targetCovers(target: string[], columns: readonly string[]): boolean {
  const joined = target.join(',').toLowerCase();
  return columns.every((column) => joined.includes(column.toLowerCase()));
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

  // Order matters: check the more specific spot+date pair first.
  if (targetCovers(target, ['parkingSpotId', 'userId', 'date'])) {
    return 'ALREADY_IN_WAITLIST';
  }
  if (targetCovers(target, ['parkingSpotId', 'date'])) {
    return 'SPOT_ALREADY_RESERVED';
  }
  if (targetCovers(target, ['userId', 'date'])) {
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
        this.logger.error({ err: exception }, 'Server-side HTTP exception');
        response.status(status).json(INTERNAL_ERROR_BODY);
        return;
      }
      this.logger.warn({ err: exception, statusCode: status }, 'Request rejected');
      response.status(status).json(body);
      return;
    }

    // Anything else is a defect. The closed contract enum has no member for
    // "the server broke", and inventing one would let a bug masquerade as a
    // domain outcome the frontend knows how to explain.
    this.logger.error({ err: exception }, 'Unhandled exception');
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json(INTERNAL_ERROR_BODY);
  }
}
