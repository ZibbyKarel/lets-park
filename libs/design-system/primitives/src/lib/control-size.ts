/**
 * The height scale shared by every control that sits on a form row — Button,
 * Input, Select, Stepper. The pixel values live in
 * `@lets-park/design-system/tokens` (`--control-h-*`); this module only names
 * the steps and picks the matching horizontal padding and type size, both of
 * which come from the ordinary `--space-*` / `--fs-*` scales.
 */
export type ControlSize = 'sm' | 'md' | 'lg' | 'xl';

/** Track height. Arbitrary-value syntax because Tailwind has no height namespace. */
export const CONTROL_HEIGHT: Record<ControlSize, string> = {
  sm: 'h-[var(--control-h-sm)]',
  md: 'h-[var(--control-h-md)]',
  lg: 'h-[var(--control-h-lg)]',
  xl: 'h-[var(--control-h-xl)]',
};

/** Type size per step. */
export const CONTROL_TEXT: Record<ControlSize, string> = {
  sm: 'text-sm',
  md: 'text-sm',
  lg: 'text-base',
  xl: 'text-md',
};

/** Horizontal padding for controls whose content is centred (buttons). */
export const CONTROL_PADDING_X: Record<ControlSize, string> = {
  sm: 'px-4',
  md: 'px-5',
  lg: 'px-6',
  xl: 'px-8',
};

/** Horizontal padding for controls whose content is a caret-aligned text run (fields). */
export const FIELD_PADDING_X: Record<ControlSize, string> = {
  sm: 'px-3',
  md: 'px-4',
  lg: 'px-4',
  xl: 'px-5',
};

/**
 * Focus ring. The design only specifies focus for text fields (border turns
 * brand blue), which is too weak to be the sole focus affordance and says
 * nothing about buttons — so every focusable primitive additionally gets this
 * one consistent, high-contrast ring. See
 * `doc/decision/0012-focus-ring-primitivu.md`.
 */
export const FOCUS_RING =
  'outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue';

/**
 * Press feedback, taken verbatim from the design's `style-active` rules
 * (`transform:scale(0.97)`). A transform ratio, not a color or a length, so it
 * has no token counterpart.
 */
export const PRESS_FEEDBACK = 'active:not-disabled:scale-[0.97]';

/** Shared transition. */
export const CONTROL_TRANSITION = 'transition duration-[var(--dur-base)] ease-out';
