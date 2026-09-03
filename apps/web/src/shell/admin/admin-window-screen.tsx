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

import type { MonthWindowOverview, ReservationLockMode } from '@lets-park/contract';
import { Badge, Stepper, Toast } from '@lets-park/design-system/primitives';
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
import { ScreenError, ScreenLoading } from '../screen-state';
import { useAdminWriteError } from './admin-errors';
import { LockModeChoice } from './lock-mode-choice';

/** Badge colour per state, matching the design's green / yellow / grey pills. */
const STATE_TONE: Record<MonthLockState, BadgeTone> = {
  OPEN: 'success',
  LOCKED: 'warning',
  NOT_YET_OPEN: 'neutral',
};

export interface AdminWindowScreenProps {
  readonly isPending: boolean;
  readonly isError: boolean;
  readonly error: unknown;
  readonly onRetry: () => void;
  /** `undefined` exactly when `isPending || isError`. */
  readonly openDaysBefore: number | undefined;
  /** `undefined` exactly when `isPending || isError`. */
  readonly lockMode: ReservationLockMode | undefined;
  /** The months to list, ascending, as `admin.window.months` returned them. */
  readonly months: readonly MonthWindowOverview[];
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
  isPending,
  isError,
  error,
  onRetry,
  openDaysBefore,
  lockMode,
  months,
  today,
  onChange,
  isSaving,
  saveError,
  isSaved,
}: AdminWindowScreenProps) {
  const t = useTranslations('admin');
  const describeWriteError = useAdminWriteError();

  if (isPending) {
    return <ScreenLoading />;
  }

  if (isError || openDaysBefore === undefined || lockMode === undefined) {
    return <ScreenError error={error} onRetry={onRetry} headingLevel={3} />;
  }

  const saveErrorMessage = describeWriteError('windowUpdate', saveError);

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <section
        aria-label={t('windowOpenTitle')}
        className="flex flex-col gap-5 rounded-lg border border-border bg-bg p-6"
      >
        <div>
          <h3 className="text-lg font-bold text-fg">{t('windowOpenTitle')}</h3>
          <p className="mt-2 text-sm leading-relaxed text-fg-3">{t('windowOpenDescription')}</p>
        </div>

        <div className="flex flex-col gap-3">
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
        </div>

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
      </section>

      <section
        aria-label={t('windowMonthsTitle')}
        className="flex flex-col rounded-lg border border-border bg-bg"
      >
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
      </section>
    </div>
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
      <Badge tone={STATE_TONE[month.state]}>{t(`windowState${month.state}`)}</Badge>
    </li>
  );
}
