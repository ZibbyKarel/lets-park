import {
  createContext,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
  type RefObject,
} from 'react';

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

/** Every open layer, in the order they opened. */
const layers: DismissableLayer[] = [];

/** Notified whenever the set gains or loses a layer. */
const subscribers = new Set<() => void>();

/**
 * Called back on every change to the set. Used by the focus trap, which has to
 * find out when a layer opens above it (so it stops trapping) and when that
 * layer closes again (so it resumes).
 */
export function subscribeToLayers(onChange: () => void): () => void {
  subscribers.add(onChange);

  return () => subscribers.delete(onChange);
}

function notify() {
  // Iterated over a copy so that a subscriber added or removed while the
  // notification is running cannot change what this pass visits. No current
  // subscriber does either — this is a guard, not a description of something
  // that happens.
  for (const subscriber of [...subscribers]) {
    subscriber();
  }
}

/** Whether `layer` sits somewhere inside `ancestor` in the layer tree. */
function isNestedIn(layer: DismissableLayer, ancestor: DismissableLayer): boolean {
  for (let node = layer.parent; node !== null; node = node.parent) {
    if (node === ancestor) {
      return true;
    }
  }

  return false;
}

/**
 * The members of `candidates` with no other candidate nested inside them — the
 * deepest layers on each open branch of the tree.
 */
function deepest(candidates: DismissableLayer[]): DismissableLayer[] {
  return candidates.filter(
    (layer) => !candidates.some((other) => other !== layer && isNestedIn(other, layer))
  );
}

/**
 * The layer a single Escape press belongs to, or `undefined` if there is
 * nothing to dismiss.
 *
 * The rule, in order:
 *
 * 1. **Deepest wins.** A layer with another dismissable layer open inside it —
 *    a modal containing a menu, a modal containing another modal — is not the
 *    target; the one nested within it is. Nesting is the layer tree's own
 *    parent link, established when each layer registers, so it describes where
 *    an overlay was *opened* rather than where it happens to render. Rounds 1
 *    to 3 of this bug all read it from the DOM instead, which is right for the
 *    overlays that render inline and silently wrong for the one that portals.
 * 2. **Then the keyboard.** Two overlays can both be deepest — unrelated
 *    siblings, neither opened inside the other. The pointer can hover one while
 *    the keyboard sits in the other, and Escape is a key: it belongs to
 *    whichever layer contains `document.activeElement`. A hover-shown bubble
 *    does not get to take a press aimed at the menu the user is arrow-keying
 *    through.
 * 3. **Then the most recent.** Siblings with the keyboard in neither of them
 *    (or nowhere at all) fall back to last-opened-wins, so a press always lands
 *    somewhere and always on the newest thing.
 *
 * Exactly one layer is returned, so exactly one overlay is ever dismissed per
 * press. The layer beneath is reached by pressing Escape again.
 */
function topmostLayer(): DismissableLayer | undefined {
  // A layer that does not answer to Escape is still part of the tree — it can
  // be somebody's parent — but it can never be the target, and it must not
  // stop the layer it contains from being one.
  const innermost = deepest(layers.filter((layer) => layer.onDismiss !== null));

  if (innermost.length <= 1) {
    return innermost[0];
  }

  const focused = document.activeElement;
  const holdingFocus = focused ? innermost.filter((layer) => layer.element?.contains(focused)) : [];
  const candidates = holdingFocus.length > 0 ? holdingFocus : innermost;

  return candidates[candidates.length - 1];
}

/**
 * Whether `layer` is the one focus-trapping layer that should currently trap.
 *
 * Same shape as the Escape rule and for the same reason, minus the focus
 * tie-break — asking "who holds focus?" to decide who controls focus would just
 * be asking a trap to confirm itself. Only trapping layers are considered, so a
 * tooltip or a menu opened inside a modal does not pause that modal's trap; a
 * second modal does. Dropping the `trapsFocus` filter fails "leaves focus in
 * the overlay on top instead of the one beneath reclaiming it", where tabbing
 * onto a tooltip trigger inside a modal would otherwise release that modal's
 * Tab confinement.
 */
export function isActiveFocusTrap(layer: DismissableLayer): boolean {
  const traps = deepest(layers.filter((candidate) => candidate.trapsFocus));

  return traps[traps.length - 1] === layer;
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
  if (!layer?.onDismiss) {
    return;
  }

  event.preventDefault();
  layer.onDismiss();
}

function register(layer: DismissableLayer) {
  layers.push(layer);

  if (layers.length === 1) {
    document.addEventListener('keydown', onDocumentKeyDown);
  }

  notify();
}

function unregister(layer: DismissableLayer) {
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

  notify();
}

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
 * `doc/decision/0024-escape-goes-to-the-innermost-open-layer.md` for the
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
