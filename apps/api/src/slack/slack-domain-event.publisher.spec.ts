/**
 * What the after-commit seam turns into a Slack message, and what it does not.
 *
 * The events here are built from the realtime contract's own types, so an event
 * the contract does not declare will not compile — the same guarantee
 * `reservation-events.ts` gives the rest of the application.
 */

import type { DomainEvent, WaitlistPromotionNotice } from '../reservations/reservation-events';
import { SlackDomainEventPublisher } from './slack-domain-event.publisher';
import type { SlackNotificationService } from './slack-notification.service';
import type { CapturedLogs } from './testing/capture-logs';
import { captureLogs } from './testing/capture-logs';

const SPOT = '0198f4c1-0000-7000-8000-000000000001';
const DATE = '2026-09-29';

/** Lets a test await work the publisher deliberately does not await. */
function flush(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

function cancelled(): DomainEvent {
  return {
    name: 'reservation:cancelled',
    payload: { date: DATE, parkingSpotId: SPOT, reservationId: 'r-1' },
  };
}

describe('SlackDomainEventPublisher', () => {
  let logs: CapturedLogs;
  let notifications: {
    notifySpotFreed: jest.Mock;
    notifyWaitlistPromotion: jest.Mock;
  };
  let publisher: SlackDomainEventPublisher;

  beforeEach(() => {
    logs = captureLogs();
    notifications = {
      notifySpotFreed: jest.fn().mockResolvedValue('delivered'),
      notifyWaitlistPromotion: jest.fn().mockResolvedValue('delivered'),
    };
    publisher = new SlackDomainEventPublisher(
      notifications as unknown as SlackNotificationService,
      logs.logger
    );
  });

  describe('publish', () => {
    it('announces a cancellation that left the spot free', async () => {
      publisher.publish([cancelled()]);
      await flush();

      expect(notifications.notifySpotFreed).toHaveBeenCalledWith({
        parkingSpotId: SPOT,
        date: DATE,
        reservationId: 'r-1',
      });
    });

    it('says nothing about a reassignment — the promoted person gets a DM instead', async () => {
      // The contract emits `reservation:reassigned` *instead of*
      // `reservation:cancelled` when a promotion happened, so filtering on
      // `cancelled` is what stops the channel announcing a spot that is
      // already taken. Nothing here re-derives that from the notices.
      publisher.publish([
        {
          name: 'reservation:reassigned',
          payload: {
            date: DATE,
            parkingSpotId: SPOT,
            cause: 'WAITLIST_PROMOTION',
            previousReservationId: 'r-1',
            fromWaitlistEntryId: 'w-1',
            reservation: {
              id: 'r-2',
              createdAt: '2026-09-01T00:00:00.000Z',
              user: { id: 'u-2', name: 'Jana', licensePlate: null },
            },
          },
        },
      ]);
      await flush();

      expect(notifications.notifySpotFreed).not.toHaveBeenCalled();
    });

    it.each([
      {
        name: 'reservation:created',
        payload: {
          date: DATE,
          parkingSpotId: SPOT,
          reservation: {
            id: 'r-3',
            createdAt: '2026-09-01T00:00:00.000Z',
            user: { id: 'u-1', name: 'Petr', licensePlate: null },
          },
        },
      },
      { name: 'waitlist:updated', payload: { date: DATE, parkingSpotId: SPOT, waitlistCount: 2 } },
      { name: 'cell:unlocked', payload: { date: DATE, parkingSpotId: SPOT } },
    ] as DomainEvent[])('ignores %s', async (event: DomainEvent) => {
      publisher.publish([event]);
      await flush();

      expect(notifications.notifySpotFreed).not.toHaveBeenCalled();
    });

    it('handles a batch, announcing only the cancellations in it', async () => {
      publisher.publish([
        cancelled(),
        {
          name: 'waitlist:updated',
          payload: { date: DATE, parkingSpotId: SPOT, waitlistCount: 0 },
        },
      ]);
      await flush();

      expect(notifications.notifySpotFreed).toHaveBeenCalledTimes(1);
    });

    it('returns before the Slack call finishes — the user is not made to wait', () => {
      let settled = false;
      notifications.notifySpotFreed.mockImplementation(
        () =>
          new Promise((resolve) =>
            setImmediate(() => {
              settled = true;
              resolve('delivered');
            })
          )
      );

      publisher.publish([cancelled()]);

      expect(settled).toBe(false);
    });
  });

  describe('notifyPromotions', () => {
    const notice: WaitlistPromotionNotice = {
      userId: 'u-9',
      parkingSpotId: SPOT,
      date: DATE,
      reservationId: 'r-9',
    };

    it('sends one DM per promoted person', async () => {
      publisher.notifyPromotions([notice, { ...notice, userId: 'u-10', reservationId: 'r-10' }]);
      await flush();

      expect(notifications.notifyWaitlistPromotion).toHaveBeenCalledTimes(2);
      expect(notifications.notifyWaitlistPromotion).toHaveBeenCalledWith(notice);
    });

    it('does nothing when nobody was promoted', async () => {
      publisher.notifyPromotions([]);
      await flush();

      expect(notifications.notifyWaitlistPromotion).not.toHaveBeenCalled();
    });
  });

  describe('a notification that throws', () => {
    it('does not escape into the caller, which is a committed domain operation', async () => {
      notifications.notifySpotFreed.mockRejectedValue(new Error('unexpected'));

      // Synchronous: `publish` returns `void`, so a throw here would land in
      // `ReservationsService.cancel` *after* the transaction committed and turn
      // a successful cancellation into a 500.
      expect(() => publisher.publish([cancelled()])).not.toThrow();
      await flush();

      expect(logs.lines()).toContainEqual(
        expect.objectContaining({
          message: 'Slack notification threw unexpectedly',
          notification: 'spot-freed',
        })
      );
    });

    it('does not escape from a promotion DM either', async () => {
      notifications.notifyWaitlistPromotion.mockRejectedValue(new Error('unexpected'));

      expect(() =>
        publisher.notifyPromotions([
          { userId: 'u-9', parkingSpotId: SPOT, date: DATE, reservationId: 'r-9' },
        ])
      ).not.toThrow();
      await flush();

      expect(logs.lines()).toContainEqual(
        expect.objectContaining({ notification: 'waitlist-promoted' })
      );
    });

    it('lets the rest of the batch through', async () => {
      notifications.notifySpotFreed
        .mockRejectedValueOnce(new Error('unexpected'))
        .mockResolvedValueOnce('delivered');

      publisher.publish([cancelled(), { ...cancelled() }]);
      await flush();

      expect(notifications.notifySpotFreed).toHaveBeenCalledTimes(2);
    });
  });
});
