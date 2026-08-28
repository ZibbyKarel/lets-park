# 0014 – `DateOnly` je nebrandovaný `string`

**Datum:** 2026-08-28 · **Stav:** přijato

## Co

`DateOnly` v `libs/shared-types` je prostý alias:

```ts
export type DateOnly = string;
```

Není to branded typ (`string & { __brand: 'DateOnly' }`). Runtime jistotu dávají
`isDateOnly()` / `assertDateOnly()` v `libs/shared-types` a `dateOnlySchema`
(`z.iso.date()`) na hranici kontraktu — ne typový systém.

## Proč

Brand by musel existovat dvakrát a v obou podobách jinak:

- `libs/shared-types` nesmí záviset na Zodu (viz `doc/decision/0003-*`), takže by si brand
  musel definovat sám;
- `libs/contract` odvozuje typy výhradně přes `z.infer`, takže by jeho `DateOnly` byl
  `z.infer<typeof dateOnlySchema>` — buď obyčejný `string`, nebo Zodí vlastní brand
  (`.brand<'DateOnly'>()`), který je strukturálně **jiný** než ten ruční.

Ať by se zvolilo cokoliv, kontraktní typ a doménový typ by si nebyly přiřaditelné a service
vrstva by byla plná přetypování. Přetypování na každém řádku je horší než žádný brand:
maskuje i ty chyby, které by brand chytil.

Navíc žádná hodnota v systému není „string, který se dá zaměnit za datum" — datumy chodí
z DB (`DATE` sloupec) a z kontraktu (`z.iso.date()`), obojí už zvalidované.

## Jak

- Veřejné API `libs/shared-types` každou vstupní hodnotu validuje (`parseDateOnly()`
  volá `assertDateOnly()`), takže neplatný řetězec spadne na `TypeError` hned, ne až
  o tři vrstvy dál.
- `dateOnlySchema` v kontraktu validuje i **kalendářní platnost** — `z.iso.date()`
  odmítne `2023-02-29` i `2026-04-31`, nejen špatný formát.
- `YearMonth` (`YYYY-MM`) je řešený stejně.

## Riziko, když je to špatně

Typový systém nezabrání předat do date funkce libovolný `string`. V praxi to chytí buď
`assertDateOnly()` v runtime, nebo test. Kdyby se ukázalo, že to bolí, jde brand zavést
později jedním místem (typ v `shared-types` + `.transform()` v `dateOnlySchema`) — API
funkcí se přitom nemění.
