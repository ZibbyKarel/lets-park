import { useEffect, type RefObject } from 'react';

import {
  isActiveFocusTrap,
  subscribeToLayers,
  useDismissableLayer,
  type DismissableLayer,
} from './dismissable-layer';

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
  /**
   * Called when Escape is pressed and this trap's container is the deepest open
   * layer (see `useDismissableLayer`). Omitting it makes the container one
   * Escape never selects, so a press falls through to whatever is beneath
   * rather than being swallowed — the container still takes its place in the
   * layer tree, because a nested overlay has to be able to find it.
   */
  onEscape?: (() => void) | undefined;
}

/**
 * Confines Tab to `containerRef` and restores focus to whatever was focused
 * before the trap became active once it deactivates.
 *
 * Escape is *not* this hook's own business, even though `onEscape` is its
 * option: it is delegated to the page-wide layer set (`useDismissableLayer`),
 * because deciding a press between a modal and whatever is open inside it is a
 * question no single trap can answer from where it stands. The `keydown`
 * listener below therefore handles Tab and nothing else.
 *
 * **Only the trap on top traps.** A trap whose container is a portal cannot see
 * a nested overlay that portals somewhere else, so left to itself it would find
 * nothing tabbable, focus its own container, and pull the keyboard out of the
 * overlay the user is actually in — which then feeds the layer set's focus
 * tie-break a false answer about who owns the next Escape. This hook therefore
 * asks the layer tree whether it is the active trap, pauses when another
 * trapping layer opens above it, and resumes when that layer closes. Pausing
 * releases Tab only; the layer that is closing owns focus restoration, so a
 * resume moves focus solely when this trap never took it in the first place.
 *
 * Returns its layer node, which the caller must publish with a
 * `DismissableLayerProvider` around the overlay's content.
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
export function useFocusTrap({
  active,
  containerRef,
  onEscape,
}: FocusTrapOptions): DismissableLayer {
  // Escape is not handled by the trap's own listener below. It belongs to the
  // page-wide layer tree, which is what decides whether this container or
  // something open inside it owns a given press. The container joins the tree
  // whether or not it answers to Escape, because it has to be findable as the
  // parent of anything opened inside it either way.
  const layer = useDismissableLayer({
    active,
    elementRef: containerRef,
    onDismiss: onEscape,
    trapsFocus: true,
  });

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

    // Tab only — see the note about Escape above.
    const onKeyDown = (event: KeyboardEvent) => {
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

    let trapping = false;
    let hasTakenFocus = false;

    const startTrapping = () => {
      if (trapping) {
        return;
      }
      trapping = true;

      // Once per activation, not on every resume. When a nested overlay closes,
      // its own cleanup puts focus back on whatever opened it — a control
      // inside this container, and a better answer than "the first one".
      // Removing this guard fails "returns focus to the control that opened the
      // overlay, not to the first one".
      if (!hasTakenFocus) {
        hasTakenFocus = true;

        const [firstTabbable] = getTabbableElements(container);
        // Falls back to the container itself, which is made focusable with
        // `tabIndex={-1}` — an overlay with no controls at all must still take
        // focus, or the screen reader stays in the page behind it.
        (firstTabbable ?? container).focus();
      }

      document.addEventListener('keydown', onKeyDown);
    };

    const stopTrapping = () => {
      if (!trapping) {
        return;
      }
      trapping = false;

      // Tab is released and focus is left exactly where it is. Whichever layer
      // caused this pause is the one placing focus, and the same holds in
      // reverse on resume — see the guard in `startTrapping`.
      document.removeEventListener('keydown', onKeyDown);
    };

    const sync = () => (isActiveFocusTrap(layer) ? startTrapping() : stopTrapping());

    // Run on every change to the tree rather than once: this trap has to pause
    // when a modal opens above it and resume when that modal closes, and
    // neither of those is a render of this component.
    const unsubscribe = subscribeToLayers(sync);
    sync();

    return () => {
      unsubscribe();
      stopTrapping();

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
  }, [active, containerRef, layer]);

  return layer;
}
