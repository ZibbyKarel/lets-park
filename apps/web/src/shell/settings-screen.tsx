'use client';

/**
 * What `/nastaveni` renders, given a profile, the active spots, and the
 * mutation state around them — and nothing about how any of that is fetched.
 *
 * Split from `./settings-page.tsx` for the same reason `TopBar`/`AdminScreen`
 * are split from their connected wrappers: the *rules* here (which of the
 * loading/error/form states is shown, what a submit sends, when the confirm
 * dialog opens) are testable with plain props, no session, no query client and
 * no live API.
 *
 * Per `doc/design/screens/11-settings.png`, drawn with `Modal` rather than a
 * bespoke card — `doc/decision/0150-*` records why the whole screen renders as
 * that shared primitive instead of a second, hand-built dialog shell. The ICS
 * section below the form has no design to copy from; `doc/decision/0151-*`
 * records why it lives here, in the same modal, rather than on its own screen.
 */

import { useEffect, useRef, useState } from 'react';
import * as z from 'zod';
import { buildIcsFeedUrl } from '@lets-park/contract';
import type { MyProfile, ParkingSpot, UpdateMySettingsInput } from '@lets-park/contract';
import { toContractError } from '@lets-park/api-client';
import { FormField, FormProvider, useAppForm } from '@lets-park/form';
import {
  Button,
  Input,
  Modal,
  Select,
  Toast,
  type ToastTone,
} from '@lets-park/design-system/primitives';
import { ConfirmDialog } from '@lets-park/design-system/compounds';
import { useTranslations } from '@lets-park/i18n';
import { ScreenError, ScreenLoading } from './screen-state';

/** The select's empty option — clearing the preferred spot is allowed. */
const NO_PREFERRED_SPOT = '';

/** `'idle'` before any copy attempt, then the outcome of the last one. */
type CopyState = 'idle' | 'copied' | 'failed';

/**
 * Field-level validation only. The three-valued clear/set/leave-alone
 * semantics of `UpdateMySettingsInput` are applied at submit time in
 * {@link toUpdateInput} — a bare `''` here means "no licence plate" /
 * "no preferred spot", never "the value is invalid".
 */
const settingsFormSchema = z.object({
  licensePlate: z.string().max(16),
  preferredParkingSpotId: z.string(),
});
type SettingsFormValues = z.infer<typeof settingsFormSchema>;

function toUpdateInput(values: SettingsFormValues): UpdateMySettingsInput {
  const trimmedPlate = values.licensePlate.trim();
  return {
    licensePlate: trimmedPlate === '' ? null : trimmedPlate,
    preferredParkingSpotId:
      values.preferredParkingSpotId === NO_PREFERRED_SPOT ? null : values.preferredParkingSpotId,
  };
}

export interface SettingsScreenProps {
  /** The profile has not arrived yet. */
  readonly isPending: boolean;
  /** The profile could not be loaded. */
  readonly isError: boolean;
  /** Whatever the failing call threw. See `ScreenErrorProps.error`. */
  readonly error: unknown;
  readonly onRetry: () => void;
  /** `undefined` exactly when `isPending || isError`. */
  readonly profile: MyProfile | undefined;
  /** Active spots for the preferred-spot picker (`spot.list`). */
  readonly spots: readonly ParkingSpot[];
  readonly onSave: (input: UpdateMySettingsInput) => void;
  readonly isSaving: boolean;
  /** Whatever the failing `me.updateSettings` call threw. */
  readonly saveError: unknown;
  /**
   * Origin of the API (`apiOriginOf(NEXT_PUBLIC_API_URL)`, no path). Empty
   * means it could not be derived — see `app/(app)/nastaveni/page.tsx` — in
   * which case the ICS section shows its unavailable state rather than a
   * broken link, since {@link buildIcsFeedUrl} has nothing to build from.
   */
  readonly apiOrigin: string;
  /** The caller's current ICS token, or `undefined` before the profile loads. */
  readonly icsToken: string | undefined;
  /**
   * Requests a new token. Resolves once the new one has replaced the old —
   * that is the signal this component uses to close the confirmation dialog;
   * a rejection leaves it open so the user can retry.
   */
  readonly onRegenerateToken: () => Promise<void>;
  readonly isRegenerating: boolean;
  /** Whatever the failing `me.regenerateIcsToken` call threw. */
  readonly regenerateError: unknown;
  /** Called for every way out: Cancel, ×, Escape, the scrim, and a saved form. */
  readonly onClose: () => void;
}

export function SettingsScreen({
  isPending,
  isError,
  error,
  onRetry,
  profile,
  spots,
  onSave,
  isSaving,
  saveError,
  apiOrigin,
  icsToken,
  onRegenerateToken,
  isRegenerating,
  regenerateError,
  onClose,
}: SettingsScreenProps) {
  const t = useTranslations('settings');
  const shellT = useTranslations('shell');
  const errorsT = useTranslations('errors');

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [copyState, setCopyState] = useState<CopyState>('idle');

  const form = useAppForm<SettingsFormValues>({
    schema: settingsFormSchema,
    defaultValues: { licensePlate: '', preferredParkingSpotId: NO_PREFERRED_SPOT },
  });

  // The form is created once, unconditionally, so the footer's Save button
  // (which lives in `Modal`'s `footer` prop, outside `children`) can always
  // call `form.handleSubmit`. It is seeded from the profile exactly once, the
  // moment it first arrives — never again, so a background refetch (e.g. after
  // the ICS token regenerates and invalidates `me.get`) cannot silently
  // overwrite an edit in progress. Done in an effect, not during render: a
  // sibling hook's own state (react-hook-form's) must never be written while
  // this component is rendering.
  const seeded = useRef(false);
  useEffect(() => {
    if (profile && !seeded.current) {
      seeded.current = true;
      form.reset({
        licensePlate: profile.licensePlate ?? '',
        preferredParkingSpotId: profile.preferredParkingSpotId ?? NO_PREFERRED_SPOT,
      });
    }
  }, [profile, form]);

  const ready = !isPending && !isError && profile !== undefined;

  const icsFeedUrl =
    apiOrigin !== '' && icsToken !== undefined ? buildIcsFeedUrl(apiOrigin, icsToken) : undefined;

  function describeError(failure: unknown): string | null {
    if (failure == null) {
      return null;
    }
    const contractError = toContractError(failure);
    return contractError === null ? shellT('errorUnknown') : errorsT(contractError.code);
  }

  const saveErrorMessage = describeError(saveError);
  const regenerateErrorMessage = describeError(regenerateError);

  async function handleCopy() {
    if (icsFeedUrl === undefined) {
      return;
    }
    try {
      await navigator.clipboard.writeText(icsFeedUrl);
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
  }

  async function handleConfirmRegenerate() {
    try {
      await onRegenerateToken();
      setConfirmOpen(false);
      setCopyState('idle');
    } catch {
      // `regenerateErrorMessage` (derived from the caller's mutation state)
      // renders inside the still-open dialog — that is the retry affordance.
    }
  }

  return (
    <>
      <Modal
        open
        onClose={onClose}
        title={t('title')}
        description={ready ? t('description') : undefined}
        size="md"
        footer={
          ready ? (
            <>
              <Button variant="secondary" size="lg" onClick={onClose} disabled={isSaving}>
                {t('cancel')}
              </Button>
              <Button
                variant="primary"
                size="lg"
                onClick={form.handleSubmit((values) => onSave(toUpdateInput(values)))}
                loading={isSaving}
              >
                {t('save')}
              </Button>
            </>
          ) : undefined
        }
      >
        {isPending ? <ScreenLoading /> : null}
        {isError ? <ScreenError error={error} onRetry={onRetry} headingLevel={3} /> : null}

        {ready ? (
          <FormProvider {...form}>
            <div className="flex flex-col gap-5">
              <FormField
                name="licensePlate"
                render={({ field, error: fieldError }) => (
                  <Input
                    label={t('licensePlateLabel')}
                    maxLength={16}
                    error={fieldError ? t('licensePlateTooLong') : undefined}
                    {...field}
                  />
                )}
              />
              <FormField
                name="preferredParkingSpotId"
                render={({ field, error: fieldError }) => (
                  <Select label={t('preferredSpotLabel')} error={fieldError} {...field}>
                    <option value={NO_PREFERRED_SPOT}>{t('preferredSpotNone')}</option>
                    {spots.map((spot) => (
                      <option key={spot.id} value={spot.id}>
                        {spot.label} · {spot.group}
                      </option>
                    ))}
                  </Select>
                )}
              />

              {saveErrorMessage ? <Toast tone="danger">{saveErrorMessage}</Toast> : null}

              <IcsSection
                headingId="ics-heading"
                icsFeedUrl={icsFeedUrl}
                copyState={copyState}
                onCopy={() => void handleCopy()}
                onRequestRegenerate={() => setConfirmOpen(true)}
                isRegenerating={isRegenerating}
              />
            </div>
          </FormProvider>
        ) : null}
      </Modal>

      <ConfirmDialog
        open={confirmOpen}
        title={t('icsRegenerateConfirmTitle')}
        description={t('icsRegenerateConfirmDescription')}
        confirmLabel={t('icsRegenerateConfirmButton')}
        tone="danger"
        loading={isRegenerating}
        onConfirm={() => void handleConfirmRegenerate()}
        onCancel={() => setConfirmOpen(false)}
      >
        {regenerateErrorMessage ? <Toast tone="danger">{regenerateErrorMessage}</Toast> : null}
      </ConfirmDialog>
    </>
  );
}

interface IcsSectionProps {
  readonly headingId: string;
  readonly icsFeedUrl: string | undefined;
  readonly copyState: CopyState;
  readonly onCopy: () => void;
  readonly onRequestRegenerate: () => void;
  readonly isRegenerating: boolean;
}

const COPY_FEEDBACK_TONE: Record<'copied' | 'failed', ToastTone> = {
  copied: 'success',
  failed: 'danger',
};

/**
 * The section `doc/decision/0151-*` adds to this modal: the ICS subscription
 * URL, a copy button, and token regeneration behind `ConfirmDialog` (rendered
 * one level up, so it sits above the whole modal rather than inside it).
 */
function IcsSection({
  headingId,
  icsFeedUrl,
  copyState,
  onCopy,
  onRequestRegenerate,
  isRegenerating,
}: IcsSectionProps) {
  const t = useTranslations('settings');

  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col gap-3 border-t border-border pt-5"
    >
      <div>
        <h3 id={headingId} className="text-sm font-bold text-fg">
          {t('icsHeading')}
        </h3>
        <p className="mt-1 text-sm text-fg-3">{t('icsDescription')}</p>
      </div>

      {icsFeedUrl === undefined ? (
        <p className="text-sm text-fg-3">{t('icsUnavailable')}</p>
      ) : (
        <>
          <Input
            label={t('icsUrlLabel')}
            value={icsFeedUrl}
            readOnly
            onFocus={(event) => event.currentTarget.select()}
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" variant="secondary" onClick={onCopy}>
              {t('icsCopy')}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={onRequestRegenerate}
              disabled={isRegenerating}
            >
              {t('icsRegenerate')}
            </Button>
          </div>
          {copyState === 'idle' ? null : (
            <Toast tone={COPY_FEEDBACK_TONE[copyState]}>
              {copyState === 'copied' ? t('icsCopied') : t('icsCopyFailed')}
            </Toast>
          )}
        </>
      )}
    </section>
  );
}
