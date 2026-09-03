import { apiOriginOf } from '../../../api-url';
import { SettingsPage } from '../../../shell/settings-page';

/**
 * `/nastaveni` — personal settings: licence plate, preferred parking spot, and
 * the ICS feed URL with its regenerate button (Task 26).
 *
 * A Server Component only so it can read `NEXT_PUBLIC_API_URL` the same way
 * `app/layout.tsx` does, for the same reason: the browser should get the
 * value the server already validated (`webEnvSchema`) rather than a second,
 * unvalidated `process.env` read from a client component. Everything else —
 * the session, the profile, the form — is `SettingsPage`'s job.
 */
export default function SettingsRoutePage() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? '';
  return <SettingsPage apiOrigin={apiOriginOrEmpty(apiUrl)} />;
}

/**
 * `apiOriginOf` throws on a value that is not an absolute URL. `webEnvSchema`
 * makes that impossible once the process has booted, so the only way to reach
 * it here is a build-time render with no environment — where an empty string
 * is the honest answer and the ICS section falls back to its "unavailable"
 * copy instead of a broken link (mirrors `app/layout.tsx`'s `originOrEmpty`).
 */
function apiOriginOrEmpty(apiUrl: string): string {
  try {
    return apiOriginOf(apiUrl);
  } catch {
    return '';
  }
}
