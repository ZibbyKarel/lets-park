'use client';

import Link from 'next/link';
import { EmptyState } from '@lets-park/design-system/compounds';
import { useTranslations } from '@lets-park/i18n';
import { LOT_ROUTE } from '../routes';

/**
 * The 404. Rendered inside the root layout, so it already has the providers —
 * which is what lets it read Czech copy rather than shipping Next.js's English
 * default page.
 *
 * The way back is a **link**, not a `Button`: it is a navigation, so it should
 * be openable in a new tab and readable as a link by assistive technology.
 * `Button` takes no `href` and wrapping one in an anchor would nest two
 * interactive elements — the design draws no 404 screen to copy either way, so
 * this follows the same "invented, in the design's language" rule `EmptyState`
 * itself was built under (`doc/decision/0071-*`).
 */
export default function NotFound() {
  const t = useTranslations('shell');

  return (
    <main className="mx-auto w-full max-w-[var(--container)] px-4 py-16">
      <EmptyState
        headingLevel={2}
        title={t('notFoundTitle')}
        description={t('notFoundDescription')}
        action={
          <Link
            href={LOT_ROUTE}
            className="rounded-sm text-sm font-bold text-brand-blue underline outline-none hover:text-brand-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue"
          >
            {t('backToLot')}
          </Link>
        }
      />
    </main>
  );
}
