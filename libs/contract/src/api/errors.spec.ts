import { ERROR_CODES, type ErrorCode } from '../schemas/errors';
import { ERROR_DEFINITIONS, authed, contractErrors } from './errors';

describe('ERROR_DEFINITIONS', () => {
  it('defines exactly the codes in ERROR_CODES — no more, no fewer', () => {
    // A code without a definition cannot be declared on a procedure; a
    // definition without a code would be an error the frontend never sees.
    expect(Object.keys(ERROR_DEFINITIONS).sort()).toEqual([...ERROR_CODES].sort());
  });

  it('gives every code an HTTP status and a default message', () => {
    for (const code of ERROR_CODES) {
      const definition = ERROR_DEFINITIONS[code];
      expect(definition.status).toBeGreaterThanOrEqual(400);
      expect(definition.status).toBeLessThan(600);
      expect(definition.message.length).toBeGreaterThan(0);
    }
  });

  it('maps the two window codes to distinct, meaningful statuses', () => {
    // They must not collapse into one status: the frontend switches on `code`,
    // but logs and proxies read the status.
    expect(ERROR_DEFINITIONS.OUT_OF_HORIZON.status).toBe(422);
    expect(ERROR_DEFINITIONS.RESERVATIONS_LOCKED.status).toBe(423);
  });

  it('accepts an omitted `data`, because most errors carry none', () => {
    expect(ERROR_DEFINITIONS.NOT_FOUND.data.safeParse(undefined).success).toBe(true);
    expect(
      ERROR_DEFINITIONS.SPOT_ALREADY_RESERVED.data.safeParse({ reservationId: 'x' }).success
    ).toBe(true);
    expect(ERROR_DEFINITIONS.NOT_FOUND.data.safeParse('nope').success).toBe(false);
  });
});

describe('contractErrors', () => {
  it('picks exactly the requested definitions', () => {
    const picked = contractErrors('NOT_FOUND', 'CONFLICT');
    expect(Object.keys(picked).sort()).toEqual(['CONFLICT', 'NOT_FOUND']);
    expect(picked.NOT_FOUND).toBe(ERROR_DEFINITIONS.NOT_FOUND);
  });

  it('narrows the type to the picked codes', () => {
    const picked = contractErrors('NOT_FOUND');
    // Type-level assertion: the result must not be widened to every code.
    const keys: 'NOT_FOUND'[] = Object.keys(picked) as (keyof typeof picked)[];
    expect(keys).toEqual(['NOT_FOUND']);
  });

  it('returns an empty map for no codes', () => {
    expect(contractErrors()).toEqual({});
  });
});

describe('authed', () => {
  it('declares FORBIDDEN on every procedure derived from it', () => {
    // A deactivated user is rejected before any handler runs, so FORBIDDEN is
    // reachable everywhere and is declared once rather than thirty times.
    expect(Object.keys(authed['~orpc'].errorMap)).toEqual(['FORBIDDEN']);
  });
});

describe('ERROR_CODES coverage', () => {
  it('has a definition for every code the type allows', () => {
    // Guards against ERROR_CODES growing without ERROR_DEFINITIONS following.
    const codes: readonly ErrorCode[] = ERROR_CODES;
    for (const code of codes) {
      expect(ERROR_DEFINITIONS[code]).toBeDefined();
    }
  });
});
