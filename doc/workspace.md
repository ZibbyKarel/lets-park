# Workspace – struktura, skripty, hranice

Nx 23 monorepo pro Let's Park. Tenhle dokument popisuje, **jak je repo poskládané**,
**jak se spouštějí kontroly** a **jak přidat novou lib tak, aby ji hlídaly stejné
hranice jako všechno ostatní**.

Závazná specifikace je `plan.md`, rozpad na úkoly `doc/implementation-plan.md`.
Rozhodnutí, která se odchylují od `plan.md` nebo ho zpřesňují, jsou v `doc/decision/`.

---

## Struktura repa

```
apps/
  web/          Next.js 16 (App Router, React 19)   tagy: type:app,  scope:web
  web-e2e/      Playwright e2e pro web              tagy: type:app,  scope:web
  api/          NestJS 11 (API + Socket.io gateway) tagy: type:app,  scope:api
  api-e2e/      Jest integrační testy proti API     tagy: type:app,  scope:api
libs/
  shared-types/ doménové konstanty + Europe/Prague date logika
                                      tagy: type:util,     scope:shared
  contract/     Zod schémata + (od Tasku 4) oRPC kontrakt
                                      tagy: type:contract, scope:shared
doc/            dokumentace, rozhodnutí, export vizuálního designu
```

Konfigurace, která platí pro celý workspace:

| soubor | k čemu je |
| --- | --- |
| `nx.json` | pluginy, cache, `targetDefaults`, defaulty generátorů |
| `tsconfig.base.json` | společné `compilerOptions` + path aliasy `@lets-park/*` |
| `eslint.config.mjs` | flat config: hranice modulů, wrapper vrstvy, `no-console` |
| `.prettierrc`, `.editorconfig` | formát pro TS/TSX/JSON/MD |
| `jest.preset.js`, `jest.config.ts` | společný Jest preset a agregace projektů |

Balíčky se jmenují `@lets-park/<lib>` (viz `doc/decision/0005-npm-scope-lets-park.md`).
Scope se odvozuje z názvu root `package.json` (`@lets-park/source`), takže generátory
Nx ho doplní samy.

---

## Skripty

Všechno se pouští z rootu repa přes npm:

| příkaz | co dělá |
| --- | --- |
| `npm run lint` | ESLint nad všemi projekty (`nx run-many -t lint`) |
| `npm run typecheck` | `tsc --noEmit` nad všemi tsconfigy každého projektu |
| `npm run test` | Jest unit testy (`nx run-many -t test`) |
| `npm run build` | produkční build `web` i `api` |
| `npm run affected` | `nx affected -t lint,test,build` – jen to, co se změnilo (pro CI) |
| `npm run format` | Prettier zápis |
| `npm run format:check` | Prettier kontrola (padá, když něco není naformátované) |

E2e testy nejsou součástí `npm run test`, spouští se cíleně:

```bash
npx nx run web-e2e:e2e      # Playwright; dev server si nastartuje sám
npx nx run api-e2e:e2e      # Jest; nastartuje si api:serve
```

Užitečné jednotlivé cíle:

```bash
npx nx run web:dev          # Next.js dev server
npx nx run api:serve        # NestJS ve watch režimu
npx nx run-many -t lint --skip-nx-cache   # obejít cache
npx nx graph                # graf závislostí
```

CI zatím nemá pipeline soubor – záměrně. Skripty výše jsou navržené tak, aby je
pipeline jen zavolala (`npm ci && npm run affected`).

---

## TypeScript

`tsconfig.base.json` zapíná napříč workspace:

- `strict: true`
- `noUncheckedIndexedAccess: true`
- `noImplicitOverride: true`
- `exactOptionalPropertyTypes: true`
- `forceConsistentCasingInFileNames: true`

Žádný projekt tyhle volby nesmí vypínat. Když nový kód narazí na
`exactOptionalPropertyTypes`, řešení je upravit typ (`prop?: T | undefined`), ne
vypnout kontrolu.

Každý projekt má vlastní cíl `typecheck` (`nx:run-commands` + `tsc --noEmit`).
**Nová lib si ho musí přidat taky** – jinak se do `npm run typecheck` nedostane.

---

## Nx tagy a hranice modulů

Tagy se píší do `project.json` (`"tags": [...]`) a vynucuje je ESLint pravidlo
`@nx/enforce-module-boundaries`. Používají se tři nezávislé dimenze; **pravidla ze všech
dimenzí musí platit současně**.

### Dimenze `type:` – jakou roli lib hraje

| tag | význam | smí záviset na |
| --- | --- | --- |
| `type:app` | aplikace (`apps/*`) | na čemkoliv; nikdo nesmí záviset na aplikaci |
| `type:feature` | doménová kompozice | `feature`, `ui`, `util`, `contract`, `data` |
| `type:ui` | design systém, bez domény | `ui`, `util` |
| `type:util` | wrapper vrstvy a helpery | `util`, `contract` |
| `type:contract` | `libs/contract` – Zod + oRPC | `util`; z npm jen `zod`, `@orpc/contract`, `tslib` |
| `type:data` | přístup k datům (`libs/database`) | `data`, `util`, `contract` |

### Dimenze `scope:` – na které straně lib žije

| tag | smí záviset na |
| --- | --- |
| `scope:web` | `scope:web`, `scope:shared` |
| `scope:api` | `scope:api`, `scope:shared` |
| `scope:shared` | `scope:shared` |

Tahle dimenze drží rozhodnutí `0003`: `apps/api` (`scope:api`) smí na
`libs/shared-types` (`scope:shared`), ale **ne** na `libs/i18n` (`scope:web`), takže se
do backendu nedostane `next-intl`.

### Dimenze `ds:` – vrstvy design systému

| tag | smí záviset na |
| --- | --- |
| `ds:tokens` | `type:util` |
| `ds:primitives` | `ds:tokens`, `type:util` |
| `ds:compounds` | `ds:tokens`, `ds:primitives`, `type:util` |

Vynucuje směr tokens → primitives → compounds. Samotné `type:ui` na to nestačí, protože
všechny tři vrstvy ho nesou – podrobnosti v `doc/decision/0007-*`.

---

## Wrapper vrstvy (`no-restricted-imports`)

Aplikační a knihovní kód nesmí importovat tyhle balíčky přímo. Jediné povolené místo je
wrapper lib, která je vlastní:

| zakázaný balíček | používej místo něj | jediný povolený adresář |
| --- | --- | --- |
| `react-hook-form` | `@lets-park/form` | `libs/form` |
| `@tanstack/react-table` | `@lets-park/design-system/compounds` | `libs/design-system/compounds` |
| `@tanstack/react-query` | `@lets-park/query` | `libs/query` |
| `@orpc/client` | `@lets-park/api-client` | `libs/api-client` |
| `socket.io-client` | `@lets-park/realtime-client` | `libs/realtime-client` |
| `next-auth` | `@lets-park/auth` | `libs/auth` |
| `ical-generator` | `@lets-park/calendar-export` | `libs/calendar-export` |
| `next-intl` | `@lets-park/i18n` | `libs/i18n` |

Seznam je v `eslint.config.mjs` v jedné mapě `WRAPPED_LIBRARIES`; globální zákaz
i výjimky pro jednotlivé wrappery se z ní generují, aby se nemohly rozejít. Chybová
hláška vždy říká, kterou wrapper lib má vývojář použít.

Dál platí `no-console: error` v `apps/api/**` a `libs/**` – backend loguje přes
`nestjs-pino`. Console je povolená jen v `tools/**`, `scripts/**`, `**/scripts/**`
a v konfiguračních souborech.

Zvlášť je ošetřená `libs/shared-types`: má vlastní `no-restricted-imports` blok, který
tam navíc zakazuje **`zod`**. Nx dimenze `type:util` to vyjádřit neumí – stejný tag nesou
i wrapper libs, které na třetích stranách záviset musí. Bez tohohle bloku by nic nebránilo
tomu, aby `apps/api` přes `shared-types` táhla Zod (viz `doc/decision/0003-*`).

> **Past při úpravách `eslint.config.mjs`:** Nx spouští `eslint .` s **cwd nastaveným na
> adresář projektu**, ne na root repa. Config objekt, jehož `files` jsou cesty od rootu
> (`apps/**`, `libs/form/**`), proto musí mít `basePath: workspaceRoot` – jinak se glob
> porovná s cestou relativní k projektu, nikdy nesedne a pravidlo **tiše nic nedělá**.
> Po každé změně path-scoped pravidla ho ověř dočasným souborem, ne jen tím, že lint
> projde.

---

## Jak přidat novou lib

1. **Vygeneruj ji.** Alias `@lets-park/<nazev>` se do `tsconfig.base.json` doplní sám.

   ```bash
   # čistě TypeScriptová lib (kontrakt, util, backend service)
   npx nx g @nx/js:lib libs/shared-types --name=shared-types \
     --unitTestRunner=jest --bundler=none --linter=eslint --useProjectJson

   # React lib (design systém, wrappery pro frontend)
   npx nx g @nx/react:lib libs/design-system/primitives --name=design-system-primitives \
     --unitTestRunner=jest --bundler=none --linter=eslint --useProjectJson
   ```

2. **Nastav tagy** v `libs/<nazev>/project.json`. Plánované rozdělení:

   | lib | tagy |
   | --- | --- |
   | `libs/contract` | `type:contract`, `scope:shared` |
   | `libs/shared-types` | `type:util`, `scope:shared` |
   | `libs/design-system/tokens` | `type:ui`, `scope:web`, `ds:tokens` |
   | `libs/design-system/primitives` | `type:ui`, `scope:web`, `ds:primitives` |
   | `libs/design-system/compounds` | `type:ui`, `scope:web`, `ds:compounds` |
   | `libs/form`, `libs/query`, `libs/api-client`, `libs/realtime-client`, `libs/auth`, `libs/i18n` | `type:util`, `scope:web` |
   | `libs/calendar-export` | `type:util`, `scope:api` |
   | `libs/database` | `type:data`, `scope:api` |

   Projekt bez tagů žádná pravidla neomezují – **netagovaná lib je díra v hranicích.**

3. **Přidej cíl `typecheck`** do `project.json`:

   ```json
   "typecheck": {
     "executor": "nx:run-commands",
     "options": { "command": "tsc --noEmit -p libs/<nazev>/tsconfig.lib.json" }
   }
   ```

4. **Ověř**: `npm run lint && npm run typecheck && npm run test`.

---

## Poznámky k formátování

`npm run format` běží nad zdrojovým kódem, ne nad `doc/` – ručně psané české dokumenty
a export designu jsou v `.prettierignore`, aby Prettier nepřeformátovával tabulky
a text, který nepatří jemu.
