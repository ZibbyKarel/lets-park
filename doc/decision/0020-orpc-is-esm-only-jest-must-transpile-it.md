# 0020 – `@orpc/contract` je ESM-only, Jest ho musí transpilovat

**Datum:** 2026-08-28 · **Stav:** přijato · **Týká se:** každého projektu, který v testech importuje `@lets-park/contract`

## Co

`@orpc/contract@1.15.0` je publikovaný **jen jako ESM**: `"type": "module"`, jediný build
`dist/index.mjs`, v `exports` není podmínka `require`. Jest projekty v tomhle workspace běží
jako CommonJS, takže import spadne na `SyntaxError: Cannot use import statement outside a module`.

Řešení je v `libs/contract/jest.config.cts` a `libs/contract/tsconfig.spec.json`:

```js
transform: {
  '^.+\\.[tj]s$':  ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  '^.+\\.mjs$':    ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
},
transformIgnorePatterns: ['/node_modules/(?!(?:@orpc)/)'],
moduleFileExtensions: ['ts', 'js', 'mjs', 'html'],
```

plus `"allowJs": true` v `tsconfig.spec.json` (ts-jest bez něj `.mjs` nevezme).

Verze je připnutá **přesně** (`"@orpc/contract": "1.15.0"`, `--save-exact`). oRPC 2.0 je zatím
beta a kontraktová lib je závazný artefakt — na prerelease nepatří.

## Proč

Všechny tři řádky dělají něco jiného a chybí-li kterýkoliv, chyba vypadá stejně:

- **`transformIgnorePatterns`** — Jest ve výchozím stavu **nic** pod `node_modules` netransformuje.
  Bez výjimky pro `@orpc` se neupravený `import` dostane až k CJS loaderu.
- **`.mjs` v `transform`** — výchozí vzor je jen `.[tj]s`, takže by se soubor sice nepřeskočil,
  ale ani nezpracoval.
- **`mjs` v `moduleFileExtensions`** — bez toho ho resolver nenajde.

Alternativy byly horší: přepnout projekt na nativní ESM v Jestu znamená `--experimental-vm-modules`
a rozbité `jest.config.cts`; vlastní CJS shim by byl kód navíc, který se musí udržovat s každým
minorem oRPC.

## Jak

Konfigurace je zatím jen v `libs/contract`, protože je to jediný projekt, který `@orpc/contract`
importuje. **Tasky 11 (`libs/api-client`) a 12 (`apps/api`) narazí na totéž** ve chvíli, kdy
v testu sáhnou na `@lets-park/contract` — musí si ty tři řádky zkopírovat.

> Až to bude potřeba **třetí** projekt, přesuň konfiguraci do `jest.preset.js` v rootu, ať se
> kopie nerozejdou. Do té doby je duplikace levnější než globální nastavení, které se nikdo
> neodváží změnit.

## Riziko, když je to špatně

Transpilace `node_modules` zpomaluje testy — dnes o zlomek vteřiny, protože jde o jeden malý
balíček. Kdyby `transformIgnorePatterns` někdo rozšířil na víc balíčků, začne to být vidět.

Druhé riziko je tichý drift: `allowJs: true` je v `tsconfig.spec.json` **kvůli Jestu**, ne kvůli
typům. `include` v tom souboru nikdy nezabírá `node_modules`, takže program pro `tsc --noEmit` se
tím nerozšiřuje — ale kdyby někdo `include` uvolnil, začne typecheck kontrolovat cizí JS.
