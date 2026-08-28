# 0017 – npm allow-list visí na dimenzi `type:`, `libs/shared-types` dostává `layer:foundation`

**Datum:** 2026-08-28 · **Stav:** přijato · **Řeší:** review Tasku 3, nálezy S3 a N3

## Co

Dvě změny v `eslint.config.mjs` (+ jeden tag v `libs/shared-types/project.json`):

1. **Každý `type:` tag má `allowedExternalImports`.** Do Tasku 4 ho měl jediný
   `type:contract`; ostatních jedenáct tagů nemělo žádný, takže **nic neomezovaly** —
   `ds:tokens` mohl importovat `lodash`, `type:ui` mohl importovat `@prisma/client`.
   Seznamy jsou v jedné mapě `NPM_ALLOWLIST` s klíči `app` / `feature` / `ui` / `util` /
   `contract` / `data` / `foundation`.
2. **`libs/shared-types` nese nový tag `layer:foundation`** s `onlyDependOnLibsWithTags: []`
   a `allowedExternalImports: []` — tedy nesmí záviset na žádné workspace lib ani na žádném
   npm balíčku. `type:contract` zároveň závisí na `layer:foundation`, ne na `type:util`.

## Proč

### Proč jen `type:`, a ne na všech dvanácti tagách

Review chtěl doplnit `allowedExternalImports` „na všech jedenáct zbývajících tagů". Po
přečtení implementace pravidla to ale není správné řešení. V
`@nx/eslint-plugin/dist/src/utils/runtime-lint-utils.js` funkce `hasBannedImport()`
**vyfiltruje všechny** constraints, jejichž source tag projekt nese, a pak vrátí
`.find(...)` — tedy **stačí jediný**, který import zakáže:

```js
depConstraints = depConstraints.filter((c) => tags.every((t) => hasTag(source, t)));
return depConstraints.find((constraint) => isConstraintBanningProject(target, constraint, imp));
```

Constraints se tedy **ANDují** a výsledná povolená množina je **průnik** všech dimenzí, které
projekt nese. Kdyby seznamy visely i na `scope:` a `ds:`, musel by být `react` vypsaný ve
třech seznamech současně a vynechání v kterémkoliv z nich by ho tiše zakázalo. To je horší
past než ta původní.

`type:` je zvolená proto, že jako jediná dimenze workspace **rozděluje beze zbytku**: každý
projekt nese právě jeden `type:` tag. Seznam na téhle dimenzi tedy pokrývá všechno a žádný
projekt nezůstane neomezený — což byl přesně obsah nálezu S3. `scope:` a `ds:` zůstávají čistě
o směru závislosti, což je to, co modelují.

Rozdíl mezi „chybí" a „prázdné" je zásadní a stojí za zapamatování:

| zápis | chování |
| --- | --- |
| `allowedExternalImports` chybí | **nic neomezuje**, projde libovolný balíček |
| `allowedExternalImports: []` | zakáže **všechny** npm balíčky |

### Proč `layer:foundation`

Nález N3: `type:util` smí záviset na `type:contract` a `type:contract` smí záviset na
`type:util` — na úrovni tagů cyklus. Obojí je přitom v konkrétních projektech legitimní:

- `libs/api-client` (`type:util`) **musí** vidět kontrakt — je to jeho wrapper,
- `libs/contract` **musí** vidět `libs/shared-types` (date helpery, výčty).

Chyba není ve směru, ale v tom, že tag `type:util` slepuje dvě různé vrstvy: wrappery **nad**
kontraktem a `shared-types` **pod** ním. Nový tag to rozděluje. Výsledné vrstvení je acyklické:

```
app → feature → ui → util → contract → foundation
```

Jako vedlejší efekt je rozhodnutí `0003` („`shared-types` nesmí táhnout Zod") poprvé vynucené
na úrovni grafu, ne jen ručně udržovaným `no-restricted-imports` blokem se jménem jednoho
balíčku. Ten blok zůstává, protože dává lepší chybovou hlášku — ale už není jediná pojistka.

## Jak

- `NPM_ALLOWLIST` v `eslint.config.mjs`, jeden komentovaný klíč na `type:` tag.
- `util` seznam je záměrně **hrubý**: je to sjednocení všech balíčků z `WRAPPED_LIBRARIES`,
  protože všech osm wrapperů nese stejný tag `type:util`. Že `libs/form` smí jen
  `react-hook-form` a `libs/auth` jen `next-auth`, vynucují per-adresářové
  `no-restricted-imports` overridy — Nx dimenze na to nestačí.
- `libs/shared-types/project.json`: `"tags": ["type:util", "scope:shared", "layer:foundation"]`.
- `type:contract` → `onlyDependOnLibsWithTags: ['layer:foundation']`.

**Ověřeno dočasnými probe soubory** (smazané), ne jen tím, že lint projde:

| probe | očekáváno | výsledek |
| --- | --- | --- |
| `import 'zod'` v `libs/shared-types` | zákaz | `type:util … not allowed to import "zod"` |
| `import 'react'` v `libs/shared-types` (`react` je v `util` seznamu) | zákaz z `foundation` | `layer:foundation … not allowed to import "react"` |
| `import '@lets-park/design-system/tokens'` v `libs/shared-types` | zákaz | `layer:foundation cannot depend on any libs with tags` |
| `import 'zod'` v `libs/design-system/tokens` | zákaz | `type:ui … not allowed to import "zod"` |
| `import '@orpc/client'` v `libs/contract` | zákaz | `type:contract … not allowed to import "@orpc/client"` |
| `import 'react'` v `libs/design-system/tokens` | **povoleno** | lint zelený |

## Riziko, když je to špatně

Allow-list je ze své podstaty neúplný pro libs, které ještě neexistují (`type:feature`,
`type:data`, a wrappery pod `type:util`). Když budoucí task potřebuje balíček, který v seznamu
není, **lint spadne s jeho jménem** a task přidá jeden řádek — to je zamýšlené chování, ne
regrese: přidání je vidět v review. Opačná chyba (seznam vynechat) je tichá, a právě ta se
tady opravovala.

Konkrétně `type:ui` je vyplněný dopředu (React, `clsx`, `tailwind-merge`,
`class-variance-authority`, Storybook, TanStack Table), protože Tasky 6–8 na design systému
běží souběžně. Kdyby se netrefil, je to jeden řádek navíc.

`layer:foundation` je čtvrtá dimenze tagů. Nese ji jediný projekt a je to záměr — kdyby
vznikla druhá „nulově závislá" lib, dostane stejný tag. Kdyby `shared-types` někdy npm
závislost opravdu potřebovala, je to signál, že patří jinam, ne že se má seznam povolit.
