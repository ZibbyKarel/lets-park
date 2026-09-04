'use client';

/**
 * The map: asphalt, painted lines, and one bay per parking spot.
 *
 * **Presentational.** Props in, callbacks out, no fetching and no query cache
 * — every decision arrived already made, as a `SpotGroupView` from
 * `./lot-view`. That split is what lets the interesting logic be tested
 * without a DOM, and lets this file be checked for what it draws.
 *
 * It lives in `apps/web` rather than in `libs/design-system/compounds`
 * because it is domain UI: a "parking bay" is not a design-system concept,
 * and a compound that knew about reservations and waitlists would stop being
 * presentation-only. Composing tokens, primitives and compounds into domain
 * UI is app work (`plan.md`, §"Design-system-first").
 *
 * Colours, radii and spacing are token utilities throughout. The four
 * geometry values a parking bay needs and the spacing scale cannot express
 * are `--lot-*` custom properties in `app/global.css`.
 */

import { Box, Stack } from '@lets-park/design-system/primitives';
import { useTranslations } from '@lets-park/i18n';
import type { SpotGroupView } from '../lot-view';
import { SpotTile } from './spot-tile';

export interface LotGridProps {
  readonly groups: readonly SpotGroupView[];
  readonly onOpenSpot: (spotId: string) => void;
  readonly onAdminOpenSpot: (spotId: string) => void;
}

/** The whole map: one labelled band per group, then the legend. */
export function LotGrid({ groups, onOpenSpot, onAdminOpenSpot }: LotGridProps) {
  const t = useTranslations('lot');

  return (
    <Box padding={4} radius="lg" className="lot-asphalt bg-neutral-600 shadow-lg">
      {groups.map((group) => (
        <section
          key={group.group}
          aria-label={t('groupLabel', { group: group.group })}
          className="mb-5 rounded-md border border-neutral-0/15 bg-brand-dark/10 px-3 pb-5 pt-4"
        >
          <Stack direction="row" align="center" spacing={3} className="mb-4">
            <h2 className="text-xs font-bold uppercase tracking-caps text-neutral-0/90">
              {group.group}
            </h2>
            <span aria-hidden="true" className="h-px flex-1 bg-neutral-0/15" />
            <span className="text-xs text-neutral-0/50">
              {t('groupFree', { free: group.freeCount, total: group.totalCount })}
            </span>
          </Stack>

          <Stack
            direction="row"
            wrap
            className="border-l-[length:var(--lot-line-w)] border-neutral-0/50"
          >
            {group.spots.map((spot) => (
              <SpotTile
                key={spot.spotId}
                spot={spot}
                onOpen={onOpenSpot}
                onAdminOpen={onAdminOpenSpot}
              />
            ))}
          </Stack>
        </section>
      ))}

      <ul className="flex list-none flex-wrap gap-5 px-1 text-xs text-neutral-0/70">
        <li className="flex items-center gap-2">
          <span aria-hidden="true" className="size-3 rounded-photos bg-car-1" />
          {t('legendTaken')}
        </li>
        <li className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="size-3 rounded-photos border-2 border-dashed border-neutral-0/50"
          />
          {t('legendFree')}
        </li>
        <li className="flex items-center gap-2">
          <span aria-hidden="true" className="size-3 rounded-photos bg-brand-yellow" />
          {t('legendWaitlist')}
        </li>
      </ul>
    </Box>
  );
}
