# 0029 – `FormField` je obecný render-prop, `libs/form` neimportuje design systém

**Datum:** 2026-08-28 · **Stav:** přijato · **Task:** 18 (`libs/form`)

## Co

`FormField` (`libs/form/src/lib/form-field.tsx`) nepřijímá jméno primitivu ani ho sám
nevykresluje — bere `name` a render-prop `render({ field, error })`, kde `field` je
`ControllerRenderProps` (`value`/`onChange`/`onBlur`/`name`/`ref`) a `error` je zpráva
z odpovídajícího Zod issue. Volající sám zavolá `Input`/`Select`/`Checkbox`
(`@lets-park/design-system-primitives`) a props na něj spread.

Důsledek: **`libs/form` (produkční zdroj) neimportuje design systém vůbec.** Jediné místo,
kde se `@lets-park/design-system-primitives` v `libs/form` objevuje, je jeden testovací
soubor (`app-form.spec.tsx`), a to díky samostatnému ESLint override popsanému níže.

## Proč

Task 18 brief popisuje `FormField` jako „renderující DS primitivy (Input, Select,
Checkbox)". Doslovné čtení („FormField importuje a switchuje mezi třemi primitivy") by ale
znamenalo, že `libs/form` (tag `type:util`) závisí na `design-system-primitives`
(tag `type:ui`) — což `eslint.config.mjs`/`doc/workspace.md` zakazují: `type:util` smí
záviset jen na `type:util`/`type:contract`, protože vrstvení `app → feature → ui → util →
contract → foundation` je acyklické jen v tomhle směru (`ui` už smí záviset na `util`,
takže obrácená hrana by graf uzavřela do cyklu). Global constraint 5 navíc říká, že
kompozice design systému žije „jen v `apps/web`" (doménová i nedoménová) — `libs/form` do
toho nepatří o nic víc než `libs/i18n`.

Přirozenější čtení brief věty je jako popis **výsledného použití** („k čemu FormField
slouží"), ne jako specifikace jeho importů — což se shoduje s formulací dál v zadání:
„your `FormField` connects the two [primitiv a validaci]". Generický render-prop tohle
spojení dělá stejně dobře jako natvrdo zapojené primitivy, a navíc:

- **Zůstává malé API** (jedna komponenta, ne tři/čtyři varianty pro Input/Select/Checkbox/
  budoucí primitivy),
- **Nepřidává vazbu** mezi wrapperem a design systémem — Task 8 (Modal/Dropdown/Tabs/Tooltip)
  byl zastaven a nemerged; kdyby `FormField` znal konkrétní sadu primitivů, každá budoucí
  primitiva by vyžadovala změnu v `libs/form`,
- **Typová bezpečnost přežívá** — `useController<TFieldValues, TName>` typuje `field` přesně
  podle schématu předaného do `useAppForm`, generický render-prop na tom nic nemění.

## Jak

- `FormField<TFieldValues, TName>({ name, render, control? })` volá `useController` (ne
  `register`) právě proto, že `useController` už samo vrátí `fieldState.error` rozřešený pro
  konkrétní `name` — `FormField` cestu k chybě neduplikuje, jen ji předá dál.
- Test, který dokazuje celý smysl wrapperu (formulář z `@lets-park/form` +
  `@lets-park/design-system-primitives`, bez přímého importu `react-hook-form`), přesto musí
  žít v `libs/form`, protože Task 18 smí sahat jen do `libs/form/**`. Řeší to samostatný
  `depConstraints` override jen pro `libs/form/**/*.spec.{ts,tsx}` (`eslint.config.mjs`,
  `formSpecDepConstraints`): klon hlavního `DEP_CONSTRAINTS` pole, kde `type:util` smí navíc
  na `type:ui` — ale **jen** pro soubory odpovídající tomu globu, ne pro zbytek `libs/form`
  ani pro žádnou jinou `type:util` lib. Vedle toho `allowCircularSelfDependency: true`, protože
  demo test importuje `@lets-park/form` přes vlastní alias zevnitř `libs/form` (aby dokázal, že
  veřejné API samo stačí) a bez toho by to pravidlo nahlásilo jako cyklickou
  self-závislost.
- Ověřeno **čtyřmi** dočasnými probe soubory (smazané, viz `doc/workspace.md` o povinnosti
  ověřovat path-scoped pravidla, ne jen že lint projde):

  | probe | umístění | očekáváno | výsledek |
  | --- | --- | --- | --- |
  | `import 'react-hook-form'` | `libs/form/src/lib/*.ts` | povoleno | lint zelený |
  | `import 'react-hook-form'` | `libs/i18n/src/lib/*.ts` | zákaz | `no-restricted-imports … use @lets-park/form` |
  | `import '@lets-park/design-system-primitives'` | `libs/form/src/lib/*.spec.tsx` | povoleno | lint zelený |
  | `import '@lets-park/design-system-primitives'` | `libs/form/src/lib/*.ts` (ne `.spec.`) | zákaz | `type:util … can only depend on … "type:util", "type:contract"` |

  Poslední řádek je ten, který dokazuje, že override cílí jen na testy, ne na celou lib —
  bez něj by bylo nerozeznatelné, jestli override omylem otevřel `type:ui` i pro `libs/form`
  jako celek.

## Riziko, když je to špatně

Pokud budoucí task (23–27, 31) skutečně potřebuje, aby `libs/form` samo vykreslovalo
konkrétní primitiva (např. kvůli sdílené logice okolo `FieldOwnProps`, která by se jinak
opakovala v každé feature), bude to vyžadovat buď přesunout tuhle kompozici do nové
`type:feature` lib (svobodně závislé na `ui`+`util`), nebo vědomě přehodnotit vrstvení a
zapsat to jako nové rozhodnutí — ne tiše rozšířit `type:util → type:ui` globálně, což by
otevřelo stejnou cestu všem ostatním wrapperům (`libs/query`, `libs/api-client`, …), i těm,
které design systém znát nemají důvod.
