'use client';

/**
 * The bar every signed-in screen sits under: the logo on the left, the
 * identity and its menu on the right.
 *
 * Drawn from `doc/design/screens/02-avatar-menu.png` and the markup behind it
 * (`doc/design/lets-park-design.dc.html`, the `isApp` branch). Composition
 * only — `Avatar`, `Badge` and `Dropdown` are design-system primitives, and
 * nothing presentational is invented here. The menu's keyboard behaviour,
 * roving tabindex, click-outside and Escape handling all come from `Dropdown`.
 *
 * It takes what it draws as props and reports what was chosen through two
 * callbacks; `./app-top-bar.tsx` is the half that reads the session and the
 * profile. The split is not ceremony: every rule this file encodes — when the
 * `ADMIN` badge appears, when `Správa` appears, what the initials are, which
 * entry is destructive — is then a pure function of its input, and a test can
 * ask about all of them without a router, a session or a network.
 */

import { Avatar, Badge, Dropdown, cx } from '@lets-park/design-system/primitives';
import type { DropdownItem } from '@lets-park/design-system/primitives';
import type { UserRole } from '@lets-park/contract';
import { useTranslations } from '@lets-park/i18n';
import Link from 'next/link';
import { ADMIN_ROUTE, LOT_ROUTE, SETTINGS_ROUTE } from '../routes';
import { Brand } from './brand';
import { initialsOf } from './initials';

/** Menu entry ids. `Dropdown.onSelect` reports one of these back. */
export const MENU_SETTINGS = 'settings';
export const MENU_ADMIN = 'administration';
export const MENU_SIGN_OUT = 'sign-out';

export interface TopBarProps {
  /** Display name. Empty while neither the session nor the profile has one. */
  readonly name: string;
  /** Shown under the name inside the menu. */
  readonly email: string;
  /**
   * The caller's role, or `undefined` while `me.get` is in flight or after it
   * failed. Anything other than `ADMIN` — `undefined` included — hides both the
   * badge and the `Správa` entry: unknown is not an admin.
   */
  readonly role?: UserRole | undefined;
  /** Called with {@link ADMIN_ROUTE} or {@link SETTINGS_ROUTE}. */
  readonly onNavigate: (route: string) => void;
  readonly onSignOut: () => void;
}

export function TopBar({ name, email, role, onNavigate, onSignOut }: TopBarProps) {
  const t = useTranslations('nav');
  const isAdmin = role === 'ADMIN';

  const items: DropdownItem[] = [
    { id: 'identity-separator', separator: true },
    { id: MENU_SETTINGS, label: t('settings') },
    ...(isAdmin
      ? [
          {
            id: MENU_ADMIN,
            label: t('administration'),
            // The design draws a right arrow on this entry alone, marking it
            // as the one that leaves the current screen.
            trailing: <span aria-hidden="true">→</span>,
          },
        ]
      : []),
    { id: 'sign-out-separator', separator: true },
    { id: MENU_SIGN_OUT, label: t('signOut'), danger: true },
  ];

  const onSelect = (id: string) => {
    if (id === MENU_SETTINGS) {
      onNavigate(SETTINGS_ROUTE);
    } else if (id === MENU_ADMIN) {
      onNavigate(ADMIN_ROUTE);
    } else if (id === MENU_SIGN_OUT) {
      onSignOut();
    }
  };

  return (
    <header
      className={cx(
        'sticky top-0 z-[var(--z-sticky)] flex h-16 items-center justify-between gap-4',
        'border-b border-border bg-bg px-4'
      )}
    >
      <Link href={LOT_ROUTE} className="inline-flex items-center rounded-sm">
        <Brand />
      </Link>

      <div className="flex items-center gap-3">
        {isAdmin ? (
          <Badge tone="info" className="uppercase tracking-caps">
            {t('adminBadge')}
          </Badge>
        ) : null}

        <Dropdown
          triggerLabel={t('userMenu')}
          label={t('userMenu')}
          trigger={
            <>
              <Avatar tone="dark" initials={initialsOf(name)} />
              <span className="font-medium">{name}</span>
              <span aria-hidden="true" className="text-xs text-fg-3">
                ▾
              </span>
            </>
          }
          header={
            <div>
              <div className="text-sm font-bold text-fg">{name}</div>
              <div className="text-xs text-fg-3">{email}</div>
            </div>
          }
          items={items}
          onSelect={onSelect}
        />
      </div>
    </header>
  );
}
