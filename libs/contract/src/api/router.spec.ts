import { type AnyContractProcedure, isContractProcedure } from '@orpc/contract';
import { ERROR_CODES } from '../schemas/errors';
import { noInputSchema } from './errors';
import { contract } from './router';

/** Flattens the router into `['a.b.c', procedure]` pairs. */
function flatten(
  node: unknown,
  path: readonly string[] = []
): readonly (readonly [string, AnyContractProcedure])[] {
  if (isContractProcedure(node)) {
    return [[path.join('.'), node]];
  }
  if (typeof node !== 'object' || node === null) {
    return [];
  }
  return Object.entries(node).flatMap(([key, child]) => flatten(child, [...path, key]));
}

const procedures = flatten(contract);
const procedurePaths = procedures.map(([path]) => path);

/**
 * The authoritative list. A procedure added, removed or renamed shows up in the
 * diff here, which is the contract-first guarantee: nothing may be implemented
 * on the backend or called from the frontend unless it is on this list.
 */
const EXPECTED_PROCEDURES = [
  'overview.day',
  'reservation.create',
  'reservation.cancel',
  'reservation.previewBulk',
  'reservation.confirmBulk',
  'waitlist.join',
  'waitlist.leave',
  'spot.list',
  'me.get',
  'me.updateSettings',
  'me.regenerateIcsToken',
  'admin.spot.list',
  'admin.spot.create',
  'admin.spot.update',
  'admin.spot.deactivate',
  'admin.user.list',
  'admin.user.update',
  'admin.window.get',
  'admin.window.update',
  'admin.window.months',
];

/**
 * The error codes each procedure declares.
 *
 * `FORBIDDEN` is on every one of them, from the shared `authed` base: a
 * deactivated user is rejected before any handler runs, and the admin subtree
 * additionally rejects a non-admin.
 *
 * The two window codes follow ruling window-1 / window-3 exactly:
 * `OUT_OF_HORIZON` means the target month is `NOT_YET_OPEN`,
 * `RESERVATIONS_LOCKED` means it is `LOCKED`. Note what is **absent**:
 * `reservation.cancel` declares neither, because cancelling your own
 * reservation is allowed in a locked month.
 */
const EXPECTED_ERROR_CODES: Record<string, readonly string[]> = {
  'overview.day': ['FORBIDDEN'],
  'reservation.create': [
    'FORBIDDEN',
    'NOT_FOUND',
    'SPOT_ALREADY_RESERVED',
    'RESERVATION_LIMIT_REACHED',
    'PAST_DATE',
    'OUT_OF_HORIZON',
    'RESERVATIONS_LOCKED',
    'VALIDATION_FAILED',
    'CONFLICT',
  ],
  'reservation.cancel': ['FORBIDDEN', 'NOT_FOUND', 'CONFLICT'],
  'reservation.previewBulk': [
    'FORBIDDEN',
    'PAST_DATE',
    'OUT_OF_HORIZON',
    'RESERVATIONS_LOCKED',
    'VALIDATION_FAILED',
  ],
  'reservation.confirmBulk': [
    'FORBIDDEN',
    'PAST_DATE',
    'OUT_OF_HORIZON',
    'RESERVATIONS_LOCKED',
    'VALIDATION_FAILED',
    'CONFLICT',
  ],
  'waitlist.join': [
    'FORBIDDEN',
    'NOT_FOUND',
    'ALREADY_IN_WAITLIST',
    'CANNOT_WAITLIST_OWN_SPOT',
    'SPOT_NOT_OCCUPIED',
    'RESERVATION_LIMIT_REACHED',
    'PAST_DATE',
    'OUT_OF_HORIZON',
    'RESERVATIONS_LOCKED',
    'VALIDATION_FAILED',
    'CONFLICT',
  ],
  'waitlist.leave': ['FORBIDDEN', 'NOT_FOUND', 'OUT_OF_HORIZON', 'RESERVATIONS_LOCKED', 'CONFLICT'],
  'spot.list': ['FORBIDDEN'],
  'me.get': ['FORBIDDEN'],
  'me.updateSettings': ['FORBIDDEN', 'NOT_FOUND', 'VALIDATION_FAILED'],
  'me.regenerateIcsToken': ['FORBIDDEN', 'CONFLICT'],
  'admin.spot.list': ['FORBIDDEN'],
  'admin.spot.create': ['FORBIDDEN', 'CONFLICT', 'VALIDATION_FAILED'],
  'admin.spot.update': ['FORBIDDEN', 'NOT_FOUND', 'CONFLICT', 'VALIDATION_FAILED'],
  'admin.spot.deactivate': ['FORBIDDEN', 'NOT_FOUND', 'CONFLICT'],
  'admin.user.list': ['FORBIDDEN'],
  'admin.user.update': ['FORBIDDEN', 'NOT_FOUND', 'CONFLICT', 'VALIDATION_FAILED'],
  'admin.window.get': ['FORBIDDEN'],
  'admin.window.update': ['FORBIDDEN', 'VALIDATION_FAILED', 'CONFLICT'],
  'admin.window.months': ['FORBIDDEN', 'VALIDATION_FAILED'],
};

describe('contract router', () => {
  it('exposes exactly the expected procedures', () => {
    expect([...procedurePaths].sort()).toEqual([...EXPECTED_PROCEDURES].sort());
  });

  it('declares an output schema on every procedure', () => {
    for (const [path, procedure] of procedures) {
      expect([path, procedure['~orpc'].outputSchema !== undefined]).toEqual([path, true]);
    }
  });

  it('declares an input schema on every procedure', () => {
    // No exceptions: the four argument-less procedures declare `noInputSchema`
    // rather than omitting `.input()`, so nothing can accept an unvalidated
    // payload by accident.
    const withoutInput = procedures
      .filter(([, procedure]) => procedure['~orpc'].inputSchema === undefined)
      .map(([path]) => path);
    expect(withoutInput).toEqual([]);
  });

  it('uses the shared no-input schema on the argument-less procedures', () => {
    for (const path of ['admin.window.get', 'me.get', 'me.regenerateIcsToken', 'spot.list']) {
      const procedure = procedures.find(([candidate]) => candidate === path)?.[1];
      expect([path, procedure?.['~orpc'].inputSchema]).toEqual([path, noInputSchema]);
    }
  });

  it('accepts an argument-less call and rejects a stray payload', () => {
    // Both shapes an argument-less call can arrive as: `undefined` over RPC,
    // `{}` over an OpenAPI GET with no parameters.
    expect(noInputSchema.safeParse(undefined).success).toBe(true);
    expect(noInputSchema.safeParse({}).success).toBe(true);
    expect(noInputSchema.safeParse({ unexpected: 1 }).success).toBe(false);
    expect(noInputSchema.safeParse(null).success).toBe(false);
  });

  it('declares at least one error code on every procedure', () => {
    for (const [path, procedure] of procedures) {
      expect([path, Object.keys(procedure['~orpc'].errorMap).length > 0]).toEqual([path, true]);
    }
  });

  it('declares only codes from the closed ERROR_CODES enum', () => {
    for (const [path, procedure] of procedures) {
      for (const code of Object.keys(procedure['~orpc'].errorMap)) {
        expect([path, ERROR_CODES.includes(code as (typeof ERROR_CODES)[number])]).toEqual([
          path,
          true,
        ]);
      }
    }
  });

  it('declares exactly the documented error codes per procedure', () => {
    for (const [path, procedure] of procedures) {
      expect([path, Object.keys(procedure['~orpc'].errorMap).sort()]).toEqual([
        path,
        [...(EXPECTED_ERROR_CODES[path] ?? [])].sort(),
      ]);
    }
  });

  it('never declares a window error on cancelling a reservation', () => {
    // Ruling window-1: a normal user may cancel their own reservation at any
    // time, including in a locked month. A regression here would be invisible
    // in types but wrong in behaviour.
    const cancel = contract.reservation.cancel['~orpc'].errorMap;
    expect(cancel).not.toHaveProperty('RESERVATIONS_LOCKED');
    expect(cancel).not.toHaveProperty('OUT_OF_HORIZON');
  });

  it('declares both window errors on every write gated by the window', () => {
    for (const path of [
      'reservation.create',
      'waitlist.join',
      'waitlist.leave',
      'reservation.previewBulk',
      'reservation.confirmBulk',
    ]) {
      const codes = EXPECTED_ERROR_CODES[path] ?? [];
      expect([path, codes.includes('OUT_OF_HORIZON')]).toEqual([path, true]);
      expect([path, codes.includes('RESERVATIONS_LOCKED')]).toEqual([path, true]);
    }
  });

  it('puts every admin-only procedure under the admin subtree', () => {
    // Grouping is the authorization boundary Task 12 implements against.
    expect(procedurePaths.filter((path) => path.startsWith('admin.')).sort()).toEqual(
      [
        'admin.spot.create',
        'admin.spot.deactivate',
        'admin.spot.list',
        'admin.spot.update',
        'admin.user.list',
        'admin.user.update',
        'admin.window.get',
        'admin.window.months',
        'admin.window.update',
      ].sort()
    );
  });
});
