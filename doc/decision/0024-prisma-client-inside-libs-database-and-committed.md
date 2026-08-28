# 0024 – Prisma klient se generuje dovnitř `libs/database` a je commitnutý

**Datum:** 2026-08-28 · **Stav:** přijato · **Týká se:** Tasků 9–13, 30 a CI

## Co

Prisma 7 vyžaduje u generátoru `prisma-client` explicitní `output` – do `node_modules`
už negeneruje. Volba je:

```prisma
generator client {
  provider     = "prisma-client"
  output       = "../src/generated/prisma"   // libs/database/src/generated/prisma
  moduleFormat = "cjs"
  runtime      = "nodejs"
}
```

Vygenerovaný klient (14 souborů, ~500 kB TypeScriptu) je **commitnutý v repu**
a je vyloučený z Prettieru (`.prettierignore`). Importuje se výhradně přes
`@lets-park/database`; do `src/generated/**` nesahá žádný jiný projekt.

## Proč

**Output uvnitř libs.** Klient je odvozený artefakt schématu, které leží v téhle libce.
Kdyby ležel v `node_modules` (Prisma 6) nebo v rootu, byl by mimo dosah tagů
`type:data`/`scope:api` a Nx by o závislosti nevěděl. Takhle platí normální hranice
modulů a `@lets-park/database` je jediný vstup.

**`moduleFormat = "cjs"`.** Default je ESM. Celý backend je ale CommonJS
(`apps/api/tsconfig.app.json` → `"module": "commonjs"`, Jest přes ts-jest taky), takže
ESM klient by skončil na `ERR_REQUIRE_ESM`. Přechod celého workspace na ESM není
rozhodnutí, které patří Tasku 9.

**Proč commitnout, a ne generovat při buildu.** Zvažované byly obě varianty:

| | commit | `prisma generate` jako `dependsOn` |
| --- | --- | --- |
| `npm ci && npm run build` na čistém stroji | funguje | vyžaduje krok navíc |
| bez `.env` | funguje | **spadne** – `prisma.config.ts` volá `env('DATABASE_URL')` a ta při chybějící proměnné vyhodí výjimku ještě před generováním |
| review diffu | vidí i vygenerovaný kód (šum) | čistý diff |
| riziko rozejití se schématem | reálné, hlídá ho test | žádné |

Rozhodl druhý řádek: generování bez databáze funguje, ale **ne bez `.env`**, a lint /
typecheck / test / build musí jít pustit na stroji, který databázi ani `.env` nemá.
Precedens v repu už je – `libs/design-system/tokens/assets/tokens.css` je taky
generovaný a commitnutý (`doc/decision/0010-*`).

Riziko rozejití se schématem je pokryté testem: `schema-contract-parity.spec.ts` čte
metadata z **vygenerovaného klienta** a porovnává je s kontraktem, takže zastaralý
klient shodí testy dřív, než se dostane do produkce.

## Jak

- `npx prisma generate` (z rootu) přegeneruje klienta; **výstup se commituje spolu se
  změnou schématu**, jinak testy spadnou.
- Cíl `database:prisma-generate` v `libs/database/project.json` je tam pro pohodlí
  a pro budoucí CI kontrolu „je klient aktuální"; není v `dependsOn` žádného cíle,
  právě proto, že by vyžadoval `.env`.
- `.prettierignore` obsahuje `/libs/database/src/generated`. ESLint a `tsc` řešit
  nemusíme – generované soubory mají `/* eslint-disable */` a `// @ts-nocheck`
  přímo v hlavičce.
- V `NPM_ALLOWLIST` pro tag `type:data` už `@prisma/*` bylo; `@prisma/adapter-pg` se
  tím pádem doplňovat nemusel.

## Riziko, když je to špatně

Někdo změní `schema.prisma` a zapomene commitnout klienta → `database:test` spadne
na neshodě polí. To je hlučné selhání, ne tiché.

Horší varianta je opačná: někdo vygenerovaného klienta ručně upraví. Proti tomu stojí
jen hlavička „Do not edit directly" v každém souboru; kdyby se to stalo, přepíše se to
při dalším `prisma generate` bez varování.
