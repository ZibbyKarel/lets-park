'use client';

/**
 * The "Uživatelé" tab (`doc/design/screens/03-admin-users.png`): the account
 * list, with a switch per row for the admin role and one for the account being
 * active at all.
 *
 * ## Two switches, one of which the design does not draw
 *
 * The design shows `Jméno` / `E-mail` / `Admin`. The brief also requires
 * deactivation, and the contract already carries it
 * (`adminUpdateUserInputSchema` picks exactly `role` and `active`). The second
 * switch is therefore added in the design's own idiom — the same `Switch` the
 * "Aktivní" column of `04-admin-spots.png` uses — rather than as a new control
 * the product has never drawn. See
 * `doc/decision/0160-the-users-table-gets-an-active-switch-the-design-does-not-draw.md`.
 *
 * ## The disabled switch is a courtesy, not the rule
 *
 * A user's own "Aktivní" switch is disabled, because deactivating yourself is
 * how an admin loses their own session mid-task. The **enforcement** is on the
 * API: `UsersService.adminUpdate` refuses it with `CONFLICT`, and refuses
 * removing the last active admin, whatever any browser sends. Nothing here is
 * authorization — `@Roles('ADMIN')` on the two procedures is.
 *
 * Presentational: everything arrives as a prop. `./admin-users-panel.tsx` is
 * the connected half.
 */

import { useMemo, useState } from 'react';
import type { AdminUser } from '@lets-park/contract';
import { Avatar, Input, Switch, Toast } from '@lets-park/design-system/primitives';
import { DataTable } from '@lets-park/design-system/compounds';
import type { DataTableColumn } from '@lets-park/design-system/compounds';
import { useTranslations } from '@lets-park/i18n';
import { initialsOf } from '../initials';
import { ScreenError, ScreenLoading } from '../screen-state';
import { useAdminWriteError } from './admin-errors';

/** One field of one row is being written. `null` when nothing is in flight. */
export interface PendingUserChange {
  readonly id: string;
  readonly field: 'role' | 'active';
}

export interface AdminUsersScreenProps {
  readonly isPending: boolean;
  readonly isError: boolean;
  readonly error: unknown;
  readonly onRetry: () => void;
  /** `undefined` exactly when `isPending || isError`. */
  readonly users: readonly AdminUser[] | undefined;
  /** Id of the signed-in admin, so their own row can protect itself. */
  readonly viewerId: string | undefined;
  readonly onRoleChange: (id: string, isAdmin: boolean) => void;
  readonly onActiveChange: (id: string, active: boolean) => void;
  /** Which row and field is being written, if any. */
  readonly pendingChange: PendingUserChange | null;
  /** Whatever the failing `admin.user.update` call threw. */
  readonly updateError: unknown;
}

/**
 * The client-side half of the search box.
 *
 * Substring, case-insensitive, against name **or** email — deliberately the
 * same rule `UsersService.adminList` applies to its `search` input, because the
 * two must not disagree about what a search means. Filtering here rather than
 * refetching per keystroke is recorded in
 * `doc/decision/0162-the-user-search-filters-the-loaded-list.md`.
 */
export function matchesUserSearch(user: AdminUser, term: string): boolean {
  const needle = term.trim().toLocaleLowerCase('cs-CZ');
  if (needle === '') {
    return true;
  }
  return (
    user.name.toLocaleLowerCase('cs-CZ').includes(needle) ||
    user.email.toLocaleLowerCase('cs-CZ').includes(needle)
  );
}

export function AdminUsersScreen({
  isPending,
  isError,
  error,
  onRetry,
  users,
  viewerId,
  onRoleChange,
  onActiveChange,
  pendingChange,
  updateError,
}: AdminUsersScreenProps) {
  const t = useTranslations('admin');
  const describeWriteError = useAdminWriteError();
  const [search, setSearch] = useState('');

  const all = users ?? [];
  const visible = useMemo(
    () => all.filter((user) => matchesUserSearch(user, search)),
    [all, search]
  );

  const updateErrorMessage = describeWriteError('userUpdate', updateError);

  const columns: DataTableColumn<AdminUser>[] = [
    {
      id: 'name',
      header: t('usersColumnName'),
      sortValue: (user) => user.name.toLocaleLowerCase('cs-CZ'),
      cell: (user) => (
        <span className="inline-flex items-center gap-3">
          <Avatar initials={initialsOf(user.name)} size="sm" />
          <span className="font-bold text-fg">{user.name}</span>
        </span>
      ),
    },
    {
      id: 'email',
      header: t('usersColumnEmail'),
      sortValue: (user) => user.email.toLocaleLowerCase('cs-CZ'),
      cell: (user) => <span className="text-fg-3">{user.email}</span>,
    },
    {
      id: 'role',
      header: t('usersColumnAdmin'),
      align: 'end',
      width: '120px',
      cell: (user) => (
        <Switch
          checked={user.role === 'ADMIN'}
          aria-label={t('usersAdminToggleLabel', { name: user.name })}
          disabled={isRowBusy(pendingChange, user.id)}
          onCheckedChange={(next) => onRoleChange(user.id, next)}
        />
      ),
    },
    {
      id: 'active',
      header: t('usersColumnActive'),
      align: 'end',
      width: '120px',
      cell: (user) => {
        const isSelf = user.id === viewerId;
        return (
          <span
            className="inline-flex items-center"
            title={isSelf ? t('usersSelfActiveHint') : undefined}
          >
            <Switch
              tone="success"
              checked={user.active}
              aria-label={t('usersActiveToggleLabel', { name: user.name })}
              disabled={isSelf || isRowBusy(pendingChange, user.id)}
              onCheckedChange={(next) => onActiveChange(user.id, next)}
            />
          </span>
        );
      },
    },
  ];

  if (isPending) {
    return <ScreenLoading />;
  }

  if (isError || users === undefined) {
    return <ScreenError error={error} onRetry={onRetry} headingLevel={3} />;
  }

  return (
    <div className="flex flex-col gap-4">
      {updateErrorMessage ? <Toast tone="danger">{updateErrorMessage}</Toast> : null}

      <DataTable
        columns={columns}
        data={visible}
        getRowId={(user) => user.id}
        title={t('usersTitle')}
        description={t('usersDescription', { count: all.length })}
        actions={
          <Input
            type="search"
            // `aria-label`, not `label`: the design draws a bare field with a
            // placeholder and no visible caption, and a placeholder is not an
            // accessible name — it disappears the moment anything is typed.
            aria-label={t('usersSearchLabel')}
            placeholder={t('usersSearchPlaceholder')}
            value={search}
            onChange={(event) => setSearch(event.currentTarget.value)}
            wrapperClassName="w-full sm:w-80"
          />
        }
        defaultSort={{ columnId: 'name', direction: 'asc' }}
        minWidth="720px"
        emptyTitle={search.trim() === '' ? t('usersEmpty') : t('usersEmptySearch')}
        emptyDescription={search.trim() === '' ? undefined : t('usersEmptySearchDescription')}
      />
    </div>
  );
}

/**
 * Whether a row's switches are blocked because one of them is mid-flight.
 *
 * Per **row**, not per switch: the two fields go through the same procedure,
 * and letting a role change land while an activity change for the same user is
 * still in the air is how the second response overwrites the first.
 */
function isRowBusy(pending: PendingUserChange | null, id: string): boolean {
  return pending !== null && pending.id === id;
}
