# 0022 – Primární klíče jsou UUID v7 generované klientem

**Datum:** 2026-08-28 · **Stav:** přijato · **Navazuje na:** `doc/decision/0016-*`

## Co

Všechny entitní tabulky mají `id UUID` s `@default(uuid(7))`, tedy **UUID verze 7**
generované Prisma Clientem. Sloupec je nativní `UUID`, ne `TEXT`.

Výjimka je `ReservationWindowSettings.id` – fixní `INTEGER` 1
(viz `doc/decision/0023-*`).

## Proč

`doc/decision/0016-*` váže Task 9 na UUID (ne cuid, ne autoinkrement) a **verzi
záměrně nechává otevřenou**: `idSchema` je `z.uuid()`, klient id nikdy nečte. Volba
verze je tedy čistě otázka výkonu úložiště.

**Proč v7, ne v4.** UUIDv7 má prvních 48 bitů timestamp, takže nově generovaná id
rostou. Na primárním klíči (B-tree) to znamená, že se zapisuje pořád do stejné
poslední stránky indexu, místo aby náhodné v4 rozstřelovalo zápisy po celém indexu.
Rozdíl je znatelný jen u velkých tabulek – naše `Reservation` poroste řádově o desítky
řádků denně – ale nic to nestojí, takže není důvod volit horší variantu.

Vedlejší efekt: `ORDER BY id` zhruba odpovídá pořadí vzniku. **Nic se na to nesmí
spoléhat** – fronta se řadí podle `createdAt` s `id` jako tiebreakerem, ne podle `id`.

**Proč generuje klient, a ne databáze.** Postgres 17 nemá vestavěné `uuidv7()`
(přibývá až v 18); `gen_random_uuid()` umí jen v4. Alternativou by bylo
`@default(dbgenerated("gen_random_uuid()"))`, což ale znamená v4 a navíc dva různé
zdroje id podle toho, jestli řádek vzniká přes Prisma nebo přes SQL.

**Důsledek, na který je potřeba myslet:** ruční `INSERT` v SQL (migrace, oprava
v `psql`) musí `id` dodat sám, protože sloupec nemá `DEFAULT`. Týká se to zatím
jediného místa – `INSERT` singletonu v init migraci, kde je `id` stejně fixní jednička.

**Proč nativní `UUID`, ne `TEXT`.** 16 bajtů místo 36, rychlejší porovnání, a databáze
odmítne nesmysl už při zápisu.

## Jak

```prisma
model User {
  id String @id @default(uuid(7)) @db.Uuid
  …
}
```

Test `schema-contract-parity.spec.ts` hlídá, že se typ id na drátě nerozejde
s kontraktem; migrace v `migration-sql.spec.ts` hlídá, že sloupec je `UUID`.

## Riziko, když je to špatně

Změna formátu id po nasazení znamená migraci dat, ne úpravu schématu – proto je to
zapsané tady a ne jen v `doc/databaze.md`. Kdyby se ukázalo, že v7 vadí (například
proto, že prozrazuje čas vzniku záznamu – to opravdu dělá), je přechod na v4
jednořádková změna schématu **pro nové řádky**; existující id zůstanou v7 a nic se tím
nerozbije, protože kontrakt verzi nevynucuje.
