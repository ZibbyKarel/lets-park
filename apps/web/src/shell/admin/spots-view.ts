/**
 * Where a failed spot write is shown, as pure functions.
 *
 * The rule lives here rather than in the 500-line screen that draws it, for
 * the reason `lot/lot-view.ts` gives for its own half of the app: a decision
 * spread over a lookup table, a type and a nested conditional inside a
 * component body can only be exercised through the DOM, while the same
 * decision as a named function has a spec that states it directly.
 *
 * No React, no hooks, no network.
 */

import type { AdminWrite } from './admin-errors';

/** Which of the three dialogs is open. Mirrors `SpotDialog['kind']`. */
export type SpotDialogKind = 'create' | 'edit' | 'delete';

/** A surface that can *start* a write: the table, or one of the three dialogs. */
type FailureHome = 'table' | SpotDialogKind;

/**
 * A surface that can *show* a failure. There are two, not four: a dialog is a
 * modal and covers the table, so all three of them share one place to print in.
 */
export type FailureSurface = 'table' | 'dialog';

/**
 * Which surfaces could have started each write.
 *
 * A second, independent guard behind `onDiscardFailure`. Discarding is what
 * *should* keep a stale sentence off the next dialog; this is what makes the
 * bad case unrepresentable even if a discard is ever missed — a `spotRetire`
 * failure has no route to the "Nové parkovací místo" form, because nothing in
 * that form can retire a spot.
 *
 * A write with no entry (`userUpdate`, `windowUpdate` — neither reaches the
 * spots screen) shows nowhere. Silence is the right failure direction for a
 * sentence whose origin that screen cannot account for.
 */
const WRITE_ORIGINS: Partial<Record<AdminWrite, readonly FailureHome[]>> = {
  spotCreate: ['create'],
  // Both the edit modal's "Uložit" and the row's inline category picker.
  spotRename: ['edit', 'table'],
  // Both the "Smazat" confirmation and the row's switch being turned off.
  spotRetire: ['delete', 'table'],
  // Only the row's switch: no dialog turns a spot back on.
  spotRevive: ['table'],
};

/** The surface an admin is looking at: whichever dialog is open, else the table. */
export function failureSurfaceOf(dialogKind: SpotDialogKind | null): FailureSurface {
  return dialogKind === null ? 'table' : 'dialog';
}

/**
 * Whether the failure from `write` belongs on `where`, with `dialogKind` open.
 *
 * Two questions, in order. First, could this surface have produced the write
 * at all ({@link WRITE_ORIGINS})? Second, is `where` the surface the admin is
 * actually looking at — a message printed behind an open modal is a message
 * nobody reads. Keying the second question on the open dialog rather than on
 * the write is what puts the sentence where the user is looking: every write
 * here has *two* possible origins, `spotRename` being both the edit modal's
 * Save and the row's inline category picker.
 *
 * `false` for every other combination, so each call site renders at most one
 * `Toast`.
 */
export function shouldShowFailureIn(
  write: AdminWrite,
  dialogKind: SpotDialogKind | null,
  where: FailureSurface
): boolean {
  const home: FailureHome = dialogKind ?? 'table';
  if (!(WRITE_ORIGINS[write] ?? []).includes(home)) {
    return false;
  }
  return failureSurfaceOf(dialogKind) === where;
}
