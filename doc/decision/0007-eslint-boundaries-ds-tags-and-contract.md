# 0007 – ESLint hranice: dimenze tagů `ds:*` a externí importy kontraktu

**Datum:** 2026-08-28 · **Stav:** přijato

## Co

Dvě odchylky od doslovného znění zadání Tasku 1 v konfiguraci
`@nx/enforce-module-boundaries` (`eslint.config.mjs`):

1. Vedle dimenzí `type:*` a `scope:*` existuje třetí dimenze **`ds:tokens` /
   `ds:primitives` / `ds:compounds`** pro vrstvy design systému.
2. `type:contract` má `allowedExternalImports: ['zod', 'zod/*', '@orpc/contract',
   'tslib']` – tedy nejen `zod`.

## Proč

**1) `ds:*` dimenze.** Zadání požaduje, aby `libs/design-system/primitives` nesmělo
importovat `libs/design-system/compounds`. Obě libs jsou ale `type:ui`, a pravidlo
`type:ui → [type:ui, type:util]` mezi nimi nedokáže rozlišit. Nx vyhodnocuje všechna
pravidla, jejichž `sourceTag` sedí, **konjunktivně** – přidáním druhého tagu tedy vznikne
další podmínka, kterou musí cíl splnit:

| zdroj | smí záviset na |
| --- | --- |
| `ds:tokens` | `type:util` |
| `ds:primitives` | `ds:tokens`, `type:util` |
| `ds:compounds` | `ds:tokens`, `ds:primitives`, `type:util` |

`primitives → compounds` projde přes `type:ui`, ale spadne na pravidle `ds:primitives`,
protože `compounds` nenese ani `ds:tokens`, ani `type:util`. Směr tokens → primitives →
compounds je tím vynucený jednosměrně, přesně jak žádá `plan.md`.

**2) `@orpc/contract` v kontraktu.** Zadání Tasku 1 říká „`type:contract` nesmí importovat
nic kromě `zod` a `type:util`", ale `plan.md` (Fáze 1) do téže lib umisťuje **oRPC
kontrakt** – procedury se tam definují přes `@orpc/contract`. Doslovné pravidlo by
znemožnilo napsat Fázi 1. Povolený je jen `@orpc/contract` (definice kontraktu), ne
`@orpc/server` ani `@orpc/client` – ty patří do backendu, respektive do
`libs/api-client`. `tslib` je runtime helper TypeScriptu (`importHelpers: true`), ne
závislost v doménovém smyslu.

## Jak

- Konfigurace je v `eslint.config.mjs`, sekce `@nx/enforce-module-boundaries`.
- Tagy pro budoucí libs jsou vypsané v `doc/workspace.md` (tabulka „jak přidat novou lib").
- Ověřeno dočasnými libs: `primitives → compounds` a `scope:api → scope:web` ESLint
  odmítne (viz report Tasku 1).

## Riziko, když je to špatně

Kdyby se ukázalo, že rozdělení design systému na tři libs je zbytečné, `ds:*` tagy se
smažou spolu s libs – nikde jinde se nepoužívají. Kdyby kontrakt potřeboval další balíček
(např. jiný oRPC modul), rozšíření `allowedExternalImports` je jednořádková změna; horší
by bylo, kdyby seznam nikdo neudržoval a pravidlo se vypnulo úplně – proto je zúžený na
konkrétní balíčky, ne na `@orpc/*`.
