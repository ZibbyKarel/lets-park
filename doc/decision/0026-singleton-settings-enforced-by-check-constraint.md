# 0026 – Singleton `ReservationWindowSettings` je vynucený `CHECK` constraintem

**Datum:** 2026-08-28 · **Stav:** přijato · **Navazuje na:** `doc/decision/0004-*`, `doc/decision/0016-*`

## Co

Tabulka `ReservationWindowSettings` smí obsahovat **právě jeden řádek**. Vynucuje to
kombinace primárního klíče a `CHECK`:

```prisma
model ReservationWindowSettings {
  id             Int                 @id @default(1)
  openDaysBefore Int                 @default(7)
  lockMode       ReservationLockMode @default(AUTO)
  updatedAt      DateTime            @updatedAt @db.Timestamptz(3)
}
```

```sql
ALTER TABLE "ReservationWindowSettings"
  ADD CONSTRAINT "ReservationWindowSettings_singleton_check" CHECK ("id" = 1);

ALTER TABLE "ReservationWindowSettings"
  ADD CONSTRAINT "ReservationWindowSettings_openDaysBefore_range_check"
  CHECK ("openDaysBefore" BETWEEN 1 AND 31);
```

Řádek zakládá **init migrace** (`INSERT … ON CONFLICT ("id") DO NOTHING`), ne seed.

## Proč

**Proč vůbec vynucovat.** „Aplikace zapisuje jen jeden řádek" není garance, je to
zvyk. Kdyby v tabulce vznikl druhý řádek, čtení nastavení začne vracet nedeterministický
výsledek a rezervační okno se bude chovat náhodně – což je přesně ta třída chyby, kterou
nikdo nereprodukuje.

**Proč `CHECK (id = 1)` na fixním primárním klíči.** Primární klíč zakazuje **druhý**
řádek s `id = 1`, `CHECK` zakazuje **jakékoliv jiné** `id`. Dohromady: víc než jeden
řádek v tabulce být nemůže, nezávisle na tom, kdo do ní píše – aplikace, `psql`,
Adminer, budoucí migrace. Čtení je pak triviální (`findUnique({ where: { id: 1 } })`)
a nepotřebuje `findFirst` ani `LIMIT 1`.

Zvažované alternativy:

- **Částečný unikátní index** (`CREATE UNIQUE INDEX … ON t ((true))`) funguje stejně
  dobře, ale je to okluznější zápis téhož a při čtení stejně potřebujeme vědět, jak
  ten jediný řádek adresovat.
- **`@@unique` nad konstantním sloupcem** znamená sloupec navíc, který nic neznamená.
- **Nastavení jako řádky v key-value tabulce** by zrušilo typovou kontrolu
  (`openDaysBefore` je `int`, `lockMode` je výčet) a přesunulo validaci do aplikace.

**Proč `id` není UUID.** `doc/decision/0016-*` říká, že identifikátory **entit** jsou
UUID, protože chodí v URL a v realtime payloadech a nesmí prozrazovat pořadí ani počet.
Tenhle `id` nikam nechodí: `reservationWindowSettingsSchema` v kontraktu žádné `id`
nemá, API čte a zapisuje nastavení bez identifikátoru. Je to interní detail úložiště,
takže 0016 se ho netýká – a jen s fixním malým číslem může být `CHECK` takhle triviální.

**Proč řádek zakládá migrace, a ne seed.** Tabulka nesmí být nikdy prázdná (čte ji
každá rezervační cesta) a `prisma db seed` se v produkci nepouští. Seed hodnoty pro
jistotu ještě upsertuje, aby se ručně rozhrabaná dev databáze vrátila do známého stavu.

**Rozsah `openDaysBefore`.** Kontrakt ho omezuje na 1–31
(`MIN_OPEN_DAYS_BEFORE`/`MAX_OPEN_DAYS_BEFORE`). Stejný `CHECK` v databázi je levný
a chrání před zápisem mimo API.

## Jak

Oba `CHECK` constrainty i `INSERT` jsou **ručně dopsané na konec** vygenerovaného
`migration.sql` – Prisma je ve schématu vyjádřit neumí. Test
`libs/database/src/lib/migration-sql.spec.ts` na jejich přítomnost přímo tvrdí, takže
se nemůžou ztratit při regeneraci migrace.

**Past:** `prisma migrate dev` porovnává stav po migracích proti `schema.prisma`, takže
tyhle objekty vidí jako drift a do další migrace navrhne jejich zrušení. Postup pro
každou další změnu schématu je popsaný v `doc/databaze.md`
(§„Past: ručně psané SQL a `migrate dev`"): `--create-only`, pak z vygenerovaného SQL
smazat `DROP CONSTRAINT`/`DROP TRIGGER`, teprve pak aplikovat.

## Riziko, když je to špatně

Hlavní riziko není samotný constraint, ale ta past výše: kdyby si jí někdo nevšiml,
tichý `DROP CONSTRAINT` v nové migraci singleton zruší a nikdo si toho nevšimne, dokud
se neobjeví druhý řádek. Proto na to tvrdí test a proto je to v `doc/databaze.md`
napsané jako postup, ne jako poznámka.

Kdyby v budoucnu bylo potřeba víc než jedno nastavení (například per-lokalita), padá
celý model – ale to už není „změna constraintu", to je nová entita s cizím klíčem.
