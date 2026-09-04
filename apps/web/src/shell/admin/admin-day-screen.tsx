'use client';

/**
 * The "Přehled parkoviště" tab: an admin's read of one day
 * (`doc/design/screens/06-admin-overview.png`).
 *
 * ## What this renders, and what it deliberately does not
 *
 * The design for this tab is the **lot screen** — a page of its own, with the
 * painted car grid, the date bar along the bottom and no tab strip on it. That
 * screen belongs to Task 24 and is the only place the grid is drawn; building a
 * second one here would give the product two implementations of the same canvas
 * that could disagree about the same day. See
 * `doc/decision/0161-the-admin-day-tab-summarises-the-lot-it-does-not-redraw-it.md`.
 *
 * What is here instead is the part of that screen an admin actually needs while
 * they are in `/admin`, drawn out of pieces that already exist: the date, the
 * free/taken counts, the window banner, and one `DataTable` row per spot saying
 * who holds it and how many people are queued. The link at the top opens the lot
 * screen for the grid itself.
 *
 * Presentational: every value arrives as a prop, and nothing here fetches. The
 * connected half is `./admin-day-panel.tsx`, the same split as
 * `settings-screen.tsx` / `settings-page.tsx`.
 */

import type { DayOverviewOutput, DaySpotOverview } from '@lets-park/contract';
import { Badge, Button, Stack } from '@lets-park/design-system/primitives';
import { DataTable } from '@lets-park/design-system/compounds';
import type { DataTableColumn } from '@lets-park/design-system/compounds';
import { formatFullDate, useTranslations } from '@lets-park/i18n';
import type { DateOnly } from '@lets-park/i18n';
import { ScreenDataGuard } from '../screen-state';
import type { ScreenData } from '../screen-state';
import { WindowBanner } from './window-banner';

export interface AdminDayScreenProps {
  /** The day being shown, `YYYY-MM-DD` in Europe/Prague. */
  readonly date: DateOnly;
  /** The day itself, or the reason it is not on screen yet. */
  readonly day: ScreenData<DayOverviewOutput>;
  readonly onRetry: () => void;
  /**
   * Navigates to the lot screen, where the painted grid lives. A callback
   * rather than an `href` because this component stays free of the router —
   * see the split described at the top of the file.
   */
  readonly onOpenLot: () => void;
}

export function AdminDayScreen({ date, day, onRetry, onOpenLot }: AdminDayScreenProps) {
  const t = useTranslations('admin');

  const columns: DataTableColumn<DaySpotOverview>[] = [
    {
      id: 'label',
      header: t('dayColumnLabel'),
      sortValue: (row) => row.spot.label,
      cell: (row) => <span className="font-bold text-fg">{row.spot.label}</span>,
    },
    {
      id: 'group',
      header: t('dayColumnGroup'),
      sortValue: (row) => row.spot.group,
      cell: (row) => <span className="text-fg-2">{row.spot.group}</span>,
    },
    {
      id: 'status',
      header: t('dayColumnStatus'),
      // Free sorts before taken, and taken rows sort by holder — a plain
      // boolean would put every occupied spot in one undifferentiated block.
      sortValue: (row) =>
        row.reservation === null ? '' : `1 ${row.reservation.user.name.toLocaleLowerCase('cs-CZ')}`,
      cell: (row) =>
        row.reservation === null ? (
          <span className="text-fg-3">{t('dayStatusFree')}</span>
        ) : (
          <span className="text-fg">
            {t('dayStatusTaken', { name: row.reservation.user.name })}
          </span>
        ),
    },
    {
      id: 'queue',
      header: t('dayColumnQueue'),
      align: 'end',
      sortValue: (row) => row.waitlistCount,
      cell: (row) =>
        row.waitlistCount === 0 ? (
          <span className="text-fg-3">{t('dayQueueNone')}</span>
        ) : (
          <Badge tone="warning">{t('dayQueueCount', { count: row.waitlistCount })}</Badge>
        ),
    },
  ];

  return (
    <ScreenDataGuard state={day} onRetry={onRetry} headingLevel={3}>
      {(overview) => {
        const free = overview.spots.filter((row) => row.reservation === null).length;
        const taken = overview.spots.length - free;

        return (
          <Stack spacing={6}>
            <Stack direction="row" wrap align="center" justify="between" spacing={4}>
              <div>
                <p className="text-xs font-bold uppercase tracking-caps text-fg-3">
                  {t('dayEyebrow')}
                </p>
                <h3 className="mt-1 text-2xl font-bold tracking-tight text-fg">
                  {formatFullDate(date)}
                </h3>
              </div>
              <Stack direction="row" wrap align="center" spacing={3}>
                <CountPill dotClassName="bg-brand-green" label={t('dayFree', { count: free })} />
                <CountPill dotClassName="bg-brand-blue" label={t('dayTaken', { count: taken })} />
                <Button variant="primary" onClick={onOpenLot}>
                  {t('dayOpenLot')}
                </Button>
              </Stack>
            </Stack>

            <WindowBanner window={overview.window} />

            <DataTable
              columns={columns}
              data={overview.spots}
              getRowId={(row) => row.spot.id}
              title={t('dayTableTitle')}
              description={t('dayTableDescription')}
              defaultSort={{ columnId: 'label', direction: 'asc' }}
              minWidth="640px"
              emptyTitle={t('dayEmpty')}
              emptyDescription={t('dayEmptyDescription')}
            />
          </Stack>
        );
      }}
    </ScreenDataGuard>
  );
}

/**
 * The design's bordered count chip: a coloured dot and a number
 * (`06-admin-overview.png`). Not a `Badge` — that primitive is a solid tint pill
 * with no dot, and this one is a white pill with a border.
 */
function CountPill({ dotClassName, label }: { dotClassName: string; label: string }) {
  return (
    <span className="inline-flex h-10 items-center gap-2 rounded-cta border border-border bg-bg px-4 text-sm text-fg">
      <span aria-hidden="true" className={`size-2 rounded-cta ${dotClassName}`} />
      {label}
    </span>
  );
}
