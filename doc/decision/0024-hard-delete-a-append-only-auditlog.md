# 0024 – Hard delete + append-only `AuditLog` místo soft delete

**Datum:** 2026-08-28 · **Stav:** přijato · **Týká se:** Tasků 13, 27, 30

## Co

- Zrušení rezervace nebo odchod z fronty **maže řádek** a zapisuje záznam do `AuditLog`.
  Sloupec `deletedAt` v žádné tabulce není.
- Uživatelé a parkovací místa se **nemažou vůbec** – deaktivují se (`active = false`).
- `AuditLog` je **append-only**, vynuceno databázovým triggerem:

  ```sql
  CREATE OR REPLACE FUNCTION "auditlog_reject_mutation"() RETURNS TRIGGER AS $$
  BEGIN
    RAISE EXCEPTION 'AuditLog is append-only: % is not allowed', TG_OP
      USING ERRCODE = 'restrict_violation';
  END;
  $$ LANGUAGE plpgsql;

  CREATE TRIGGER "AuditLog_append_only"
    BEFORE UPDATE OR DELETE ON "AuditLog"
    FOR EACH ROW EXECUTE FUNCTION "auditlog_reject_mutation"();
  ```

- Všechny ostatní cizí klíče mají `ON DELETE RESTRICT`; jediný `SET NULL` je
  `User.preferredParkingSpotId`.

## Proč

**Soft delete by rozbil unikátní index, na kterém stojí celá rezervační logika.**
`Reservation (parkingSpotId, date)` je jediná věc, která při souběžných requestech
brání dvojité rezervaci. Se soft delete by v tabulce zůstal „zrušený" řádek a index by
na to místo ten den už nikoho nepustil. Obejít to jde částečným indexem
(`WHERE "deletedAt" IS NULL`), ale tím se z jednoduché databázové garance stává něco,
co musí mít na paměti každý dotaz — a co jednou někdo zapomene.

**Soft delete by zaneřádil každý dotaz.** „Kdo dnes parkuje", „kolik je volných míst",
„kdo je další ve frontě" – všechno se ptá na živé záznamy. Jedno zapomenuté
`WHERE "deletedAt" IS NULL` v joinu nebo agregaci nezpůsobí pád, ale tiše špatné číslo.

**Historii stejně potřebujeme jinde.** Audit musí odpovědět na „kdo, co, kdy a s jakým
payloadem" i u akcí, které žádný řádek nemažou (`USER_UPDATED`, `SPOT_UPDATED`,
`WAITLIST_PROMOTED`). `AuditLog` to pokrývá celé; soft delete pokrývá jen mazání,
takže by se vedle auditu udržoval druhý, poloviční záznam historie – a ty dva by se
dřív nebo později rozešly.

**Mazání je bezpečné jen tam, kde se maže.** Hard delete se týká výhradně rezervací
a položek fronty: krátkodobých záznamů ohraničených datem, na které nic dalšího neváže.
Uživatel ani místo se nemažou, protože na nich visí cizí klíče z auditu – proto
`ON DELETE RESTRICT` všude a `active = false` jako odchod ze systému.

**Proč trigger, a ne konvence.** Když je audit jediný záznam o tom, že rezervace
existovala, pak omylem spuštěný `UPDATE` ničí důkaz, který se nemá odkud obnovit.
K tabulce se navíc dá dostat i mimo aplikaci (`psql`, Adminer, migrace), takže
„servisní vrstva to nedělá" negarantuje nic. Trigger to zastaví ve všech případech
a stojí jednu funkci.

Prisma append-only vyjádřit neumí, takže trigger je ručně dopsaný na konec init
migrace – platí pro něj stejná past s `migrate dev` jako pro `CHECK` constrainty
(viz `doc/decision/0023-*` a `doc/databaze.md`).

## Jak

- Trigger a jeho funkce jsou v `libs/database/prisma/migrations/*/migration.sql`;
  `migration-sql.spec.ts` na jejich přítomnost tvrdí.
- Servisní vrstva (Task 13) musí mazání a zápis auditu dělat **v jedné transakci**,
  jinak vznikne buď rezervace bez stopy, nebo stopa bez skutku.
- `AuditLog.actorUserId` je povinný (`doc/decision/0016-*`): i automatické povýšení
  z fronty spouští uživatel svým zrušením rezervace.

## Riziko, když je to špatně

Překlep v `payload` nejde opravit – jde jen připsat nový záznam. To je záměr, ale
znamená to, že tvar payloadu je potřeba promyslet **předtím**, než ho začne služba
zapisovat.

Druhé riziko je růst tabulky: `AuditLog` se nikdy nezmenší. Při desítkách rezervací
denně jsou to řádově tisíce řádků ročně, což je nic; kdyby to jednou vadilo, řešením je
archivace do jiné tabulky (`INSERT … SELECT` + `DELETE` s dočasně vypnutým triggerem),
ne změna modelu.

Třetí riziko: trigger blokuje i `pg_restore`, kdyby obnova používala `UPDATE`.
Nepoužívá – `pg_restore` dělá `COPY`/`INSERT` (ověřeno v `doc/databaze.md`, sekce
Zálohy, zatím jen z dokumentace, ne reálným během).
