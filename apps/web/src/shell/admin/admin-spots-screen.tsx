'use client';

/**
 * The "Parkovací místa" tab (`doc/design/screens/04-admin-spots.png`): the spot
 * list, an inline category picker and activity switch per row, and add / edit /
 * delete.
 *
 * ## "Smazat" retires, it never deletes
 *
 * The button says *Smazat* because the design says so, but the procedure behind
 * it is `admin.spot.deactivate`, which sets `active: false`. A spot row can
 * never be deleted — `Reservation`, `WaitlistEntry` and `AuditLog` all point at
 * it — and the API refuses even the soft delete while somebody still holds the
 * spot from today onwards. That `CONFLICT` gets its own Czech sentence here,
 * because the generic one ("somebody else made the same change") would be a
 * false explanation. See
 * `doc/decision/0163-smazat-retires-a-spot-and-says-so-when-it-cannot.md`.
 *
 * ## The category chips are counts, not editors
 *
 * The design draws removable chips and an "Přidat kategorii" field. A category
 * is `PARKING_GROUPS` — a closed enum in `libs/shared-types` backed by a Postgres
 * enum column — so there is nothing here that could add or remove one without a
 * schema change. The band renders the counts and says the list is fixed rather
 * than offering a control that cannot work. See
 * `doc/decision/0164-parking-categories-stay-a-closed-enum.md`.
 *
 * Presentational: `./admin-spots-panel.tsx` is the connected half.
 */

import { useId, useState } from 'react';
import * as z from 'zod';
import type {
  CreateSpotInput,
  ParkingGroup,
  ParkingSpot,
  SpotListOutput,
} from '@lets-park/contract';
import { FormField, FormProvider, useAppForm } from '@lets-park/form';
import {
  Badge,
  Button,
  Input,
  Modal,
  Select,
  Switch,
  Toast,
} from '@lets-park/design-system/primitives';
import { ConfirmDialog, DataTable } from '@lets-park/design-system/compounds';
import type { DataTableColumn } from '@lets-park/design-system/compounds';
import { PARKING_GROUPS, useTranslations } from '@lets-park/i18n';
import { ScreenDataGuard, type ScreenData } from '../screen-state';
import { useAdminWriteError, type AdminWriteFailure } from './admin-errors';
import {
  isDialogSaving,
  shouldShowFailureIn,
  toCategoryCounts,
  type FailureSurface,
  type SpotDialog,
} from './spots-view';

/** How a spot stands today, as the day overview reports it. */
export interface SpotToday {
  /** Name of whoever holds the spot today, or `null` when it is free. */
  readonly holderName: string | null;
}

export interface AdminSpotsScreenProps {
  readonly onRetry: () => void;
  /** The spot list as one state. Inactive spots included. */
  readonly spots: ScreenData<SpotListOutput>;
  /**
   * Today's state per spot id. A spot missing from the map has no state to show
   * — an inactive spot is not in the day overview at all — and renders as a
   * dash rather than as "Volné", which would be a claim.
   */
  readonly todayBySpotId: ReadonlyMap<string, SpotToday>;
  /** Resolves when the spot exists; rejects to keep the dialog open. */
  readonly onCreate: (input: CreateSpotInput) => Promise<void>;
  /** Same contract, for a label/group edit. */
  readonly onSave: (input: { id: string; label: string; group: ParkingGroup }) => Promise<void>;
  /** Inline activity switch. Fire-and-forget: the row reports through `rowError`. */
  readonly onActiveChange: (id: string, active: boolean) => void;
  /** Resolves when the spot is retired; rejects to keep the dialog open. */
  readonly onDeactivate: (id: string) => Promise<void>;
  /**
   * A write is in flight for this spot id, if any. Scopes the row-level
   * disabling: only the row being written is frozen, not the whole table.
   */
  readonly pendingSpotId: string | null;
  /** Any write is in flight — including a create, which has no id yet. */
  readonly isSaving: boolean;
  /**
   * The failed write, or `null` when there is none. See
   * {@link AdminWriteFailure} for why the error and its origin are one value.
   */
  readonly writeFailure: AdminWriteFailure | null;
  /**
   * Throws away whatever `writeFailure` holds.
   *
   * Called on every dialog change — opened, swapped, cancelled or closed after
   * a success. A failure describes one attempt at one spot; the moment the
   * admin moves to a different dialog it describes nothing on screen, and
   * leaving it in state is how it gets re-shown under the wrong heading. See
   * `doc/decision/0167-*`.
   */
  readonly onDiscardFailure: () => void;
}

/** Field-level validation. The contract re-checks the same shape on arrival. */
const spotFormSchema = z.object({
  label: z.string().trim().min(1),
  group: z.enum(PARKING_GROUPS),
});
type SpotFormValues = z.infer<typeof spotFormSchema>;

export function AdminSpotsScreen({
  onRetry,
  spots,
  todayBySpotId,
  onCreate,
  onSave,
  onActiveChange,
  onDeactivate,
  pendingSpotId,
  isSaving,
  writeFailure,
  onDiscardFailure,
}: AdminSpotsScreenProps) {
  const t = useTranslations('admin');
  const describeWriteError = useAdminWriteError();
  const [dialog, setDialog] = useState<SpotDialog | null>(null);

  /**
   * The only way the dialog changes. Every open, swap, cancel and
   * close-on-success goes through here so that the failure on screen is
   * discarded with it — see `onDiscardFailure`.
   */
  function changeDialog(next: SpotDialog | null) {
    onDiscardFailure();
    setDialog(next);
  }

  /**
   * The sentence to print on `where`, or `null` when nothing belongs there.
   *
   * {@link shouldShowFailureIn} holds the rule — which surface a failure is
   * shown on, and which surfaces could have produced it at all; this adds the
   * two things only the screen has, the failure itself and the translation of
   * it. Each call site therefore renders at most one `Toast`.
   */
  function failureShownIn(where: FailureSurface): string | null {
    if (writeFailure === null) {
      return null;
    }
    return shouldShowFailureIn(writeFailure.from, dialog?.kind ?? null, where)
      ? describeWriteError(writeFailure.from, writeFailure.error)
      : null;
  }

  const dialogSaving = isDialogSaving(isSaving, dialog, pendingSpotId);

  const columns: DataTableColumn<ParkingSpot>[] = [
    {
      id: 'label',
      header: t('spotsColumnLabel'),
      sortValue: (spot) => spot.label,
      cell: (spot) => (
        <span className="inline-flex items-center gap-2">
          <span className="font-bold text-fg">{spot.label}</span>
          {spot.active ? null : <Badge tone="neutral">{t('spotsInactive')}</Badge>}
        </span>
      ),
    },
    {
      id: 'group',
      header: t('spotsColumnGroup'),
      width: '160px',
      cell: (spot) => (
        <Select
          aria-label={t('spotsGroupSelectLabel', { label: spot.label })}
          value={spot.group}
          disabled={pendingSpotId === spot.id}
          onChange={(event) =>
            void onSave({
              id: spot.id,
              label: spot.label,
              group: event.currentTarget.value as ParkingGroup,
            }).catch(() => {
              // The row's failure is rendered by `writeFailure` above the table;
              // an unhandled rejection here would only add noise to the console.
            })
          }
        >
          {PARKING_GROUPS.map((group) => (
            <option key={group} value={group}>
              {group}
            </option>
          ))}
        </Select>
      ),
    },
    {
      id: 'today',
      header: t('spotsColumnToday'),
      cell: (spot) => {
        const today = todayBySpotId.get(spot.id);
        if (today === undefined) {
          return <span className="text-fg-3">{t('spotsTodayUnknown')}</span>;
        }
        return today.holderName === null ? (
          <span className="text-fg-3">{t('dayStatusFree')}</span>
        ) : (
          <span className="text-fg">{t('dayStatusTaken', { name: today.holderName })}</span>
        );
      },
    },
    {
      id: 'active',
      header: t('spotsColumnActive'),
      width: '110px',
      cell: (spot) => (
        <Switch
          tone="success"
          checked={spot.active}
          aria-label={t('spotsActiveToggleLabel', { label: spot.label })}
          disabled={pendingSpotId === spot.id}
          onCheckedChange={(next) => onActiveChange(spot.id, next)}
        />
      ),
    },
    {
      id: 'actions',
      header: <span className="sr-only">{t('spotsColumnActions')}</span>,
      align: 'end',
      width: '210px',
      cell: (spot) => (
        <span className="inline-flex items-center gap-2">
          <Button
            variant="secondary"
            disabled={pendingSpotId === spot.id}
            onClick={() => changeDialog({ kind: 'edit', spot })}
          >
            {t('spotsEdit')}
          </Button>
          <Button
            variant="danger"
            disabled={pendingSpotId === spot.id}
            onClick={() => changeDialog({ kind: 'delete', spot })}
          >
            {t('spotsDelete')}
          </Button>
        </span>
      ),
    },
  ];

  const tableError = failureShownIn('table');
  // Only the delete dialog carries its failure inside itself; the form dialog
  // takes the same value through its own `errorMessage` prop.
  const deleteError = dialog?.kind === 'delete' ? failureShownIn('dialog') : null;

  return (
    <ScreenDataGuard state={spots} onRetry={onRetry} headingLevel={3}>
      {(loaded) => (
        <div className="flex flex-col gap-4">
          {tableError ? <Toast tone="danger">{tableError}</Toast> : null}

          <DataTable
            columns={columns}
            data={[...loaded.spots]}
            getRowId={(spot) => spot.id}
            title={t('spotsTitle')}
            description={t('spotsDescription')}
            actions={
              <Button variant="primary" size="lg" onClick={() => changeDialog({ kind: 'create' })}>
                {t('spotsAdd')}
              </Button>
            }
            toolbar={<CategoryBand spots={loaded.spots} />}
            defaultSort={{ columnId: 'label', direction: 'asc' }}
            minWidth="900px"
            emptyTitle={t('spotsEmpty')}
            emptyDescription={t('spotsEmptyDescription')}
          />

          {dialog?.kind === 'create' || dialog?.kind === 'edit' ? (
            <SpotFormDialog
              // A fresh form per spot. Without it an edit→edit transition would
              // reuse the mounted form and its previous `defaultValues`.
              key={dialog.kind === 'edit' ? dialog.spot.id : 'create'}
              spot={dialog.kind === 'edit' ? dialog.spot : null}
              errorMessage={failureShownIn('dialog')}
              saving={dialogSaving}
              onCancel={() => changeDialog(null)}
              onSubmit={async (values) => {
                if (dialog.kind === 'edit') {
                  await onSave({ id: dialog.spot.id, ...values });
                } else {
                  await onCreate(values);
                }
                changeDialog(null);
              }}
            />
          ) : null}

          <ConfirmDialog
            open={dialog?.kind === 'delete'}
            title={t('spotsDeleteTitle', {
              label: dialog?.kind === 'delete' ? dialog.spot.label : '',
            })}
            description={t('spotsDeleteDescription')}
            confirmLabel={t('spotsDeleteConfirm')}
            cancelLabel={t('spotsCancel')}
            tone="danger"
            loading={dialogSaving}
            onConfirm={() => {
              if (dialog?.kind !== 'delete') {
                return;
              }
              void onDeactivate(dialog.spot.id).then(
                () => changeDialog(null),
                () => {
                  // Left open on purpose: the sentence below is the retry
                  // affordance, and closing would hide why nothing happened.
                }
              );
            }}
            onCancel={() => changeDialog(null)}
          >
            {deleteError === null ? null : <Toast tone="danger">{deleteError}</Toast>}
          </ConfirmDialog>
        </div>
      )}
    </ScreenDataGuard>
  );
}

/**
 * The band under the table header: one chip per category with its count.
 *
 * What is counted, and why inactive spots are in it, is
 * {@link toCategoryCounts}.
 */
function CategoryBand({ spots }: { readonly spots: readonly ParkingSpot[] }) {
  const t = useTranslations('admin');
  const labelId = useId();

  return (
    // A named group, so the band is distinguishable from the table's own
    // "Kategorie" column heading — to a screen reader as much as to a test.
    <div role="group" aria-labelledby={labelId} className="flex flex-wrap items-center gap-3">
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
    </div>
  );
}

interface SpotFormDialogProps {
  /**
   * The spot being edited, or `null` when adding a new one — narrowed to the
   * two fields the form actually edits, so the dialog cannot start reading
   * `active` or an id it has no business acting on.
   */
  readonly spot: Pick<ParkingSpot, 'label' | 'group'> | null;
  readonly errorMessage: string | null;
  readonly saving: boolean;
  readonly onCancel: () => void;
  readonly onSubmit: (values: SpotFormValues) => Promise<void>;
}

/** Add / edit, in the same `Modal` the settings screen uses. */
function SpotFormDialog({ spot, errorMessage, saving, onCancel, onSubmit }: SpotFormDialogProps) {
  const t = useTranslations('admin');

  const form = useAppForm<SpotFormValues>({
    schema: spotFormSchema,
    defaultValues: {
      label: spot?.label ?? '',
      group: spot?.group ?? PARKING_GROUPS[0],
    },
  });

  const submit = form.handleSubmit((values) => {
    void onSubmit(values).catch(() => {
      // `errorMessage` renders inside the still-open modal; see `ConfirmDialog`
      // above for the same shape.
    });
  });

  return (
    <Modal
      open
      onClose={onCancel}
      title={spot === null ? t('spotsCreateTitle') : t('spotsEditTitle', { label: spot.label })}
      size="sm"
      footer={
        <>
          <Button variant="secondary" size="lg" onClick={onCancel} disabled={saving}>
            {t('spotsCancel')}
          </Button>
          <Button variant="primary" size="lg" onClick={submit} loading={saving}>
            {t('spotsSave')}
          </Button>
        </>
      }
    >
      <FormProvider {...form}>
        <div className="flex flex-col gap-5">
          <FormField
            name="label"
            render={({ field, error: fieldError }) => (
              <Input
                label={t('spotsLabelField')}
                error={fieldError ? t('spotsLabelRequired') : undefined}
                {...field}
              />
            )}
          />
          <FormField
            name="group"
            render={({ field, error: fieldError }) => (
              <Select label={t('spotsGroupField')} error={fieldError} {...field}>
                {PARKING_GROUPS.map((group) => (
                  <option key={group} value={group}>
                    {group}
                  </option>
                ))}
              </Select>
            )}
          />
          {errorMessage ? <Toast tone="danger">{errorMessage}</Toast> : null}
        </div>
      </FormProvider>
    </Modal>
  );
}
