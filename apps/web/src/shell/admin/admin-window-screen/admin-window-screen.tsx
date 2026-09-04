'use client';

/**
 * The "Rezervační okno" tab (`doc/design/screens/05-admin-window.png`): the
 * settings card on the left, the per-month state list on the right.
 *
 * ## There is no Save button, because the design has none
 *
 * Both controls write on change, the same way the switches in the other two
 * tabs do. That is what the design draws, and it is what makes the right-hand
 * card meaningful: it says "podle nastavení vlevo", i.e. it is a live read of
 * the setting next to it, and a form with an unsaved pending state would make
 * that sentence false half the time. The cost — one request per stepper press —
 * is bounded by the range (1–31) and by this being an admin screen a handful of
 * people touch a handful of times.
 *
 * ## The month list never prints a date it cannot stand behind
 *
 * `windowFrom`/`windowTo` are the range the AUTO rule *would* produce. Under a
 * forced lock mode they describe a hypothetical
 * (`libs/contract/src/schemas/reservation-window.ts`), so the row says so in
 * words — "automaticky by bylo otevřeno …" — instead of stating it as fact.
 *
 * Presentational: `./admin-window-panel.tsx` is the connected half.
 */

import type {
  ListMonthWindowsOutput,
  MonthWindowOverview,
  ReservationLockMode,
} from '@lets-park/contract';
import { Badge, Card, Grid, Stack, Stepper, Toast } from '@lets-park/design-system/primitives';
import type { BadgeTone } from '@lets-park/design-system/primitives';
import {
  formatDayAndMonth,
  formatDayMonthAndYear,
  formatMonthAndYear,
  MAX_OPEN_DAYS_BEFORE,
  MIN_OPEN_DAYS_BEFORE,
  RESERVATION_LOCK_MODES,
  startOfYearMonth,
  useTranslations,
} from '@lets-park/i18n';
import type { DateOnly, MonthLockState } from '@lets-park/i18n';
import { ScreenDataGuard } from '../../screen-state/screen-state';
import type { ScreenData } from '../../screen-state/screen-state';
import { useAdminWriteError } from '../admin-errors';
import { LockModeChoice } from '../lock-mode-choice/lock-mode-choice';

/**
 * Badge colour per state, straight off `05-admin-window.png`: `Otevřeno` is a
 * green pill, `Uzamčeno` a yellow one, `Zatím neotevřeno` a grey one.
 *
 * Exported so a spec can pin it. The colour is not decoration on this screen —
 * it is the at-a-glance signal an admin reads before the words, so a locked
 * month rendered green is a lie that no amount of correct text undoes.
 *
 * `BANNER_STATE_TONE` in `./window-view.ts` is its counterpart for the
 * overview banner: same three values, a different `Tone` type, a different
 * design artifact, and a pin of its own. See that docblock for why they stay
 * two maps.
 */
export const BADGE_STATE_TONE: Record<MonthLockState, BadgeTone> = {
  OPEN: 'success',
  LOCKED: 'warning',
  NOT_YET_OPEN: 'neutral',
};

export interface AdminWindowScreenProps {
  /**
   * The settings and the months they were derived under, exactly as
   * `admin.window.months` returned them — one value, because they came from one
   * response and a form that disagreed with the list beside it would be lying
   * about the same moment.
   */
  readonly reservationWindow: ScreenData<ListMonthWindowsOutput>;
  readonly onRetry: () => void;
  /** Today in Europe/Prague — the date the states were derived against. */
  readonly today: DateOnly;
  /** A full replacement of both fields; the contract has no patch. */
  readonly onChange: (next: { openDaysBefore: number; lockMode: ReservationLockMode }) => void;
  readonly isSaving: boolean;
  /** Whatever the failing `admin.window.update` call threw. */
  readonly saveError: unknown;
  /** The last save succeeded and nothing has changed since. */
  readonly isSaved: boolean;
}

export function AdminWindowScreen({
  reservationWindow,
  onRetry,
  today,
  onChange,
  isSaving,
  saveError,
  isSaved,
}: AdminWindowScreenProps) {
  const t = useTranslations('admin');
  const describeWriteError = useAdminWriteError();

  const saveErrorMessage = describeWriteError('windowUpdate', saveError);

  return (
    <ScreenDataGuard state={reservationWindow} onRetry={onRetry} headingLevel={3}>
      {({ settings: { openDaysBefore, lockMode }, months }) => (
        <Grid columns={{ base: 1, md: 2 }} spacing={6}>
          <section aria-label={t('windowOpenTitle')}>
            <Card className="h-full">
              <Stack spacing={5}>
                <div>
                  <h3 className="text-lg font-bold text-fg">{t('windowOpenTitle')}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-fg-3">
                    {t('windowOpenDescription')}
                  </p>
                </div>

                <Stack spacing={3}>
                  <span className="text-xs font-bold uppercase tracking-caps text-fg-3">
                    {t('windowDaysLabel')}
                  </span>
                  <Stepper
                    label={t('windowDaysLabel')}
                    value={openDaysBefore}
                    min={MIN_OPEN_DAYS_BEFORE}
                    max={MAX_OPEN_DAYS_BEFORE}
                    disabled={isSaving}
                    decrementLabel={t('windowDaysDecrement')}
                    incrementLabel={t('windowDaysIncrement')}
                    formatValue={(count) => t('windowDaysValue', { count })}
                    onValueChange={(next) => onChange({ openDaysBefore: next, lockMode })}
                  />
                </Stack>

                <LockModeChoice
                  label={t('windowLockLabel')}
                  value={lockMode}
                  disabled={isSaving}
                  options={RESERVATION_LOCK_MODES.map((mode) => ({
                    value: mode,
                    label: t(`windowLock${mode}`),
                  }))}
                  onValueChange={(next) => onChange({ openDaysBefore, lockMode: next })}
                />

                {saveErrorMessage ? <Toast tone="danger">{saveErrorMessage}</Toast> : null}
                {saveErrorMessage === null && isSaved ? (
                  <Toast tone="success">{t('windowSaved')}</Toast>
                ) : null}
              </Stack>
            </Card>
          </section>

          <section aria-label={t('windowMonthsTitle')}>
            <Card padding={0} className="h-full">
              <Stack>
                <div className="border-b border-divider px-6 py-5">
                  <h3 className="text-lg font-bold text-fg">{t('windowMonthsTitle')}</h3>
                  <p className="mt-1 text-sm text-fg-3">
                    {t('windowMonthsDescription', { today: formatDayMonthAndYear(today) })}
                  </p>
                </div>
                <ul className="flex flex-col">
                  {months.map((month) => (
                    <MonthRow key={month.month} month={month} />
                  ))}
                </ul>
              </Stack>
            </Card>
          </section>
        </Grid>
      )}
    </ScreenDataGuard>
  );
}

function MonthRow({ month }: { readonly month: MonthWindowOverview }) {
  const t = useTranslations('admin');

  const range = {
    from: formatDayAndMonth(month.windowFrom),
    to: formatDayAndMonth(month.windowTo),
  };

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 border-b border-divider px-6 py-4 last:border-b-0">
      <div>
        <p className="font-bold text-fg">{formatMonthAndYear(startOfYearMonth(month.month))}</p>
        <p className="mt-0.5 text-sm text-fg-3">
          {month.lockMode === 'AUTO'
            ? t('windowMonthRangeAuto', range)
            : t('windowMonthRangeForced', range)}
        </p>
      </div>
      <Badge tone={BADGE_STATE_TONE[month.state]}>{t(`windowState${month.state}`)}</Badge>
    </li>
  );
}
