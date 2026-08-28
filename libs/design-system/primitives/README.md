# design-system-primitives

`@lets-park/design-system/primitives` — the design system's second layer:
Button, Input, Select, Checkbox, Radio, Badge, Avatar, Switch, Stepper.

Presentation only, and strictly domain-free: nothing in here knows what the app
reserves or who reserves it. Every colour, radius, spacing and type size comes
from `@lets-park/design-system/tokens`; no value is written by hand.

```bash
nx test design-system-primitives              # Jest + Testing Library
nx run design-system-primitives:storybook     # Storybook dev server, port 4400
nx run design-system-primitives:build-storybook
```

Full documentation — component APIs, conventions and how to add a primitive —
is in `doc/design-system.md`.
