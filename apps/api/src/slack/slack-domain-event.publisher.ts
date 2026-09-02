/**
 * The Slack end of the after-commit seam.
 *
 * `apps/api/src/reservations/reservation-events.ts` declares
 * `DomainEventPublisher` with a no-op default and says in as many words that
 * Task 16 turns `notifyPromotions` into an outbound `chat.postMessage`. This is
 * that implementation. It reuses the existing seam rather than adding a second
 * one, so the guarantee the seam already carries — the services call it strictly
 * after `COMMIT`, outside the cancel retry loop, so a message is sent once and
 * only about something that actually happened — is inherited rather than
 * re-argued.
 *
 * ## Which events produce a Slack message, and why only those
 *
 * | Event | Slack |
 * | --- | --- |
 * | `reservation:cancelled` | freed-spot notice to the shared channel |
 * | `reservation:reassigned` | **nothing** — the promotion DM covers it |
 * | `reservation:created` | nothing |
 * | `waitlist:updated`, `cell:*` | nothing |
 *
 * The first two rows are one decision, and the realtime contract already made
 * it: a cancellation that promoted somebody emits `reservation:reassigned`
 * *instead of* `reservation:cancelled`, never both. So "a spot came free and
 * stayed free" is exactly `reservation:cancelled`, and there is no chance of
 * announcing a free spot that was taken in the same transaction. Nothing here
 * re-derives that from the promotion notices; it falls out of the contract.
 *
 * The other rows are the scope boundary. A reservation someone made themselves
 * is not news, and `cell:locked` fires every time a user hovers over a tile.
 *
 * ## Why the calls are not awaited
 *
 * The seam's contract is `void`: it is called on a request's way out, and
 * `ReservationsService.cancel` returns immediately afterwards. Awaiting a Slack
 * round trip — with up to `SLACK_RETRY_ATTEMPTS` attempts and a backoff — would
 * add seconds to the user's cancellation to tell somebody else about it. Every
 * detached promise is caught here, so a Slack failure can never surface as an
 * unhandled rejection, and `SlackClient` does not throw in the first place.
 *
 * ## What a reviewer merging Task 15 must do
 *
 * Task 15 (the Socket.io gateway) needs the *same* `DomainEventPublisher`
 * token, for `publish`. Both branches change the one `useClass` line in
 * `reservations.module.ts`, so git will conflict there — deliberately. The
 * resolution is **not** to pick one: it is a small composite provider that
 * forwards `publish` and `notifyPromotions` to both implementations, e.g.
 *
 * ```ts
 * { provide: DomainEventPublisher, useFactory: (a, b) => new CompositePublisher([a, b]),
 *   inject: [SlackDomainEventPublisher, RealtimeDomainEventPublisher] }
 * ```
 *
 * with each implementation also registered as a provider in its own module.
 * Neither branch can write that composite on its own, because neither can name
 * the other's class.
 */

import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import type { DomainEvent, WaitlistPromotionNotice } from '../reservations/reservation-events';
import { DomainEventPublisher } from '../reservations/reservation-events';
import { SlackNotificationService } from './slack-notification.service';

@Injectable()
export class SlackDomainEventPublisher extends DomainEventPublisher {
  constructor(
    private readonly notifications: SlackNotificationService,
    @InjectPinoLogger(SlackDomainEventPublisher.name) private readonly logger: PinoLogger
  ) {
    super();
  }

  publish(events: readonly DomainEvent[]): void {
    for (const event of events) {
      if (event.name !== 'reservation:cancelled') {
        continue;
      }
      const { date, parkingSpotId, reservationId } = event.payload;
      this.detach('spot-freed', () =>
        this.notifications.notifySpotFreed({ parkingSpotId, date, reservationId })
      );
    }
  }

  notifyPromotions(notices: readonly WaitlistPromotionNotice[]): void {
    for (const notice of notices) {
      this.detach('waitlist-promoted', () => this.notifications.notifyWaitlistPromotion(notice));
    }
  }

  /**
   * Runs a notification without awaiting it, and without letting it escape.
   *
   * `SlackNotificationService` already returns outcomes rather than throwing,
   * so the catch is for the one thing it cannot promise: a bug in this
   * application. An unhandled rejection in Node terminates the process by
   * default, and a Slack notice must never be able to take the API down.
   */
  private detach(notification: string, send: () => Promise<unknown>): void {
    void send().catch((error: unknown) => {
      this.logger.error({ err: error, notification }, 'Slack notification threw unexpectedly');
    });
  }
}
