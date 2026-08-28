/**
 * The personal ICS feed — the one endpoint that is deliberately **outside**
 * oRPC.
 *
 * Calendar clients (Outlook, Google Calendar) fetch a plain URL with no headers
 * they can be taught to send, so the feed cannot ride on the RPC transport and
 * cannot use the session cookie. It is a plain `GET` authenticated by an
 * unguessable token in the path, which is what `User.icsToken` is for.
 *
 * `plan.md` §Contract-first names this as the single exception. The contract's
 * job here is therefore not to define a procedure but to own the **shape of the
 * URL**, so that `apps/api` (which serves it) and `apps/web` (which shows it)
 * cannot drift apart. Regenerating the token *is* a procedure, and lives in
 * `./me`.
 */

/**
 * Path segment the feed is mounted under, including the API's global prefix
 * (`app.setGlobalPrefix('api')` in `apps/api/src/main.ts`).
 */
export const ICS_FEED_BASE_PATH = '/api/calendar';

/**
 * Suffix on the token. Calendar clients and proxies key off it, and some refuse
 * a subscription URL without it.
 */
export const ICS_FEED_FILE_EXTENSION = '.ics';

/**
 * Path of one user's feed, relative to the API origin:
 * `/api/calendar/<token>.ics`.
 *
 * The token is percent-encoded even though it is generated URL-safe — the
 * helper must not be the thing that breaks if the generator ever changes.
 *
 * @throws when `icsToken` is empty, which would produce a URL pointing at the
 * collection rather than at a user and is always a caller bug.
 */
export function buildIcsFeedPath(icsToken: string): string {
  if (icsToken.length === 0) {
    throw new Error('buildIcsFeedPath: icsToken must not be empty');
  }
  return `${ICS_FEED_BASE_PATH}/${encodeURIComponent(icsToken)}${ICS_FEED_FILE_EXTENSION}`;
}

/**
 * Absolute feed URL, e.g.
 * `buildIcsFeedUrl('https://parking.example.com', 'abc')` →
 * `https://parking.example.com/api/calendar/abc.ics`.
 *
 * Trailing slashes on `baseUrl` are trimmed, so both `https://host` and
 * `https://host/` produce the same URL.
 */
export function buildIcsFeedUrl(baseUrl: string, icsToken: string): string {
  if (baseUrl.length === 0) {
    throw new Error('buildIcsFeedUrl: baseUrl must not be empty');
  }
  return `${baseUrl.replace(/\/+$/, '')}${buildIcsFeedPath(icsToken)}`;
}
