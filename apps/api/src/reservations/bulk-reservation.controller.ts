/**
 * `reservation.previewBulk` and `reservation.confirmBulk`.
 *
 * A separate controller from `ReservationsController` for the same reason
 * `WaitlistController` is one: a controller here is a thin delegation to exactly
 * one service, and bulk booking has its own.
 *
 * No `@Roles()`: any authenticated user may book for themselves, and the whole
 * batch is written for `context.user` — the procedures take no user id, so there
 * is no "somebody else's booking" to authorize.
 */

import { Controller, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { implementer } from '../orpc/implementer';
import { RpcRouteHandler } from '../orpc/rpc-route-handler';
import { RPC_ROUTE_PREFIX, rpcRoute } from '../orpc/rpc-route';
import { BulkReservationService } from './bulk-reservation.service';

@Controller(RPC_ROUTE_PREFIX)
export class BulkReservationController {
  private readonly rpc: RpcRouteHandler;

  constructor(
    bulk: BulkReservationService,
    @InjectPinoLogger(BulkReservationController.name) logger: PinoLogger
  ) {
    this.rpc = new RpcRouteHandler(
      {
        reservation: {
          previewBulk: implementer.reservation.previewBulk.handler(({ input, context }) =>
            bulk.preview(input, context.user)
          ),
          confirmBulk: implementer.reservation.confirmBulk.handler(({ input, context }) =>
            bulk.confirm(input, context.user)
          ),
        },
      },
      logger
    );
  }

  @Post(rpcRoute('reservation', 'previewBulk'))
  previewBulk(
    @Req() request: Request,
    @Res() response: Response,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<void> {
    return this.rpc.handle(request, response, user);
  }

  @Post(rpcRoute('reservation', 'confirmBulk'))
  confirmBulk(
    @Req() request: Request,
    @Res() response: Response,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<void> {
    return this.rpc.handle(request, response, user);
  }
}
