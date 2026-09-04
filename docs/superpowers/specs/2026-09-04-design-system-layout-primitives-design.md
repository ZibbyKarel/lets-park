# Design system: layout primitives (Stack, Container, Divider, Spacer, Card, Box, Grid)

## Cíl a rozsah

`apps/web/src` obsahuje 20 souborů a 176 výskytů `className=` s raw Tailwind
třídami (0 přes `cn()`/`clsx()` — nic takového se v repu nepoužívá). Cíl je
poskytnout sadu layoutových primitiv v `libs/design-system/primitives`, které
tyto opakující se vzory pokryjí, takže feature kód `apps/web` je může nahradit
místo psaní vlastního Tailwindu.

**V rozsahu:** definice nových primitiv a jejich API.
**Mimo rozsah:** ESLint pravidlo zakazující raw `className`/Tailwind v
`apps/web`, a fázový migrační plán pro 20 existujících souborů. Obojí je
navazující práce až po tomto spec.

## Evidence z `apps/web/src` (viz průzkum, respektive konkrétní řádky)

| Vzor                                                         | Výskyty      | Nejsilnější příklad                                                                              |
| ------------------------------------------------------------ | ------------ | ------------------------------------------------------------------------------------------------ |
| `mx-auto w-full max-w-[var(--container)] px-4 py-*`          | 4× identicky | `app/error.tsx:26`, `app/global-error.tsx:51`, `app/not-found.tsx:24`, `app/(app)/layout.tsx:26` |
| `flex flex-col gap-*` (vertikální stack)                     | 15+          | `admin-window-screen.tsx:104`, `settings-screen.tsx:307`                                         |
| `flex items-center gap-*` / `flex-wrap` (horizontální stack) | 15+          | `top-bar.tsx:94`, `lot-header.tsx:46`                                                            |
| `border-t/border-b border-border\|border-divider`            | 7×           | `admin-window-screen.tsx:149,176`                                                                |
| `rounded-lg border border-border bg-bg p-6` (panel/card)     | 2×+          | `admin-window-screen.tsx:104,147`                                                                |
| `grid gap-6 md:grid-cols-2`                                  | 1×           | `admin-window-screen.tsx:101`                                                                    |

Žádný Stack/Container/Divider/Spacer/Card/Box/Grid primitiv dnes neexistuje.

## Architektura

Nové primitivy žijí v `libs/design-system/primitives/src/lib`, po vzoru
`button.tsx`: plain Tailwind class stringy složené přes existující `cx()`
helper, žádná nová runtime dependency. Spacing hodnoty čerpají z existující
`SPACING` token mapy (`libs/design-system/tokens`) — žádná nová škála.

```ts
// SPACING klíče (beze změny, z libs/design-system/tokens/src/lib/spacing.ts)
export const SPACING = {
  1: "4px",
  2: "8px",
  3: "12px",
  4: "16px",
  5: "20px",
  6: "24px",
  8: "32px",
  10: "40px",
  12: "48px",
  16: "64px",
  20: "80px",
  24: "96px",
  32: "128px",
} as const;

export type SpacingKey = keyof typeof SPACING;
```

### Sdílený typ `Padding`

Padding a margin propsy na všech nových primitivách mimikují CSS shorthand
zápis (1/2/4 hodnoty), místo separátních propsů pro každou stranu:

```ts
// libs/design-system/primitives/src/lib/padding.ts
export type Padding =
  | SpacingKey // p-{v} (všechny strany)
  | readonly [vertical: SpacingKey, horizontal: SpacingKey] // py-{v} px-{h}
  | readonly [top: SpacingKey, right: SpacingKey, bottom: SpacingKey, left: SpacingKey]; // pt/pr/pb/pl
```

Interní resolver (`resolvePadding(value: Padding, axis: 'p' | 'm'): string`)
mapuje tvar pole na odpovídající Tailwind třídy (`p-*`/`py-*`+`px-*`/`pt-*`+
`pr-*`+`pb-*`+`pl-*`, případně `m-*` analogicky). `margin` prop na `Box` má
prozatím stejný typ `Padding` — sémantický alias `Margin = Padding` lze
zavést později, pokud se ukáže potřebný.

## Komponenty

### `Stack`

Nahrazuje `flex flex-col gap-*` a `flex items-center gap-*` (30+ výskytů).

```ts
interface StackProps {
  direction?: "row" | "column"; // default 'column'
  spacing?: SpacingKey; // gap-{n}
  align?: "start" | "center" | "end" | "stretch" | "baseline";
  justify?: "start" | "center" | "end" | "between" | "around";
  wrap?: boolean; // flex-wrap
  divider?: ReactNode; // vloženo mezi children (typicky <Divider>)
  className?: string;
}
```

### `Container`

Nahrazuje 4× identický `mx-auto w-full max-w-[var(--container)] px-4 py-*`.

```ts
interface ContainerProps {
  maxWidth?: "base" | "wide"; // default 'base', mapuje na CONTAINER token
  padding?: Padding;
  className?: string;
}
```

### `Divider`

Nahrazuje `border-t/border-b border-border|border-divider` (7 výskytů).

```ts
interface DividerProps {
  orientation?: "horizontal" | "vertical"; // default 'horizontal'
  tone?: "border" | "divider"; // oba dnes používané color tokeny
  spacing?: SpacingKey; // margin ve směru orientace
  className?: string;
}
```

### `Spacer`

Flexibilní nebo pevná mezera uvnitř flex řádku/kolony (např. rozpojení
toolbar prvků vlevo/vpravo).

```ts
interface SpacerProps {
  size?: SpacingKey; // pevná šířka/výška; bez size renderuje flex-1
}
```

### `Card`

Nahrazuje opakovaný panel `rounded-lg border border-border bg-bg p-6`.

```ts
interface CardProps {
  padding?: Padding; // default 6
  className?: string;
}
```

### `Box`

Obecný "escape hatch" primitiv — nutný, aby feature kód nikdy nesáhl zpět po
raw Tailwindu pro drobné layoutové úpravy, které Stack/Container/Card/Divider
nepokrývají.

```ts
interface BoxProps {
  padding?: Padding;
  margin?: Padding;
  background?: "bg" | "surface";
  radius?: "sm" | "md" | "lg";
  border?: boolean;
  className?: string;
}
```

### `Grid`

Dnes jen 1 reálné použití (`admin-window-screen.tsx:101`), ale nutný pro
responsivní vícesloupcové rozvržení.

```ts
interface GridProps {
  columns: number | { base: number; md?: number };
  spacing?: SpacingKey; // gap-{n}
  className?: string;
}
```

## Testování

Každá komponenta dostane Storybook story vedle implementace (per CLAUDE.md
požadavek na primitivy) a jednotkový test pokrývající mapování props → třídy,
po vzoru `button.spec.tsx`.

## Mimo rozsah / navazující práce

- ESLint pravidlo (`no-restricted-syntax` na JSX `className` literály nebo
  vlastní lint plugin) k vynucení používání primitiv v `apps/web` — dnes
  nic takového neexistuje.
- Fázový migrační plán pro 20 existujících souborů s raw Tailwindem.
- Případný alias `Margin = Padding`, pokud se sémanticky odlišné API ukáže
  potřebné.
