# 0012 – Časová razítka v kontraktu jsou ISO řetězce, ne `Date`

**Datum:** 2026-08-28 · **Stav:** přijato

## Co

`createdAt` / `updatedAt` a všechna ostatní časová razítka mají v `libs/contract` schéma
`timestampSchema = z.iso.datetime()`, tedy **řetězec** v UTC (`2026-08-28T09:15:00.000Z`).
Nepoužívá se `z.date()` ani `z.coerce.date()`.

Netýká se to rezervačního dne — ten je `dateOnlySchema` (`YYYY-MM-DD`) a `DATE` v Postgresu,
nikdy timestamp.

## Proč

- **Kontrakt zůstává transportně neutrální.** Schéma platí stejně pro oRPC RPC protokol,
  pro prosté JSON, pro OpenAPI i pro payload Socket.io eventu. `z.date()` funguje jen tam,
  kde je mezi oběma stranami serializátor, který `Date` rekonstruuje — jinak se z něj po
  `JSON.stringify` stane řetězec a schéma na druhé straně spadne.
- **Konzistence s date-only sémantikou.** V kontraktu už jednou platí „datum je řetězec";
  mít vedle toho „čas je objekt" je zbytečná druhá konvence.
- **Selže hlasitě, ne tiše.** `z.coerce.date()` by přijal skoro cokoliv a vyrobil
  `Invalid Date`; `z.iso.datetime()` neplatný vstup odmítne.

`z.iso.datetime()` ve výchozím nastavení přijímá **jen `Z`**, ne offsety (`+02:00`).
To je záměr: jediný formát na drátě, žádné „je to +02:00 nebo +01:00" hádání.

## Jak

- Backend serializuje razítka přes `Date.prototype.toISOString()`.
- Frontend si `Date` vyrobí až tam, kde ho opravdu potřebuje (formátování v `libs/i18n`).
- Prisma vrací `Date`; mapování na řetězec je mechanické a děje se v service vrstvě, která
  entitu skládá do kontraktního tvaru.

## Riziko, když je to špatně

Kdyby se ukázalo, že oRPC serializace `Date` je natolik pohodlnější, že to stojí za ztrátu
transportní neutrality, je změna lokální: `timestampSchema` je jedno místo a typy jsou
odvozené, takže se přepíše jeden řádek a TypeScript ukáže všechna volající místa.
Task 4 (oRPC procedury) je poslední moment, kdy to jde přehodnotit levně.
