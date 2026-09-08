'use client';

/**
 * Thin horizontal rule for separating groups of menu items.
 *
 * Module-private: `Dropdown` renders it itself for an item with
 * `separator: true`, which is the only way a caller asks for one. It exists as
 * a function so its markup lives in one place, not as a second entry point.
 */
export function DropdownSeparator() {
  return <div role="separator" className="mx-1 my-1 h-px bg-divider" />;
}
