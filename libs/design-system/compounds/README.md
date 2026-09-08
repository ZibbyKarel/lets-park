# design-system-compounds

`@lets-park/design-system/compounds` — the design system's third layer:
DataTable, EmptyState, ConfirmDialog.

Built from `@lets-park/design-system/primitives`, and strictly domain-free:
nothing in here knows what the app reserves or who reserves it, fixtures and
stories included. Compounds may import primitives; primitives must never import
compounds.

This lib is also the **wrapper for `@tanstack/react-table`** — the single place
in the workspace allowed to import it. No TanStack type crosses `DataTable`'s
props.

```bash
nx test design-system-compounds              # Jest + Testing Library
nx run design-system-compounds:storybook     # Storybook dev server, port 4401
nx run design-system-compounds:build-storybook
```

Full documentation — component APIs, conventions and how to add a compound —
is in `doc/design-system.md`.
