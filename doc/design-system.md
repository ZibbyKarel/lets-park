# Design systém – tokeny a primitivy

Tasky 6 a 7 z `doc/implementation-plan.md`. Dokument popisuje dvě spodní vrstvy
design systému:

1. **tokeny** (`libs/design-system/tokens`) – hodnoty,
2. **primitivy** (`libs/design-system/primitives`) – nejmenší komponenty
   postavené výhradně z těch hodnot.

Třetí vrstva (`compounds`, např. DataTable) vzniká v dalším úkolu. Směr
závislostí `tokens → primitives → compounds` vynucuje ESLint (viz
`doc/workspace.md`, dimenze `ds:*`); **compounds smí importovat primitivy,
nikdy naopak**.

Design systém je **domain-free**: v `libs/design-system/**` nesmí být nic, co ví
o `ParkingSpot`/`Reservation`/uživatelích – ani v názvech props, ani ve stories.
Tokeny jsou čistě prezentační hodnoty, primitivy čistě prezentační komponenty.

## Zdroj pravdy

`doc/design/ds/colors_and_type.css` ("Shoptet Design System — Foundations").
Každá barva, `--fs-*`, `--lh-*`, `--tracking-*`, `--space-*`, `--radius-*`,
`--shadow-*`, `--dur-*`, `--ease-*` a `--container*` v TS zdroji je **1:1** kopie
tohoto souboru – žádné zaokrouhlování, přejmenování ani "vylepšování" hodnot.
Trojice `#fcaf00`/`#00e25a`/`#3b88ff` (barvy aut na obsazených místech) je z
`plan.md` / `doc/design/README.md` – je to samostatná skupina tokenů, **není**
součástí obecné palety (viz níže).

Dvě skupiny tokenů jsou **odvozené, ne opsané** z `colors_and_type.css`, a mají
to napsané v hlavičce svého souboru: `BREAKPOINTS` v `layout.ts`
(`doc/decision/0009-breakpointy-jsou-odvozene.md`) a `CONTROLS` v `controls.ts`
– výšky ovládacích prvků a geometrie přepínače, čtené z exportovaného designu
(`doc/decision/0011-odvozene-control-tokeny-a-zaokrouhleni.md`).

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
      controls.ts             – --control-h-*, --switch-* (ODVOZENÉ, viz 0011)
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

Viz `doc/decision/0008-generovany-tokens-css-je-commitnuty.md`. Krátce: je
commitnutý, aby appka po `npm ci` fungovala bez extra build kroku, a je vyloučený
z Prettieru, protože věrně kopíruje styl zdrojového `colors_and_type.css`
(velká písmena v hexu, žádné mezery v `rgba()`), který by Prettier přepsal.

### Aliasy se zachovávají

`colors_and_type.css` část tokenů nedefinuje hodnotou, ale odkazem
(`--bg: var(--neutral-0)`, `--fg: var(--text)`, `--success: var(--brand-green)`,
`--radius-pill: var(--radius-cta)`, `--brand-blue-100: var(--brand-light)`).
Generátor tenhle řetěz **neplošťuje na literál** – vypíše ho jako `var(...)`,
protože právě přes něj se dělá budoucí téma (přesměruješ cíl a všichni
konzumenti se posunou s ním).

TS objekty ale drží už rozřešené hodnoty (`SURFACE_COLORS.bg` je řetězec
`#FFFFFF`, ne odkaz), takže by se data a vypsaný alias mohly rozejít. Hlídá to
funkce `alias()` v `generate-css.ts`: při generování porovná hodnotu tokenu
s hodnotou cíle a při neshodě **vyhodí výjimku** místo aby napsala
`--bg: var(--neutral-0)` pro token, který už bílou nemá.

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

`assets/theme.css` je vstupní CSS soubor pro konzumenty. Prvním z nich je
Storybook primitivů, a ten ho importuje **relativní cestou** –
`@import '../../tokens/assets/theme.css'` v `.storybook/preview.css`. Důvod:
`@lets-park/design-system/tokens` je jen TS `tsconfig` path alias pro modulovou
rezoluci v JS/TS; CSS `@import` ani bundlery ho neznají automaticky. Jak se
`theme.css` dostane do výstupního CSS `apps/web` (relativní cesta vs. `exports`
mapping v `package.json` libky) rozhodne task, který web poprvé stylizuje:

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
- `tailwindcss` a `@tailwindcss/vite` už v repu jsou (přidal je Task 7 kvůli
  Storybooku). PostCSS/Next.js pipeline v `apps/web` je pořád mimo tenhle
  dokument – patří tasku na `apps/web`.

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
není ověřená** (viz `doc/design/README.md` a `doc/decision/0010-*`) – proto má
`FONT_FAMILIES.sans` vždy funkční fallback (`Neue Haas Grotesk` → `Helvetica Neue`
→ `Inter` → `Arial` → `system-ui` → `sans-serif`), takže appka vypadá rozumně, i
kdyby se `.otf` soubory musely z produkčního buildu vyřadit.

---

# Primitivy (`libs/design-system/primitives`)

Balíček `@lets-park/design-system/primitives`, tagy `type:ui`, `scope:web`,
`ds:primitives`. Devět komponent, ke každé **story vedle komponenty** a Jest +
Testing Library test (84 testů celkem).

```
libs/design-system/primitives/
  .storybook/
    main.ts         – Storybook 10 + @storybook/react-vite, viteFinal → @tailwindcss/vite
    preview.ts      – parametry, backgrounds
    preview.css     – @import theme.css z libky tokenů + @source '../src'
  src/
    lib/
      cx.ts               – spojovač class names (žádný clsx, tři řádky)
      control-size.ts     – sdílená škála sm|md|lg|xl + FOCUS_RING, PRESS_FEEDBACK
      field.tsx           – useFieldIds() + <Field> (label / hint / error kolem prvku)
      button.tsx    badge.tsx    avatar.tsx
      input.tsx     select.tsx   checkbox.tsx   radio.tsx
      switch.tsx    stepper.tsx
      *.stories.tsx        – story ke každé komponentě
      *.spec.tsx            – test ke každé komponentě
    index.ts                 – veřejné API
```

## Zásady, které platí napříč primitivy

- **Žádná ručně psaná hodnota.** Barvy, rozestupy, poloměry a velikosti písma
  chodí z tokenů přes Tailwind utility (`bg-brand-blue`, `px-4`, `rounded-cta`,
  `text-sm`); výšky ovládacích prvků přes `h-[var(--control-h-lg)]`.
  Zaokrouhlování rozměrů z designu řeší `doc/decision/0011-*`.
- **Nativní prvky.** Input/Select/Checkbox/Radio jsou opravdové `<input>` /
  `<select>`, jen přestylované. Chování z klávesnice dodává platforma, ne náš
  kód (`doc/decision/0012-*`).
- **Jednotný focus ring** (`FOCUS_RING`) na každém fokusovatelném prvku –
  2px `--brand-blue` přes `:focus-visible`. Design ho nepředepisuje, viz
  `doc/decision/0012-*`.
- **Vypnutý stav se nepřebíjí, ale nahrazuje.** Dvě utility, které nastavují
  stejnou vlastnost (`bg-bg` a `bg-bg-muted`, `text-fg` a `text-fg-3`), mají
  stejnou specificitu – vyhrává ta, kterou Tailwind vypíše ve stylesheetu
  později, ne ta, která je později v `className`. Přidat vypnuté barvy *navrch*
  k zapnutým proto u každé dvojice náhodně vyjde, nebo tiše nevyjde. Barvy pro
  zapnutý stav proto patří do zapnuté větve ternárního výrazu, ať prvek nikdy
  nenese obě poloviny dvojice zároveň. Totéž platí pro `checked:` – varianta
  přebije obě prosté utility, takže vypnutý zaškrtnutý Checkbox si musí
  přebarvit i `checked:` výplň, jinak svítí značkovou modrou.
  Jsdom žádný stylesheet neaplikuje, takže tohle žádný render test nechytí –
  invariant hlídá `disabled-styling.spec.tsx`.
- **Chybový stav je zpráva.** Prop `error` neexistuje jako boolean: text chyby
  *je* stav. Nastaví `aria-invalid`, červený rámeček i `role="alert"` naráz,
  takže se nemůžou rozejít.
- **UI copy česky** (např. výchozí názvy tlačítek Stepperu), **identifikátory a
  komentáře anglicky.**

## Soupis a API

Sdílené typy: `ControlSize = 'sm' | 'md' | 'lg' | 'xl'` (36/40/48/56 px).
Prvky formuláře navíc přijímají `label`, `hint`, `error` (typ `FieldOwnProps`).

### `Button`

| prop | typ | default | popis |
| --- | --- | --- | --- |
| `variant` | `'primary' \| 'secondary' \| 'outline' \| 'danger' \| 'ghost'` | `'primary'` | vizuální váha |
| `size` | `ControlSize` | `'md'` | výška |
| `loading` | `boolean` | `false` | spinner + `aria-busy` + `disabled` |
| `fullWidth` | `boolean` | `false` | roztáhne na šířku rodiče |
| `startAdornment` / `endAdornment` | `ReactNode` | – | obsah před/za popiskem |
| `type` | `'button' \| 'submit' \| 'reset'` | `'button'` | výchozí `button`, aby nechtěně neodeslal formulář |

Plus všechny nativní atributy `<button>`. `ref` míří na `<button>`.

Varianty jsou odvozené z designu: `primary` je modré pill CTA
(hover `--brand-blue-700` + `--shadow-blue`), `secondary` bílé s rámečkem,
`outline` průhledné s tmavým rámečkem (hover se invertuje na plnou tmavou),
`danger` je „Smazat" – světle červené, po hoveru plné červené.

### `Input`

`size`, `fullWidth` (default `true`), `label`, `hint`, `error`,
`wrapperClassName` + nativní atributy `<input>` kromě `size` (ten je přebitý
škálou – znakový `size` do design systému nepatří). `ref` míří na `<input>`.

### `Select`

Stejné props jako `Input` (`size` opět přebitý), `children` jsou `<option>`.
Šipka je `aria-hidden` SVG, prvek zůstává nativní `<select>`.

### `Checkbox`

`label`, `hint`, `error`, `indeterminate`, `wrapperClassName` + nativní atributy
`<input>` kromě `type` a `size`. `indeterminate` se nastavuje přes ref, protože
existuje jen na DOM uzlu, ne jako HTML atribut.

### `Radio` a `RadioGroup`

`Radio` má stejné props jako `Checkbox` (bez `indeterminate`).
**`aria-invalid` na něm záměrně není** – `role="radio"` ho nepodporuje, validitu
nese skupina.

`RadioGroup` (`<fieldset>`): `legend` (povinné, přístupné jméno skupiny),
`hint`, `error`, `horizontal`.

### `Badge`

`tone: 'neutral' | 'info' | 'success' | 'warning' | 'danger'` (default
`neutral`) + atributy `<span>`. Bez role – je to popisek, ne prvek. Když badge
nese informaci, která není v okolním textu, musí ji volající vystavit sám.

### `Avatar`

| prop | typ | default |
| --- | --- | --- |
| `initials` | `string` | – (povinné) |
| `label` | `string` | – |
| `tone` | `'dark' \| 'info' \| 'neutral' \| 'warning'` | `'neutral'` |
| `size` | `'sm' \| 'md' \| 'lg'` (24/32/40 px) | `'md'` |

S `label` je to `role="img"` s přístupným jménem, bez něj `aria-hidden` –
předpoklad je, že jméno je napsané vedle. **Iniciály si počítá aplikace**, ne
design systém: k tomu je potřeba vědět, co je jméno, a to je doména.

### `Switch`

`checked` / `defaultChecked` / `onCheckedChange`, `label`, `aria-label`,
`tone: 'info' | 'success'`, `disabled`, `id`, `name`. Řízený i neřízený režim.
Je to `<button type="button" role="switch">`, takže Enter i mezerník fungují
z podstaty prvku a nikdy neodešle formulář.

### `Stepper`

| prop | typ | default |
| --- | --- | --- |
| `value` / `defaultValue` / `onValueChange` | `number` / `(v: number) => void` | neřízený od `min` |
| `min` / `max` / `step` | `number` | `0` / `MAX_SAFE_INTEGER` / `1` |
| `label` | `string` | – (povinné) |
| `formatValue` | `(v: number) => string` | – |
| `decrementLabel` / `incrementLabel` | `string` | `'Snížit'` / `'Zvýšit'` |

Hodnota je `role="spinbutton"`, takže je dosažitelná Tabem a ovladatelná
šipkami, Home a End – tlačítka jsou pohodlí pro myš, ne jediná cesta.
`formatValue` je zároveň `aria-valuetext`, takže se jednotka i přečte.

## Storybook

```bash
npx nx run design-system-primitives:storybook         # dev server, port 4400
npx nx run design-system-primitives:build-storybook   # statický build do dist/
```

Konfigurace je psaná ručně, bez `@nx/storybook` a bez addonů – proč, je
v `doc/decision/0013-*`. Pozor: `build-storybook` **není** součástí
`npm run build`, do CI se musí přidat zvlášť.

`preview.css` importuje `theme.css` (ne `tokens.css` – ten sám o sobě dá
proměnné, ale žádné Tailwind utility) a přidává `@source '../src'`, aby Tailwind
skenoval komponenty; hledá totiž od adresáře toho CSS souboru, kde je
`@import "tailwindcss"`, a ten je v libce tokenů.

## Jak přidat primitiv

1. `src/lib/<jmeno>.tsx` – komponenta. Rozměry ze škály v `control-size.ts`,
   barvy z Tailwind utilit napojených na tokeny. Nativní prvek, kdykoli
   existuje.
2. `src/lib/<jmeno>.stories.tsx` – **současně**, ne potom. Stavy, které dávají
   smysl: default, varianty, velikosti, disabled, error, loading.
3. `src/lib/<jmeno>.spec.tsx` – **současně**. Testuje se `role`, přístupné
   jméno, dosažitelnost Tabem, klávesnice a interakce; ne vzhled.
4. Export z `src/index.ts`.
5. `npm run lint && npm run typecheck && npm run test` a
   `npx nx run design-system-primitives:build-storybook`.
