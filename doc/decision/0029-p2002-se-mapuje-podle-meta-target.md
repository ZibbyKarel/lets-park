# 0029 – Prisma `P2002` se na kód kontraktu mapuje podle `meta.target`

**Datum:** 2026-08-28 · **Stav:** přijato · **Navazuje na:** `doc/decision/0018-*`, `doc/decision/0016-*`, `doc/decision/0026-*`

## Co

Globální exception filtr (`apps/api/src/common/filters/contract-exception.filter.ts`) překládá
`Prisma.PrismaClientKnownRequestError` na členy uzavřeného výčtu `ERROR_CODES`. `P2002`
(porušení unique constraintu) se **nemapuje na jediný kód**, ale rozhoduje se podle toho,
který index spadl – ten je v `error.meta.target`:

| unique index | kód kontraktu | HTTP |
| --- | --- | --- |
| `Reservation (parkingSpotId, date)` | `SPOT_ALREADY_RESERVED` | 409 |
| `Reservation (userId, date)` | `RESERVATION_LIMIT_REACHED` | 409 |
| `WaitlistEntry (parkingSpotId, userId, date)` | `ALREADY_IN_WAITLIST` | 409 |
| cokoli jiného | `CONFLICT` | 409 |

Dál `P2025` (záznam nenalezen) → `NOT_FOUND` a `P2003` (porušení cizího klíče) → `CONFLICT`.
Neznámý Prisma kód se **nemapuje vůbec** – propadne do větve „neočekávaná chyba" a vrátí
holou 500 (viz `doc/decision/0030-*`).

`error.meta` se do odpovědi **nikdy nepřepisuje**. Nese jména sloupců, případně jméno
constraintu, a to je detail schématu, ne informace pro klienta.

## Proč

`Reservation (parkingSpotId, date)` je unique constraint právě proto, že **on** je tím, co
dělá dvojitou rezervaci nemožnou. Aplikační kontrola „je to místo volné?" a následný `INSERT`
nejsou atomické; při souběhu dvou požadavků na stejné místo obě projdou kontrolou a jeden
`INSERT` spadne na constraintu. To není okrajový případ – to je *ten* případ, kvůli kterému
constraint existuje.

Kdyby se `P2002` mapovalo paušálně na `CONFLICT`, poražený požadavek v tom závodě by
uživateli řekl „konflikt" místo „místo už je zabrané". Kdyby se nemapovalo vůbec, řekl by
„internal server error" a UI by nemělo šanci nabídnout waitlist. Rozlišení podle `meta.target`
je jediný způsob, jak z jednoho Prisma kódu dostat tři různé domény chyby, protože Prisma
žádný jemnější kód nemá.

**Proč se musí zvládnout dva tvary `meta.target`.** Prisma ho hlásí buď jako pole jmen
sloupců (`['parkingSpotId', 'date']`), nebo jako jméno indexu
(`'Reservation_parkingSpotId_date_key'`). Který přijde, závisí na driveru a verzi, takže
`mapUniqueConstraintViolation` musí umět oba – jinak by mapování v produkci tiše degradovalo
na `CONFLICT`. Testy pokrývají obě formy.

**Porovnává se přesná množina sloupců, ne podřetězec.** První verze slepila sloupce do
řetězce a ptala se `includes`. To mělo dvě tiché vady: sloupec, jehož jméno *obsahuje* jiné
(`dateFrom`, `updatedDate` vůči `date`), test splnil, a nadmnožina známého constraintu
(`(parkingSpotId, date, tenantId)`) se tvářila jako ten constraint. Správnost pak nesla
*pořadí* podmínek, ne podmínky samotné. Teď se porovnává seřazená množina na rovnost a každá
větev navíc jmenuje svoji tabulku, takže na pořadí nezáleží a cizí tabulka se stejnou dvojicí
sloupců (`Invoice_userId_date_key`) se nenamapuje. Všechny tři pasti mají test.

## Jak

```ts
// apps/api/src/common/filters/contract-exception.filter.ts
export function mapUniqueConstraintViolation(meta: Record<string, unknown> | undefined): ErrorCode {
  const target = uniqueConstraintTarget(meta);
  if (targetMatches(target, 'WaitlistEntry', ['parkingSpotId', 'userId', 'date'])) return 'ALREADY_IN_WAITLIST';
  if (targetMatches(target, 'Reservation', ['parkingSpotId', 'date'])) return 'SPOT_ALREADY_RESERVED';
  if (targetMatches(target, 'Reservation', ['userId', 'date'])) return 'RESERVATION_LIMIT_REACHED';
  return 'CONFLICT';
}
```

Testy v `contract-exception.filter.spec.ts` konstruují **skutečné**
`Prisma.PrismaClientKnownRequestError` objekty (konstruktor
`(message, { code, clientVersion, meta })`), takže k jejich běhu není potřeba databáze.
Pokryté jsou oba tvary `meta.target` i to, že se `meta` neobjeví v odpovědi.

## Riziko, když je to špatně

Když se v migraci změní složení některého unique indexu a tahle mapa se nezmění s ním, spadne
to **tiše**: `P2002` propadne na `CONFLICT` a uživatel dostane generickou hlášku místo té
správné. Nic se nerozbije, jen se zhorší – což je přesně ta kategorie regrese, kterou nikdo
nenahlásí. Při zásahu do unique indexů v `libs/database/prisma/schema.prisma` se proto musí
projít i tahle funkce; testy chytí jen to, že mapování dělá, co říká, ne že odpovídá schématu.

Přesné porovnání tenhle sklon k tichému selhání **zesiluje** – dřív by změněný constraint
možná ještě prošel podřetězcem, teď propadne na `CONFLICT` najisto. Je to vědomá volba:
degradace na obecnější, ale pravdivou chybu je lepší než sebejisté nálepkování cizího
constraintu jménem domény, které mu nepatří.
