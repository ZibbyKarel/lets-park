/**
 * The realtime cell lock, seen from the other side.
 *
 * Two browser contexts on the same day. One opens a bay's dialog; the other
 * must see that bay hatch over as "právě upravuje / Dev User" — and, when the
 * dialog closes, see it go back to being reservable.
 *
 * Nothing in this file polls or reloads. The second page is never told
 * anything: `useCellLock` takes the hold over the socket, the gateway
 * broadcasts `cell:locked` to the day room excluding the asker, and
 * `useCellLocks` turns it into the tile's `editing` appearance. If the socket
 * is not connected, or the hold is not taken, or the broadcast is not sent,
 * nothing on the second page ever changes and the assertion times out — which
 * is the point: this is the one scenario whose defence is *only* realtime.
 *
 * That is also why it does not assert on the yellow hatch's colours. What is
 * checked is what the state means to a user: the tile says somebody is editing,
 * names them, and refuses to be clicked.
 *
 * The one thing each test *does* wait for before acting is
 * {@link waitForDayRoom} on the observing page. A `cell:locked` broadcast is
 * never replayed to a socket that joins afterwards, so taking the hold before
 * the observer is in the room is not a slow test — it is a test asking about an
 * event that was already sent to nobody. See `realtime.ts` and
 * `doc/decision/0187-*` for the measurement behind that.
 */

import { e2eDayForSlot, SPEC_DAY_SLOTS } from './support/dates';
import { expect, test } from './support/fixtures';
import { LOT_PATH } from './support/oidc-login';
import { USER } from './support/personas';
import { closeDialog, goToDate, openSpot, spotTile } from './support/lot-page';
import { waitForDayRoom } from './support/realtime';

const DATE = e2eDayForSlot(SPEC_DAY_SLOTS.cellLock);
const SPOT = 'E2.61';

test('one user opening a bay locks it for the other, and releases it on close', async ({
  userPage,
  userTwoPage,
}) => {
  await userPage.goto(LOT_PATH);
  await goToDate(userPage, DATE);
  await userTwoPage.goto(LOT_PATH);
  await goToDate(userTwoPage, DATE);

  const observed = spotTile(userTwoPage, SPOT);
  // Before anything happens the bay is offered to the observer, by the name a
  // free tile carries. Without this the "locked" assertion below could pass
  // against a tile that was never free in the first place.
  await expect(userTwoPage.getByRole('button', { name: `Rezervovat místo ${SPOT}` })).toBeVisible();

  // The observer has to be in the room before the hold is taken, or the
  // broadcast is sent to nobody and never sent again.
  await waitForDayRoom(userTwoPage, DATE);

  await openSpot(userPage, SPOT);

  await expect(observed).toContainText('právě upravuje');
  await expect(observed).toContainText(USER.displayName);
  // `lot-view.ts` gives an `editing` tile `action: 'none'`, and `lot-grid.tsx`
  // renders that as a genuinely disabled button — not a click handler that
  // returns early. The observer cannot open a bay somebody else is editing.
  await expect(observed).toBeDisabled();

  await closeDialog(userPage);

  await expect(userTwoPage.getByRole('button', { name: `Rezervovat místo ${SPOT}` })).toBeEnabled();
});

test('the holder never sees their own hold', async ({ userPage, userTwoPage }) => {
  await userPage.goto(LOT_PATH);
  await goToDate(userPage, DATE);
  await userTwoPage.goto(LOT_PATH);
  await goToDate(userTwoPage, DATE);
  await waitForDayRoom(userTwoPage, DATE);

  await openSpot(userPage, SPOT);

  // The second page proves the hold really was taken and broadcast…
  await expect(spotTile(userTwoPage, SPOT)).toContainText('právě upravuje');
  // …and the first page proves the holder's own tile is untouched underneath
  // the dialog. `toSpotView` drops a lock whose holder is the viewer.
  await closeDialog(userPage);
  await expect(userPage.getByRole('button', { name: `Rezervovat místo ${SPOT}` })).toBeVisible();
  await expect(spotTile(userPage, SPOT)).not.toContainText('právě upravuje');
});
