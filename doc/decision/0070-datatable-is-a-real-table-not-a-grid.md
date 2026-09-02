# 0070 – `DataTable` renders a real `<table>`, not the design's CSS grid

## What

`DataTable` renders semantic `<table>` / `<thead>` / `<tr>` / `<th>` / `<td>`
elements with a `<colgroup>` for the column widths, and a `sr-only`
`<caption>` for the accessible name.

The design draws the same tables as a **CSS grid of `<div>`s**: the header row
and every body row repeat the same `grid-template-columns`
(`1.5fr 1.8fr 96px` in `doc/design/screens/03-admin-users.png`,
`0.8fr 1fr 1.1fr 0.8fr auto` in `04-admin-spots.png`), inside a card with
`overflow-x:auto` and a `min-width`.

The rendered picture is the same. The element tree is not.

## Why

- **The semantics come from the element, or they come from a list of `role`
  attributes nothing checks.** The grid version needs `role="table"`,
  `role="rowgroup"`, `role="row"`, `role="columnheader"` and `role="cell"`
  written out by hand on nine separate `<div>`s. Every one of them is a string
  that can be mistyped, forgotten on a new column, or silently dropped by a
  refactor, and none of it fails a test unless somebody wrote a test for that
  exact attribute. A `<td>` cannot stop being a cell.
- **This is the rule the primitives already follow.**
  `doc/decision/0012-focus-ring-and-native-elements-in-primitives.md` fixed
  "use the native element whenever one exists" for `<input>`, `<select>` and
  `<button>`. A table is the same argument with a different element: row and
  column position, the header/cell association, the row and column counts, and
  a screen reader's table-navigation mode all arrive for free and stay correct.
- **`aria-sort` belongs on a `<th>`.** It is defined for `columnheader`, which
  is what `<th scope="col">` already is. On a `<div>` it is only meaningful once
  the matching `role` is also present and correct.
- **Applying `display:grid` to real table elements would have been the worst of
  both.** It is the obvious way to keep the design's exact tracks *and* the
  semantics, and it does not work: in Chrome and Firefox, overriding a table
  element's `display` strips its implicit ARIA role, so the roles would have to
  be written out by hand anyway — with the extra trap that the markup *looks*
  semantic while it is not.
- **The tests get better.** `getByRole('table' | 'row' | 'columnheader' |
  'cell')` exercises the real accessibility tree rather than asserting that a
  string is present in an attribute.

## How

- **Column tracks become `<colgroup>` entries.** `DataTableColumn.width` takes
  any CSS width and is applied to a `<col>`. The design's `fr` units have no
  table equivalent, so a caller reproducing the admin screens translates them
  to percentages (`1.5fr 1.8fr 96px` → `45% 55% 96px`); fixed pixel columns
  carry over unchanged.
- **`minWidth` plus the card's `overflow-x-auto` reproduce the horizontal
  scroll** exactly as the grid version does — that behaviour is a property of
  the scroll container, not of the layout algorithm.
- **The gutter is rebuilt from cell padding.** The design puts `padding: … 24px`
  on the *row* and butts the tracks together (`gap: 0`). A `<tr>` cannot carry
  padding, so cells get `px-3` with `first:pl-6 last:pr-6`: 24px outer gutters,
  and 24px between neighbouring columns.
- **One string names the table twice.** The `title` prop is both the visible
  card title and the `sr-only` `<caption>`, so the two cannot drift apart. The
  card itself is a `<section aria-label={title}>`.
- **Row padding snaps to the 4px scale.** The two screens disagree — 14px in
  `03-admin-users.png`, 12px in `04-admin-spots.png` — and 14px is not on the
  spacing scale at all. `py-3` (12px) is used for both: it matches one screen
  exactly and the design system forbids a hand-written length.

## Risk

- **The `fr` → `%` translation is done by the caller, not checked by anything.**
  A screen that gets the percentages wrong will look slightly off from the mock,
  and only a visual review catches it.
- **The columns are not resizable and have no sticky header.** Both are real
  table features that would need layout measurement; neither appears in the
  design, and neither is in this MVP.
- **A very long unbreakable cell value can still push a column wider than its
  `<col>` width**, because the table layout stays `auto` rather than `fixed`.
  The card scrolls sideways rather than clipping, which is the same outcome the
  grid version has.
