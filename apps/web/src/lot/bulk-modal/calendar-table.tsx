'use client';

import type { ReactNode } from 'react';
import { useTranslations } from '@lets-park/i18n';
import { Button, Modal } from '@lets-park/design-system/primitives';
import type { PreviewBulkOutput } from '@lets-park/contract';

/**
 * Step 2 of {@link ../bulk-modal.BulkReservationModal} — the schedule
 * `reservation.previewBulk` proposed, with the confirm/back footer.
 *
 * Every identifier the schedule section read from
 * `BulkReservationModalContent`'s closure arrives here as a prop, in the
 * order the parent already computed them. `confirmPending` and `onConfirm`
 * stand in for the `confirmBulk` mutation object itself, which app code may
 * not import the type of directly (`@tanstack/react-query` is wrapped by
 * `@lets-park/query`).
 */
export interface CalendarTableProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly t: ReturnType<typeof useTranslations>;
  readonly proposal: PreviewBulkOutput;
  readonly pending: boolean;
  readonly onBack: () => void;
  readonly confirmPending: boolean;
  readonly onConfirm: () => void;
  readonly renderSchedule: (days: PreviewBulkOutput['days']) => ReactNode;
  readonly failureNote: ReactNode;
}

export function CalendarTable({
  open,
  onClose,
  t,
  proposal,
  pending,
  onBack,
  confirmPending,
  onConfirm,
  renderSchedule,
  failureNote,
}: CalendarTableProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title={t('scheduleTitle')}
      description={t('scheduleDescription')}
      closeLabel={t('close')}
      closeOnScrimClick={false}
      footer={
        <>
          <Button variant="secondary" disabled={pending} onClick={onBack}>
            {t('ctaBack')}
          </Button>
          <Button
            loading={confirmPending}
            disabled={pending}
            onClick={() => {
              // The days of the **proposal on screen**, not of `selected`.
              // They agree today, because both procedures answer one entry
              // per requested day — but "we confirm exactly what you were
              // shown" is the invariant, and reading it off the thing that
              // was shown is the only way to state it.
              onConfirm();
            }}
          >
            {t('ctaConfirm')}
          </Button>
        </>
      }
    >
      {renderSchedule(proposal.days)}
      <p className="mt-4 text-base text-fg-2">
        {/*
          The server's own count, exactly as the result step uses
          `result.summary`. Re-deriving it here by filtering `days` would put
          two authorities behind one sentence, and the moment they disagreed
          the user would read a difference between the two steps that the
          comparison panel cannot explain, because no day moved.
        */}
        {t('scheduleSummary', {
          assigned: proposal.summary.assigned,
          queued: proposal.summary.queued,
        })}
      </p>
      {failureNote}
    </Modal>
  );
}
