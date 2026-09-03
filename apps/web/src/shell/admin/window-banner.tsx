'use client';

/**
 * The one-sentence notice about a month's reservation window
 * (`doc/design/screens/06-admin-overview.png` — the green band under the date).
 *
 * ## Why six sentences and not three
 *
 * `MonthWindowOverview` carries a `state` **and** a `lockMode`, and the two
 * together decide what may honestly be said. `windowFrom`/`windowTo` are always
 * the range the AUTO rule *would* produce; when an admin has forced the state
 * they describe a hypothetical, not a fact
 * (`libs/contract/src/schemas/reservation-window.ts`). So each of the three
 * states gets a pair: the AUTO wording, which names a date, and the forced
 * wording, which says an admin decided and names none.
 *
 * Reading a date out of the forced case would put a sentence on screen that is
 * simply untrue — "reservations close on 31 August" while the mode says they
 * are open indefinitely — which is the failure this split exists to prevent.
 */

import type { MonthWindowOverview } from '@lets-park/contract';
import { Toast, type ToastTone } from '@lets-park/design-system/primitives';
import {
  formatDayAndMonth,
  formatMonthAndYear,
  startOfYearMonth,
  useTranslations,
} from '@lets-park/i18n';
import type { MonthLockState } from '@lets-park/i18n';

/**
 * Colour per state, matching `06-admin-overview.png`'s green band for an open
 * month. Exported for the same reason as the badge tones in
 * `./admin-window-screen.tsx`: it is signal, not decoration.
 */
export const STATE_TONE: Record<MonthLockState, ToastTone> = {
  OPEN: 'success',
  LOCKED: 'warning',
  NOT_YET_OPEN: 'neutral',
};

/**
 * The glyph in the design's coloured chip, one per state. `aria-hidden` on
 * `Toast`, so it is decoration — but decoration that says "open" or "locked" to
 * anyone scanning, which is why it is exported and pinned alongside the tone.
 */
export const STATE_GLYPH: Record<MonthLockState, string> = {
  OPEN: '✓',
  LOCKED: '🔒',
  NOT_YET_OPEN: '…',
};

export interface WindowBannerProps {
  readonly window: MonthWindowOverview;
  readonly className?: string | undefined;
}

export function WindowBanner({ window: month, className }: WindowBannerProps) {
  const t = useTranslations('admin');

  const monthName = formatMonthAndYear(startOfYearMonth(month.month));
  const isAuto = month.lockMode === 'AUTO';

  const text = isAuto
    ? {
        OPEN: () =>
          t('bannerOpenAuto', { month: monthName, until: formatDayAndMonth(month.windowTo) }),
        LOCKED: () => t('bannerLockedAuto', { month: monthName }),
        NOT_YET_OPEN: () =>
          t('bannerNotYetOpenAuto', {
            month: monthName,
            from: formatDayAndMonth(month.windowFrom),
          }),
      }[month.state]()
    : {
        OPEN: () => t('bannerOpenForced', { month: monthName }),
        LOCKED: () => t('bannerLockedForced', { month: monthName }),
        NOT_YET_OPEN: () => t('bannerNotYetOpenForced', { month: monthName }),
      }[month.state]();

  return (
    <Toast
      tone={STATE_TONE[month.state]}
      icon={STATE_GLYPH[month.state]}
      {...(className === undefined ? {} : { className })}
    >
      {text}
    </Toast>
  );
}
