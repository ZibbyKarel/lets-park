'use client';

/**
 * The signed-out canvas: the logo, two lines of explanation, one button, one
 * footnote. Drawn from `doc/design/screens/canvas-default.png` and the markup
 * behind it (`doc/design/lets-park-design.dc.html`, the `isLogin` branch).
 *
 * The button is a `<form action={…}>` submit rather than an `onClick`, and that
 * is the point of splitting this file from its page: the action is a **Server
 * Action** that calls `libs/lets-park/auth`'s server-side `signIn`, so the redirect to
 * Okta is issued by the server and the page works with JavaScript disabled.
 * Nothing about the credential exchange happens in the browser — see
 * `doc/auth.md` §"The flow, end to end".
 */

import { Button, Stack } from '@lets-park/design-system/primitives';
import { useTranslations } from '@lets-park/i18n';
import { Brand } from '../brand';

export interface LoginScreenProps {
  /** Server Action that starts the Okta authorization-code flow. */
  readonly action: () => Promise<void>;
}

export function LoginScreen({ action }: LoginScreenProps) {
  const t = useTranslations('login');

  return (
    <Stack align="center" justify="center" spacing={8} className="min-h-dvh bg-bg px-4 text-center">
      <Brand size="lg" asHeading />

      <p className="text-md leading-loose text-fg-3">
        {t('tagline')}
        <br />
        {t('taglineSecondary')}
      </p>

      <form action={action}>
        <Button
          type="submit"
          size="xl"
          startAdornment={
            // The design's inset "O" chip: a translucent square on the blue
            // fill, not an icon. `bg-bg/20` is the white surface token at the
            // design's 22% alpha.
            <span
              aria-hidden="true"
              className="inline-flex size-5 items-center justify-center rounded-xs bg-bg/20 text-xs font-bold"
            >
              O
            </span>
          }
        >
          {t('signIn')}
        </Button>
      </form>

      <p className="text-xs font-bold uppercase tracking-caps text-neutral-400">{t('footnote')}</p>
    </Stack>
  );
}
