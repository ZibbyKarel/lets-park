'use client';

/**
 * A route the shell already navigates to, whose screen belongs to a later
 * task.
 *
 * The avatar menu links to `/nastaveni` and `/sprava`, and the top bar's logo
 * links to `/`, so all three have to resolve to something today — a 404 behind
 * a menu entry is worse than a page that says what it is. Each of Tasks 24, 26
 * and 27 replaces one of these; when the last one goes, so does this file.
 *
 * The heading is real, not filler: it is the section's name from the message
 * catalog, which is what those screens will title themselves with.
 */

import { EmptyState } from '@lets-park/design-system/compounds';
import { useTranslations } from '@lets-park/i18n';

export type SectionKey = 'lot' | 'settings' | 'administration';

export function SectionPlaceholder({ section }: { readonly section: SectionKey }) {
  const sections = useTranslations('sections');
  const shell = useTranslations('shell');

  return (
    <>
      <h1 className="mb-6 text-3xl font-bold tracking-tight text-fg">{sections(section)}</h1>
      <EmptyState title={shell('comingSoon')} />
    </>
  );
}
