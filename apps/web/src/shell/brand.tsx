'use client';

/**
 * The logo lockup: a blue rounded tile carrying a `P`, next to the wordmark.
 *
 * Drawn twice in the design at two sizes — 52 px on the login canvas
 * (`doc/design/screens/canvas-default.png`) and 30 px in the top bar
 * (`02-avatar-menu.png`) — so it is one component with a size step rather than
 * two pieces of markup that can drift.
 *
 * It lives in app code, not in the design system: a design system is
 * domain-free, and a product's own logo is the most domain-specific thing
 * there is (global constraint 5).
 *
 * **Rounded to tokens.** The design's exact boxes are 52 px / 30 px with 16 px
 * / 9 px radii; the token scale offers 48 px / 32 px (`--space-12` /
 * `--space-8`) and 16 px / 8 px (`--radius-md` / `--radius-xs`). Snapping to
 * the scale rather than hand-writing four pixel values is the rule
 * `doc/decision/0011-derived-control-tokens-and-rounding.md` set for exactly
 * this situation.
 */

import { cx } from '@lets-park/design-system/primitives';
import { useTranslations } from '@lets-park/i18n';

export type BrandSize = 'sm' | 'lg';

const TILE_CLASSES: Record<BrandSize, string> = {
  sm: 'size-8 rounded-xs text-md',
  lg: 'size-12 rounded-md text-2xl',
};

const WORDMARK_CLASSES: Record<BrandSize, string> = {
  sm: 'text-md tracking-snug',
  lg: 'text-2xl tracking-tight',
};

const GAP_CLASSES: Record<BrandSize, string> = {
  sm: 'gap-2',
  lg: 'gap-3',
};

export interface BrandProps {
  /** Diameter step. Defaults to the top bar's. */
  readonly size?: BrandSize;
  /**
   * Renders the wordmark as the page's `<h1>` instead of a plain span.
   *
   * Opt-in, and only the login screen passes it: that page has no other
   * heading, whereas inside the app the `<h1>` belongs to the screen's own
   * title and a second one in the top bar would break the outline.
   */
  readonly asHeading?: boolean;
  readonly className?: string;
}

export function Brand({ size = 'sm', asHeading = false, className }: BrandProps) {
  const t = useTranslations('shell');
  const Wordmark = asHeading ? 'h1' : 'span';

  // A `<div>` rather than a `<span>`, because `asHeading` puts an `<h1>`
  // inside it and a heading is flow content that phrasing content may not
  // contain. `<a>` may contain flow content, so the top bar's link still wraps
  // this legally.
  return (
    <div className={cx('inline-flex items-center', GAP_CLASSES[size], className)}>
      <span
        aria-hidden="true"
        className={cx(
          'inline-flex shrink-0 items-center justify-center bg-brand-blue font-bold text-fg-on-blue tracking-tight',
          TILE_CLASSES[size]
        )}
      >
        P
      </span>
      <Wordmark className={cx('m-0 font-bold text-fg', WORDMARK_CLASSES[size])}>
        {t('brand')}
      </Wordmark>
    </div>
  );
}
