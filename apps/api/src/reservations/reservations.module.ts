import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { ReservationWindowModule } from '../reservation-window/reservation-window.module';
import { BulkReservationController } from './bulk-reservation.controller';
import { BulkReservationService } from './bulk-reservation.service';
import { DomainEventPublisher, NoopDomainEventPublisher } from './reservation-events';
import { ReservationPolicy } from './reservation-policy';
import { ReservationsController } from './reservations.controller';
import { ReservationsService } from './reservations.service';
import { WaitlistController } from './waitlist.controller';
import { WaitlistPromotionService } from './waitlist-promotion.service';
import { WaitlistService } from './waitlist.service';

/**
 * Reservations, the waitlist and bulk booking, which are one module because they
 * are one transaction: cancelling a reservation promotes out of the waitlist,
 * and splitting them would mean either a circular import or a promotion that
 * could not share the cancellation's transaction. Bulk booking joins them
 * because it writes into both tables at once and shares the same policy, the
 * same audit shape and the same after-commit publisher.
 *
 * The window settings come from `ReservationWindowModule` rather than being
 * re-read here, for the same reason the day overview borrows them: one
 * definition of whether a month is open.
 *
 * ## The provider Tasks 15 and 16 replace
 *
 * `DomainEventPublisher` is bound to {@link NoopDomainEventPublisher} — an
 * abstract class used as the injection token rather than a `Symbol`, so the
 * seam is discoverable from the type and a replacement cannot silently have the
 * wrong shape. Task 15 (Socket.io) and Task 16 (Slack) swap this one line for a
 * real implementation; no call site changes, and nothing about *when* it is
 * called is up to them — the services already publish strictly after commit.
 */
@Module({
  imports: [AuditModule, ReservationWindowModule],
  controllers: [ReservationsController, WaitlistController, BulkReservationController],
  providers: [
    ReservationsService,
    WaitlistService,
    BulkReservationService,
    WaitlistPromotionService,
    ReservationPolicy,
    { provide: DomainEventPublisher, useClass: NoopDomainEventPublisher },
  ],
})
export class ReservationsModule {}
