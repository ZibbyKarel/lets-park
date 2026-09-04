'use client';

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
  type RefObject,
} from 'react';

import { register, unregister } from './layer-registry';

/**
 * One overlay's place in the layer tree.
 *
 * The node exists for as long as the component does; only `register` decides
 * whether it is *open*. Keeping it around while closed is what lets a child
 * overlay name its parent even when that parent's own bubble is hidden.
 */
export interface DismissableLayer {
  /**
   * The layer this one opened inside, or `null` for a top-level one.
   *
   * Read from React context rather than from the DOM, and that is the whole
   * point: `Modal` portals to `document.body`, so two modals nested in JSX are
   * DOM *siblings* and `element.contains(other)` is false in both directions.
   * Context crosses a portal — a portalled child still sees the context of its
   * React parent — so this is the only place the nesting is visible at all.
   * Verified by "dismisses one layer per press, innermost first, across the
   * portal boundary", which fails outright when this link is not read.
   */
  parent: DismissableLayer | null;
  /**
   * The overlay's outermost node, set when the layer opens. Used only for the
   * focus tie-break between layers that are not nested in one another.
   */
  element: HTMLElement | null;
  /** `null` for a layer that Escape must not close. */
  onDismiss: (() => void) | null;
  /** Whether this layer confines Tab while it is the topmost such layer. */
  trapsFocus: boolean;
}

/**
 * The nearest enclosing layer, as seen from the React tree.
 *
 * `null` at the root, and `null` is also what a layer with no enclosing overlay
 * gets — the two are the same thing.
 */
const DismissableLayerContext = createContext<DismissableLayer | null>(null);

/**
 * Publishes `layer` as the parent of every layer opened inside `children`.
 *
 * Rendered by each overlay around its own content. It emits no DOM of its own,
 * so it is safe to wrap anything, including the inside of a portal.
 */
export function DismissableLayerProvider({
  layer,
  children,
}: {
  layer: DismissableLayer;
  children: ReactNode;
}) {
  return (
    <DismissableLayerContext.Provider value={layer}>{children}</DismissableLayerContext.Provider>
  );
}

export { isActiveFocusTrap, subscribeToLayers } from './layer-registry';

export interface DismissableLayerOptions {
  /**
   * The layer counts as open only while this is `true`. A closed layer is
   * absent from the set, so a press falls through to whatever is beneath it
   * rather than being absorbed and dropped.
   */
  active: boolean;
  /** The overlay's outermost node, mounted for as long as `active` is true. */
  elementRef: RefObject<HTMLElement | null>;
  /**
   * Called when this layer is the one an Escape press belongs to. Omit it for
   * an overlay Escape must not close: the layer still takes its place in the
   * tree (so what opens inside it can find its parent) but is never the target.
   */
  onDismiss?: (() => void) | undefined;
  /**
   * Whether this overlay confines Tab. Only the deepest, most recent trapping
   * layer actually traps — see `isActiveFocusTrap`.
   */
  trapsFocus?: boolean | undefined;
}

/**
 * Makes an overlay part of the page-wide layer tree: dismissable by Escape, and
 * a possible parent for whatever opens inside it.
 *
 * Overlays used to bind an Escape listener each, which made "which one does
 * this press close?" a question about listener phase and mount order. Three
 * rounds of fixes moved that ordering around and each time produced a wrong
 * answer somewhere else: a tooltip inside a modal closing both, then a tooltip
 * consuming a press aimed at an unrelated menu, then a modal opened inside
 * another modal taking a press aimed at itself and unmounting them both.
 * Routing everything through one listener over one tree replaces the ordering
 * question with a structural one — see `topmostLayer` for the rule, and
 * `doc/decision/0056-escape-goes-to-the-innermost-open-layer.md` for the
 * reasoning and the alternatives that were rejected.
 *
 * The returned node must be handed to a `DismissableLayerProvider` around the
 * overlay's own content, or nothing opened inside this overlay can see it as
 * its parent.
 *
 * Pointer dismissal (click-outside) is deliberately **not** part of this set;
 * the decision record explains why.
 */
export function useDismissableLayer({
  active,
  elementRef,
  onDismiss,
  trapsFocus = false,
}: DismissableLayerOptions): DismissableLayer {
  // Held in a ref because callers pass an inline arrow: depending on it would
  // unregister and re-register the layer on every render of the page around it.
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  const dismiss = useRef(() => onDismissRef.current?.()).current;

  const parent = useContext(DismissableLayerContext);
  const layerRef = useRef<DismissableLayer | null>(null);
  layerRef.current ??= { parent: null, element: null, onDismiss: null, trapsFocus: false };
  const layer = layerRef.current;

  // These have to be true of the node *before* it registers, because
  // `register` notifies every focus trap synchronously and each one reads
  // `trapsFocus` and the parent chain on the spot to decide whether to pause.
  // Writing them during render is the simplest way to guarantee that ordering;
  // assignment is idempotent, so a repeated render changes nothing. Moving them
  // into an effect declared *after* the registration effect below fails "lets
  // only the newest of two unrelated modals confine Tab"; an effect declared
  // before it stays green, which is why this is a note about ordering rather
  // than about render-versus-effect.
  layer.parent = parent;
  layer.onDismiss = onDismiss === undefined ? null : dismiss;
  layer.trapsFocus = trapsFocus;

  useEffect(() => {
    if (!active) {
      return;
    }

    const element = elementRef.current;
    if (!element) {
      return;
    }

    layer.element = element;
    register(layer);

    return () => unregister(layer);
  }, [active, elementRef, layer]);

  return layer;
}
