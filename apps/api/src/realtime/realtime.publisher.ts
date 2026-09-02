/**
 * The after-commit seam, filled in.
 *
 * `reservations/reservation-events.ts` declared `DomainEventPublisher` as an
 * abstract class with a no-op implementation and said Task 15 would swap the
 * binding. This is that swap, and it is deliberately the *only* thing this task
 * changes about reservations: **when** an event is published is not up to the
 * publisher. `ReservationsService.cancel` computes events inside the
 * transaction, returns them, and calls `publish` past the `await` — outside the
 * retry loop, so a cancellation that lost two races publishes once, not three
 * times. `WaitlistService` does the same. Nothing here can move a broadcast
 * back inside a transaction, and nothing here needs to know it is outside one.
 *
 * ## Why `publish` swallows everything
 *
 * `reservation-events.ts` states the requirement: implementations "must not
 * throw and must not block: they are called after the transaction has
 * committed, on the request's way out, and a failure to broadcast must never
 * turn a successful cancellation into an error the user sees". A user whose
 * reservation *is* cancelled, told it failed because a socket write threw,
 * would cancel it again — against a row that no longer exists.
 *
 * So a broadcast failure is a logged defect and nothing more. It is logged at
 * `error` with the stack, because unlike a refused handshake there is no
 * caller who can trigger this at will: reaching it means the gateway is broken.
 *
 * The loop is per event rather than around the whole batch on purpose. A
 * cancellation that promoted somebody publishes two events —
 * `reservation:reassigned` and `waitlist:updated` — and they are different
 * facts about the cell. One failing must not silently take the other with it.
 */

import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import type { DomainEvent } from '../reservations/reservation-events';
import { DomainEventPublisher } from '../reservations/reservation-events';
import { RealtimeGateway } from './realtime.gateway';

@Injectable()
export class RealtimeDomainEventPublisher extends DomainEventPublisher {
  constructor(
    private readonly gateway: RealtimeGateway,
    @InjectPinoLogger(RealtimeDomainEventPublisher.name) private readonly logger: PinoLogger
  ) {
    super();
  }

  publish(events: readonly DomainEvent[]): void {
    for (const event of events) {
      try {
        this.gateway.broadcastDomainEvent(event);
      } catch (error) {
        this.logger.error(
          { err: error, event: event.name },
          'Failed to broadcast a committed domain event'
        );
      }
    }
  }

  /**
   * Out-of-band notification of a promoted user — **Task 16's**, not this
   * task's.
   *
   * Left a no-op rather than removed: the method is abstract, so this class
   * cannot exist without it, and a promoted user does already learn what
   * happened over the socket — `reservation:reassigned` carries
   * `fromWaitlistEntryId` precisely so their own client can drop its queue
   * entry. What is missing is the Slack message for a user who has no tab open,
   * which is the whole of Task 16 (`plan.md`, Fáze 5, point 7).
   *
   * When Task 16 lands there will be two things wanting this one token. The
   * shape that keeps both honest is a publisher that fans out to a list of
   * implementations, rather than a Slack call bolted onto this class — the
   * realtime broadcast and an outbound HTTP call have different failure modes
   * and must not share a `try`. Recorded here so the choice is made
   * deliberately; see the Task 15 report.
   */
  notifyPromotions(): void {
    // Intentionally empty — see the method comment.
  }
}
