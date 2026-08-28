# 0010 – Generovaný `tokens.css` je commitnutý a vyloučený z Prettieru

**Datum:** 2026-08-28 · **Stav:** přijato

## Co

`libs/design-system/tokens/assets/tokens.css` je **generovaný** soubor (z TS tokenů
v `src/lib/*.ts`, funkcí `generateTokensCss`), ale je **commitnutý do gitu** a je
z formátování Prettierem vyloučený přes `.prettierignore` – stejně jako
`apps/web/next-env.d.ts`.

## Proč

1. **Commitnutý.** Konzumenti (Next.js app, Storybook, testy) mají po `npm ci`
   rovnou funkční CSS proměnné bez nutnosti spouštět build krok navíc. Design systém
   je teprve v Tasku 6 (jen `tokens`); `primitives`/`compounds` v dalších taskách
   budou tento soubor importovat – nemusí čekat na to, že si někdo pamatuje spustit
   generátor. **Pozor:** přesný import specifier (relativní cesta vs. nějaký
   `exports` mapping) zatím není vyřešený – `@lets-park/design-system/tokens` je jen
   TS `tsconfig.paths` alias pro modulovou rezoluci, CSS `@import`/bundler ho
   nezná automaticky. Jak apps/web/Storybook budou `theme.css` reálně importovat
   je na Tasku, který tuhle lib poprvé konzumuje – viz `doc/design-system.md`.
2. **Mimo Prettier.** `generateTokensCss` vědomě reprodukuje styl zdrojového
   `doc/design/ds/colors_and_type.css` 1:1 – velká písmena v hex kódech
   (`#008FFF`), dvojité uvozovky, `rgba(35,34,31,0.04)` bez mezer za čárkami.
   Zadání Tasku 6 explicitně zakazuje hodnoty „rounding/renaming/improving“.
   Prettier by ale hex kódy zmenšil na malá písmena a přidal mezery do `rgba()` –
   tedy změnil by zápis, i když ne barvu. Nechat Prettier přeformátovat by rozbilo
   1:1 shodu se zdrojem a hlavně by po každém `npm run format` přepsalo soubor
   jinak, než jak ho generuje `generateTokensCss` – drift test (`generate-css.spec.ts`)
   by pak padal i po neškodném `format:write`.

## Jak

- Generátor: `libs/design-system/tokens/src/lib/generate-css.ts`
  (`generateTokensCss(tokens: DesignTokens): string`), čistá funkce bez I/O.
- Spouštěč: `libs/design-system/tokens/scripts/build-tokens-css.ts`, cíl
  `nx run design-system-tokens:generate-css`.
- Drift test: `generate-css.spec.ts` čte commitnutý soubor ze disku (`fs.readFileSync`)
  a porovnává ho `toBe()` s výstupem `generateTokensCss(DESIGN_TOKENS)` – žádný Jest
  inline snapshot, protože ten by se tiše přepsal na nový výstup generátoru a nikdy
  by nechytil rozjetí generátoru/TS zdroje od skutečného souboru na disku.
- `.prettierignore`: `/libs/design-system/tokens/assets/tokens.css`.
- `theme.css` (hand-written Tailwind bridge ve stejné složce) **naopak** Prettier
  hlídá běžně – je to strukturální soubor s `var()` odkazy, ne kopie hodnot.

## Riziko, když je to špatně

Kdyby se ukázalo, že commitnutý generovaný soubor vadí (např. konflikty při mergi,
nebo touha mít CSS čistě odvozené za buildu), řešení je hodit `assets/tokens.css`
do `.gitignore` a spustit `generate-css` jako `preinstall`/`prebuild` skript – žádná
jiná část kódu na commitnutí souboru nezávisí kromě testu, který by se upravil na
`beforeAll` regeneraci do tmp souboru.
