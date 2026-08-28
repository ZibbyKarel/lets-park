# 0025 – `next-intl` je ESM-only, Jest v `libs/i18n` musí transpilovat i `@orpc`

**Datum:** 2026-08-28 · **Stav:** přijato · **Týká se:** `libs/i18n/jest.config.cts`

## Co

`libs/i18n` naráží na dvě nezávislé ESM-only knihovny ve stejném projektu, obě ve tvaru
popsaném v `doc/decision/0020-orpc-je-esm-only-jest-ho-musi-transpilovat.md`:

1. `next-intl` a jeho tranzitivní závislosti (`use-intl`, `intl-messageformat`,
   `@formatjs/*`, `@schummar/icu-type-parser`, `icu-minify`) — publikované jako
   `"type": "module"`, prostý `.js`.
2. `@orpc/contract` (jediný `.mjs` build) — vtažené tranzitivně, protože
   `errors.spec.ts` importuje `ERROR_CODES` z `@lets-park/contract` **za běhu**
   (ne jen jako typ).

Bez zásahu Jest padá na `SyntaxError: Cannot use import statement outside a module`.

## Proč

`libs/i18n` je React lib (generátor `@nx/react:lib`), takže na rozdíl od `libs/contract`
netranspiluje přes `ts-jest`, ale přes `babel-jest` (`@nx/react/babel`). Řešení má proto tři
odlišnosti od `doc/decision/0020-*`, ne jen kopii:

- **`transformIgnorePatterns`** musí povolit obě skupiny balíčků najednou
  (`@orpc|next-intl|use-intl|intl-messageformat|@formatjs|@schummar|icu-minify`), ne jen jednu.
- **`.mjs` musí jít přes `babel-jest`**, ne přes `ts-jest` — `libs/i18n` `ts-jest` vůbec
  nepoužívá.
- **Pořadí klíčů v `transform` je významné.** Generátor `@nx/react:lib` dá na první místo
  vzor `'^(?!.*\\.(js|jsx|ts|tsx|css|json)$)'` (Nx assetový transform pro obrázky/CSS). Jest
  aplikuje první vzor, který na soubor sedne — a `.mjs` do téhle negace *sedne* (protože
  `mjs` v seznamu přípon nebyl), takže `.mjs` soubory tiše skončily v assetovém transformu
  místo v babelu a `import` prošel bez úpravy. Oprava je přidat `mjs` do té negace, ne přidat
  další pravidlo za ni — nové pravidlo za existující shodou by se nikdy nepoužilo.

Druhý, oddělený problém: barrel `@lets-park/contract` (`src/index.ts`) re-exportuje i
`src/api`, které za běhu importuje `@orpc/client` (kvůli oRPC procedure builderu). To zase
odkazuje na webové `TransformStream`, které jsdom (výchozí test prostředí `libs/i18n`, kvůli
`provider.spec.tsx`, který renderuje React) neposkytuje. Řešení není polyfill, ale
`/** @jest-environment node */` na `errors.spec.ts` — ten soubor nikdy nesahá na DOM, takže
běží v čistém Node, kde `TransformStream` je globální od Node 18.

## Jak

- `libs/i18n/jest.config.cts`: `transformIgnorePatterns` se seznamem obou skupin balíčků,
  `.mjs` přidané do `transform` (na `babel-jest`) i do `moduleFileExtensions`, a `mjs`
  přidané do negace prvního (assetového) pravidla.
- `libs/i18n/src/lib/errors.spec.ts`: pragma komentář `@jest-environment node`.
- `doc/decision/0020-*` sám říká, že až tenhle fix bude potřeba potřetí, patří do kořenového
  `jest.preset.js` místo kopírování — Task 17 ale smí sahat jen do `libs/i18n/**`, takže
  zůstává lokální i teď. Kdo bude sjednocovat, ať sjednotí obě kopie (`libs/contract` i
  `libs/i18n`) najednou.

## Riziko, když je to špatně

Riziko duplikace je totožné s `doc/decision/0020-*`: kopie se mohou rozejít. Riziko navíc
specifické pro `libs/i18n` je to pořadí v `transform` — kdyby někdo přidal další
`'^.+\\.mjs$'` pravidlo, aniž by opravil negaci v prvním vzoru, oprava by tiše přestala
platit znovu. `dates.spec.ts` i `errors.spec.ts` na to spadnou hned (import `next-intl`,
resp. `@lets-park/contract`, je v obou nutný), takže regrese se neprojeví tiše.
