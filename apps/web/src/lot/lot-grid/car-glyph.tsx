'use client';

import { cx } from '@lets-park/design-system/primitives';

/**
 * The car, seen from above.
 *
 * An **SVG with a viewBox**, not a stack of positioned boxes. The design draws
 * it as nine absolutely-positioned divs, and transcribing those would have put
 * a dozen pixel literals into TSX — which would read as spacing decisions and
 * be linted as such, when they are nothing of the kind. Inside a `viewBox`
 * they are user units in the drawing's own coordinate system, obviously an
 * illustration's proportions rather than layout, and the whole glyph scales
 * from the one size below.
 *
 * The body takes the car colour from `--color-car-*` through `fill="currentColor"`
 * and a text utility, so the palette stays the design system's.
 *
 * Purely decorative: the holder's name and plate are written underneath in
 * real text, so a second announcement of the same fact would be noise.
 */
export function CarGlyph({ colorClass }: { readonly colorClass: string }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="-4 0 66 104"
      width="62"
      height="98"
      className={cx('shrink-0 drop-shadow-md', colorClass)}
    >
      {/* wing mirrors, behind the body */}
      <rect x="-4" y="32" width="5" height="9" rx="2" className="fill-brand-dark/40" />
      <rect x="57" y="32" width="5" height="9" rx="2" className="fill-brand-dark/40" />
      {/* body */}
      <path
        d="M0 16A16 16 0 0 1 16 0h26a16 16 0 0 1 16 16v75a13 13 0 0 1-13 13H13A13 13 0 0 1 0 91Z"
        fill="currentColor"
      />
      {/* windscreen, roof panel, rear window */}
      <rect x="8" y="10" width="42" height="20" rx="7" className="fill-brand-dark/45" />
      <rect x="5" y="36" width="48" height="34" rx="6" className="fill-neutral-0/15" />
      <rect x="8" y="76" width="42" height="16" rx="5" className="fill-brand-dark/35" />
    </svg>
  );
}
