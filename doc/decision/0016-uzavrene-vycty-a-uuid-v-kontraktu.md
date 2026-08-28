# 0016 – Uzavřené výčty v kontraktu: akce AuditLogu a UUID identifikátory

**Datum:** 2026-08-28 · **Stav:** přijato

## Co

Dvě věci, které `plan.md` nechává otevřené, kontrakt zavírá:

1. **`AuditLog.action` je uzavřený výčet** (`auditLogActionSchema`), ne volný `string`.
   Startovní seznam je přesně těch šest akcí, které `plan.md` §Doménový model jmenuje:
   `RESERVATION_CREATED`, `RESERVATION_CANCELLED`, `RESERVATION_CANCELLED_BY_ADMIN`,
   `WAITLIST_PROMOTED`, `USER_UPDATED`, `SPOT_UPDATED`.
2. **Identifikátory entit jsou UUID** (`idSchema = z.uuid()`), včetně
   `User.preferredParkingSpotId`.

## Proč

**Výčet akcí.** `plan.md` uvádí akce slovem „např.", takže seznam není vyčerpávající.
Volný `string` by ale znamenal, že se překlep (`RESERVATION_CANCELED`) dostane do
append-only tabulky a nikdy se nedá opravit — a že filtrování v adminu nemá co nabídnout.
Uzavřený výčet je přesně to, co znamená contract-first: novou akci musí Task, který ji
zavádí, nejdřív přidat do kontraktu. Vymýšlet je dopředu (`ICS_TOKEN_REGENERATED`,
`BULK_RESERVATION_CREATED`, …) by byla spekulace: kdyby se jméno netrefilo, vznikne jen
churn. **Task 12, 13 a 30 výčet rozšíří, až budou vědět, co přesně zapisují.**

**UUID.** `plan.md` formát id neurčuje. Contract-first znamená, že rozhoduje kontrakt a
datový model ho následuje — ne naopak. UUID je zvolené proto, že id chodí v URL
(`/reservations/:id`) i v payloadech realtime eventů a nesmí prozrazovat počet záznamů ani
pořadí. **Task 9 (Prisma schéma) musí použít UUID, ne cuid ani autoinkrement.**

## Jak

- Výčet žije v `libs/contract/src/schemas/entities.ts` jako `AUDIT_LOG_ACTIONS` (tuple)
  a `auditLogActionSchema` (`z.enum`). Test na přesné složení seznamu je záměrný — donutí
  toho, kdo výčet rozšiřuje, změnu vidět.
- `idSchema` je jedno místo v `libs/contract/src/schemas/primitives.ts`; entity ho jen
  používají.
- `AuditLog.actorUserId` je podle `plan.md` povinný (ne nullable): i automatické povýšení
  z waitlistu spouští uživatel svým zrušením rezervace, takže actor vždy existuje.

## Riziko, když je to špatně

Rozšíření výčtu je jednořádková změna v kontraktu plus úprava testu — a TypeScript ukáže
všechna volající místa. Změna formátu id po Tasku 9 už levná není (migrace dat), proto je
rozhodnutí zapsané tady, a ne až v `doc/databaze.md`. Kdyby `actorUserId` u nějaké budoucí
čistě systémové akce (cron) actor chyběl, je řešením buď servisní uživatel v seedu, nebo
zúžit pole na nullable — obojí v Tasku 13.
