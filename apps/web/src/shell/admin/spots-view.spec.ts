import { failureSurfaceOf, shouldShowFailureIn } from './spots-view';

describe('failureSurfaceOf', () => {
  it('is the table when no dialog is open', () => {
    expect(failureSurfaceOf(null)).toBe('table');
  });

  it('is the dialog for every one of the three dialogs', () => {
    // Three homes, one surface: a modal covers the table, so all three print
    // in the same place.
    expect(failureSurfaceOf('create')).toBe('dialog');
    expect(failureSurfaceOf('edit')).toBe('dialog');
    expect(failureSurfaceOf('delete')).toBe('dialog');
  });
});

describe('shouldShowFailureIn', () => {
  it('shows a create failure in the create dialog and not above the table', () => {
    expect(shouldShowFailureIn('spotCreate', 'create', 'dialog')).toBe(true);
    expect(shouldShowFailureIn('spotCreate', 'create', 'table')).toBe(false);
  });

  it('shows a rename failure above the table when the rename came from the row', () => {
    // The inline category picker renames without opening anything.
    expect(shouldShowFailureIn('spotRename', null, 'table')).toBe(true);
    expect(shouldShowFailureIn('spotRename', null, 'dialog')).toBe(false);
  });

  it('shows a rename failure inside the edit dialog when that dialog is open', () => {
    expect(shouldShowFailureIn('spotRename', 'edit', 'dialog')).toBe(true);
    expect(shouldShowFailureIn('spotRename', 'edit', 'table')).toBe(false);
  });

  it('shows a retire failure in either of its two origins', () => {
    expect(shouldShowFailureIn('spotRetire', 'delete', 'dialog')).toBe(true);
    expect(shouldShowFailureIn('spotRetire', null, 'table')).toBe(true);
  });

  it('shows nothing when the open dialog could not have produced the write', () => {
    // The guard that survives a missed discard: nothing in the "Nové
    // parkovací místo" form can retire or revive a spot, so a failure from
    // one has no route into it.
    expect(shouldShowFailureIn('spotRetire', 'create', 'dialog')).toBe(false);
    expect(shouldShowFailureIn('spotRevive', 'edit', 'dialog')).toBe(false);
    expect(shouldShowFailureIn('spotCreate', 'edit', 'dialog')).toBe(false);
  });

  it('shows nothing for a revive failure while a dialog is open', () => {
    // Only the row's switch can revive; with a dialog open the admin is not
    // looking at the row, and no dialog is an origin for it.
    expect(shouldShowFailureIn('spotRevive', null, 'table')).toBe(true);
    expect(shouldShowFailureIn('spotRevive', 'delete', 'dialog')).toBe(false);
  });

  it('shows nothing at all for a write that never reaches this screen', () => {
    // `userUpdate` and `windowUpdate` have no entry: silence is the right
    // direction for a sentence whose origin this screen cannot account for.
    expect(shouldShowFailureIn('userUpdate', null, 'table')).toBe(false);
    expect(shouldShowFailureIn('windowUpdate', null, 'table')).toBe(false);
    expect(shouldShowFailureIn('windowUpdate', 'edit', 'dialog')).toBe(false);
  });
});
