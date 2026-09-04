'use client';

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';

import { FOCUS_RING, INSET_FOCUS_RING } from './control-size';
import { cx } from './cx';

export interface TabItem {
  /** Stable identity. Also what `onValueChange` reports. */
  id: string;
  /** Visible label on the tab. */
  label: ReactNode;
  /** Panel content. Only the selected panel is rendered. */
  content?: ReactNode | undefined;
  disabled?: boolean | undefined;
}

export interface TabsProps {
  items: TabItem[];
  /** Controlled selection. Leave undefined to let Tabs own it. */
  value?: string | undefined;
  /** Initial selection when uncontrolled. Defaults to the first enabled tab. */
  defaultValue?: string | undefined;
  onValueChange?: ((id: string) => void) | undefined;
  /** Accessible name of the tab list. */
  label?: string | undefined;
  className?: string | undefined;
}

/**
 * Horizontal tab strip with one panel visible at a time.
 *
 * Wired as ARIA's tab pattern: `role="tablist"` / `role="tab"` /
 * `role="tabpanel"`, `aria-selected` on the tabs, `aria-controls` and
 * `aria-labelledby` tying each tab to its panel both ways.
 *
 * Two choices worth naming, both in
 * `doc/decision/0054-keyboard-navigation-for-dropdown-and-tabs.md`:
 *
 * - **Automatic activation.** An arrow key moves focus *and* selects, rather
 *   than moving focus and waiting for Enter. ARIA recommends this whenever
 *   showing a panel is cheap, which it is here — the panels are already in the
 *   page's data — and it saves the keyboard user a keystroke per tab.
 * - **Roving tabindex.** Only the selected tab is tabbable, so the strip is one
 *   stop in the page's tab order and Tab from a tab moves into its panel.
 */
export function Tabs({ items, value, defaultValue, onValueChange, label, className }: TabsProps) {
  const baseId = useId();
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const firstEnabled = items.find((item) => !item.disabled)?.id ?? items[0]?.id ?? '';
  const [uncontrolled, setUncontrolled] = useState(defaultValue ?? firstEnabled);
  const isControlled = value !== undefined;
  const selected = isControlled ? value : uncontrolled;

  const tabId = (id: string) => `${baseId}-tab-${id}`;
  const panelId = (id: string) => `${baseId}-panel-${id}`;

  const select = (id: string) => {
    const item = items.find((candidate) => candidate.id === id);
    if (!item || item.disabled || id === selected) {
      return;
    }
    if (!isControlled) {
      setUncontrolled(id);
    }
    onValueChange?.(id);
  };

  /** Indices of the tabs the keyboard is allowed to land on. */
  const enabledIndexes = items
    .map((item, index) => (item.disabled ? -1 : index))
    .filter((index) => index >= 0);

  const moveTo = (index: number | undefined) => {
    if (index === undefined) {
      return;
    }
    const item = items[index];
    if (!item) {
      return;
    }
    // Focus first, then select: automatic activation means both happen, and
    // moving focus explicitly is what makes the arrow keys work at all.
    tabRefs.current[index]?.focus();
    select(item.id);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const currentIndex = items.findIndex((item) => item.id === selected);
    const position = enabledIndexes.indexOf(currentIndex);
    const count = enabledIndexes.length;

    if (count === 0) {
      return;
    }

    switch (event.key) {
      // Left/Right are the axis of a horizontal tablist; Up/Down are not bound,
      // so they keep scrolling the page as the user expects.
      case 'ArrowRight':
        event.preventDefault();
        moveTo(enabledIndexes[(position + 1) % count]);
        break;
      case 'ArrowLeft':
        event.preventDefault();
        moveTo(enabledIndexes[(position - 1 + count) % count]);
        break;
      case 'Home':
        event.preventDefault();
        moveTo(enabledIndexes[0]);
        break;
      case 'End':
        event.preventDefault();
        moveTo(enabledIndexes[count - 1]);
        break;
      default:
        break;
    }
  };

  const selectedItem = items.find((item) => item.id === selected);

  return (
    <div className={cx('flex flex-col', className)}>
      <div
        role="tablist"
        aria-label={label}
        onKeyDown={onKeyDown}
        className="flex gap-1 overflow-x-auto border-b border-border"
      >
        {items.map((item, index) => {
          const isSelected = item.id === selected;

          return (
            <button
              key={item.id}
              ref={(node) => {
                tabRefs.current[index] = node;
              }}
              type="button"
              role="tab"
              id={tabId(item.id)}
              aria-selected={isSelected}
              aria-controls={panelId(item.id)}
              disabled={item.disabled}
              // Roving tabindex: the selected tab is the strip's single stop.
              tabIndex={isSelected ? 0 : -1}
              onClick={() => select(item.id)}
              className={cx(
                'shrink-0 whitespace-nowrap border-0 bg-transparent px-4 py-3 text-base',
                // The underline sits on the button's own bottom border, so the
                // selected and unselected states are the same box and nothing
                // shifts by 3px when the selection moves.
                'border-b-[length:var(--tab-indicator-h)] border-solid',
                'transition duration-[var(--dur-fast)] ease-out',
                INSET_FOCUS_RING,
                // Swapped, never layered (see `button.tsx`): each state supplies
                // its own text colour AND its own border colour, so no element
                // ever carries two of either.
                item.disabled
                  ? 'cursor-not-allowed border-transparent font-medium text-fg-3'
                  : isSelected
                    ? 'cursor-pointer border-brand-dark font-bold text-fg'
                    : 'cursor-pointer border-transparent font-medium text-fg-3 hover:text-fg'
              )}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      {selectedItem ? (
        <div
          role="tabpanel"
          id={panelId(selectedItem.id)}
          aria-labelledby={tabId(selectedItem.id)}
          // Focusable so that Tab from the tab strip reaches the panel even when
          // the panel's own content has nothing focusable in it.
          tabIndex={0}
          className={cx('pt-6', FOCUS_RING)}
        >
          {selectedItem.content}
        </div>
      ) : null}
    </div>
  );
}
