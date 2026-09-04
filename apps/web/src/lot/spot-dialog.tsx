'use client';

/**
 * The dialog behind a parking bay: reserve, queue, cancel, or an explanation.
 *
 * Presentational — every decision is on {@link SpotDialogProps}, and the four
 * actions are callbacks. The design draws this as four variants of one modal
 * (`08-modal-reserve.png`, `09-modal-queue.png`), keyed off `modalTitle`,
 * `modalSub`, `modalCta`, `modalCancel`, `modalPrimaryShow` and `modalLocked`;
 * so does this.
 *
 * **Two places where the design draws something the contract will not let it,
 * and the contract wins** (`plan.md`: contract-first; `doc/decision/0004-*`
 * gives the design the casting vote on *visuals*, not on what may cross the
 * wire):
 *
 * 1. **No name/SPZ form.** The design's reserve modal has "Jméno" and "SPZ"
 *    inputs bound to `resName`/`resPlate`. `createReservationInputSchema` is
 *    `{ parkingSpotId, date }` and nothing else — the holder is the caller and
 *    the plate is read off their profile, which they edit in Nastavení (Task
 *    26). Rendering the two fields would have meant either inventing request
 *    fields the contract does not have, or drawing inputs that quietly discard
 *    what is typed into them. So the modal is a confirmation, not a form —
 *    which is also why this screen needs no `libs/form`.
 * 2. **No list of who is queued.** The design lists the queue by name. The
 *    contract exposes `waitlistCount` plus **the caller's own** position and
 *    deliberately nothing else: `waitlistUpdatedEventSchema` states that "who
 *    is queued for a spot is not public". Listing the names would need a
 *    procedure that does not exist and should not. The count and the caller's
 *    own position are shown instead.
 */

import { Avatar, Button, Modal, Stack } from '@lets-park/design-system/primitives';
import { formatDayAndMonth, useTranslations } from '@lets-park/i18n';
import type { DateOnly } from '@lets-park/i18n';
import { initialsOf } from '../shell/initials';
import { ScreenError } from '../shell/screen-state';
import type { SpotView } from './lot-view';

export interface SpotDialogProps {
  /** `null` closes the dialog. */
  readonly spot: SpotView | null;
  readonly date: DateOnly;
  /**
   * From `overview.day`. Gates the two *write* actions the reservation window
   * blocks — creating a reservation and joining a queue, which declare the
   * same two window error codes. It does **not** gate cancelling: the contract
   * gives `reservation.cancel` no window errors at all, because "a locked
   * window stops people from taking spots, not from giving them back".
   */
  readonly canReserve: boolean;
  readonly isAdmin: boolean;
  /** The month name, for the yellow "locked" note. */
  readonly monthName: string;
  /** Whatever the last action threw, or `null`. Rendered by code, never by message. */
  readonly error: unknown;
  readonly pending: boolean;
  readonly onClose: () => void;
  readonly onReserve: () => void;
  readonly onJoinWaitlist: () => void;
  readonly onLeaveWaitlist: () => void;
  readonly onCancelReservation: () => void;
}

export function SpotDialog({
  spot,
  date,
  canReserve,
  isAdmin,
  monthName,
  error,
  pending,
  onClose,
  onReserve,
  onJoinWaitlist,
  onLeaveWaitlist,
  onCancelReservation,
}: SpotDialogProps) {
  const t = useTranslations('lot');

  if (spot === null) return null;

  const isTaken = spot.appearance === 'taken';
  const isInfo = spot.action === 'info';
  const isQueued = spot.viewerWaitlistEntryId !== null;

  // `modalCancel` in the design: the holder or an admin may cancel. Never
  // gated on the window — see `canReserve` on the props.
  const showCancel = isTaken && (isAdmin || spot.isMine);
  // `modalPrimaryShow`. Reserving and queueing are both writes the window
  // blocks, and both are absent rather than disabled when it does.
  const showPrimary = canReserve && !spot.isMine && !isInfo;

  // `isQueued` is tested **before** `isAdmin`, in both the title and the
  // description, because it is the more specific true statement about the
  // caller and it is the one the footer button already acts on. The design's
  // state machine has no such branch — its prototype had no waitlist
  // membership, so it only ever offered "join" — and a browser run against the
  // real API showed the consequence: a modal headed "Přidat se do fronty" above
  // a button reading "Odejít z fronty". An admin who is queued sees the queue
  // copy too; their cancel button is governed by `showCancel` and is unaffected.
  const title = isInfo
    ? t('titleInfo')
    : spot.isMine
      ? t('titleMine')
      : isTaken
        ? isQueued
          ? t('titleQueued')
          : isAdmin
            ? t('titleEdit')
            : t('titleQueue')
        : t('titleReserve');

  const description = isInfo
    ? t('subInfo')
    : spot.isMine
      ? canReserve
        ? t('subMine')
        : t('subMineLocked')
      : isTaken
        ? isQueued
          ? t('subQueued')
          : isAdmin
            ? t('subAdmin')
            : canReserve
              ? t('subQueue')
              : t('subTaken')
        : t('subReserve', { date: formatDayAndMonth(date) });

  return (
    <Modal
      open
      onClose={onClose}
      eyebrow={t('modalEyebrow', { label: spot.label })}
      title={title}
      description={description}
      // The design's modal has no × in the corner — its only close control is
      // the footer button — and drawing both would put two controls with the
      // same accessible name, doing the same thing, in the same dialog.
      // Escape and the scrim still close it; `Modal` keeps both regardless.
      hideCloseButton
      // Nothing here is unsaved input — the dialog holds no form (see the
      // module docs) — so a stray click on the scrim throws no work away.
      closeOnScrimClick
      footer={
        <>
          {showCancel ? (
            <Button
              variant="danger"
              className="mr-auto"
              loading={pending}
              onClick={onCancelReservation}
            >
              {t('cancelReservation')}
            </Button>
          ) : null}
          <Button variant="secondary" onClick={onClose}>
            {t('close')}
          </Button>
          {showPrimary ? (
            isTaken ? (
              isQueued ? (
                <Button variant="outline" loading={pending} onClick={onLeaveWaitlist}>
                  {t('leaveQueue')}
                </Button>
              ) : (
                <Button loading={pending} onClick={onJoinWaitlist}>
                  {t('ctaQueue')}
                </Button>
              )
            ) : (
              <Button loading={pending} onClick={onReserve}>
                {t('ctaReserve')}
              </Button>
            )
          ) : null}
        </>
      }
    >
      {isTaken && spot.holderName !== null ? (
        <div className="mb-5">
          <Stack
            direction="row"
            align="center"
            spacing={3}
            className="mb-3 rounded-md border border-border px-4 py-3"
          >
            <Avatar initials={initialsOf(spot.holderName)} tone="neutral" size="lg" />
            <div>
              <p className="text-base font-bold text-fg">{spot.holderName}</p>
              <p className="text-sm text-fg-3">
                {t('occupiedBy', { plate: spot.holderPlate ?? t('noPlate') })}
              </p>
            </div>
          </Stack>

          <p className="mb-2 text-xs font-bold uppercase tracking-caps text-fg-2">
            {t('queueHeading')}
          </p>
          {spot.waitlistCount === 0 ? (
            <p className="text-base text-fg-3">{t('queueEmpty')}</p>
          ) : (
            <p className="text-base text-fg-3">{t('waiting', { count: spot.waitlistCount })}</p>
          )}
          {spot.viewerWaitlistPosition !== null ? (
            <p className="mt-1 text-base font-bold text-fg">
              {t('queuePosition', { position: spot.viewerWaitlistPosition })}
            </p>
          ) : null}
        </div>
      ) : null}

      {!canReserve && !isInfo ? (
        <Stack
          direction="row"
          align="start"
          spacing={3}
          className="mb-5 rounded-md border border-brand-yellow bg-brand-yellow-100 px-4 py-3"
        >
          <span
            aria-hidden="true"
            className="inline-flex size-6 shrink-0 items-center justify-center rounded-xs bg-brand-yellow text-sm font-bold text-fg-on-yellow"
          >
            ⊘
          </span>
          <p className="text-sm leading-normal text-fg">{t('lockNote', { month: monthName })}</p>
        </Stack>
      ) : null}

      {error === null || error === undefined ? null : (
        // Keyed off the contract error's **code**, never its message: a
        // contract message is developer-facing English and a transport
        // failure's is stack-adjacent. `ScreenError` already owns that rule.
        <ScreenError error={error} headingLevel={3} />
      )}
    </Modal>
  );
}
