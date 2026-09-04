'use client';

import { formatDayAndMonth, formatWeekdayName } from '@lets-park/i18n';
import type { useTranslations } from '@lets-park/i18n';
import { Badge } from '@lets-park/design-system/primitives';
import type { BadgeTone } from '@lets-park/design-system/primitives';
import {
  toBadgeMessage,
  toScheduleRows,
  type BulkBadgeView,
  type BulkDayOutcomeView,
} from './bulk-view';

const BADGE_TONES: Record<BulkBadgeView['kind'], BadgeTone> = {
  ASSIGNED_PREFERRED: 'success',
  ASSIGNED: 'info',
  QUEUED: 'warning',
  UNAVAILABLE: 'neutral',
};

export function badgeLabel(badge: BulkBadgeView, t: ReturnType<typeof useTranslations>): string {
  const message = toBadgeMessage(badge);
  return t(message.messageKey, message.values);
}

/**
 * The schedule a batch of days resolves to — `reservation.previewBulk`'s
 * proposal and `reservation.confirmBulk`'s result both print the same rows
 * through this component, so the two steps of the bulk-reservation modal
 * (`../bulk-modal.tsx`) quote the same rendering rather than each keeping
 * its own copy.
 */
export interface CalendarTableProps {
  readonly days: readonly BulkDayOutcomeView[];
  readonly t: ReturnType<typeof useTranslations>;
}

export function CalendarTable({ days, t }: CalendarTableProps) {
  // No empty-list branch: both procedures answer one entry per requested day
  // and the call to action is disabled at zero selection, so `rows` cannot be
  // empty. A branch that cannot render is copy nobody will ever proof-read
  // (`doc/decision/0021-*`'s unreachable-member rule, applied to a catalog).
  // Only a preview that filtered days out of its response would change that.
  const rows = toScheduleRows(days);
  return (
    <ul className="flex flex-col gap-2">
      {rows.map((row) => (
        <li
          key={row.date}
          className="flex flex-wrap items-center justify-between gap-3 rounded-sm border border-border px-4 py-3"
        >
          <span className="text-base text-fg">
            {formatDayAndMonth(row.date)} · {formatWeekdayName(row.date)}
          </span>
          <span className="flex items-center gap-3">
            {row.spotLabel === null ? null : (
              <span className="text-sm font-bold text-fg-2">{row.spotLabel}</span>
            )}
            <Badge tone={BADGE_TONES[row.badge.kind]}>{badgeLabel(row.badge, t)}</Badge>
          </span>
        </li>
      ))}
    </ul>
  );
}
