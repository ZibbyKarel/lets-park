/**
 * The filter is tested without a database on purpose: `P2002` is raised by
 * Postgres, but `PrismaClientKnownRequestError` is an ordinary class, so the
 * exact object Prisma would throw can be constructed here. That makes the most
 * important mapping in the API — the one that turns a lost double-booking race
 * into a clean 409 instead of a 500 — testable on a machine with no Postgres.
 */

import {
  ArgumentsHost,
  BadRequestException,
  HttpException,
  HttpStatus,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { ERROR_DEFINITIONS, errorShapeSchema } from '@lets-park/contract';
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

/**
 * A minimal Express request/response double that records what the filter wrote.
 *
 * `path` decides whether the response is expected to carry the RPC envelope. It
 * defaults to a non-oRPC route so that every assertion written before the
 * envelope existed still describes the same situation it always did.
 */
function createHost(path = '/api/echo'): { host: ArgumentsHost; captured: CapturedResponse } {
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
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => ({ path, method: 'POST' }),
    }),
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
    // `meta.target` as a column list — what Prisma documents, and what the
    // query-engine client emits. NOT what this project's driver adapter emits;
    // an earlier version of this comment claimed it was, and that belief is why
    // the mapping was green while every real violation degraded to CONFLICT.
    // The shape that actually arrives is in the `driverAdapterError` block
    // below, transcribed from a live PostgreSQL 17 and re-asserted on every
    // `nx run api:test-db`.
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

  /**
   * The shape `@prisma/adapter-pg` really sends. There is no `target` key
   * anywhere in it — `database-contract.db.spec.ts` asserts its absence against
   * a live server, so these fixtures cannot drift into fiction unnoticed.
   */
  function driverAdapterMeta(index: string): Record<string, unknown> {
    return {
      modelName: index.split('_')[0],
      driverAdapterError: {
        cause: {
          originalCode: '23505',
          kind: 'UniqueConstraintViolation',
          constraint: { index },
          table: index.split('_')[0],
        },
      },
    };
  }

  it.each([
    ['Reservation_parkingSpotId_date_key', 'SPOT_ALREADY_RESERVED'],
    ['Reservation_userId_date_key', 'RESERVATION_LIMIT_REACHED'],
    ['WaitlistEntry_parkingSpotId_userId_date_key', 'ALREADY_IN_WAITLIST'],
    ['User_email_key', 'CONFLICT'],
    ['ParkingSpot_label_key', 'CONFLICT'],
  ])('maps the driver adapter’s constraint index %s to %s', (index, expected) => {
    expect(mapUniqueConstraintViolation(driverAdapterMeta(index))).toBe(expected);
  });

  it('reads the driver adapter’s `fields` form too, for adapters that report columns', () => {
    // The `constraint` union's other arm. No driver in this project emits it
    // today; it costs three lines and removes a whole class of "worked on
    // Postgres, silent on MySQL".
    const meta = {
      driverAdapterError: {
        cause: { kind: 'UniqueConstraintViolation', constraint: { fields: ['userId', 'date'] } },
      },
    };
    expect(mapUniqueConstraintViolation(meta)).toBe('RESERVATION_LIMIT_REACHED');
  });

  it('degrades to CONFLICT when Prisma reports no target at all', () => {
    expect(mapUniqueConstraintViolation(undefined)).toBe('CONFLICT');
    expect(mapUniqueConstraintViolation({})).toBe('CONFLICT');
    // A driver-adapter error that is not a unique violation, and a malformed
    // one: neither may be read as a constraint match.
    expect(mapUniqueConstraintViolation({ driverAdapterError: null })).toBe('CONFLICT');
    expect(
      mapUniqueConstraintViolation({ driverAdapterError: { cause: { constraint: {} } } })
    ).toBe('CONFLICT');
  });

  // The matching is by exact column set. A previous version joined the columns
  // and used `includes`, so each of these mapped to a reservation error.
  it.each([
    [['userId', 'dateFrom']],
    [['userId', 'updatedDate']],
    [['parkingSpotId', 'dateCreated']],
  ])('does not match %p, whose column merely contains "date"', (target) => {
    expect(mapUniqueConstraintViolation({ target })).toBe('CONFLICT');
  });

  it('does not treat a superset of a known constraint as that constraint', () => {
    // A future `Reservation (parkingSpotId, date, tenantId)` is a different
    // rule and must not silently claim SPOT_ALREADY_RESERVED.
    expect(mapUniqueConstraintViolation({ target: ['parkingSpotId', 'date', 'tenantId'] })).toBe(
      'CONFLICT'
    );
  });

  it('does not confuse another table with the same column pair', () => {
    expect(mapUniqueConstraintViolation({ target: 'Invoice_userId_date_key' })).toBe('CONFLICT');
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

  /**
   * Found by running the API against a real database: four probes at a wrong
   * path produced four multi-kilobyte log lines, each ten frames of
   * `@nestjs/core` router internals. The response was always clean, so this is
   * a logging defect rather than a leak — but 404 is the most common status on
   * a public endpoint, so any scanner walking URLs fills the log with frames
   * that answer nothing.
   */
  describe('a framework 4xx is logged without its stack', () => {
    function lastWarn() {
      const warn = loggerCalls.filter((call) => call.level === 'warn').at(-1);
      if (warn === undefined) {
        throw new Error('Nothing was logged at warn.');
      }
      return warn.payload as Record<string, unknown>;
    }

    it('logs a 404 at warn with no `err` key', () => {
      const { host } = createHost('/api/nope');

      filter.catch(new NotFoundException('Cannot POST /api/nope'), host);

      const payload = lastWarn();
      expect(payload).not.toHaveProperty('err');
      expect(JSON.stringify(payload)).not.toContain('@nestjs/core');
    });

    it('keeps what actually answers "what were they asking for"', () => {
      const { host } = createHost('/api/nope');

      filter.catch(new NotFoundException('Cannot POST /api/nope'), host);

      expect(lastWarn()).toEqual({
        statusCode: 404,
        method: 'POST',
        path: '/api/nope',
        reason: 'Cannot POST /api/nope',
      });
    });

    it('still logs the stack for a 5xx, where the frames are the diagnosis', () => {
      const { host } = createHost();

      filter.catch(new HttpException('boom', 500), host);

      const errors = loggerCalls.filter((call) => call.level === 'error');
      expect(errors.at(-1)?.payload).toHaveProperty('err');
    });

    it('keeps the stack on a DomainError, where the frames name the rule', () => {
      // Deliberately different from the branch above: only an authenticated
      // caller can raise one, and the frames point at the service that refused.
      const { host } = createHost();

      filter.catch(new DomainError('CONFLICT'), host);

      expect(lastWarn()).toHaveProperty('err');
    });
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

  /**
   * Regression: the body parser's rejection is not an `HttpException`, so it
   * used to fall through to the generic 500 arm — wrong status class, and a
   * logged stack for something any anonymous caller can trigger at will.
   * `http-pipeline.spec.ts` proves the end-to-end behaviour; these pin the
   * boundaries of the recognition rule.
   */
  describe('http-errors raised before routing', () => {
    /** The shape `raw-body` throws, as probed from a real oversized request. */
    function payloadTooLarge() {
      return Object.assign(new Error('request entity too large'), {
        status: 413,
        statusCode: 413,
        expose: true,
        type: 'entity.too.large',
      });
    }

    it('answers 413 with the transport shape', () => {
      const { host, captured } = createHost();

      filter.catch(payloadTooLarge(), host);

      expect(captured.status).toBe(413);
      expect(captured.body).toEqual({ statusCode: 413, message: 'request entity too large' });
    });

    it('logs it at warn and without the stack — it is a client mistake, not a defect', () => {
      const { host } = createHost();

      filter.catch(payloadTooLarge(), host);

      expect(loggerCalls).toHaveLength(1);
      expect(loggerCalls[0]).toMatchObject({ level: 'warn' });
      expect(loggerCalls[0]?.payload).not.toHaveProperty('err');
    });

    it('ignores a 4xx whose message the library marked internal (expose: false)', () => {
      const { host, captured } = createHost();

      filter.catch(
        Object.assign(new Error('internal detail'), { status: 400, expose: false }),
        host
      );

      expect(captured.status).toBe(500);
      expect(captured.body).toEqual({ statusCode: 500, message: 'Internal server error' });
      expect(serialized(captured)).not.toContain('internal detail');
    });

    it('ignores a 5xx http-error — those are never client-safe', () => {
      const { host, captured } = createHost();

      filter.catch(
        Object.assign(new Error('upstream exploded at 10.0.0.7'), {
          status: 502,
          expose: false,
        }),
        host
      );

      expect(captured.status).toBe(500);
      expect(serialized(captured)).not.toContain('10.0.0.7');
    });
  });

  /**
   * Regression: terminus signals a failed check by throwing a 503, which the
   * `status >= 500` branch used to overwrite with the constant body — throwing
   * away the only information a readiness probe exists to convey.
   */
  describe('terminus health results', () => {
    function healthResult(status: 'ok' | 'error') {
      const details = { database: { status: 'down', reason: 'Database is unreachable' } };
      return { status, info: {}, error: details, details };
    }

    it('forwards the health payload at 503 instead of the constant body', () => {
      const { host, captured } = createHost();

      filter.catch(new ServiceUnavailableException(healthResult('error')), host);

      expect(captured.status).toBe(503);
      expect(captured.body).toMatchObject({
        status: 'error',
        details: { database: { status: 'down', reason: 'Database is unreachable' } },
      });
    });

    it('logs a failed probe at warn without a stack — it repeats every probe interval', () => {
      const { host } = createHost();

      filter.catch(new ServiceUnavailableException(healthResult('error')), host);

      expect(loggerCalls).toHaveLength(1);
      expect(loggerCalls[0]).toMatchObject({ level: 'warn' });
      expect(loggerCalls[0]?.payload).not.toHaveProperty('err');
    });

    // The guarantee that makes the allowance above safe to have.
    it('still replaces an ordinary 5xx body, so no internal detail rides along', () => {
      const { host, captured } = createHost();

      filter.catch(
        new InternalServerErrorException('connect ECONNREFUSED 10.0.0.7:5432 lets_park'),
        host
      );

      expect(captured.status).toBe(500);
      expect(captured.body).toEqual({ statusCode: 500, message: 'Internal server error' });
      expect(serialized(captured)).not.toContain('10.0.0.7');
      expect(serialized(captured)).not.toContain('lets_park');
    });

    it('does not forward a 503 whose body merely looks structured', () => {
      const { host, captured } = createHost();

      filter.catch(
        new ServiceUnavailableException({ status: 'error', secret: 'connection string' }),
        host
      );

      expect(captured.body).toEqual({ statusCode: 500, message: 'Internal server error' });
      expect(serialized(captured)).not.toContain('connection string');
    });
  });

  /**
   * The guard `doc/decision/0039-*` routed here, and the defect it describes.
   *
   * A domain error written at the top level of the body deserialises to
   * `undefined` in `@orpc/client`, which then synthesises a code from the HTTP
   * status — so `SPOT_ALREADY_RESERVED` (409) arrived as `CONFLICT`, a member of
   * `ERROR_CODES` too, and the UI showed the wrong error with full confidence.
   * These tests fail if the envelope is removed.
   *
   * They belong here rather than in `libs/api-client`: that lib is
   * `type:util`/`scope:web` and the Nx boundaries forbid it from depending on
   * `apps/api`, which is why the earlier attempt at a tripwire over there had
   * zero coupling to this file.
   */
  describe('the RPC envelope on oRPC routes', () => {
    const RPC_PATH = '/api/rpc/reservation/create';

    it('wraps a domain error in { json, meta } so the oRPC client can read the code', () => {
      const { host, captured } = createHost(RPC_PATH);

      filter.catch(new DomainError('SPOT_ALREADY_RESERVED'), host);

      expect(captured.status).toBe(409);
      expect(captured.body).toEqual({
        json: {
          defined: false,
          code: 'SPOT_ALREADY_RESERVED',
          status: 409,
          message: ERROR_DEFINITIONS.SPOT_ALREADY_RESERVED.message,
        },
      });
    });

    it('wraps a Prisma constraint violation the same way', () => {
      const { host, captured } = createHost(RPC_PATH);

      filter.catch(prismaError('P2002', { target: ['parkingSpotId', 'date'] }), host);

      expect(captured.body).toEqual({
        json: expect.objectContaining({ code: 'SPOT_ALREADY_RESERVED' }),
      });
    });

    it('leaves a transport failure in Nest’s shape, even on an RPC path', () => {
      // `doc/decision/0033-*`: the closed enum has no member for "too many
      // requests", and the oRPC client derives a code from the status for these.
      const { host, captured } = createHost(RPC_PATH);

      filter.catch(new BadRequestException('Validation failed'), host);

      expect(captured.body).toEqual({ statusCode: 400, message: 'Validation failed' });
    });

    it('leaves a non-oRPC route unwrapped — the ICS feed and the probes are not oRPC clients', () => {
      const { host, captured } = createHost('/api/calendar/abc.ics');

      filter.catch(new DomainError('NOT_FOUND'), host);

      expect(captured.body).toMatchObject({ code: 'NOT_FOUND' });
      expect(captured.body).not.toHaveProperty('json');
    });

    it('does not mistake a path that merely starts with the same characters', () => {
      const { host, captured } = createHost('/api/rpcsomething/else');

      filter.catch(new DomainError('NOT_FOUND'), host);

      expect(captured.body).not.toHaveProperty('json');
    });
  });
});
