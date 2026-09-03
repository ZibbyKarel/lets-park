/**
 * The after-commit seam with **two** implementations behind it.
 *
 * Task 15 (Socket.io) and Task 16 (Slack) both need the one
 * `DomainEventPublisher` token, and both said so in a comment predicting this
 * file. Nest resolves one
 * provider per token, so the resolution is not a choice between them: it is a
 * composite that forwards every fact to each implementation in turn. Neither
 * branch could write it, because neither could name the other's class — which
 * is why it lives here, next to the token it implements, rather than in
 * `realtime/` or `slack/`.
 *
 * ## Why it takes a list rather than the two classes
 *
 * The delegates arrive through {@link DOMAIN_EVENT_PUBLISHERS}, assembled in
 * `reservations.module.ts` from the instances `RealtimeModule` and
 * `SlackModule` export. Two consequences, both deliberate:
 *
 * - This file imports nothing from `realtime/` or `slack/`, so the composite
 *   is unit-testable against delegates that do nothing but throw — which is
 *   the only way to prove the isolation properties below rather than assert
 *   them in prose.
 * - The instances are the ones their own modules built. Task 16 needed
 *   `useExisting` for exactly that reason (a second `SlackDomainEventPublisher`
 *   would resolve but could not reach the collaborators `SlackModule` does not
 *   export, and would keep its own in-flight set); injecting the concrete
 *   classes as tokens keeps that guarantee, and
 *   `slack.module.spec.ts` still proves the sharing end-to-end.
 *
 * ## The two isolation properties, and why the nesting is what it is
 *
 * `reservation-events.ts` states the requirement this class exists to keep:
 * implementations "must not throw and must not block: they are called after
 * the transaction has committed, on the request's way out, and a failure to
 * broadcast must never turn a successful cancellation into an error the user
 * sees". A user whose reservation *was* cancelled but who is told it failed
 * will cancel it again, against a row that no longer exists. So every forward
 * is wrapped, and nothing here ever rethrows.
 *
 * The loops are nested **event-outer, delegate-inner**, and each innermost call
 * gets its own `try`. That is `delegates.length × events.length` separate
 * failure domains, which is what the two requirements together demand:
 *
 * - *No shared `try` between implementations.* A Socket.io write that throws
 *   must not suppress the Slack notification for the same event, and vice
 *   versa — they are different transports with unrelated failure modes.
 * - *No shared `try` between events.* A cancellation that promoted somebody
 *   publishes `reservation:reassigned` **and** `waitlist:updated`, two
 *   different facts about the cell, and one failing must not take the other
 *   with it. `RealtimeDomainEventPublisher` already loops per event internally;
 *   doing it here as well means the property holds for *any* delegate, present
 *   or future, rather than depending on each one remembering to.
 *
 * Each delegate is therefore handed a one-element array. Both current
 * implementations loop over their argument and are indifferent to the batching;
 * a delegate for which it mattered would be a delegate that had quietly taken
 * on the batch-failure semantics this class is here to deny it.
 *
 * ## What is logged
 *
 * A failure here is a logged defect and nothing more: `error` with the stack,
 * naming the delegate, the method and the event, and never the payload. There
 * is no caller who can trigger it at will — reaching it means a publisher that
 * promised not to throw did — and per the project's logging rule no token and
 * no JWT can appear in that line, because none of the fields is one.
 */

import { Inject, Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import type { DomainEvent, WaitlistPromotionNotice } from './reservation-events';
import { DomainEventPublisher } from './reservation-events';

/**
 * The implementations {@link CompositeDomainEventPublisher} fans out to, in
 * order. Bound in `reservations.module.ts`; a `Symbol` rather than an abstract
 * class because the injected value is a list, not a seam — the seam itself
 * stays {@link DomainEventPublisher}.
 */
export const DOMAIN_EVENT_PUBLISHERS = Symbol('DOMAIN_EVENT_PUBLISHERS');

@Injectable()
export class CompositeDomainEventPublisher extends DomainEventPublisher {
  constructor(
    @Inject(DOMAIN_EVENT_PUBLISHERS) private readonly delegates: readonly DomainEventPublisher[],
    @InjectPinoLogger(CompositeDomainEventPublisher.name) private readonly logger: PinoLogger
  ) {
    super();
  }

  publish(events: readonly DomainEvent[]): void {
    for (const event of events) {
      for (const delegate of this.delegates) {
        this.forward(delegate, 'publish', event.name, () => delegate.publish([event]));
      }
    }
  }

  notifyPromotions(notices: readonly WaitlistPromotionNotice[]): void {
    for (const notice of notices) {
      for (const delegate of this.delegates) {
        this.forward(delegate, 'notifyPromotions', 'waitlist:promoted', () =>
          delegate.notifyPromotions([notice])
        );
      }
    }
  }

  /**
   * One forward, one failure domain. Never rethrows: see the class comment for
   * why a broadcast failure must not reach the user who already got their
   * cancellation.
   */
  private forward(
    delegate: DomainEventPublisher,
    method: 'publish' | 'notifyPromotions',
    subject: string,
    call: () => void
  ): void {
    try {
      call();
    } catch (error) {
      this.logger.error(
        { err: error, publisher: delegate.constructor.name, method, subject },
        'An after-commit publisher threw; the other publishers were unaffected'
      );
    }
  }
}
