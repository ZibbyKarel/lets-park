import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { ReservationWindowModule } from '../reservation-window/reservation-window.module';
import { ReservationPolicy } from './reservation-policy';
import { ReservationsController } from './reservations.controller';
import { ReservationsService } from './reservations.service';
import { WaitlistController } from './waitlist.controller';
import { WaitlistPromotionService } from './waitlist-promotion.service';
import { WaitlistService } from './waitlist.service';

/**
 * Reservations and the waitlist, which are one module because they are one
 * transaction: cancelling a reservation promotes out of the waitlist, and
 * splitting them would mean either a circular import or a promotion that could
 * not share the cancellation's transaction.
 *
 * The window settings come from `ReservationWindowModule` rather than being
 * re-read here, for the same reason the day overview borrows them: one
 * definition of whether a month is open.
 *
 * ## The provider Task 15 replaced, and Task 16 will extend
 *
 * `DomainEventPublisher` is an abstract class used as the injection token
 * rather than a `Symbol`, so the seam is discoverable from the type and a
 * replacement cannot silently have the wrong shape. It was bound here to
 * `NoopDomainEventPublisher`; Task 15 moved the binding into `RealtimeModule`,
 * which supplies the Socket.io implementation. **No call site changed**, and
 * nothing about *when* it is called was up to it — the services below already
 * published strictly after commit, and still do.
 *
 * Task 16 (Slack) wants the same token for `notifyPromotions`. See
 * `realtime/realtime.publisher.ts` for the fan-out shape that keeps the two
 * from sharing a `try`.
 */
@Module({
  imports: [AuditModule, ReservationWindowModule, RealtimeModule],
  controllers: [ReservationsController, WaitlistController],
  providers: [ReservationsService, WaitlistService, WaitlistPromotionService, ReservationPolicy],
})
export class ReservationsModule {}
