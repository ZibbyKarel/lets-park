/**
 * What the settings screen decides, as pure functions.
 *
 * The same split `lot/lot-view.ts` makes, for the same reason: a decision that
 * lives inside a component body is reachable only by rendering the component
 * and reading the DOM, while the same decision as a function has a name, a
 * type, and a spec that states it directly.
 *
 * No React, no hooks, no network.
 */

import { buildIcsFeedUrl } from '@lets-park/contract';

/**
 * The calendar feed, or the reason there is nothing to link to.
 *
 * A union rather than `string | undefined` because the two inputs that can be
 * missing — the API origin (`apiOriginOf(NEXT_PUBLIC_API_URL)` could not be
 * derived) and the caller's token (the profile has not arrived, or has no
 * token) — mean the same thing on screen: the section says the link is
 * unavailable instead of drawing a broken one. {@link buildIcsFeedUrl} has
 * nothing to build from in either case.
 */
export type IcsFeedView =
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'ready'; readonly url: string };

/** The feed URL for `apiOrigin` and `token`, when both are actually there. */
export function toIcsFeedView(apiOrigin: string, token: string | undefined): IcsFeedView {
  if (apiOrigin === '' || token === undefined) {
    return { kind: 'unavailable' };
  }
  return { kind: 'ready', url: buildIcsFeedUrl(apiOrigin, token) };
}
