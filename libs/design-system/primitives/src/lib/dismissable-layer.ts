import { useEffect, useRef, type RefObject } from 'react';

/** One open overlay, for as long as it is open. */
interface Layer {
  /**
   * The overlay's outermost node. Used to answer two questions: which layers
   * are nested inside which, and which layer currently holds the keyboard.
   */
  element: HTMLElement;
  onDismiss: () => void;
}

/**
 * Every open, Escape-dismissable overlay on the page, in registration order.
 *
 * Module-level on purpose: overlays are siblings in the React tree as often as
 * they are ancestor and descendant, so a context provider would have to be
 * mounted above every one of them by the application — a requirement a
 * primitive cannot enforce and that would fail silently when forgotten.
 */
const layers: Layer[] = [];

/**
 * The layer a single Escape press belongs to, or `undefined` if nothing is
 * open.
 *
 * The rule, in order:
 *
 * 1. **Innermost wins.** A layer that has another registered layer inside it —
 *    a modal containing a tooltip, a modal containing a menu — is not the
 *    target; the one nested within it is. This is the question the previous
 *    two attempts at this bug got wrong, and it is deliberately answered from
 *    the DOM rather than from the order the listeners were registered in,
 *    because registration order is mount order, which no overlay controls.
 * 2. **Then the keyboard.** Two overlays can both be innermost — unrelated
 *    siblings, neither inside the other. The pointer can hover one while the
 *    keyboard sits in the other, and Escape is a key: it belongs to whichever
 *    layer contains `document.activeElement`. A hover-shown bubble does not
 *    get to take a press aimed at the menu the user is arrow-keying through.
 * 3. **Then the most recent.** Siblings with the keyboard in neither of them
 *    (or nowhere at all) fall back to last-registered-wins, so a press always
 *    lands somewhere and always on the newest thing.
 *
 * Exactly one layer is returned, so exactly one overlay is ever dismissed per
 * press. The layer beneath is reached by pressing Escape again.
 */
function topmostLayer(): Layer | undefined {
  const innermost = layers.filter(
    (layer) => !layers.some((other) => other !== layer && layer.element.contains(other.element))
  );

  if (innermost.length <= 1) {
    return innermost[0];
  }

  const focused = document.activeElement;
  const holdingFocus = focused ? innermost.filter((layer) => layer.element.contains(focused)) : [];
  const candidates = holdingFocus.length > 0 ? holdingFocus : innermost;

  return candidates[candidates.length - 1];
}

/**
 * The one and only Escape listener for the whole set. Bound to `document` so it
 * sees presses delivered anywhere on the page — a bubble shown on hover has to
 * be dismissable while the keyboard is somewhere else entirely (WCAG 2.1
 * SC 1.4.13), which a listener on the overlay's own subtree would never manage.
 *
 * Bubble phase, and it does **not** call `stopPropagation`. By the time an
 * event reaches `document`, every handler in the tree below — including React's
 * synthetic ones, which are bound to the root container — has already run, so
 * there is nothing left to stop and nothing left to steal. That is the whole
 * point of routing every overlay through one listener here instead of letting
 * each bind its own and fight over phase order.
 */
function onDocumentKeyDown(event: KeyboardEvent) {
  if (event.key !== 'Escape') {
    return;
  }

  const layer = topmostLayer();
  if (!layer) {
    return;
  }

  event.preventDefault();
  layer.onDismiss();
}

function register(layer: Layer) {
  layers.push(layer);

  if (layers.length === 1) {
    document.addEventListener('keydown', onDocumentKeyDown);
  }
}

function unregister(layer: Layer) {
  const index = layers.indexOf(layer);
  if (index === -1) {
    return;
  }

  // Removed by identity rather than popped, because a layer in the middle of
  // the set can close on its own account — a menu selected with the mouse
  // while a modal is still open behind it, a tooltip whose trigger unmounts.
  layers.splice(index, 1);

  if (layers.length === 0) {
    document.removeEventListener('keydown', onDocumentKeyDown);
  }
}

export interface DismissableLayerOptions {
  /**
   * The layer counts as open only while this is `true`. An overlay that must
   * not answer to Escape at all simply never passes `true`: it is then absent
   * from the set entirely, so the press falls through to whatever is beneath it
   * rather than being absorbed and dropped.
   */
  active: boolean;
  /** The overlay's outermost node, mounted for as long as `active` is true. */
  elementRef: RefObject<HTMLElement | null>;
  /** Called when this layer is the one an Escape press belongs to. */
  onDismiss: () => void;
}

/**
 * Makes an overlay dismissable by Escape, as part of one page-wide set rather
 * than on its own.
 *
 * Overlays used to bind an Escape listener each, which made "which one does
 * this press close?" a question about listener phase and mount order. Two
 * rounds of fixes moved that ordering around and each time produced a wrong
 * answer somewhere else: a tooltip inside a modal closing both, then a tooltip
 * consuming a press aimed at an unrelated menu. Routing everything through one
 * listener replaces the ordering question with a structural one — see
 * `topmostLayer` for the rule, and
 * `doc/decision/0024-escape-goes-to-the-innermost-open-layer.md` for the
 * reasoning and the alternatives that were rejected.
 *
 * Pointer dismissal (click-outside) is deliberately **not** part of this set;
 * the decision record explains why.
 */
export function useDismissableLayer({ active, elementRef, onDismiss }: DismissableLayerOptions) {
  // Held in a ref for the same reason `useFocusTrap` holds its `onEscape` that
  // way: callers pass an inline arrow, and depending on it would unregister and
  // re-register the layer on every render of the page around it.
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  useEffect(() => {
    if (!active) {
      return;
    }

    const element = elementRef.current;
    if (!element) {
      return;
    }

    const layer: Layer = { element, onDismiss: () => onDismissRef.current() };
    register(layer);

    return () => unregister(layer);
  }, [active, elementRef]);
}
