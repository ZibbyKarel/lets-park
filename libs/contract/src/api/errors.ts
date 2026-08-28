/**
 * Bridge between the Task 3 error contract (`ERROR_CODES`, `errorShapeSchema`)
 * and oRPC's typed-error mechanism.
 *
 * oRPC carries errors as `{ code, message, data }`, where `code` is the key of
 * the procedure's error map. Our contract calls the third field `details`, but
 * it is the same field — see
 * `doc/decision/0018-mapovani-error-kontraktu-na-orpc.md`. Nothing here invents
 * a new code: the map below is keyed by `ErrorCode` and TypeScript rejects a
 * key that is not in `ERROR_CODES`.
 */

import type { ErrorMapItem } from '@orpc/contract';
import { oc } from '@orpc/contract';
import * as z from 'zod';
import type { ErrorCode } from '../schemas/errors';
import { errorDetailsSchema } from '../schemas/errors';

/**
 * Schema of every error's `data`. Optional, because most failures need nothing
 * beyond their code; the ones that do (a conflicting reservation's id, the
 * month that is locked) put it here.
 */
export const errorDataSchema = errorDetailsSchema.optional();

type ErrorDefinition = ErrorMapItem<typeof errorDataSchema>;

/**
 * The one definition per domain error code: the HTTP status the transport maps
 * it to, and a default message used when the thrower does not supply one.
 *
 * The `message` is a developer-facing fallback for logs and unexpected clients.
 * User-visible Czech copy is keyed off `code` in `libs/i18n` and never comes
 * from here.
 */
export const ERROR_DEFINITIONS = {
  SPOT_ALREADY_RESERVED: {
    status: 409,
    message: 'The parking spot is already reserved for that day.',
    data: errorDataSchema,
  },
  RESERVATION_LIMIT_REACHED: {
    status: 409,
    message: 'The user already has a reservation for that day.',
    data: errorDataSchema,
  },
  PAST_DATE: {
    status: 422,
    message: 'The date is in the past (Europe/Prague).',
    data: errorDataSchema,
  },
  OUT_OF_HORIZON: {
    status: 422,
    message: 'Reservations for that month have not opened yet.',
    data: errorDataSchema,
  },
  NOT_FOUND: {
    status: 404,
    message: 'The requested entity does not exist.',
    data: errorDataSchema,
  },
  FORBIDDEN: {
    status: 403,
    message: 'The caller is not allowed to perform this action.',
    data: errorDataSchema,
  },
  ALREADY_IN_WAITLIST: {
    status: 409,
    message: 'The user is already queued for that spot and day.',
    data: errorDataSchema,
  },
  CANNOT_WAITLIST_OWN_SPOT: {
    status: 422,
    message: 'The user already holds the reservation for that spot and day.',
    data: errorDataSchema,
  },
  SPOT_NOT_OCCUPIED: {
    status: 409,
    message: 'The spot is free — reserve it instead of queueing for it.',
    data: errorDataSchema,
  },
  VALIDATION_FAILED: {
    status: 400,
    message: 'The request is structurally valid but violates a domain rule.',
    data: errorDataSchema,
  },
  CONFLICT: {
    status: 409,
    message: 'The request lost a race against a concurrent change.',
    data: errorDataSchema,
  },
  RESERVATIONS_LOCKED: {
    status: 423,
    message: 'The reservation window for that month is closed.',
    data: errorDataSchema,
  },
} satisfies Record<ErrorCode, ErrorDefinition>;

/**
 * Picks the error definitions a procedure declares.
 *
 * ```ts
 * authed.errors(contractErrors('NOT_FOUND', 'SPOT_ALREADY_RESERVED'))
 * ```
 *
 * The return type is a `Pick`, so the client sees exactly the codes a procedure
 * can produce — declaring one and throwing another is a type error on the
 * backend, and a code that is not in `ERROR_CODES` does not compile at all.
 */
export function contractErrors<const TCodes extends readonly ErrorCode[]>(
  ...codes: TCodes
): Pick<typeof ERROR_DEFINITIONS, TCodes[number]> {
  return Object.fromEntries(codes.map((code) => [code, ERROR_DEFINITIONS[code]])) as Pick<
    typeof ERROR_DEFINITIONS,
    TCodes[number]
  >;
}

/**
 * Base builder every procedure in this contract starts from.
 *
 * `FORBIDDEN` is declared once here rather than repeated thirty times: it is
 * reachable on **every** procedure, because a deactivated user (`active: false`,
 * how offboarding works) is rejected before any handler runs. Procedures that
 * are additionally admin-only do not need to redeclare it.
 */
export const authed = oc.errors(contractErrors('FORBIDDEN'));

/**
 * Input schema for procedures that take no arguments.
 *
 * oRPC allows `.input()` to be omitted entirely, but an omitted schema means an
 * accidental payload is silently ignored, and it leaves the procedure without
 * the input schema this contract requires of every procedure. Declaring the
 * absence of input is stricter than not declaring input.
 *
 * It accepts `undefined` **and** `{}` on purpose. The RPC transport delivers
 * `undefined` for an argument-less call, while oRPC's OpenAPI input mapping
 * merges path/query/body into an object and hands a parameter-less GET an empty
 * one. `z.void()` would pass the first and reject the second, which would turn
 * the handler choice in Task 12 into a runtime break here. Anything with a key
 * in it is still rejected.
 */
export const noInputSchema = z.strictObject({}).optional();

/** `undefined` — the only value a caller of a no-input procedure should send. */
export type NoInput = z.infer<typeof noInputSchema>;
