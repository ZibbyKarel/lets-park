'use client';

import type { DismissableLayer } from './dismissable-layer';

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

export function register(layer: DismissableLayer) {
  layers.push(layer);

  if (layers.length === 1) {
    document.addEventListener('keydown', onDocumentKeyDown);
  }

  notify();
}

export function unregister(layer: DismissableLayer) {
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
