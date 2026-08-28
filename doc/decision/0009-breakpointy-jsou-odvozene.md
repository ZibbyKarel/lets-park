# 0009 – Breakpointy jsou odvozené, ne ze zdroje

**Datum:** 2026-08-28 · **Stav:** přijato

## Co

`doc/design/ds/colors_and_type.css` nedefinuje žádné `--breakpoint-*` custom
properties. `libs/design-system/tokens/src/lib/layout.ts` (`BREAKPOINTS`) a
`assets/theme.css` (`@theme { --breakpoint-* }`) proto používají Tailwind v4
defaultní hodnoty: `sm:640px, md:768px, lg:1024px, xl:1280px, 2xl:1536px`.

## Proč

Zadání Tasku 6 říká: „Breakpointy, které v CSS nejsou explicitně, odvoď z designu
a označ komentářem.“ Zdrojový CSS soubor breakpointy vůbec nemá – jen dva obsahové
`--container`/`--container-wide` (1200px/1320px). Snímky obrazovek v
`doc/design/screens/` ukazují jednotlivé stavy, ne mezilehlé šířky, kde se layout
zlomí. Bez přístupu k živému `.dc.html` renderu (běžel by Playwright) nejde
breakpointy „naměřit“ přesně – zvolil jsem tedy Tailwind v4 defaulty, protože:

- `xl` (1280px) leží mezi `--container` (1200px) a `--container-wide` (1320px) –
  rozumný bod, kde container přestává být limitujícím faktorem.
- `2xl` (1536px) je nad oběma containery.
- `sm`/`md` pokrývají běžný mobil→tablet přechod, který design (mobile-first typ
  scale v `colors_and_type.css`, komentář „bumped at md via utilities“) předpokládá.

## Jak

- TS zdroj: `BREAKPOINTS` v `layout.ts`, s komentářem „DERIVED“.
- CSS: `assets/theme.css`, blok `@theme { ... }` (ne `@theme inline` – breakpointy
  musí být literální hodnoty, Tailwind je vyhodnocuje do `@media`, nejde tam dát
  `var()`).

## Riziko, když je to špatně

Až budou k dispozici skutečné šířky ze `.dc.html` (Task na `primitives`/`compounds`,
nebo review designu), oprava je lokální: změnit `BREAKPOINTS` v `layout.ts` a
odpovídající řádky v `theme.css`. Nic dalšího v `tokens` na konkrétních hodnotách
breakpointů nezávisí.
