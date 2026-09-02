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

Tři skupiny tokenů jsou **odvozené, ne opsané** z `colors_and_type.css`, a mají
to napsané v hlavičce svého souboru: `BREAKPOINTS` v `layout.ts`
(`doc/decision/0009-breakpointy-jsou-odvozene.md`), `CONTROLS` v `controls.ts`
– výšky ovládacích prvků a geometrie přepínače, čtené z exportovaného designu
(`doc/decision/0011-odvozene-control-tokeny-a-zaokrouhleni.md`) – a `OVERLAYS`
v `overlays.ts`: škála vrstvení, scrim a rozměry dialogů, menu, tooltipu
a toastu (`doc/decision/0020-overlay-tokeny-a-vrstveni.md`). `overlays.ts` má
navíc u **každé** položky napsané, jestli je ze designu, nebo vymyšlená –
tooltip ani toast v designu vůbec nejsou.

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
      overlays.ts                 – --z-*, --scrim, --modal-w-*, ... (ODVOZENÉ, viz 0020)
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
není ověřená** (viz `doc/design/README.md` a `doc/decision/0012-*`) – proto má
`FONT_FAMILIES.sans` vždy funkční fallback (`Neue Haas Grotesk` → `Helvetica Neue`
→ `Inter` → `Arial` → `system-ui` → `sans-serif`), takže appka vypadá rozumně, i
kdyby se `.otf` soubory musely z produkčního buildu vyřadit.

---

# Primitivy (`libs/design-system/primitives`)

Balíček `@lets-park/design-system/primitives`, tagy `type:ui`, `scope:web`,
`ds:primitives`. **Čtrnáct komponent** ve dvou dávkách – devět formulářových
(task 7) a pět overlay/navigačních (task 8) – ke každé **story vedle
komponenty** a Jest + Testing Library test (165 testů celkem).

```
libs/design-system/primitives/
  .storybook/
    main.ts         – Storybook 10 + @storybook/react-vite, viteFinal → @tailwindcss/vite
    preview.ts      – parametry, backgrounds
    preview.css     – @import theme.css z libky tokenů + @source '../src'
  src/
    lib/
      cx.ts               – spojovač class names (žádný clsx, tři řádky)
      control-size.ts     – sdílená škála sm|md|lg|xl + FOCUS_RING, INSET_FOCUS_RING, PRESS_FEEDBACK
      field.tsx           – useFieldIds() + <Field> (label / hint / error kolem prvku)
      use-focus-trap.ts   – focus trap + návrat focusu (jen Modal; viz 0021)
      button.tsx    badge.tsx    avatar.tsx
      input.tsx     select.tsx   checkbox.tsx   radio.tsx
      switch.tsx    stepper.tsx
      modal.tsx     dropdown.tsx tabs.tsx       tooltip.tsx    toast.tsx
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
  invariant hlídá `disabled-styling.spec.tsx`. Ten netestuje seznam známých
  špatných dvojic, ale samotné pravidlo: **žádný prvek nesmí nést dvě
  nepodmíněné barevné utility, které nastavují stejnou vlastnost**
  (`bg-*` / `text-*` / `border-*`). Klasifikuje se podle *jména tokenu*, ne
  podle prefixu, aby `text-sm` (velikost písma) nebo `border-2` (šířka)
  nespadly do barevné skupiny. Stejný problém mají i **varianty** – aktivní vs.
  neaktivní tab, otevřený vs. zavřený trigger – ne jen `disabled`.
- **Chybový stav je zpráva.** Prop `error` neexistuje jako boolean: text chyby
  *je* stav. Nastaví `aria-invalid`, červený rámeček i `role="alert"` naráz,
  takže se nemůžou rozejít. Když je prvek zároveň `disabled`, **vyhrává
  vypnutý stav**: pole, které uživatel nemůže editovat, na něj nemá zároveň
  křičet červeným rámečkem.
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

`RadioGroup` je `<fieldset role="radiogroup">`: `legend` (povinné, přístupné
jméno skupiny), `hint`, `error`, `horizontal`. Explicitní `role="radiogroup"`
je jak přesnější mapování než výchozí `group`, tak jediná role z těch dvou,
která `aria-invalid` na skupině vůbec podporuje.

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
| `size` | `ControlSize` | `'lg'` |

Hodnota je `role="spinbutton"`, takže je dosažitelná Tabem a ovladatelná
šipkami, Home a End – tlačítka jsou pohodlí pro myš, ne jediná cesta.
`formatValue` je zároveň `aria-valuetext`, takže se jednotka i přečte.

## Overlay a navigační primitivy

Pět komponent z druhé dávky. Jsou to ty nejrizikovější kusy z hlediska
přístupnosti, takže tady platí navíc:

- **Klávesnice je první třída.** Focus trap, Escape, šipky a Home/End nejsou
  „nice to have" – jsou to jediné cesty, jak tyhle komponenty ovládá někdo, kdo
  nemá myš. Testují se proto jako **chování** (`user-event`, skutečný Tab a
  skutečný focus), ne jako přítomnost atributu.
- **Přebíjení barev je tady horší než u `disabled`.** Overlay komponenty mají
  víc podmíněných stavů (aktivní vs. neaktivní tab, otevřený vs. zavřený
  trigger, pět tónů toastu). Každý stav proto dodává **celou** sadu barev pro
  všechny vlastnosti, které nastavuje – hlídá to `disabled-styling.spec.tsx`.
- **Vrstvení jde z jedné škály** `--z-*` (`doc/decision/0020-*`). Žádná
  komponenta si `z-index` nevymýšlí.

### `Modal`

| prop | typ | default |
| --- | --- | --- |
| `open` | `boolean` | – (povinné) |
| `onClose` | `() => void` | – (povinné) |
| `title` | `ReactNode` | – (povinné, je to i přístupné jméno) |
| `description` | `ReactNode` | – (napojené na `aria-describedby`) |
| `eyebrow` | `ReactNode` | – (pilulka nad titulkem) |
| `footer` | `ReactNode` | – (zarovnané doprava) |
| `size` | `'sm' \| 'md'` | `'sm'` (460 / 620 px) |
| `closeOnScrimClick` | `boolean` | `true` |
| `closeLabel` | `string` | `'Zavřít'` |
| `hideCloseButton` | `boolean` | `false` |

`<div role="dialog" aria-modal="true">` v portálu na `document.body`.
**Nikdy se nezavírá sám** – `open` vlastní volající, `onClose` se volá pro
všechny tři cesty ven (Escape, scrim, ×).

Co dělá pro přístupnost:

- **Skutečný focus trap.** Tab i Shift+Tab cyklí uvnitř; když focus skončí mimo,
  další Tab ho vtáhne zpět. Dialog bez jediného ovládacího prvku fokusuje sám
  sebe (`tabIndex={-1}`), ať odečítač nezůstane na stránce za ním.
- **Návrat focusu** na prvek, který dialog otevřel.
- **Escape zavírá.**
- **Zamyká scroll stránky** pod sebou – scrollování je jediná cesta, jak se
  myší dostat na obsah, který scrim zakrývá.
- „Obsah vzadu je inert" je řešené trojicí `aria-modal` + trap + krycí scrim, ne
  mutací sousedních uzlů; **proč** je v `doc/decision/0021-*` spolu s tím, proč
  to není nativní `<dialog>`.

### `Dropdown`

| prop | typ | default |
| --- | --- | --- |
| `trigger` | `ReactNode` | – (obsah tlačítka, které komponenta vlastní) |
| `triggerLabel` | `string` | – (jméno triggeru, když není samopopisný) |
| `items` | `DropdownItem[]` | – (povinné) |
| `onSelect` | `(id: string) => void` | – |
| `header` | `ReactNode` | – (nefokusovatelný blok nad položkami) |
| `label` | `string` | jméno triggeru |
| `align` | `'start' \| 'end'` | `'end'` |

`DropdownItem`: `id`, `separator?`, `label`, `trailing?`, `danger?`, `disabled?`.
Když je `separator: true`, ostatní pole se ignorují a položka se vykreslí jako
`DropdownSeparator` (tenká dělicí čára, `role="separator"`) místo `menuitem` —
šipky ji přeskakují stejně jako zakázané položky.

Trigger je `aria-haspopup="menu"` + `aria-expanded` + `aria-controls`, panel
`role="menu"`, položky `role="menuitem"`. Klávesnice: `ArrowDown` otevře na
první položce, `ArrowUp` na poslední, uvnitř šipky se zabalením, `Home`/`End`,
`Enter`/mezerník vybere, `Escape` zavře a vrátí focus na trigger, `Tab` zavře
a skočí za trigger. Zakázané položky se přeskakují. Klik mimo zavře.

**Roving tabindex** – v tab orderu je vždy jen jedna položka, takže menu je
jedna zastávka, ne N. **Type-ahead záměrně není** (`doc/decision/0022-*`).

Není to portál (na rozdíl od `Modal`), takže `z-[var(--z-dropdown)]` platí
lokálně vůči stacking contextu triggeru.

### `Tabs`

| prop | typ | default |
| --- | --- | --- |
| `items` | `TabItem[]` | – (povinné) |
| `value` / `defaultValue` / `onValueChange` | `string` / `(id: string) => void` | neřízené od prvního povoleného |
| `label` | `string` | – (jméno pásu) |

`TabItem`: `id`, `label`, `content?`, `disabled?`.

`role="tablist"` / `tab` / `tabpanel`, `aria-selected` na **všech** tabech
(i `false`), `aria-controls` a `aria-labelledby` svazují tab s panelem oběma
směry. Klávesnice: `←`/`→` posunou focus **i výběr** (automatická aktivace),
`Home`/`End` skočí na kraje, `↑`/`↓` zůstávají stránce. Roving tabindex, takže
`Tab` z pásu jde rovnou do panelu; panel má `tabIndex={0}`, aby byl dosažitelný
i když v něm nic fokusovatelného není. Rozhodnutí v `doc/decision/0022-*`.

Podtržení vybraného tabu je `border-bottom` o `--tab-indicator-h` (3px) na
**každém** tabu – nevybrané mají `border-transparent` – takže se při přepnutí
nic neposune.

### `Tooltip`

| prop | typ | default |
| --- | --- | --- |
| `content` | `ReactNode` | – (povinné) |
| `children` | `ReactElement` | – (právě jeden fokusovatelný prvek) |
| `placement` | `'top' \| 'bottom'` | `'top'` |

Otevírá se na **focus i hover**, zavírá na blur, odjetí myši a `Escape`
(bez přesunu focusu). `aria-describedby` se zapisuje **na dítě samotné** přes
`cloneElement`, sloučeně s tím, co si tam volající dal sám – na obalu by
nepopisovalo nic, protože odečítač čte popis z fokusovaného prvku.

Je to **popis, ne jméno**: prvek, jehož jediné jméno by přišlo z tooltipu,
potřebuje `aria-label`. Bublina se montuje na vyžádání, takže mimo zobrazení
není ani ve stromu přístupnosti, a nepřidává vlastní zastávku do tab orderu.

### `Toast` a `ToastRegion`

| prop (`Toast`) | typ | default |
| --- | --- | --- |
| `children` | `ReactNode` | – (povinné, samotná zpráva) |
| `title` | `ReactNode` | – (tučný první řádek) |
| `tone` | `'neutral' \| 'info' \| 'success' \| 'warning' \| 'danger'` | `'info'` |
| `icon` | `ReactNode` | – (dekorativní, `aria-hidden`) |
| `onDismiss` | `() => void` | – (teprve tohle zobrazí × tlačítko) |
| `dismissLabel` | `string` | `'Zavřít'` |

| prop (`ToastRegion`) | typ | default |
| --- | --- | --- |
| `children` | `ReactNode` | – (`Toast` prvky, klidně žádné) |
| `placement` | `'top-right' \| 'bottom-right' \| 'bottom-center'` | `'top-right'` |
| `label` | `string` | – (jméno oblasti) |

**Ohlašuje se, ale nekrade focus** – to je celý smysl toastu. Živou oblastí je
**samotný `Toast`**: `role="status"` (zdvořilé) pro všechny tóny kromě
`danger`, který má `role="alert"` (naléhavé) – stejný tvar, jaký používají
běžné toast knihovny. `ToastRegion` renderuj **bezpodmínečně a klidně
prázdný** – ne kvůli živé oblasti (sama `role="region"` živá záměrně není, aby
se zpráva nečetla dvakrát), ale aby aplikace měla stabilní uzel, do kterého
toasty vkládá. Jestli to skutečný odečítač přečte, tahle testovací sada ověřit
neumí – jsdom nemá strom přístupnosti, který by to spotřeboval.

Fronta, časovač ani imperativní `toast.success(...)` tu **nejsou** a nebudou:
je to stav aplikace, ne design systému (`doc/decision/0023-*`).

## Storybook

```bash
npx nx run design-system-primitives:storybook         # dev server, port 4400
npx nx run design-system-primitives:build-storybook   # statický build do dist/
```

Konfigurace je psaná ručně, bez `@nx/storybook` a bez addonů – proč, je
v `doc/decision/0013-*`. `build-storybook` **je** součástí `npm run build`
(`nx run-many -t build,build-storybook`) i `npm run affected`, takže rozbitá
story spadne v CI, ne až při ručním spuštění.

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
