/**
 * The filter is tested without a database on purpose: `P2002` is raised by
 * Postgres, but `PrismaClientKnownRequestError` is an ordinary class, so the
 * exact object Prisma would throw can be constructed here. That makes the most
 * important mapping in the API — the one that turns a lost double-booking race
 * into a clean 409 instead of a 500 — testable on a machine with no Postgres.
 */

import { ArgumentsHost, HttpException, HttpStatus, NotFoundException } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { errorShapeSchema } from '@lets-park/contract';
import { Prisma } from '@lets-park/database';
import { DomainError } from '../errors/domain-error';
import {
  ContractExceptionFilter,
  contractErrorBody,
  mapPrismaErrorCode,
  mapUniqueConstraintViolation,
} from './contract-exception.filter';

interface CapturedResponse {
  status: number;
  body: Record<string, unknown>;
}

/** A minimal Express response double that records what the filter wrote. */
function createHost(): { host: ArgumentsHost; captured: CapturedResponse } {
  const captured: CapturedResponse = { status: 0, body: {} };
  const response = {
    status(code: number) {
      captured.status = code;
      return this;
    },
    json(body: Record<string, unknown>) {
      captured.body = body;
      return this;
    },
  };
  const host = {
    switchToHttp: () => ({ getResponse: () => response }),
  } as unknown as ArgumentsHost;
  return { host, captured };
}

const loggerCalls: Array<{ level: string; payload: unknown; message: string }> = [];

const logger = {
  warn: (payload: unknown, message: string) =>
    loggerCalls.push({ level: 'warn', payload, message }),
  error: (payload: unknown, message: string) =>
    loggerCalls.push({ level: 'error', payload, message }),
} as never;

function prismaError(code: string, meta?: Record<string, unknown>) {
  return new Prisma.PrismaClientKnownRequestError('Prisma failed', {
    code,
    clientVersion: '7.10.0',
    // `exactOptionalPropertyTypes` is on: an explicit `meta: undefined` is not
    // the same as an absent `meta`, and Prisma itself omits the key.
    ...(meta === undefined ? {} : { meta }),
  });
}

/** Every body the filter produces, stringified — used for leak assertions. */
function serialized(captured: CapturedResponse): string {
  return JSON.stringify(captured.body);
}

describe('mapUniqueConstraintViolation', () => {
  it.each([
    // Prisma reports `target` as column names with the driver adapters…
    [['parkingSpotId', 'date'], 'SPOT_ALREADY_RESERVED'],
    [['userId', 'date'], 'RESERVATION_LIMIT_REACHED'],
    [['parkingSpotId', 'userId', 'date'], 'ALREADY_IN_WAITLIST'],
    [['email'], 'CONFLICT'],
  ])('maps the column list %p to %s', (target, expected) => {
    expect(mapUniqueConstraintViolation({ target })).toBe(expected);
  });

  it.each([
    // …and as the constraint name in other configurations. Both must work, or
    // the mapping silently degrades to CONFLICT in production.
    ['Reservation_parkingSpotId_date_key', 'SPOT_ALREADY_RESERVED'],
    ['Reservation_userId_date_key', 'RESERVATION_LIMIT_REACHED'],
    ['WaitlistEntry_parkingSpotId_userId_date_key', 'ALREADY_IN_WAITLIST'],
    ['User_email_key', 'CONFLICT'],
    ['ParkingSpot_label_key', 'CONFLICT'],
  ])('maps the constraint name %s to %s', (target, expected) => {
    expect(mapUniqueConstraintViolation({ target })).toBe(expected);
  });

  it('degrades to CONFLICT when Prisma reports no target at all', () => {
    expect(mapUniqueConstraintViolation(undefined)).toBe('CONFLICT');
    expect(mapUniqueConstraintViolation({})).toBe('CONFLICT');
  });
});

describe('mapPrismaErrorCode', () => {
  it('maps P2025 (record not found) to NOT_FOUND', () => {
    expect(mapPrismaErrorCode(prismaError('P2025'))).toBe('NOT_FOUND');
  });

  it('maps P2003 (foreign key) to CONFLICT — every FK here is ON DELETE RESTRICT', () => {
    expect(mapPrismaErrorCode(prismaError('P2003'))).toBe('CONFLICT');
  });

  it('returns undefined for a code it does not know, so it becomes a 500', () => {
    expect(mapPrismaErrorCode(prismaError('P1001'))).toBeUndefined();
  });
});

describe('contractErrorBody', () => {
  it('carries the status and message the contract assigns, not a local guess', () => {
    expect(contractErrorBody('RESERVATIONS_LOCKED')).toEqual({
      defined: false,
      code: 'RESERVATIONS_LOCKED',
      status: 423,
      message: 'The reservation window for that month is closed.',
    });
  });

  it('keeps OUT_OF_HORIZON and RESERVATIONS_LOCKED distinct (ruling window-3)', () => {
    const notYetOpen = contractErrorBody('OUT_OF_HORIZON');
    const alreadyClosed = contractErrorBody('RESERVATIONS_LOCKED');

    expect(notYetOpen.code).not.toBe(alreadyClosed.code);
    expect(notYetOpen.status).toBe(422);
    expect(alreadyClosed.status).toBe(423);
  });

  it('produces a body that satisfies the Task 3 error contract', () => {
    const body = contractErrorBody('SPOT_ALREADY_RESERVED', { reservationId: 'abc' });

    // `data` is `details` under oRPC's name for the same field (decision 0018).
    expect(
      errorShapeSchema.safeParse({
        code: body.code,
        message: body.message,
        details: body.data,
      }).success
    ).toBe(true);
  });

  it('omits data entirely when there are no details', () => {
    expect(contractErrorBody('NOT_FOUND')).not.toHaveProperty('data');
  });
});

describe('ContractExceptionFilter', () => {
  let filter: ContractExceptionFilter;

  beforeEach(() => {
    loggerCalls.length = 0;
    filter = new ContractExceptionFilter(logger);
  });

  it('turns a P2002 on (parkingSpotId, date) into SPOT_ALREADY_RESERVED / 409', () => {
    // This is the concurrency guarantee: the unique index makes double-booking
    // impossible, and this mapping is what turns the losing request of that
    // race into an error a user can understand.
    const { host, captured } = createHost();

    filter.catch(prismaError('P2002', { target: ['parkingSpotId', 'date'] }), host);

    expect(captured.status).toBe(409);
    expect(captured.body).toEqual({
      defined: false,
      code: 'SPOT_ALREADY_RESERVED',
      status: 409,
      message: 'The parking spot is already reserved for that day.',
    });
  });

  it('turns a P2025 into NOT_FOUND / 404', () => {
    const { host, captured } = createHost();

    filter.catch(prismaError('P2025'), host);

    expect(captured.status).toBe(404);
    expect(captured.body).toMatchObject({ code: 'NOT_FOUND', status: 404 });
  });

  it('never forwards Prisma meta — it names constraints and columns', () => {
    const { host, captured } = createHost();

    filter.catch(prismaError('P2002', { target: ['parkingSpotId', 'date'] }), host);

    expect(serialized(captured)).not.toContain('parkingSpotId');
    expect(captured.body).not.toHaveProperty('data');
  });

  it('answers an unmapped Prisma code with a bare 500 and logs the cause', () => {
    const { host, captured } = createHost();

    filter.catch(prismaError('P1001'), host);

    expect(captured.status).toBe(500);
    expect(captured.body).toEqual({ statusCode: 500, message: 'Internal server error' });
    expect(loggerCalls.some((call) => call.level === 'error')).toBe(true);
  });

  it('renders a DomainError with the contract status and its details', () => {
    const { host, captured } = createHost();

    filter.catch(new DomainError('RESERVATIONS_LOCKED', { details: { month: '2026-09' } }), host);

    expect(captured.status).toBe(423);
    expect(captured.body).toEqual({
      defined: false,
      code: 'RESERVATIONS_LOCKED',
      status: 423,
      message: 'The reservation window for that month is closed.',
      data: { month: '2026-09' },
    });
  });

  it('logs a domain rule violation at warn, not error — it is not a defect', () => {
    const { host } = createHost();

    filter.catch(new DomainError('PAST_DATE'), host);

    expect(loggerCalls).toHaveLength(1);
    expect(loggerCalls[0]?.level).toBe('warn');
  });

  it('passes a client-side HttpException through with its own status', () => {
    const { host, captured } = createHost();

    filter.catch(new NotFoundException('No route'), host);

    expect(captured.status).toBe(404);
    expect(captured.body).toEqual({ statusCode: 404, message: 'No route' });
  });

  it('lets a throttled request keep its 429', () => {
    const { host, captured } = createHost();

    filter.catch(new ThrottlerException(), host);

    expect(captured.status).toBe(HttpStatus.TOO_MANY_REQUESTS);
  });

  it('replaces a server-side HttpException body with the generic 500', () => {
    const { host, captured } = createHost();

    filter.catch(new HttpException('Upstream said no: db-primary-7 refused', 502), host);

    expect(captured.status).toBe(502);
    expect(serialized(captured)).not.toContain('db-primary-7');
  });

  it('answers an arbitrary thrown value with the generic 500', () => {
    const { host, captured } = createHost();

    filter.catch(new TypeError("Cannot read properties of undefined (reading 'id')"), host);

    expect(captured.status).toBe(500);
    expect(captured.body).toEqual({ statusCode: 500, message: 'Internal server error' });
  });

  it('never puts a stack trace in the response, for any kind of failure', () => {
    const failures: unknown[] = [
      new DomainError('FORBIDDEN'),
      prismaError('P2002', { target: ['userId', 'date'] }),
      prismaError('P1001'),
      new HttpException('boom', 500),
      new TypeError('boom'),
      'a thrown string',
    ];

    for (const failure of failures) {
      const { host, captured } = createHost();
      filter.catch(failure, host);

      const body = serialized(captured);
      // The topmost stack frame is the most specific thing a stack leak would
      // put in the body, so it is what is asserted against — a bare "at "
      // search would trip over ordinary English in a contract message.
      const topFrame = (failure instanceof Error ? (failure.stack ?? '') : '')
        .split('\n')[1]
        ?.trim();
      if (topFrame !== undefined && topFrame !== '') {
        expect(body).not.toContain(topFrame);
      }
      expect(body).not.toContain('.spec.ts');
      expect(body).not.toContain('node_modules');
      expect(captured.body).not.toHaveProperty('stack');
    }
  });

  it('logs the error object for every failure, so the stack is not simply lost', () => {
    const failure = new TypeError('boom');
    const { host } = createHost();

    filter.catch(failure, host);

    expect(loggerCalls).toHaveLength(1);
    expect(loggerCalls[0]).toMatchObject({ level: 'error' });
    expect((loggerCalls[0]?.payload as { err: unknown }).err).toBe(failure);
  });
});
