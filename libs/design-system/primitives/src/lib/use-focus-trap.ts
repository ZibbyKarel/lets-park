import { useEffect, useRef, type RefObject } from 'react';

/**
 * Selector for the elements a browser will put in the tab order. Kept in one
 * place because the focus trap and the "focus the first thing" step must agree
 * on what counts as focusable — if they disagree, Tab can escape a container
 * the trap believed it had covered.
 *
 * `[tabindex]:not([tabindex="-1"])` deliberately excludes programmatically
 * focusable elements: they are reachable by script and by click, but not by
 * Tab, so they are not part of the cycle the trap has to close.
 */
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/** Every tabbable element inside `container`, in document order. */
export function getTabbableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) => !element.hasAttribute('inert') && element.getAttribute('aria-hidden') !== 'true'
  );
}

export interface FocusTrapOptions {
  /** The trap only runs while this is true. */
  active: boolean;
  /** Element whose contents are trapped. */
  containerRef: RefObject<HTMLElement | null>;
  /** Called when Escape is pressed. */
  onEscape?: (() => void) | undefined;
}

/**
 * Confines Tab to `containerRef` and restores focus to whatever was focused
 * before the trap became active once it deactivates.
 *
 * **Why a hand-rolled trap rather than `<dialog>.showModal()`.** The native top
 * layer really does trap focus in a browser, and it would be the better
 * primitive if it could be verified — but jsdom implements neither the top
 * layer nor its focus containment, and `user-event`'s `tab()` computes tab
 * order itself across the whole document. Against a native dialog the tests
 * that matter here ("Tab from the last control returns to the first", "Tab
 * never reaches the page behind") would therefore either fail or, worse, pass
 * without proving anything. A keydown handler that calls `preventDefault()` and
 * moves focus explicitly behaves identically under jsdom and in a browser, so
 * the behaviour the specs assert is the behaviour that ships. See
 * `doc/decision/0021-fokus-trap-modalu-rucne-ne-dialog.md`.
 */
export function useFocusTrap({ active, containerRef, onEscape }: FocusTrapOptions): void {
  // Held in a ref, not in the dependency array. A consumer almost always passes
  // an inline arrow for `onEscape`, so depending on it would tear down and
  // rebuild the trap on every render — and rebuilding re-runs the initial
  // focus, yanking the caret out of whatever field the user was typing in.
  const onEscapeRef = useRef(onEscape);
  onEscapeRef.current = onEscape;

  useEffect(() => {
    if (!active) {
      return;
    }

    const container = containerRef.current;
    if (!container) {
      return;
    }

    // Captured before the first focus move, so it is the element that opened
    // the overlay rather than anything the overlay itself focused.
    const previouslyFocused = document.activeElement as HTMLElement | null;

    const [firstTabbable] = getTabbableElements(container);
    // Falls back to the container itself, which is made focusable with
    // `tabIndex={-1}` — an overlay with no controls at all must still take
    // focus, or the screen reader stays in the page behind it.
    (firstTabbable ?? container).focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onEscapeRef.current?.();

        return;
      }

      if (event.key !== 'Tab') {
        return;
      }

      const tabbables = getTabbableElements(container);
      if (tabbables.length === 0) {
        // Nothing to move between; keep focus on the container.
        event.preventDefault();
        container.focus();

        return;
      }

      const first = tabbables[0] as HTMLElement;
      const last = tabbables[tabbables.length - 1] as HTMLElement;
      const activeElement = document.activeElement;

      // Wrapping is driven by the container boundary as well as by the
      // first/last element: if focus has somehow left the container entirely,
      // the next Tab pulls it back in rather than letting it walk the page.
      if (!container.contains(activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();

        return;
      }

      if (event.shiftKey && activeElement === first) {
        event.preventDefault();
        last.focus();

        return;
      }

      if (!event.shiftKey && activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('keydown', onKeyDown);

      if (!previouslyFocused || !previouslyFocused.isConnected) {
        return;
      }

      // Take focus back only if the overlay still holds it. `document.body` is
      // included because that is where the browser parks focus once the
      // focused element is removed from the DOM, which is the normal case when
      // an overlay closes — checking only `container.contains(...)` would
      // therefore restore focus almost never.
      const current = document.activeElement;
      const overlayStillHasFocus =
        !current || current === document.body || container.contains(current);

      if (overlayStillHasFocus) {
        previouslyFocused.focus();
      }
    };
  }, [active, containerRef]);
}
