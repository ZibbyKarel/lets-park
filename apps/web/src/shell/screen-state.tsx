'use client';

/**
 * The three states every screen has to be able to be in, written once.
 *
 * `plan.md` (Fáze 6, point 3) requires each screen to define a loading, an
 * empty and an error state, and requires a contract error code to reach the
 * user as a sentence rather than an enum name. These are those pieces —
 * composed, not invented: the empty and error states are the design system's
 * `EmptyState` compound, and the retry control is its `Button` primitive.
 *
 * They live in app code rather than in `libs/design-system/compounds` because
 * they carry domain knowledge the design system must not: `ScreenError` reads
 * a **contract** error and translates a member of the contract's closed error
 * enum. `EmptyState` itself stays domain-free, which is why it is imported
 * here rather than extended there.
 */

import { Button } from '@lets-park/design-system/primitives';
import { EmptyState } from '@lets-park/design-system/compounds';
import type { EmptyStateHeadingLevel } from '@lets-park/design-system/compounds';
import { toContractError } from '@lets-park/api-client';
import { useTranslations } from '@lets-park/i18n';

export interface ScreenLoadingProps {
  /** Overrides the default "Načítá se…". */
  readonly label?: string;
}

/**
 * A screen waiting for its first data.
 *
 * `role="status"` with the default `aria-live="polite"` is what makes the
 * spinner an announcement rather than a decoration: a screen reader says the
 * label when this appears, and says the screen's content when it is replaced.
 * The spinner itself is `aria-hidden`, because the label already says it.
 */
export function ScreenLoading({ label }: ScreenLoadingProps) {
  const t = useTranslations('shell');
  const text = label ?? t('loading');

  return (
    <div role="status" className="flex flex-col items-center justify-center gap-3 px-6 py-16">
      <span
        aria-hidden="true"
        className="size-6 animate-spin rounded-cta border-2 border-border border-t-brand-blue"
      />
      <span className="text-sm text-fg-3">{text}</span>
    </div>
  );
}

export interface ScreenErrorProps {
  /**
   * Whatever the failing call threw. Read through `toContractError`, so a
   * domain failure becomes one of the contract's codes and anything else — a
   * dropped connection, a 500, a bug — falls back to the generic sentence.
   */
  readonly error: unknown;
  /** Rendered as a "Zkusit znovu" button when supplied. */
  readonly onRetry?: () => void;
  /** See `EmptyStateProps.headingLevel`: only the page knows its own outline. */
  readonly headingLevel?: EmptyStateHeadingLevel;
}

/**
 * A screen whose data could not be loaded.
 *
 * The message is keyed off the **code**, never off the error's own `message`:
 * a contract error's `message` field is developer-facing English by design
 * (`libs/contract/src/api/errors.ts`), and a transport failure's message is a
 * stack-adjacent string that has no business on a page. Neither is ever shown.
 */
export function ScreenError({ error, onRetry, headingLevel }: ScreenErrorProps) {
  const t = useTranslations('shell');
  const errors = useTranslations('errors');
  const contractError = toContractError(error);

  return (
    <EmptyState
      title={t('errorTitle')}
      description={contractError === null ? t('errorUnknown') : errors(contractError.code)}
      {...(headingLevel === undefined ? {} : { headingLevel })}
      {...(onRetry === undefined
        ? {}
        : {
            action: (
              <Button variant="secondary" onClick={onRetry}>
                {t('retry')}
              </Button>
            ),
          })}
    />
  );
}

/**
 * The **empty** state, re-exported rather than re-implemented.
 *
 * `EmptyState` (Task 22) is already the design system's "there is nothing
 * here" block and it is domain-free, which is exactly right — only the screen
 * knows what its own emptiness means, so nothing generic about parking belongs
 * in it. Re-exporting it here means a screen imports all three of its states
 * from one place instead of two.
 */
export { EmptyState };
