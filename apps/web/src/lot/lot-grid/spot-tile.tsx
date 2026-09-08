'use client';

import { Badge, cx } from '@lets-park/design-system/primitives';
import { useTranslations } from '@lets-park/i18n';
import type { SpotView } from '../lot-view';
import { CarGlyph } from './car-glyph';

export interface SpotTileProps {
  readonly spot: SpotView;
  /** Opening the spot's modal. Not called for an `editing` tile. */
  readonly onOpen: (spotId: string) => void;
  /**
   * The `⋯` button, admins only, on a taken spot. It opens the **same**
   * dialog `onOpen` does, deliberately: the contract exposes no procedure to
   * edit somebody else's reservation (only create-for-self and cancel), so
   * there is no second surface to route to. `SpotDialog` already renders the
   * admin-flavoured copy (`titleEdit`/`subAdmin`) and the cancel button off
   * `isAdmin` alone, regardless of which button opened it. What `⋯` adds is
   * discoverability that matches the design's own affordance
   * (`01-lot-admin.png`) — not a different modal. See `doc/decision/0125-*`.
   */
  readonly onAdminOpen: (spotId: string) => void;
}

/**
 * One parking bay.
 *
 * A **real `<button>`**, not a clickable `<div>`: Enter and Space, the focus
 * ring and the disabled state all come from the platform that way. An
 * `editing` tile is genuinely `disabled` rather than merely ignoring clicks,
 * which is also what keeps it out of the tab order — the design's `if
 * (locked) return;` is a pointer-only version of the same rule.
 *
 * The `⋯` button is a sibling button rather than a nested one: a button
 * inside a button is invalid HTML and browsers recover from it
 * unpredictably. It is not a menu — see {@link SpotTileProps.onAdminOpen}.
 */
export function SpotTile({ spot, onOpen, onAdminOpen }: SpotTileProps) {
  const t = useTranslations('lot');
  const inert = spot.action === 'none';

  /**
   * The bay's whole state, in its accessible name.
   *
   * `aria-label` **replaces** the button's contents as its accessible name,
   * and a screen reader treats a `<button>` as a single node — so everything
   * rendered inside it below ("Volné", the holder's name and plate,
   * "rezervace uzamčeny", "právě upravuje" and the editor) used to be
   * announced to nobody. A taken bay, a window-locked bay and a bay somebody
   * else is editing all read as "Otevřít místo E2.93", with no way to tell
   * them apart; the only state that survived was the waitlist `Badge`, which
   * happens to sit outside the button. See `doc/decision/0257-*`.
   *
   * Built from the **same keys the tile draws**, not from a second set written
   * for screen readers. Two catalogues saying nearly the same thing is how
   * they drift, and the visible text is already the true statement of the
   * state — an alternative wording could only ever be a worse copy of it.
   *
   * The waitlist pill is deliberately left out: it is a sibling of this
   * button, not a child, so it already has its own place in the reading order.
   */
  const stateWords: readonly (string | null)[] =
    spot.appearance === 'free'
      ? [t('free')]
      : spot.appearance === 'taken'
        ? [spot.holderName, spot.holderPlate ?? t('noPlate')]
        : spot.appearance === 'window-locked'
          ? [t('tileLocked')]
          : // "právě upravuje Jana Dvořáková" reads as one clause and is joined
            // with a space; the tile draws the same two strings on two lines.
            [
              spot.editorName === null
                ? t('tileEditing')
                : `${t('tileEditing')} ${spot.editorName}`,
            ];

  const accessibleName = [
    spot.appearance === 'free'
      ? t('reserveSpotAction', { label: spot.label })
      : t('openSpotAction', { label: spot.label }),
    ...stateWords,
  ]
    .filter((word): word is string => word !== null && word !== '')
    .join(', ');

  return (
    <div
      className={cx(
        'relative flex flex-1 basis-[var(--lot-tile-min-w)]',
        'max-w-[var(--lot-tile-max-w)] flex-col',
        'border-r-[length:var(--lot-line-w)] border-t-[length:var(--lot-kerb-w)] border-neutral-0/50'
      )}
    >
      <button
        type="button"
        disabled={inert}
        onClick={() => {
          onOpen(spot.spotId);
        }}
        aria-label={accessibleName}
        className={cx(
          'flex h-[var(--lot-tile-h)] w-full cursor-pointer flex-col items-center',
          'px-3 py-3 text-left transition duration-[var(--dur-base)] ease-out',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px]',
          'focus-visible:outline-brand-blue',
          inert ? 'cursor-default bg-brand-yellow/6' : 'hover:bg-neutral-0/6'
        )}
      >
        <span className="mb-3 text-sm font-bold tracking-wide text-neutral-0/80">{spot.label}</span>

        {spot.appearance === 'free' ? (
          <span className="flex w-full flex-1 flex-col items-center justify-center gap-3 rounded-sm border-2 border-dashed border-neutral-0/30 text-neutral-0/70">
            <span
              aria-hidden="true"
              className="flex size-8 items-center justify-center rounded-cta bg-neutral-0/15 text-xl font-bold leading-none"
            >
              +
            </span>
            <span className="text-sm font-medium">{t('free')}</span>
          </span>
        ) : null}

        {spot.appearance === 'taken' && spot.carColorClass !== null ? (
          <span className="flex flex-1 flex-col items-center justify-start gap-2">
            <CarGlyph colorClass={spot.carColorClass} />
            <span className="block text-center">
              <span className="block text-sm font-bold text-neutral-0">{spot.holderName}</span>
              <span className="block text-xs tracking-normal text-neutral-0/60">
                {spot.holderPlate ?? t('noPlate')}
              </span>
            </span>
          </span>
        ) : null}

        {spot.appearance === 'window-locked' ? (
          <span className="flex w-full flex-1 flex-col items-center justify-center gap-3 rounded-sm border-2 border-neutral-0/20 bg-brand-dark/15 text-neutral-0/60">
            <span
              aria-hidden="true"
              className="flex size-8 items-center justify-center rounded-cta bg-neutral-0/15 text-base"
            >
              ⊘
            </span>
            <span className="px-2 text-center text-xs leading-snug">{t('tileLocked')}</span>
          </span>
        ) : null}

        {spot.appearance === 'editing' ? (
          <span className="lot-hatch flex w-full flex-1 flex-col items-center justify-center gap-3 rounded-sm border-2 border-brand-yellow/65">
            <span
              aria-hidden="true"
              className="flex size-8 items-center justify-center rounded-cta bg-brand-yellow text-base font-bold text-fg-on-yellow"
            >
              ✎
            </span>
            <span className="px-2 text-center text-xs leading-snug text-neutral-0">
              {t('tileEditing')}
              <br />
              <strong className="font-bold">{spot.editorName}</strong>
            </span>
          </span>
        ) : null}
      </button>

      {spot.waitlistCount > 0 ? (
        <Badge
          tone="warning"
          className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2"
        >
          {t('waiting', { count: spot.waitlistCount })}
        </Badge>
      ) : null}

      {spot.showAdminMenu ? (
        <button
          type="button"
          onClick={() => {
            onAdminOpen(spot.spotId);
          }}
          aria-label={t('spotMenu', { label: spot.label })}
          className={cx(
            'absolute right-2 top-2 flex size-6 cursor-pointer items-center justify-center',
            'rounded-xs border-0 bg-neutral-0/20 text-sm font-bold leading-none text-neutral-0',
            'transition duration-[var(--dur-base)] ease-out hover:bg-neutral-0 hover:text-fg',
            'focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-blue'
          )}
        >
          ⋯
        </button>
      ) : null}
    </div>
  );
}
