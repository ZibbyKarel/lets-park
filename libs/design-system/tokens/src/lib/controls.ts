/**
 * Interactive-control geometry.
 *
 * DERIVED, not sourced from `colors_and_type.css` — that file has no notion of
 * a control height, and every other token module in this lib is a byte-faithful
 * copy of it. The values below are read off the finished visual design
 * (`doc/design/lets-park-design.dc.html`), which sizes its buttons, inputs and
 * selects with literal pixel heights that are not expressible on the `--space-*`
 * scale (36px, 44px, 52px, 56px). Keeping them here — rather than inline in the
 * primitives — is what lets `libs/design-system/primitives` stay free of
 * hand-written pixel values.
 *
 * See `doc/decision/0011-odvozene-control-tokeny-a-zaokrouhleni.md` for why the
 * design's seven distinct heights collapse to four steps.
 */

/**
 * Shared height scale for buttons, inputs, selects and the stepper. The design
 * uses 32/36/40/44/48/52/56px; those cluster into four steps, and the four
 * chosen values are all literally present in the design.
 */
export const CONTROL_HEIGHTS = {
  /** Compact toolbar / table-row controls. */
  sm: '36px',
  /** Default. Day navigation, filter selects, month/year pickers. */
  md: '40px',
  /** Modal and settings forms. */
  lg: '48px',
  /** Hero call-to-action. */
  xl: '56px',
} as const;

/**
 * Toggle-switch geometry. A switch is not on the height scale above — the
 * design draws it as one fixed 46x26 track with a 20px knob, at every size it
 * appears in.
 */
export const SWITCH_GEOMETRY = {
  trackWidth: '46px',
  trackHeight: '26px',
  /** Inset between track edge and knob. */
  trackPadding: '3px',
  knobSize: '20px',
  /**
   * Tighter and darker than any `--shadow-*` step (those top out at 0.12
   * opacity); the knob needs to read as lifted off a saturated track.
   */
  knobShadow: '0 1px 2px rgba(35,34,31,0.24)',
} as const;

export const CONTROLS = {
  height: CONTROL_HEIGHTS,
  switch: SWITCH_GEOMETRY,
} as const;
