/**
 * The parking overview, as the specs talk to it.
 *
 * Everything here addresses the screen the way a person does — by role and by
 * the Czech accessible name the UI actually renders (`libs/i18n`'s `lot`
 * namespace). There are no `data-testid` hooks in this application and none are
 * added here: a selector that matches the same string the user reads cannot
 * silently keep passing after the copy it names is gone, which is exactly the
 * failure mode an e2e suite is supposed to catch.
 *
 * Every wait is on a condition (Playwright's auto-retrying assertions and
 * `toPass`), never on a fixed delay. A `waitForTimeout` is load-bound: it
 * passes on an idle laptop and fails on a busy one.
 */

import { expect, type Locator, type Page } from '@playwright/test';
import { addDays, addMonths, parseDateOnly, todayInPrague } from '@lets-park/shared-types';
import type { DateOnly } from '@lets-park/shared-types';

/** Months in a year — the step `withYear` in `lot-screen.tsx` moves by. */
const MONTHS_IN_YEAR = 12;

/** The tile for one spot, whatever state it is in. */
export function spotTile(page: Page, label: string): Locator {
  // `lot-grid.tsx` labels a free tile "Rezervovat místo X" and every other
  // state "Otevřít místo X"; matching either is what lets one helper serve
  // both, without matching the `⋯` button ("Možnosti místa X").
  return page.getByRole('button', {
    name: new RegExp(`^(Rezervovat|Otevřít) místo ${label}$`, 'u'),
  });
}

/** The admin-only `⋯` button on a taken tile. */
export function spotMenuButton(page: Page, label: string): Locator {
  return page.getByRole('button', { name: `Možnosti místa ${label}` });
}

/** The spot dialog, once open. */
export function spotDialog(page: Page): Locator {
  return page.getByRole('dialog');
}

/**
 * Moves the screen to `target`.
 *
 * The day is component state, not a route, so it can only be reached through
 * the controls: the year and month `<select>`s, then the ‹ / › day steppers.
 * The number of steps is computed with the **application's own** date helpers
 * — `addMonths` owns the "31 January, one month on, is 28 February" clamp
 * (`lot-screen.tsx` moves the month through the same function), so mirroring
 * that arithmetic here rather than re-deriving it is what keeps the helper
 * correct on the four days of the year where it matters.
 */
export async function goToDate(page: Page, target: DateOnly): Promise<void> {
  let current = todayInPrague();
  const wanted = parseDateOnly(target);

  const startYear = parseDateOnly(current).year;
  if (wanted.year !== startYear) {
    await page.getByRole('combobox', { name: 'Rok' }).selectOption(String(wanted.year));
    current = addMonths(current, (wanted.year - startYear) * MONTHS_IN_YEAR);
  }

  const startMonth = parseDateOnly(current).month;
  if (wanted.month !== startMonth) {
    await page.getByRole('combobox', { name: 'Měsíc' }).selectOption(String(wanted.month));
    current = addMonths(current, wanted.month - startMonth);
  }

  const forward = current < target;
  const step = forward ? 'Následující den' : 'Předchozí den';
  while (current !== target) {
    await page.getByRole('button', { name: step }).click();
    current = addDays(current, forward ? 1 : -1);
  }

  // Landing on a weekend or a public holiday would make every write on this
  // day impossible for a reason that has nothing to do with what is under
  // test, so the arrival is asserted rather than assumed.
  await expect(page.getByText('Pracovní den', { exact: true })).toBeVisible();
}

/** Opens a spot's dialog by clicking its tile. */
export async function openSpot(page: Page, label: string): Promise<Locator> {
  await spotTile(page, label).click();
  const dialog = spotDialog(page);
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(`Místo ${label}`);
  return dialog;
}

/** Closes whatever dialog is open, through its own "Zavřít" button. */
export async function closeDialog(page: Page): Promise<void> {
  await spotDialog(page).getByRole('button', { name: 'Zavřít' }).click();
  await expect(spotDialog(page)).toBeHidden();
}

/**
 * Reserves `label` for the day currently on screen.
 *
 * Returns once the dialog has closed, which `lot-screen.tsx` only does on a
 * **successful** mutation — a failure leaves the dialog open with the error in
 * it, so this cannot report success for a write that was refused.
 */
export async function reserveSpot(page: Page, label: string): Promise<void> {
  const dialog = await openSpot(page, label);
  await dialog.getByRole('button', { name: 'Rezervovat', exact: true }).click();
  await expect(dialog).toBeHidden();
}

/** Cancels the reservation on `label` — as its holder, or as an admin. */
export async function cancelReservation(page: Page, label: string): Promise<void> {
  const dialog = await openSpot(page, label);
  await dialog.getByRole('button', { name: 'Zrušit rezervaci' }).click();
  await expect(dialog).toBeHidden();
}

/** Joins the queue for an occupied `label`. */
export async function joinQueue(page: Page, label: string): Promise<void> {
  const dialog = await openSpot(page, label);
  await dialog.getByRole('button', { name: 'Přidat se do fronty' }).click();
  await expect(dialog).toBeHidden();
}

/** Asserts the tile shows `name` as the holder. Auto-retries. */
export async function expectHeldBy(page: Page, label: string, name: string): Promise<void> {
  await expect(spotTile(page, label)).toContainText(name);
}

/** Asserts the tile is free — i.e. it offers to be reserved. */
export async function expectFree(page: Page, label: string): Promise<void> {
  await expect(page.getByRole('button', { name: `Rezervovat místo ${label}` })).toBeVisible();
}

/**
 * How long a route may take to appear the **first** time it is visited.
 *
 * The suite starts the **built** app (`web:start`), which compiles nothing on
 * demand — but `reuseExistingServer` is on outside CI, so a run may still meet
 * a `next dev` somebody already had up, and that one does. Measured, not
 * guessed: the dev server logged `GET /nastaveni 200 in 4.9s (compile: 1573ms,
 * proxy.ts: 1177ms, render: 2.2s)` on a machine that was also running three
 * browsers and a webpack watch — over Playwright's 5 s default, which is what
 * made the settings step flaky before this existed. See `doc/decision/0183-*`
 * and `doc/decision/0187-*`.
 *
 * It is deliberately **not** the global `expect` timeout: raising that would
 * make every assertion in the suite wait three times as long to report a real
 * failure. Only the one step that pays a compilation carries the allowance,
 * and the wait is still on a condition — the modal being visible — never on a
 * fixed delay. See `doc/decision/0183-*`.
 */
export const FIRST_ROUTE_VISIT_TIMEOUT_MS = 30_000;

/**
 * Opens Nastavení from the user menu and returns the modal.
 *
 * Settings is a route rendered as a modal over whatever is underneath
 * (`doc/decision/0150-*`), so this waits for the URL first: a `/nastaveni` that
 * never arrives and a modal that never renders are different failures, and the
 * report should say which one happened.
 */
export async function openSettings(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: 'Uživatelské menu' }).click();
  await page.getByRole('menuitem', { name: 'Nastavení (SPZ auta)' }).click();
  await page.waitForURL('**/nastaveni', { timeout: FIRST_ROUTE_VISIT_TIMEOUT_MS });

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible({ timeout: FIRST_ROUTE_VISIT_TIMEOUT_MS });
  await expect(dialog).toContainText('Nastavení');
  return dialog;
}
