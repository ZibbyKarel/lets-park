'use client';

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';

import { FOCUS_RING, INSET_FOCUS_RING } from '../control-size';
import { cx } from '../cx';
import { DismissableLayerProvider, useDismissableLayer } from '../dismissable-layer/dismissable-layer';
import { getTabbableElements } from '../use-focus-trap';

export type DropdownAlign = 'start' | 'end';

export interface DropdownItem {
  /** Stable identity. Also what `onSelect` reports — never for a separator. */
  id: string;
  /**
   * Renders a thin dividing rule in place of a selectable item. Every other
   * field below is ignored when this is `true`.
   */
  separator?: boolean | undefined;
  /** Visible label. Required unless `separator` is `true`. */
  label?: ReactNode;
  /** Optional trailing content, e.g. an arrow or a shortcut. */
  trailing?: ReactNode | undefined;
  /** Renders the item in the danger tone. */
  danger?: boolean | undefined;
  disabled?: boolean | undefined;
}

export interface DropdownProps {
  /**
   * The control that opens the menu. Rendered inside a `<button>` that this
   * component owns, so that `aria-haspopup`, `aria-expanded` and
   * `aria-controls` can never drift from the panel's actual state.
   */
  trigger: ReactNode;
  /** Accessible name of the trigger, when `trigger` is not self-describing. */
  triggerLabel?: string | undefined;
  items: DropdownItem[];
  /** Called with the item's `id`. The menu closes itself first. */
  onSelect?: ((id: string) => void) | undefined;
  /** Optional block above the items, e.g. an identity header. Not focusable. */
  header?: ReactNode | undefined;
  /** Accessible name of the menu itself. Defaults to the trigger's name. */
  label?: string | undefined;
  /** Which edge of the trigger the panel aligns to. Defaults to `end`. */
  align?: DropdownAlign | undefined;
  className?: string | undefined;
  triggerClassName?: string | undefined;
}

/**
 * Button that opens a menu of actions.
 *
 * `role="menu"` with `role="menuitem"` children, driven by **roving tabindex**:
 * exactly one item is in the tab order at a time and the arrow keys move it.
 * That is the pattern ARIA's menu role expects — a menu is a single composite
 * widget, not a list of independently tabbable buttons — and it means Tab
 * leaves the menu entirely rather than walking it item by item.
 *
 * Deliberately **not** a portal, unlike `Modal`: the panel is positioned
 * relative to its trigger, and keeping it in the same DOM subtree is what makes
 * "click outside closes it" and the nesting inside a modal work without any
 * coordinate maths. Its `z-index` is therefore local to whatever stacking
 * context the trigger already sits in.
 *
 * **No type-ahead.** ARIA lists it as optional for menus, and the design's menu
 * is three items long — a feature nobody can discover on three items, but that
 * would still swallow every printable key. See
 * `doc/decision/0054-keyboard-navigation-for-dropdown-and-tabs.md`.
 */
export function Dropdown({
  trigger,
  triggerLabel,
  items,
  onSelect,
  header,
  label,
  align = 'end',
  className,
  triggerClassName,
}: DropdownProps) {
  const baseId = useId();
  const menuId = `${baseId}-menu`;
  const triggerId = `${baseId}-trigger`;
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  /** Indices of the items the keyboard is allowed to land on. */
  const enabledIndexes = useMemo(
    () =>
      items
        .map((item, index) => (item.separator || item.disabled ? -1 : index))
        .filter((index) => index >= 0),
    [items]
  );

  const close = useCallback(
    (returnFocus: boolean) => {
      setOpen(false);
      if (returnFocus) {
        triggerRef.current?.focus();
      }
    },
    [] // triggerRef is stable
  );

  const openAt = (index: number) => {
    setActiveIndex(index);
    setOpen(true);
  };

  // Keeps DOM focus on the item the roving tabindex points at. Runs after every
  // change of `activeIndex` so arrow keys move focus, not just an attribute.
  useEffect(() => {
    if (!open) {
      return;
    }

    const item = itemRefs.current[activeIndex];
    if (item && !item.disabled) {
      item.focus();

      return;
    }

    // Nothing focusable to land on — a menu whose every item is disabled, or an
    // active index that fell on a separator. `.focus()` on a `disabled` button
    // is a silent no-op, so without this the panel would open with
    // `aria-expanded="true"` while focus stayed on the trigger behind it: a
    // keyboard user would have opened something they cannot reach, and Escape
    // would not be delivered to it either. Focusing the panel itself keeps the
    // menu announced and dismissable.
    menuRef.current?.focus();
  }, [open, activeIndex]);

  // Escape closes and hands focus back to the trigger — but only when this menu
  // is the layer the press belongs to. `rootRef` is what gets registered rather
  // than the panel, because it is mounted whether the menu is open or not, so
  // the node handed to the set is never one that is about to disappear from
  // under it mid-render.
  const layer = useDismissableLayer({
    active: open,
    elementRef: rootRef,
    onDismiss: () => close(true),
  });

  // Click outside closes. Pointer-only affordance, kept out of the layer set
  // above on purpose: a pointer event names its own target, so every open
  // overlay can independently and correctly answer "was that outside me?".
  // Escape names nothing, which is the only reason it needs one arbiter.
  useEffect(() => {
    if (!open) {
      return;
    }

    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', onPointerDown);

    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  const firstEnabled = enabledIndexes[0] ?? 0;
  const lastEnabled = enabledIndexes[enabledIndexes.length - 1] ?? 0;

  const step = (direction: 1 | -1) => {
    const position = enabledIndexes.indexOf(activeIndex);
    // Wrap, as ARIA's menu pattern specifies: past the end is the start again.
    const nextPosition =
      (position + direction + enabledIndexes.length) % Math.max(enabledIndexes.length, 1);
    setActiveIndex(enabledIndexes[nextPosition] ?? firstEnabled);
  };

  /**
   * Closes the menu and moves focus to whatever follows (or precedes) the
   * trigger in the page's tab order, as if the menu had not been open.
   */
  const moveFocusPastTrigger = (backwards: boolean) => {
    const root = rootRef.current;
    const trigger = triggerRef.current;
    setOpen(false);

    if (!root || !trigger) {
      return;
    }

    // Everything tabbable in the page, minus the menu panel that is about to
    // disappear — the trigger itself is kept, as the point to count from.
    const candidates = getTabbableElements(document.body).filter(
      (element) => element === trigger || !root.contains(element)
    );
    const position = candidates.indexOf(trigger);
    const destination = candidates[position + (backwards ? -1 : 1)];

    (destination ?? trigger).focus();
  };

  const onTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    // Down opens on the first item, Up on the last — the standard shortcut for
    // reaching the bottom of a menu without walking the whole thing.
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      openAt(firstEnabled);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      openAt(lastEnabled);
    }
  };

  const onMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        step(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        step(-1);
        break;
      case 'Home':
        event.preventDefault();
        setActiveIndex(firstEnabled);
        break;
      case 'End':
        event.preventDefault();
        setActiveIndex(lastEnabled);
        break;
      // Escape is deliberately absent: it is handled once, page-wide, by the
      // layer set this menu registers with while open (see the hook call
      // above). Handling it here as well would close the menu on a press the
      // set had already given to an overlay nested inside it.
      case 'Tab':
        // Tab leaves the whole widget rather than walking the items, which is
        // what makes a menu one stop in the page's tab order.
        //
        // The move is made explicitly rather than by letting the browser's own
        // Tab run, because the browser would compute its destination from the
        // menu item the key was pressed on — a node this very handler is about
        // to unmount. Resolving the destination from the *trigger's* position
        // in the page instead is both what the user expects and the only
        // version that behaves the same before and after React re-renders.
        event.preventDefault();
        moveFocusPastTrigger(event.shiftKey);
        break;
      default:
        break;
    }
  };

  const selectItem = (item: DropdownItem) => {
    if (item.disabled) {
      return;
    }
    close(true);
    onSelect?.(item.id);
  };

  return (
    <div ref={rootRef} className={cx('relative inline-block', className)}>
      <DismissableLayerProvider layer={layer}>
        <button
          ref={triggerRef}
          type="button"
          id={triggerId}
          aria-label={triggerLabel}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={open ? menuId : undefined}
          onClick={() => (open ? close(false) : openAt(firstEnabled))}
          onKeyDown={onTriggerKeyDown}
          className={cx(
            'inline-flex cursor-pointer items-center gap-3 rounded-cta border border-border bg-bg',
            'py-1 pl-1 pr-3 text-sm text-fg',
            'transition duration-[var(--dur-fast)] ease-out hover:shadow-sm',
            FOCUS_RING,
            triggerClassName
          )}
        >
          {trigger}
        </button>

        {open ? (
          <div
            ref={menuRef}
            id={menuId}
            role="menu"
            aria-label={label}
            aria-labelledby={label ? undefined : triggerId}
            // Focusable only programmatically, and only as the fallback above:
            // -1 keeps it out of the tab order, so the menu is still one stop.
            tabIndex={-1}
            onKeyDown={onMenuKeyDown}
            className={cx(
              'absolute top-full mt-2 flex flex-col gap-1 rounded-md border border-border bg-bg p-2',
              'min-w-[var(--menu-min-w)] shadow-lg',
              'z-[var(--z-dropdown)]',
              align === 'end' ? 'right-0' : 'left-0'
            )}
          >
            {header ? <div className="px-3 pb-3 pt-2">{header}</div> : null}

            {items.map((item, index) =>
              item.separator ? (
                <DropdownSeparator key={item.id} />
              ) : (
                <button
                  key={item.id}
                  ref={(node) => {
                    itemRefs.current[index] = node;
                  }}
                  type="button"
                  role="menuitem"
                  // Roving tabindex: only the active item is reachable by Tab, so
                  // the menu is one stop rather than N.
                  tabIndex={index === activeIndex ? 0 : -1}
                  disabled={item.disabled}
                  onClick={() => selectItem(item)}
                  onMouseEnter={() => {
                    if (!item.disabled) {
                      setActiveIndex(index);
                    }
                  }}
                  className={cx(
                    'flex items-center justify-between gap-3 rounded-sm border-0 bg-transparent',
                    'px-3 py-3 text-left text-sm',
                    'transition duration-[var(--dur-fast)] ease-out',
                    INSET_FOCUS_RING,
                    // Swapped, never layered (see `button.tsx`): the three states
                    // each supply their own text colour rather than stacking.
                    item.disabled
                      ? 'cursor-not-allowed text-fg-3'
                      : item.danger
                        ? 'cursor-pointer text-danger hover:bg-danger-100'
                        : 'cursor-pointer text-fg hover:bg-bg-muted'
                  )}
                >
                  <span>{item.label}</span>
                  {item.trailing ? <span className="text-fg-3">{item.trailing}</span> : null}
                </button>
              )
            )}
          </div>
        ) : null}
      </DismissableLayerProvider>
    </div>
  );
}

/**
 * Thin horizontal rule for separating groups of menu items.
 *
 * Module-private: `Dropdown` renders it itself for an item with
 * `separator: true`, which is the only way a caller asks for one. It exists as
 * a function so its markup lives in one place, not as a second entry point.
 */
function DropdownSeparator() {
  return <div role="separator" className="mx-1 my-1 h-px bg-divider" />;
}
