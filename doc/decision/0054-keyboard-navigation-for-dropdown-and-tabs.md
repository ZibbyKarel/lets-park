# 0054 – Keyboard navigation for Dropdown and Tabs

## What

Both components run on a **roving tabindex** (exactly one element of the widget
is in the page's tab order at any time) and make three concrete decisions that
ARIA leaves to the implementation:

| decision | Dropdown | Tabs |
| --- | --- | --- |
| activation | Enter / Space selects | **automatic** – an arrow key selects directly |
| type-ahead (typing letters) | **none** | none (ARIA does not define it for tabs) |
| what Tab does | closes the menu and jumps past the trigger | from the strip into the panel |
| wrapping at the ends | yes | yes |
| arrow axis | ↑ ↓ | ← → (↑ ↓ left to the page) |

## Why

- **Roving tabindex, not N stops.** Under ARIA, both a menu and a tab strip are
  *one* composite widget, not a list of independent buttons. If every item were
  tabbable, a keyboard user would have to wade through the tab strip with nine
  Tab presses just to reach the content.
- **Tabs: automatic activation.** ARIA recommends it whenever showing a panel is
  cheap – here it is, since the panels' content is already in the page. It saves
  one keystroke per tab. (Manual activation is the right call when a panel loads
  something; if that ever happens, it is a change in `moveTo`.)
- **Dropdown: no type-ahead.** ARIA lists it as optional for menus. The menu in
  the design has three items – nobody discovers type-ahead on three items, yet
  it would still swallow every printable key. Leaving it out is therefore a
  clean win; if a menu ever grows, it can be added.
- **Tabs: ↑ ↓ are left to the page.** A horizontal tab strip's axis is ← →. If
  it claimed the vertical arrows too, a user could not scroll while a tab had
  focus.
- **Tab out of a menu is measured from the trigger, not from the item.** The
  browser would compute the destination from the menu item that the very same
  handler is in the middle of detaching from the DOM. Moving explicitly from the
  **trigger's** position is both what the user expects and the only variant that
  behaves the same before and after React re-renders. (This is not theory – the
  original version, which just called `close()`, failed exactly this test.)

## How

- **Dropdown** (`dropdown.tsx`): the trigger carries `aria-haspopup="menu"`,
  `aria-expanded` and `aria-controls`; the panel is `role="menu"`, the items
  `role="menuitem"` with `tabIndex` 0 on the active one only. `ArrowDown` on the
  trigger opens on the first item, `ArrowUp` on the last. Inside: arrows with
  wrapping, Home/End, and a click outside closes. Escape closes and hands focus
  back to the trigger, but the press itself is arbitrated page-wide rather than
  by the menu's own handler – see
  `doc/decision/0056-escape-goes-to-the-innermost-open-layer.md`. Disabled items
  are skipped (`enabledIndexes`) and cannot be selected. The `useEffect` on
  `activeIndex` moves **real DOM focus**, not just an attribute – otherwise the
  arrow keys would mean nothing to a screen reader.
- **Tabs** (`tabs.tsx`): `role="tablist"` / `tab` / `tabpanel`, `aria-selected`
  on every tab (including `false`, never omitted), with `aria-controls` and
  `aria-labelledby` binding tab to panel in both directions. The panel has
  `tabIndex={0}` so it can be reached with Tab even when it contains nothing
  focusable.
- Neither the menu nor the tab strip **is a portal** (unlike `Modal`): the panel
  is positioned relative to the trigger, and keeping it in the same subtree is
  what makes "a click outside closes" and nesting inside a modal work without
  computing coordinates.

## Risk

- **Automatic activation is wrong for expensive panels in Tabs.** If a panel
  loaded something over the network, arrowing across five tabs would fire five
  requests. The change is local to `moveTo` (split focus and select apart).
- **The missing type-ahead** only shows up on a long menu. Until then it is a
  saving.
- **A roving tabindex in Tabs means the selected tab is also the only tabbable
  one.** When the selected tab is `disabled` (which the API allows via `value`),
  the strip has nothing in the tab order. `defaultValue` is therefore computed
  from the first **enabled** tab; in controlled mode it is the caller's
  responsibility.
- **`aria-selected` on a `disabled` tab stays `false`**, but the element remains
  in `role="tab"`. A screen reader therefore announces it as an unavailable tab
  rather than as a non-existent one – which is the intent.
