/**
 * The routing table and the contract must not drift.
 *
 * Each contract procedure is mounted on its own Nest route so that `@Roles()`
 * and `@CurrentUser()` keep working (`rpc-route-handler.ts`). The price of that
 * is a path written out in a decorator, and a path written by hand is a path
 * that can be wrong. This file is what makes it not be:
 *
 * - every registered route names a procedure that exists in `libs/contract`;
 * - every procedure Task 12 implements has exactly one route;
 * - every procedure it does not implement has **none** — so a half-added Task 13
 *   procedure fails here rather than answering 404 in production;
 * - every `admin.*` route carries `@Roles('ADMIN')` and no other route does.
 *
 * The last one is the reason this file is worth more than a lint rule. The
 * authorization of this API is a list of decorators; nothing else in the
 * codebase would notice one going missing.
 */

import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { isContractProcedure } from '@orpc/contract';
import { contract } from '@lets-park/contract';
import type { UserRole } from '@lets-park/contract';
import { ROLES_KEY } from '../auth/roles.decorator';
import { MeController } from '../me/me.controller';
import { OverviewController } from '../overview/overview.controller';
import { ReservationWindowController } from '../reservation-window/reservation-window.controller';
import { SpotsController } from '../spots/spots.controller';
import { UsersController } from '../users/users.controller';
import { RPC_ROUTE_PREFIX } from './rpc-route';

/**
 * The procedures Tasks 13 and 17 own. Listing them here rather than deriving
 * "everything else" is deliberate: when Task 13 lands, this list shrinks in the
 * same commit that adds the routes, and the assertions below force that to
 * happen together.
 */
const NOT_YET_IMPLEMENTED = [
  'reservation.create',
  'reservation.cancel',
  'reservation.previewBulk',
  'reservation.confirmBulk',
  'waitlist.join',
  'waitlist.leave',
];

const CONTROLLERS = [
  SpotsController,
  UsersController,
  MeController,
  ReservationWindowController,
  OverviewController,
];

interface RegisteredRoute {
  /** Dotted procedure name, e.g. `admin.spot.list`. */
  procedure: string;
  method: RequestMethod;
  roles: readonly UserRole[] | undefined;
}

/** Every procedure in the contract, as a dotted name. */
function contractProcedures(node: unknown, prefix: string[] = []): string[] {
  if (isContractProcedure(node)) {
    return [prefix.join('.')];
  }
  if (typeof node !== 'object' || node === null) {
    return [];
  }
  return Object.entries(node).flatMap(([key, child]) =>
    contractProcedures(child, [...prefix, key])
  );
}

/** Every route the five controllers register, read off Nest's own metadata. */
function registeredRoutes(): RegisteredRoute[] {
  const routes: RegisteredRoute[] = [];

  for (const controller of CONTROLLERS) {
    const controllerPath = Reflect.getMetadata(PATH_METADATA, controller) as string;
    expect(controllerPath).toBe(RPC_ROUTE_PREFIX);

    const prototype = controller.prototype as unknown as Record<string, unknown>;
    for (const name of Object.getOwnPropertyNames(prototype)) {
      const handler = prototype[name];
      if (typeof handler !== 'function' || name === 'constructor') {
        continue;
      }
      const path = Reflect.getMetadata(PATH_METADATA, handler) as string | undefined;
      if (path === undefined) {
        continue;
      }
      routes.push({
        procedure: path.split('/').join('.'),
        method: Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod,
        roles: Reflect.getMetadata(ROLES_KEY, handler) as readonly UserRole[] | undefined,
      });
    }
  }

  return routes;
}

describe('the RPC routing table', () => {
  const procedures = contractProcedures(contract);
  const routes = registeredRoutes();

  it('finds the contract’s procedures — otherwise every assertion below is vacuous', () => {
    // Without this, a walker that returned `[]` would make the set comparisons
    // trivially true against an equally empty route list.
    expect(procedures).toContain('admin.spot.list');
    expect(procedures.length).toBeGreaterThan(15);
    expect(routes.length).toBeGreaterThan(10);
  });

  it('registers no route that the contract does not declare', () => {
    expect(routes.map((route) => route.procedure).sort()).toEqual(
      routes
        .map((route) => route.procedure)
        .filter((name) => procedures.includes(name))
        .sort()
    );
  });

  it('registers exactly one route per implemented procedure, and none per pending one', () => {
    const expected = procedures.filter((name) => !NOT_YET_IMPLEMENTED.includes(name)).sort();

    expect(routes.map((route) => route.procedure).sort()).toEqual(expected);
  });

  it('lists only procedures that exist as not-yet-implemented', () => {
    for (const pending of NOT_YET_IMPLEMENTED) {
      expect(procedures).toContain(pending);
    }
  });

  it('mounts every procedure as POST, which is what RPCLink sends', () => {
    for (const route of routes) {
      expect(route.method).toBe(RequestMethod.POST);
    }
  });

  describe('authorization', () => {
    it('guards every admin procedure with @Roles(ADMIN)', () => {
      const adminRoutes = routes.filter((route) => route.procedure.startsWith('admin.'));

      expect(adminRoutes.length).toBeGreaterThan(0);
      for (const route of adminRoutes) {
        expect(route.roles).toEqual(['ADMIN']);
      }
    });

    it('leaves every non-admin procedure open to any authenticated caller', () => {
      // `@Roles()` on, say, `overview.day` would lock the parking screen to
      // admins. Undecorated is the correct state, and it has to be asserted for
      // the same reason the decorated one does.
      const otherRoutes = routes.filter((route) => !route.procedure.startsWith('admin.'));

      expect(otherRoutes.length).toBeGreaterThan(0);
      for (const route of otherRoutes) {
        expect(route.roles).toBeUndefined();
      }
    });
  });
});
