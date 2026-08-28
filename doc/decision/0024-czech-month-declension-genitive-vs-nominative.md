# 0024 – České sklonování měsíců: genitiv vs. nominativ v `libs/i18n`

**Datum:** 2026-08-28 · **Stav:** přijato

## Co

Formátovací funkce `libs/i18n` (`formatFullDate`, `formatDayAndMonth`, `formatMonthAndYear`,
`formatMonthName`) nepoužívají jedno společné volání `Intl.DateTimeFormat`, ale dvě různé
kombinace opcí, protože čeština skloňuje názvy měsíců a design (`doc/design/screens/07-lot.png`,
`05-admin-window.png`) používá oba tvary vedle sebe:

| forma | příklad | kdy |
| --- | --- | --- |
| genitiv | `25. srpna`, `pondělí 28. září 2026` | den je součástí stejného volání formátování |
| nominativ | `srpen`, `srpen 2026` | den součástí volání **není** |

## Proč

`Intl.DateTimeFormat('cs-CZ', …)` sám o sobě nedává jeden tvar — dává ten, který ICU data pro
`cs-CZ` přiřadí dané kombinaci polí. Ověřeno v Node (viz komentář v `dates.ts` a testy
v `dates.spec.ts`):

```
{ month: 'long' }                                    -> "srpen"       (nominativ)
{ month: 'long', year: 'numeric' }                   -> "srpen 2026"  (nominativ)
{ day: 'numeric', month: 'long' }                     -> "25. srpna"   (genitiv)
{ weekday: 'long', day: 'numeric', month: 'long', … } -> "pondělí 28. září 2026" (genitiv)
```

Pro září je genitiv shodný s nominativem ("září" v obou), takže naivní test na jediném měsíci
by tenhle rozdíl neodhalil — proto testy v `dates.spec.ts` záměrně pokrývají i srpen (`srpen` /
`srpna`) a říjen (`říjen` / `října`), kde se oba tvary liší.

## Jak

- `formatFullDate` a `formatDayAndMonth` vždy formátují datum s `day` v opcích → genitiv.
- `formatMonthAndYear` a `formatMonthName` datum s `day` nikdy nekombinují → nominativ.
- Všechny čtyři jdou přes next-intl (`createFormatter({ locale: 'cs', timeZone: 'UTC' })`), ne
  přes syrové `Intl.DateTimeFormat` — next-intl je tu jen tenká vrstva nad týmž ICU chováním,
  ale `libs/i18n` je jediné místo, které smí `next-intl` importovat (`eslint.config.mjs`), takže
  formátovací kód musí jít skrz něj i tady.
- `timeZone: 'UTC'` v obou formatterech je nezávislé na `PRAGUE_TIME_ZONE`, který používá
  `IntlProvider` — vstupem těchto funkcí je vždy `DateOnly` (kalendářní den bez časového pásma,
  `doc/decision/0014-*`), převedený na UTC půlnoc, takže žádný posun podle Europe/Prague nesmí
  nastat.

## Riziko, když je to špatně

Kdyby se ICU data pro `cs-CZ` mezi verzemi Node/ICU změnila (např. přestala genitiv nabízet),
`dates.spec.ts` na to spadne okamžitě — testy assertují přesný řetězec, ne jen "nějaký měsíc".
Oprava by pak byla v `dates.ts` samotném (explicitní tabulka skloňovaných tvarů), ne v API,
které `libs/i18n` exportuje ven.
