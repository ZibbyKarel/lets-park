/**
 * The personal calendar feed, fetched the way a calendar client fetches it.
 *
 * The URL is not constructed here — it is read out of the Nastavení modal,
 * which is where a person copies it from, so the test covers the whole path
 * from `me.get`'s `icsToken` through `buildIcsFeedUrl` to the route. It is then
 * fetched with **no cookies and no Authorization header**, from a request
 * context that has never signed in, because that is the entire security model
 * of the feed: the token in the path is the only credential, and a calendar
 * client cannot send anything else.
 *
 * Nothing here logs the URL or the token. A failure prints the assertion, not
 * the credential.
 */

import { e2eDayForSlot, SPEC_DAY_SLOTS } from './support/dates';
import { expect, test } from './support/fixtures';
import { LOT_PATH } from './support/oidc-login';
import {
  cancelReservation,
  expectHeldBy,
  goToDate,
  openSettings,
  reserveSpot,
} from './support/lot-page';

const DATE = e2eDayForSlot(SPEC_DAY_SLOTS.icsFeed);
const SPOT = 'E2.96';

/** `2026-10-05` → `20261005`, the `VALUE=DATE` form RFC 5545 uses. */
function icsDate(date: string): string {
  return date.replace(/-/gu, '');
}

/**
 * Undoes RFC 5545 line folding so a property can be matched as one string.
 *
 * A folded line continues on the next one after a single leading space, and
 * `ical-generator` folds at 75 octets — which "SUMMARY:Parkování – E2.96" is
 * comfortably under today, but a longer spot label would not be. Unfolding
 * first means this test asserts the *content*, not the current line lengths.
 */
function unfold(ics: string): string {
  return ics.replace(/\r\n[ \t]/gu, '');
}

test('a reservation appears in the personal ICS feed, fetched by token alone', async ({
  userPage,
  playwright,
}) => {
  await userPage.goto(LOT_PATH);
  await goToDate(userPage, DATE);
  await reserveSpot(userPage, SPOT);
  await expectHeldBy(userPage, SPOT, 'Dev User');

  // The URL as a person copies it: out of the settings modal.
  const settings = await openSettings(userPage);
  const urlField = settings.getByLabel('Odkaz na kalendář');
  await expect(urlField).toBeVisible();
  const feedUrl = await urlField.inputValue();
  expect(feedUrl).toMatch(/\/api\/calendar\/.+\.ics$/u);

  // A brand-new request context: no cookies, no bearer token, nothing this
  // browser session earned. The token in the path is the whole credential.
  const anonymous = await playwright.request.newContext();
  try {
    const response = await anonymous.get(feedUrl);

    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('text/calendar');
    // The URL is a secret; the response says so.
    expect(response.headers()['cache-control']).toContain('private');
    expect(response.headers()['x-robots-tag']).toContain('noindex');

    const body = unfold(await response.text());
    expect(body).toContain('BEGIN:VCALENDAR');
    expect(body).toContain(`SUMMARY:Parkování – ${SPOT}`);
    expect(body).toContain(`DTSTART;VALUE=DATE:${icsDate(DATE)}`);

    // A wrong token is a 404, not a 401 — otherwise the response code alone
    // would let somebody enumerate valid tokens.
    const wrong = await anonymous.get(feedUrl.replace(/\/([^/]+)\.ics$/u, '/not-a-real-token.ics'));
    expect(wrong.status()).toBe(404);
    expect(wrong.headers()['content-type']).not.toContain('text/calendar');
  } finally {
    await anonymous.dispose();
  }

  // The feed drops the event again when the reservation goes away.
  await userPage.keyboard.press('Escape');
  await userPage.goto(LOT_PATH);
  await goToDate(userPage, DATE);
  await cancelReservation(userPage, SPOT);

  const afterCancel = await playwright.request.newContext();
  try {
    const body = unfold(await (await afterCancel.get(feedUrl)).text());
    expect(body).toContain('BEGIN:VCALENDAR');
    expect(body).not.toContain(`SUMMARY:Parkování – ${SPOT}`);
  } finally {
    await afterCancel.dispose();
  }
});
