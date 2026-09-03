/**
 * The composite seam, proved by mutation rather than by inspection.
 *
 * A fan-out is the classic shape that passes its tests while only one branch
 * ever runs: two delegates, both healthy, and an assertion that "the event was
 * delivered" is satisfied by either of them. So every isolation test below
 * makes **one named side throw** and asserts, by name, that the *other* side
 * still ran — and separately that nothing reached the caller. Both directions
 * are tested, because a `try` that happens to wrap only the first delegate
 * would pass a one-directional suite.
 *
 * The delegates here are fakes rather than the real Socket.io and Slack
 * publishers on purpose. Neither of those throws today — the realtime one
 * catches per event, the Slack one detaches every promise — so a test built on
 * them could not distinguish "the composite isolates its delegates" from "the
 * delegates happen not to fail". The wiring that puts the *real* two behind
 * this class is asserted in `slack/slack.module.spec.ts` and
 * `realtime/realtime.gateway.spec.ts`.
 */

import type { PinoLogger } from 'nestjs-pino';
import { CompositeDomainEventPublisher } from './composite-domain-event.publisher';
import type { DomainEvent, WaitlistPromotionNotice } from './reservation-events';
import { DomainEventPublisher } from './reservation-events';

const DATE = '2026-09-15';
const SPOT = '11111111-1111-4111-8111-111111111111';
const RESERVATION = '22222222-2222-4222-8222-222222222222';
const USER = '33333333-3333-4333-8333-333333333333';

/** A delegate that records what it was handed, and optionally throws first. */
class RecordingPublisher extends DomainEventPublisher {
  readonly published: DomainEvent[] = [];
  readonly notified: WaitlistPromotionNotice[] = [];
  /** When set, thrown by `publish` *before* recording — the mutation. */
  publishThrows?: Error | undefined;
  /** When set, thrown by `notifyPromotions` before recording. */
  notifyThrows?: Error | undefined;

  publish(events: readonly DomainEvent[]): void {
    if (this.publishThrows !== undefined) {
      throw this.publishThrows;
    }
    this.published.push(...events);
  }

  notifyPromotions(notices: readonly WaitlistPromotionNotice[]): void {
    if (this.notifyThrows !== undefined) {
      throw this.notifyThrows;
    }
    this.notified.push(...notices);
  }
}

function cancelled(reservationId = RESERVATION): DomainEvent {
  return {
    name: 'reservation:cancelled',
    payload: { date: DATE, parkingSpotId: SPOT, reservationId },
  };
}

function waitlistUpdated(): DomainEvent {
  return {
    name: 'waitlist:updated',
    payload: { date: DATE, parkingSpotId: SPOT, waitlistCount: 2 },
  };
}

function promotion(): WaitlistPromotionNotice {
  return { userId: USER, parkingSpotId: SPOT, date: DATE, reservationId: RESERVATION };
}

describe('CompositeDomainEventPublisher', () => {
  let realtime: RecordingPublisher;
  let slack: RecordingPublisher;
  let errors: { bindings: Record<string, unknown>; message: string }[];
  let publisher: CompositeDomainEventPublisher;

  beforeEach(() => {
    realtime = new RecordingPublisher();
    slack = new RecordingPublisher();
    errors = [];
    const logger = {
      error: (bindings: Record<string, unknown>, message: string) => {
        errors.push({ bindings, message });
      },
    } as unknown as PinoLogger;
    publisher = new CompositeDomainEventPublisher([realtime, slack], logger);
  });

  describe('the healthy path', () => {
    it('hands every event to every delegate', () => {
      publisher.publish([cancelled(), waitlistUpdated()]);

      expect(realtime.published.map((event) => event.name)).toEqual([
        'reservation:cancelled',
        'waitlist:updated',
      ]);
      expect(slack.published.map((event) => event.name)).toEqual([
        'reservation:cancelled',
        'waitlist:updated',
      ]);
      expect(errors).toEqual([]);
    });

    it('hands every promotion notice to every delegate', () => {
      publisher.notifyPromotions([promotion()]);

      expect(realtime.notified).toEqual([promotion()]);
      expect(slack.notified).toEqual([promotion()]);
    });

    it('publishes nothing at all for an empty batch', () => {
      publisher.publish([]);
      publisher.notifyPromotions([]);

      expect(realtime.published).toEqual([]);
      expect(slack.published).toEqual([]);
      expect(realtime.notified).toEqual([]);
      expect(slack.notified).toEqual([]);
    });
  });

  describe('one implementation throwing does not silence the other', () => {
    // The mutation table. Each row makes exactly one named side fail and names
    // the side that must still have run; a composite with a single `try` around
    // both delegates fails the row whose victim comes second.

    it('still reaches Slack when the realtime publisher throws on publish', () => {
      realtime.publishThrows = new Error('socket write failed');

      publisher.publish([cancelled()]);

      expect(realtime.published).toEqual([]);
      expect(slack.published.map((event) => event.name)).toEqual(['reservation:cancelled']);
    });

    it('still reaches the realtime publisher when Slack throws on publish', () => {
      slack.publishThrows = new Error('slack notification failed');

      publisher.publish([cancelled()]);

      expect(slack.published).toEqual([]);
      expect(realtime.published.map((event) => event.name)).toEqual(['reservation:cancelled']);
    });

    it('still reaches Slack when the realtime publisher throws on notifyPromotions', () => {
      realtime.notifyThrows = new Error('socket write failed');

      publisher.notifyPromotions([promotion()]);

      expect(realtime.notified).toEqual([]);
      expect(slack.notified).toEqual([promotion()]);
    });

    it('still reaches the realtime publisher when Slack throws on notifyPromotions', () => {
      slack.notifyThrows = new Error('slack notification failed');

      publisher.notifyPromotions([promotion()]);

      expect(slack.notified).toEqual([]);
      expect(realtime.notified).toEqual([promotion()]);
    });

    it('keeps delivering to a delegate that failed on an earlier event', () => {
      // Per-event isolation *within* one delegate, not only between delegates:
      // the realtime side throws on the first event only, and must still be
      // handed the second. A composite that gave each delegate the whole batch
      // in one `try` would lose it.
      realtime.publishThrows = new Error('socket write failed');

      publisher.publish([cancelled()]);
      realtime.publishThrows = undefined;
      publisher.publish([waitlistUpdated()]);

      expect(realtime.published.map((event) => event.name)).toEqual(['waitlist:updated']);
    });

    it('delivers the second fact when a delegate throws on the first, in one call', () => {
      // The same property inside a single `publish`, which is how a promoting
      // cancellation actually arrives: `reservation:reassigned` and
      // `waitlist:updated` together. The delegate throws only for the
      // reassignment, so the queue-length fact must still get through.
      const selective = new (class extends DomainEventPublisher {
        readonly seen: string[] = [];
        publish(events: readonly DomainEvent[]): void {
          for (const event of events) {
            if (event.name === 'reservation:cancelled') {
              throw new Error('socket write failed');
            }
            this.seen.push(event.name);
          }
        }
        notifyPromotions(): void {
          // Not exercised by this test.
        }
      })();
      publisher = new CompositeDomainEventPublisher([selective], {
        error: () => undefined,
      } as unknown as PinoLogger);

      publisher.publish([cancelled(), waitlistUpdated()]);

      expect(selective.seen).toEqual(['waitlist:updated']);
    });

    it('reaches every remaining delegate when both of the first two throw', () => {
      // Three delegates, the first two failing: proves the loop continues
      // rather than merely tolerating one failure.
      const third = new RecordingPublisher();
      realtime.publishThrows = new Error('socket write failed');
      slack.publishThrows = new Error('slack notification failed');
      publisher = new CompositeDomainEventPublisher([realtime, slack, third], {
        error: () => undefined,
      } as unknown as PinoLogger);

      publisher.publish([cancelled()]);

      expect(third.published.map((event) => event.name)).toEqual(['reservation:cancelled']);
    });
  });

  describe('nothing reaches the caller', () => {
    // `reservation-events.ts`: a failure to broadcast "must never turn a
    // successful cancellation into an error the user sees". A user told their
    // cancellation failed will cancel again, against a row that is gone.

    it('does not throw when the realtime publisher throws on publish', () => {
      realtime.publishThrows = new Error('socket write failed');

      expect(() => publisher.publish([cancelled()])).not.toThrow();
    });

    it('does not throw when Slack throws on publish', () => {
      slack.publishThrows = new Error('slack notification failed');

      expect(() => publisher.publish([cancelled()])).not.toThrow();
    });

    it('does not throw when both throw on publish', () => {
      realtime.publishThrows = new Error('socket write failed');
      slack.publishThrows = new Error('slack notification failed');

      expect(() => publisher.publish([cancelled()])).not.toThrow();
    });

    it('does not throw when either side throws on notifyPromotions', () => {
      realtime.notifyThrows = new Error('socket write failed');
      slack.notifyThrows = new Error('slack notification failed');

      expect(() => publisher.notifyPromotions([promotion()])).not.toThrow();
    });
  });

  describe('what a failure logs', () => {
    it('logs the failure at error with the original error, naming the delegate and the event', () => {
      const thrown = new Error('socket write failed');
      realtime.publishThrows = thrown;

      publisher.publish([cancelled()]);

      expect(errors).toHaveLength(1);
      expect(onlyError().bindings).toEqual({
        err: thrown,
        publisher: 'RecordingPublisher',
        method: 'publish',
        subject: 'reservation:cancelled',
      });
      expect(onlyError().message).toContain('threw');
    });

    it('logs once per failing delegate, not once per call', () => {
      realtime.publishThrows = new Error('socket write failed');
      slack.publishThrows = new Error('slack notification failed');

      publisher.publish([cancelled()]);

      expect(errors.map((entry) => entry.bindings['method'])).toEqual(['publish', 'publish']);
    });

    it('names notifyPromotions as the method when a promotion notice fails', () => {
      realtime.notifyThrows = new Error('slack lookup failed');

      publisher.notifyPromotions([promotion()]);

      expect(onlyError().bindings['method']).toBe('notifyPromotions');
      expect(onlyError().bindings['subject']).toBe('waitlist:promoted');
    });

    it('logs no payload, so a redacted field cannot re-enter the log here', () => {
      // The composite logs the event *name*, never `event.payload`. Nothing in
      // a domain event is a credential today, but the seam is the one place
      // every committed fact passes through, and the project's rule is that a
      // token or a JWT never reaches a log line.
      realtime.publishThrows = new Error('socket write failed');

      publisher.publish([cancelled()]);

      expect(Object.keys(onlyError().bindings).sort()).toEqual([
        'err',
        'method',
        'publisher',
        'subject',
      ]);
      expect(JSON.stringify(onlyError().bindings)).not.toContain(RESERVATION);
    });

    it('logs nothing when every delegate succeeds', () => {
      publisher.publish([cancelled(), waitlistUpdated()]);
      publisher.notifyPromotions([promotion()]);

      expect(errors).toEqual([]);
    });
  });

  /** The single logged failure, asserted to be single rather than assumed. */
  function onlyError(): { bindings: Record<string, unknown>; message: string } {
    const [first, ...rest] = errors;
    if (first === undefined || rest.length > 0) {
      throw new Error(`expected exactly one logged error, got ${errors.length}`);
    }
    return first;
  }
});
