'use client';

/**
 * Everything above the map. All presentational.
 *
 * - {@link LotHeader} — the section eyebrow, the day as a heading, the two
 *   count pills and the bulk-reservation button;
 * - {@link WindowBanner} — the one true sentence about the month's window;
 * - {@link RealtimeNotice} — the affordance for a refused socket.
 *
 * The sticky day picker at the bottom of the design is `./date-nav-bar`'s
 * `DayBar`, not this file's — split out for Task 25 (`doc/decision/0140-*`).
 */

import { Button, Stack, cx } from '@lets-park/design-system/primitives';
import { formatFullDate, useTranslations } from '@lets-park/i18n';
import type { DateOnly } from '@lets-park/i18n';
import type { BannerView, LotCounts } from './lot-view';

export interface LotHeaderProps {
  readonly date: DateOnly;
  readonly counts: LotCounts;
  readonly sectionTitle: string;
  /**
   * `windowOpen || admin` — the design's `batchAllowed`. When it is false the
   * button is **absent**, not disabled: a normal user in a locked month has no
   * bulk action to take, and a greyed-out control invites a click that will
   * only ever be refused.
   */
  readonly showBulk: boolean;
  readonly onBulk: () => void;
}

export function LotHeader({ date, counts, sectionTitle, showBulk, onBulk }: LotHeaderProps) {
  const t = useTranslations('lot');

  return (
    <Stack direction="row" wrap align="end" justify="between" spacing={6} className="mb-6">
      <div>
        <p className="mb-2 text-xs font-bold uppercase tracking-caps text-fg-2">{sectionTitle}</p>
        <h1 className="text-4xl font-bold leading-tight tracking-tight text-fg">
          {formatFullDate(date)}
        </h1>
      </div>

      <Stack direction="row" wrap align="center" spacing={3}>
        <p className="flex h-9 items-center gap-2 rounded-cta border border-border bg-bg px-4 text-base">
          <span aria-hidden="true" className="size-2 rounded-cta bg-car-2" />
          {t('freeCount', { count: counts.free })}
        </p>
        <p className="flex h-9 items-center gap-2 rounded-cta border border-border bg-bg px-4 text-base">
          <span aria-hidden="true" className="size-2 rounded-cta bg-car-3" />
          {t('takenCount', { count: counts.taken })}
        </p>
        {showBulk ? (
          <Button size="sm" onClick={onBulk}>
            {t('bulkReservation')}
          </Button>
        ) : null}
      </Stack>
    </Stack>
  );
}

/**
 * The status banner above the map.
 *
 * There is always exactly one: `overview.day` always carries a `window`, and
 * each of its three states has one true sentence. See `doc/decision/0122-*`
 * for why the design's `showLockState` prototype prop is not a hiding rule.
 *
 * `role="status"` so a screen reader is told when the window changes under a
 * page that is already open — which an admin flipping `lockMode` does, through
 * a refetch, without the user navigating anywhere.
 */
export function WindowBanner({ banner }: { readonly banner: BannerView }) {
  const t = useTranslations('lot');
  const isSuccess = banner.tone === 'success';

  return (
    <Stack
      direction="row"
      align="center"
      spacing={3}
      role="status"
      className={cx(
        'mb-5 rounded-md border px-4 py-3',
        isSuccess
          ? 'border-brand-green bg-brand-green-100'
          : 'border-brand-yellow bg-brand-yellow-100'
      )}
    >
      <span
        aria-hidden="true"
        className={cx(
          'inline-flex size-6 shrink-0 items-center justify-center rounded-xs text-sm font-bold',
          isSuccess ? 'bg-brand-green text-fg-on-green' : 'bg-brand-yellow text-fg-on-yellow'
        )}
      >
        {isSuccess ? '✓' : '⊘'}
      </span>
      <p className="text-base leading-snug text-fg">{t(banner.messageKey, banner.values)}</p>
    </Stack>
  );
}

/**
 * The board has stopped updating itself.
 *
 * Two states reach here and the sentence is the same for both, because it is
 * the true one for both: live updates are off, so the overview may not refresh
 * on its own. What differs is whether there is anything for the user to do.
 *
 * - **Refused** (`doc/decision/0061-*` makes a refused handshake terminal for
 *   that socket and bounds the automatic retries, precisely so a page cannot
 *   sit forever presenting a credential the gateway has already rejected).
 *   Nothing will happen without the user, so `onReconnect` is passed and the
 *   button — the intended caller of the connection's unconditional
 *   `reconnect()` — is drawn.
 * - **Dropped**, and reconnecting on its own. `onReconnect` is omitted and the
 *   notice is the quieter, buttonless variant: a control that duplicates what
 *   is already in progress invites a click that changes nothing.
 *
 * One `realtimeRejected` string covers both. The key is named for the state it
 * was written for, but the sentence names neither — it says the connection is
 * down and what that means for the screen — and inventing a second, identical
 * string so the two keys could differ would be catalogue noise.
 */
export function RealtimeNotice({
  onReconnect,
}: {
  /** Omitted for a drop the connection is already recovering from. */
  readonly onReconnect?: (() => void) | undefined;
}) {
  const t = useTranslations('lot');

  return (
    <Stack
      direction="row"
      wrap
      align="center"
      spacing={3}
      role="status"
      className="mb-5 rounded-md border border-brand-yellow bg-brand-yellow-100 px-4 py-3"
    >
      <p className="flex-1 text-base leading-snug text-fg">{t('realtimeRejected')}</p>
      {onReconnect === undefined ? null : (
        <Button variant="secondary" size="sm" onClick={onReconnect}>
          {t('realtimeReconnect')}
        </Button>
      )}
    </Stack>
  );
}
