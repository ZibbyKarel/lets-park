'use client';

import { useId } from 'react';
import type { ParkingSpot } from '@lets-park/contract';
import { Stack } from '@lets-park/design-system/primitives';
import { useTranslations } from '@lets-park/i18n';
import { toCategoryCounts } from './spots-view';

/**
 * The band under the table header: one chip per category with its count.
 *
 * What is counted, and why inactive spots are in it, is
 * {@link toCategoryCounts}.
 */
export function CategoryBand({ spots }: { readonly spots: readonly ParkingSpot[] }) {
  const t = useTranslations('admin');
  const labelId = useId();

  return (
    // A named group, so the band is distinguishable from the table's own
    // "Kategorie" column heading — to a screen reader as much as to a test.
    <Stack role="group" aria-labelledby={labelId} direction="row" align="center" wrap spacing={3}>
      <span id={labelId} className="text-xs font-bold uppercase tracking-caps text-fg-3">
        {t('spotsCategories')}
      </span>
      {toCategoryCounts(spots).map(({ group, count }) => (
        <span
          key={group}
          className="inline-flex h-8 items-center gap-2 rounded-cta bg-bg-muted px-3 text-sm font-medium text-fg"
        >
          {group}
          <span className="text-fg-3">{count}</span>
        </span>
      ))}
      <span className="text-xs text-fg-3">{t('spotsCategoriesFixed')}</span>
    </Stack>
  );
}
