'use client';

import { Button, Input, Stack, Toast, type ToastTone } from '@lets-park/design-system/primitives';
import { useTranslations } from '@lets-park/i18n';
import type { IcsFeedView } from './settings-view';
import type { CopyState } from './settings-screen';

export interface IcsSectionProps {
  readonly headingId: string;
  readonly feed: IcsFeedView;
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
export function IcsSection({
  headingId,
  feed,
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

      {feed.kind === 'unavailable' ? (
        <p className="text-sm text-fg-3">{t('icsUnavailable')}</p>
      ) : (
        <>
          <Input
            label={t('icsUrlLabel')}
            value={feed.url}
            readOnly
            onFocus={(event) => event.currentTarget.select()}
          />
          <Stack direction="row" align="center" wrap spacing={3}>
            {/* `size="lg"`, matching the footer's Cancel/Save buttons — the
                design shows one control height throughout the modal. */}
            <Button type="button" variant="secondary" size="lg" onClick={onCopy}>
              {t('icsCopy')}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={onRequestRegenerate}
              disabled={isRegenerating}
            >
              {t('icsRegenerate')}
            </Button>
          </Stack>
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
