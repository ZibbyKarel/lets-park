import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { ReservationWindowModule } from '../reservation-window/reservation-window.module';
import { BulkReservationController } from './bulk-reservation.controller';
import { BulkReservationService } from './bulk-reservation.service';
import { SlackModule } from '../slack/slack.module';
import { SlackDomainEventPublisher } from '../slack/slack-domain-event.publisher';
import { DomainEventPublisher } from './reservation-events';
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
 * `DomainEventPublisher` is bound to {@link SlackDomainEventPublisher} as of
 * Task 16 — an abstract class used as the injection token rather than a
 * `Symbol`, so the seam is discoverable from the type and a replacement cannot
 * silently have the wrong shape. No call site changed, and nothing about *when*
 * it is called was up to Task 16: the services already publish strictly after
 * commit.
 *
 * `useExisting`, not `useClass`: the instance must be the one `SlackModule`
 * built, or Nest would construct a second publisher here and fail to resolve
 * the collaborators that module deliberately does not export.
 *
 * **Task 15 needs this same token for `publish`.** Both branches change this
 * one line, so it will conflict — on purpose. The resolution is a composite
 * provider forwarding to both implementations, not a choice between them; see
 * the class comment on `SlackDomainEventPublisher` for the shape.
 */
@Module({
  imports: [AuditModule, ReservationWindowModule, SlackModule],
  controllers: [ReservationsController, WaitlistController, BulkReservationController],
  providers: [
    ReservationsService,
    WaitlistService,
    BulkReservationService,
    WaitlistPromotionService,
    ReservationPolicy,
    { provide: DomainEventPublisher, useExisting: SlackDomainEventPublisher },
  ],
})
export class ReservationsModule {}
