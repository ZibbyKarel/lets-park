# Design systém – tokeny

Task 6 z `doc/implementation-plan.md`. Tenhle dokument popisuje **jen vrstvu
tokenů** (`libs/design-system/tokens`) – první a nejnižší vrstvu design systému.
Vrstvy nad ní (`primitives`, `compounds`) vznikají v dalších úkolech a smí záviset
jen na tokenech (vynuceno ESLintem, viz `doc/workspace.md`, dimenze `ds:*`).

Design systém je **domain-free**: v `libs/design-system/**` nesmí být nic, co ví
o `ParkingSpot`/`Reservation`/uživatelích. Tokeny jsou čistě prezentační hodnoty.

## Zdroj pravdy

`doc/design/ds/colors_and_type.css` ("Shoptet Design System — Foundations").
Každá barva, `--fs-*`, `--lh-*`, `--tracking-*`, `--space-*`, `--radius-*`,
`--shadow-*`, `--dur-*`, `--ease-*` a `--container*` v TS zdroji je **1:1** kopie
tohoto souboru – žádné zaokrouhlování, přejmenování ani "vylepšování" hodnot.
Trojice `#fcaf00`/`#00e25a`/`#3b88ff` (barvy aut na obsazených místech) je z
`plan.md` / `doc/design/README.md` – je to samostatná skupina tokenů, **není**
součástí obecné palety (viz níže).

## Jak jsou tokeny poskládané

```
libs/design-system/tokens/
  src/
    lib/
      colors.ts          – brand, neutrály, semantické surface/fg/line/status
      car-palette.ts      – CAR_COLOR_PALETTE (jen barva auta, samostatný namespace)
      typography.ts        – font families, @font-face metadata, type scale, lh, tracking
      spacing.ts            – --space-*
      radius.ts              – --radius-*
      shadows.ts               – --shadow-*
      motion.ts                 – --ease-*, --dur-*
      layout.ts                  – --container*, BREAKPOINTS (odvozené, viz 0009)
      tokens.ts                   – DESIGN_TOKENS = spojení všeho výše
      generate-css.ts               – generateTokensCss(tokens) -> CSS text (čistá funkce)
      generate-css.spec.ts           – test, že commitnutý tokens.css == generateTokensCss(...)
    index.ts                          – veřejné API (@lets-park/design-system/tokens)
  scripts/
    build-tokens-css.ts                 – zapíše generateTokensCss(...) do assets/tokens.css
  assets/
    tokens.css                            – GENEROVANÝ (viz níže), commitnutý
    theme.css                              – RUČNĚ PSANÝ Tailwind v4 bridge
    fonts/*.otf                             – Neue Haas Grotesk Display Pro (8 řezů)
```

**Jediný zdroj pravdy v kódu je TS** (`DESIGN_TOKENS` v `tokens.ts`). Všechno
ostatní (`tokens.css`, mapování v `theme.css`) z něj vychází.

## Proč je `tokens.css` generovaný a commitnutý

Viz `doc/decision/0010-generovany-tokens-css-je-commitnuty.md`. Krátce: je
commitnutý, aby appka po `npm ci` fungovala bez extra build kroku, a je vyloučený
z Prettieru, protože věrně kopíruje styl zdrojového `colors_and_type.css`
(velká písmena v hexu, žádné mezery v `rgba()`), který by Prettier přepsal.

**Drift test** (`generate-css.spec.ts`) hlídá, že se TS zdroj a commitnutý soubor
nerozejdou: čte `assets/tokens.css` ze disku a porovnává ho `toBe()` s tím, co by
`generateTokensCss(DESIGN_TOKENS)` vygenerovalo právě teď. Změníš-li token v TS a
nezavoláš `nx run design-system-tokens:generate-css`, test spadne v CI.

## Jak přidat nový token

1. Přidej hodnotu do příslušného `src/lib/*.ts` souboru (nebo založ nový, pokud
   jde o novou kategorii) a zapoj ho do `DESIGN_TOKENS` v `tokens.ts`.
2. Přidej odpovídající řádek do `generateTokensCss` v `generate-css.ts` (stejné
   jméno `--custom-property`, jaké by měl mít v `colors_and_type.css` / designu).
3. Spusť `npx nx run design-system-tokens:generate-css` a commitni změněný
   `assets/tokens.css`.
4. Pokud má token smysl jako Tailwind utilita (barva, spacing, radius, shadow,
   font, tracking/leading, ease/duration), přidej mapovací řádek do
   `assets/theme.css` (`@theme inline { --tailwind-namespace-*: var(--tvuj-token); }`).
   Namespace se řídí Tailwindovou dokumentací (`--color-*`, `--spacing-*`,
   `--radius-*`, `--shadow-*`, `--font-*`, `--text-*`, `--leading-*`,
   `--tracking-*`, `--ease-*`, `--duration-*`, `--breakpoint-*`).
5. `npm run test` (ověří drift test) + `npm run lint` + `npm run typecheck`.

Nikdy nepiš hodnotu ručně na dvou místech (TS **a** CSS) – jedno musí vždy vznikat
z druhého (generátor), jinak vznikne přesně ten drift, který má test odchytit.

## Napojení na Tailwind v4

`assets/theme.css` je vstupní CSS soubor pro konzumenty (bude ho importovat
`apps/web`, případně Storybook). **Přesný mechanismus importu (relativní cesta
do `node_modules`/dist vs. nějaký `exports` mapping) tenhle task nezavádí** –
`@lets-park/design-system/tokens` existuje jen jako TS `tsconfig` path alias pro
modulovou rezoluci v JS/TS; CSS `@import` a bundlery (Next.js, PostCSS,
Storybook) ho neznají automaticky. Jak `theme.css` reálně dostane se do
výstupního CSS appky je na tasku, který design systém poprvé konzumuje:

```css
@import 'tailwindcss';
@import './tokens.css';

@theme {
  /* breakpointy – literální hodnoty, Tailwind je potřebuje do @media */
  --breakpoint-sm: 640px;
  /* ... */
}

@theme inline {
  /* každý řádek je var() odkaz na custom property z tokens.css,
     nikdy duplikovaná literální hodnota */
  --color-brand-blue: var(--brand-blue);
  /* ... */
}
```

- `@import "tailwindcss"` + `@theme inline` je aktuální (Tailwind v4) CSS-first
  syntax – žádný `tailwind.config.js` (ověřeno přes Context7/oficiální docs, ne
  z paměti, viz global constraint 10).
- `@theme inline` mapuje custom properties z `tokens.css` na Tailwind theme
  proměnné (`--color-*`, `--text-*`, `--spacing-*`, ...), takže Tailwind
  vygeneruje utility (`bg-brand-blue`, `text-fg-2`, `rounded-md`, `shadow-lg`,
  `duration-base`, ...) se stejnou hodnotou, jakou má css proměnná.
  `inline` je nutné, protože `--theme-*` proměnné jinak nejdou odkazovat na jiné
  custom properties definované mimo `@theme` blok (bez `inline` by Tailwind
  zamrznul hodnotu při parse-time, ne runtime).
- `--breakpoint-*` je v (ne-`inline`) `@theme` bloku, protože breakpointy
  Tailwind potřebuje jako literální hodnoty pro generování `@media` – `var()`
  se do media query dosadit nedá.
- `--container` / `--container-wide` (content max-width, ne container queries)
  **nejsou** mapované do Tailwindova `--container-*` namespace – ten je vyhrazený
  pro `@container` query breakpointy, jiný koncept. Používej je přímo jako CSS
  proměnnou, např. `max-w-[var(--container)]`.
- Instalace/konfigurace samotného `tailwindcss` balíčku a PostCSS/Next.js
  pipeline v `apps/web` je mimo tenhle úkol (patří Tasku na `apps/web`) – tady jen
  autorujeme CSS, které to bude konzumovat.

## Barva auta na obsazeném místě – proč je jinde

`CAR_COLOR_PALETTE` (`car-palette.ts`) a `--palette-car-1/2/3` v `tokens.css` /
`--color-car-1/2/3` v `theme.css` jsou **záměrně** oddělené od obecné palety
(`COLORS`). Design (`doc/design/README.md`) je definuje jen pro barvu auta na
obsazeném parkovacím místě – žádná jiná UI komponenta (tlačítko, badge, stav) je
nemá používat. Tokeny nesou jen surová data (tři barvy); deterministický výběr
"který uživatel má kterou barvu" je doménová logika (potřebuje pojem "uživatel"),
proto nežije v design systému.

## Fonty a licence

8 řezů Neue Haas Grotesk Display Pro (`.otf`) je zkopírováno do `assets/fonts/`
a použito v generovaných `@font-face` blocích. **Licence pro produkční nasazení
není ověřená** (viz `doc/design/README.md` a `doc/decision/0012-*`) – proto má
`FONT_FAMILIES.sans` vždy funkční fallback (`Neue Haas Grotesk` → `Helvetica Neue`
→ `Inter` → `Arial` → `system-ui` → `sans-serif`), takže appka vypadá rozumně, i
kdyby se `.otf` soubory musely z produkčního buildu vyřadit.
