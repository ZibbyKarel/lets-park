export type ClassValue = string | false | null | undefined;

/**
 * Joins class names, dropping anything falsy.
 *
 * Deliberately not `clsx`/`classnames`: the primitives only ever compose a
 * handful of flat strings, and a one-line helper keeps the design system's
 * runtime dependency list at zero.
 */
export function cx(...values: ClassValue[]): string {
  return values.filter(Boolean).join(' ');
}
