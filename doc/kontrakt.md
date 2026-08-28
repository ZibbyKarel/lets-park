# Kontrakt – struktura, pravidla, jak přidat schéma

`libs/contract` je **jediný zdroj pravdy** pro každý tvar dat, který přechází hranici
frontend ↔ backend. Žádný endpoint, DTO ani realtime event nesmí existovat v kódu dřív,
než existuje tady.

Tenhle dokument zakládá Task 3 (entity, primitiva, error kontrakt). Task 4 ho doplní
o oRPC procedury a Task 5 o realtime eventy.

---

## Dvě libs, ostrá dělba

| lib | tagy | čím je | co v ní **nesmí** být |
| --- | --- | --- | --- |
| `libs/shared-types` | `type:util`, `scope:shared` | doménové konstanty a čistá date-only logika pro `Europe/Prague` | Zod, next-intl, jakákoliv runtime závislost |
| `libs/contract` | `type:contract`, `scope:shared` | Zod schémata + (od Tasku 4) oRPC kontrakt | cokoliv z npm mimo `zod`, `@orpc/contract`, `tslib` |

Rozdělení není kosmetické. `libs/shared-types` importuje `apps/api` i `libs/i18n`, takže
nesmí táhnout Zod ani frontendové knihovny (viz `doc/decision/0003-*`). `libs/contract`
naopak nesmí sáhnout po transportu — proto má v ESLintu povolený jen `@orpc/contract`,
nikdy `@orpc/client` ani `@orpc/server` (viz `doc/decision/0007-*`).

Závislost jde jen jedním směrem: **`contract` → `shared-types`**, nikdy naopak.

---

## Struktura `libs/contract`

```
libs/contract/src/
  index.ts                  vstupní bod @lets-park/contract
  schemas/
    primitives.ts           idSchema, dateOnlySchema, yearMonthSchema, timestampSchema
    enums.ts                Zod obaly doménových výčtů ze shared-types
    entities.ts             User, ParkingSpot, Reservation, WaitlistEntry, AuditLog
    reservation-window.ts   ReservationWindowSettings, MonthWindowOverview
    errors.ts               ERROR_CODES, errorCodeSchema, errorShapeSchema
    index.ts                barrel
  api/                      (Task 4)  oRPC procedury
  realtime/                 (Task 5)  Zod payloady Socket.io eventů,
                                      vstupní bod @lets-park/contract/realtime
```

Schémata v `schemas/` sdílí obě větve (`api/` i `realtime/`) — proto nejsou v žádné z nich.

---

## Proč jsou typy odvozené

Každý typ vzniká z `z.infer`, nikdy se nepíše ručně vedle schématu:

```ts
export const reservationSchema = z.object({ /* ... */ });
export type Reservation = z.infer<typeof reservationSchema>;
```

Ručně psaný typ vedle schématu je duplicita, která se rozejde tiše: schéma se změní,
typ ne, TypeScript mlčí a chyba se objeví až v runtime na produkci. Odvozený typ se
rozejít nemůže.

Když schéma **transformuje** (typicky `.default()`), rozlišuj:

- `z.infer<T>` = `z.output<T>` – tvar **po** validaci, s doplněnými defaulty,
- `z.input<T>` – tvar **před** validací, kde jsou pole s defaultem nepovinná.

`reservationWindowSettingsSchema` exportuje obojí (`ReservationWindowSettings`,
`ReservationWindowSettingsInput`), protože admin formulář posílá vstupní tvar a service
vrstva pracuje s výstupním.

Výjimka, která žádnou výjimkou není: hodnoty výčtů (`PARKING_GROUPS`, `USER_ROLES`, …)
žijí v `libs/shared-types` jako `as const` tuple a kontrakt je jen obalí
(`z.enum(PARKING_GROUPS)`). Hodnoty jsou tedy pořád na jednom místě a typ v kontraktu
zůstává odvozený. Test v `enums.spec.ts` navíc typově ověřuje, že se obě strany nerozešly.

---

## Datumy a čas

| co | schéma | poznámka |
| --- | --- | --- |
| rezervační den | `dateOnlySchema` (`z.iso.date()`) | `YYYY-MM-DD`, `DATE` v Postgresu, nikdy timestamp |
| měsíc | `yearMonthSchema` | `YYYY-MM` |
| časové razítko | `timestampSchema` (`z.iso.datetime()`) | ISO řetězec v UTC, ne `Date` (`doc/decision/0015-*`) |

`dateOnlySchema` validuje **formát a kalendářní platnost** (`2023-02-29` i `2026-04-31`
neprojdou) — a **nic víc**. Konkrétně nevaliduje:

- že den není v minulosti,
- že den spadá do otevřeného rezervačního okna.

Obojí je **service-level** kontrola (Task 13), protože okno závisí na
`ReservationWindowSettings` čtených z databáze, což statické schéma vidět nemůže. Starý
horizont z `plan.md` („do konce následujícího měsíce") zrušilo
`doc/decision/0004-*`.

Výpočet stavu měsíce dělá čistá funkce `monthLockState()` / `isMonthOpen()` v
`libs/shared-types`. Je záměrně **jen popisná** — nic nevynucuje. Automatické povýšení
z waitlistu je systémová akce a zámek na ni neplatí, což funguje jen proto, že ji volající
prostě nezavolá.

---

## Error kontrakt

Backend nikdy nevrací ad-hoc tvar chyby. Všechno projde přes `errorShapeSchema`:

```ts
{ code: ErrorCode, message: string, details?: Record<string, unknown> }
```

`ERROR_CODES` je uzavřený výčet dvanácti kódů. Frontend větví na `code`; `message` je
detail pro logy a nečekané případy, česká UI copy se klíčuje podle kódu (`libs/i18n`).

Dva „okenní" kódy jsou rozlišené záměrně, protože uživateli říkají něco jiného:

| kód | stav cílového měsíce | co se stalo |
| --- | --- | --- |
| `OUT_OF_HORIZON` | `NOT_YET_OPEN` | rezervace na ten měsíc se teprve otevřou |
| `RESERVATIONS_LOCKED` | `LOCKED` | okno se už zavřelo (včetně každého měsíce, který začal) |

Oba vrací service vrstva na základě `monthLockState()`, nikdy schéma.

---

## Jak přidat nové schéma

1. **Zjisti, kam patří.** Sdílená entita → `schemas/entities.ts`. Nové primitivum
   (skalár používaný na víc místech) → `schemas/primitives.ts`. Nová hodnota výčtu →
   nejdřív tuple v `libs/shared-types/src/lib/domain-constants.ts`, teprve pak Zod obal
   v `schemas/enums.ts`.
2. **Stav na existujících kusech.** Nikdy neopisuj `z.uuid()` ani `z.iso.date()` — použij
   `idSchema`, `dateOnlySchema`, `timestampSchema`. Request tvary odvozuj z entity
   (`.pick()`, `.omit()`, `.partial()`), nepiš je znovu.
3. **Exportuj typ přes `z.infer`.** U schématu s `.default()` exportuj i `z.input`.
4. **Napiš test vedle** (`*.spec.ts` ve stejné složce): validní vstup, nevalidní vstup,
   hraniční hodnoty. U výčtu otestuj i přesné složení seznamu — ať je jeho rozšíření
   vidět v diffu.
5. **Reexportuj** ze `schemas/index.ts`, pokud jsi přidal soubor.
6. **Ověř**: `npm run lint && npm run typecheck && npm run test`.

Co se **nepřidává**: nový error kód bez záznamu v tomhle dokumentu, nová akce AuditLogu
bez rozšíření `AUDIT_LOG_ACTIONS`, a jakákoliv validace, která potřebuje data z databáze —
ta patří do service vrstvy.

---

## Co poskytuje `libs/shared-types`

Kontrakt na ni staví, ale používá ji i backend a `libs/i18n`.

| oblast | funkce |
| --- | --- |
| date-only | `isDateOnly`, `assertDateOnly`, `parseDateOnly`, `formatDateOnly`, `addDays`, `addMonths`, `differenceInDays`, `compareDateOnly`, `isBefore/isAfter/isSameDay`, `startOfMonth`, `endOfMonth`, `toYearMonth`, `startOfYearMonth`, `dayOfWeek`, `isWeekend`, `daysInMonth` |
| Europe/Prague | `PRAGUE_TIME_ZONE`, `todayInPrague`, `toDateOnlyInPrague`, `startOfDayInPrague`, `endOfDayExclusiveInPrague` |
| české svátky | `easterSunday`, `goodFriday`, `easterMonday`, `czechPublicHolidays`, `czechPublicHolidayOn`, `isCzechPublicHoliday`, `isBusinessDay` |
| výčty a defaulty | `PARKING_GROUPS`, `USER_ROLES`, `RESERVATION_LOCK_MODES`, `MONTH_LOCK_STATES`, `DEFAULT_OPEN_DAYS_BEFORE`, `MIN/MAX_OPEN_DAYS_BEFORE`, `DEFAULT_RESERVATION_LOCK_MODE` |
| rezervační okno | `isMonthOpen`, `monthLockState`, `reservationWindowRange` |

Aritmetika je kalendářní a časová zóna se řeší na jediné hranici — viz
`doc/decision/0013-*`. Pohyblivé svátky (Velký pátek, Velikonoční pondělí) se počítají
Meeus/Jones/Butcher algoritmem, ne z tabulky, takže nezastarají.

---

## Související rozhodnutí

- `doc/decision/0003-date-helpery-v-shared-types.md` – proč date logika není v `libs/i18n`
- `doc/decision/0004-rozsah-mvp-vcetne-funkci-z-designu.md` – rezervační okno, hromadná
  rezervace, preferované místo
- `doc/decision/0013-kalendarni-aritmetika-a-jedina-hranice-casove-zony.md`
- `doc/decision/0014-dateonly-je-nebrandovany-string.md`
- `doc/decision/0015-casova-razitka-v-kontraktu-jsou-iso-retezce.md`
- `doc/decision/0016-uzavrene-vycty-a-uuid-v-kontraktu.md`
