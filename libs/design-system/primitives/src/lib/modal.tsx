import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { FOCUS_RING } from './control-size';
import { cx } from './cx';
import { DismissableLayerProvider } from './dismissable-layer';
import { useFocusTrap } from './use-focus-trap';

export type ModalSize = 'sm' | 'md';

/** Dialog widths, both taken from the design. */
const MODAL_WIDTH: Record<ModalSize, string> = {
  sm: 'max-w-[var(--modal-w-sm)]',
  md: 'max-w-[var(--modal-w-md)]',
};

export interface ModalProps {
  /** The modal renders nothing at all when this is `false`. */
  open: boolean;
  /**
   * Called for every way out: Escape, the scrim, and the close button. The
   * modal never closes itself — the caller owns `open`.
   */
  onClose: () => void;
  /**
   * Heading text. Also the dialog's accessible name, wired through
   * `aria-labelledby`, so the two can never disagree.
   */
  title: ReactNode;
  /** Optional line under the title, wired through `aria-describedby`. */
  description?: ReactNode | undefined;
  /** Small pill above the title, e.g. a status. */
  eyebrow?: ReactNode | undefined;
  /** Footer content, laid out right-aligned. Usually buttons. */
  footer?: ReactNode | undefined;
  /** Width step. Defaults to `sm`. */
  size?: ModalSize | undefined;
  /**
   * Whether clicking the scrim closes the modal. Defaults to `true`. Set it to
   * `false` for a dialog with unsaved input, where a stray click should not
   * throw work away.
   */
  closeOnScrimClick?: boolean | undefined;
  /** Accessible name of the × button. Defaults to `'Zavřít'`. */
  closeLabel?: string | undefined;
  /** Hides the × button. Escape and the scrim still work. */
  hideCloseButton?: boolean | undefined;
  className?: string | undefined;
  children?: ReactNode | undefined;
}

/**
 * Centred dialog on a dimmed scrim.
 *
 * Built as `role="dialog" aria-modal="true"` in a portal on `document.body`,
 * not as a native `<dialog>` — see `useFocusTrap` and
 * `doc/decision/0053-modal-focus-trap-is-manual-not-native-dialog.md` for why.
 *
 * **On "background content is inert".** A primitive cannot honestly mark the
 * rest of the page inert: it does not own that DOM, and reaching out to mutate
 * siblings it did not render would be a side effect nothing could clean up
 * reliably. What it does instead is the combination the ARIA specification
 * asks for and that assistive technology actually acts on: `aria-modal="true"`
 * on the dialog (which tells a screen reader to confine its virtual cursor),
 * a real Tab trap (which confines the keyboard), and an opaque scrim over the
 * full viewport (which confines the pointer). Marking siblings `inert` is an
 * application-level concern for the layout that owns them.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  eyebrow,
  footer,
  size = 'sm',
  closeOnScrimClick = true,
  closeLabel = 'Zavřít',
  hideCloseButton = false,
  className,
  children,
}: ModalProps) {
  const baseId = useId();
  const titleId = `${baseId}-title`;
  const descriptionId = `${baseId}-description`;
  const dialogRef = useRef<HTMLDivElement>(null);

  const layer = useFocusTrap({ active: open, containerRef: dialogRef, onEscape: onClose });

  // The page behind must not scroll under an open modal — scrolling it is the
  // one way a pointer user can still reach content the scrim is covering.
  useEffect(() => {
    if (!open || typeof document === 'undefined') {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open || typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    // The provider, not the portal, is what a modal opened inside this one will
    // find as its parent: the portal moves the DOM node to `document.body`,
    // where nesting is invisible, but React context follows the tree the JSX
    // describes and crosses the portal unchanged.
    <DismissableLayerProvider layer={layer}>
      <div
        // Presentational: the scrim is a backdrop, and the dialog inside it is
        // what carries the role. A keyboard user reaches every way out through
        // Escape and the close button, so this click handler is a pointer
        // shortcut that duplicates existing behaviour rather than adding any.
        role="presentation"
        onClick={
          closeOnScrimClick
            ? (event) => {
                if (event.target === event.currentTarget) {
                  onClose();
                }
              }
            : undefined
        }
        className={cx(
          'fixed inset-0 flex items-center justify-center overflow-y-auto bg-scrim p-6',
          'z-[var(--z-overlay)]'
        )}
      >
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={description ? descriptionId : undefined}
          // Focusable as a last resort, so a dialog with no controls in it can
          // still receive focus instead of leaving it in the page behind.
          tabIndex={-1}
          className={cx(
            'relative w-full rounded-lg bg-bg p-6 shadow-lg outline-none',
            MODAL_WIDTH[size],
            className
          )}
        >
          {hideCloseButton ? null : (
            <button
              type="button"
              aria-label={closeLabel}
              onClick={onClose}
              className={cx(
                'absolute right-6 top-6 inline-flex size-8 items-center justify-center',
                'cursor-pointer rounded-cta border-0 bg-transparent text-fg-3',
                'transition duration-[var(--dur-base)] ease-out hover:bg-bg-muted hover:text-fg',
                FOCUS_RING
              )}
            >
              <svg aria-hidden="true" focusable="false" viewBox="0 0 14 14" className="size-3">
                <path
                  d="M1 1 13 13M13 1 1 13"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          )}

          {eyebrow ? (
            <div
              className={cx(
                'mb-3 inline-flex h-6 items-center rounded-cta bg-brand-light px-3',
                'text-xs font-bold uppercase tracking-caps text-brand-blue'
              )}
            >
              {eyebrow}
            </div>
          ) : null}

          <h2
            id={titleId}
            className={cx(
              'mb-2 text-xl font-bold tracking-snug text-fg',
              // Keeps the title clear of the × button in the corner.
              !hideCloseButton && 'pr-8'
            )}
          >
            {title}
          </h2>

          {description ? (
            <p id={descriptionId} className="mb-5 text-base leading-loose text-fg-3">
              {description}
            </p>
          ) : null}

          {children}

          {footer ? (
            <div className="mt-6 flex flex-wrap items-center justify-end gap-3">{footer}</div>
          ) : null}
        </div>
      </div>
    </DismissableLayerProvider>,
    document.body
  );
}
