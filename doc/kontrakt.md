# Kontrakt – struktura, pravidla, jak přidat schéma

`libs/contract` je **jediný zdroj pravdy** pro každý tvar dat, který přechází hranici
frontend ↔ backend. Žádný endpoint, DTO ani realtime event nesmí existovat v kódu dřív,
než existuje tady.

Tenhle dokument zakládá Task 3 (entity, primitiva, error kontrakt), Task 4 doplnil oRPC
procedury a Task 5 realtime eventy.

---

## Dvě libs, ostrá dělba

| lib | tagy | čím je | co v ní **nesmí** být |
| --- | --- | --- | --- |
| `libs/shared-types` | `type:util`, `scope:shared`, `layer:foundation` | doménové konstanty a čistá date-only logika pro `Europe/Prague` | Zod, next-intl, jakákoliv runtime závislost |
| `libs/contract` | `type:contract`, `scope:shared` | Zod schémata + oRPC kontrakt + realtime eventy | cokoliv z npm mimo `zod`, `@orpc/contract`, `tslib` |

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
    errors.ts               ERROR_CODES, errorCodeSchema, errorDetailsSchema, errorShapeSchema
    index.ts                barrel
  api/                      oRPC procedury (Task 4)
    errors.ts               ERROR_DEFINITIONS, contractErrors(), builder `authed`
    overview.ts             přehled dne
    reservations.ts         create, cancel
    bulk.ts                 previewBulk, confirmBulk
    waitlist.ts             join, leave
    spots.ts, users.ts      správa míst a uživatelů
    me.ts                   profil, nastavení, regenerace ICS tokenu
    ics.ts                  konstanty a helper pro ICS URL (feed je mimo oRPC)
    reservation-window.ts   admin správa rezervačního okna
    router.ts               `contract` — celý router
    index.ts                barrel
  realtime/                 vstupní bod @lets-park/contract/realtime
    events.ts               payloady server → client eventů
    commands.ts             payloady client → server příkazů + ack na cell:lock
    event-maps.ts           registry schémat + ServerToClientEvents / ClientToServerEvents
    rooms.ts                roomForDate(), DAY_ROOM_PREFIX
    index.ts                barrel
  __fixtures__/             fixtures pro testy, mimo tsconfig.lib.json
```

Schémata v `schemas/` sdílí obě větve (`api/` i `realtime/`) — proto nejsou v žádné z nich.
Konkrétně tam kvůli tomu leží i dvě projekce, ne jen holé entity: `userSummarySchema`
(jak uživatel vypadá pro **jiného** uživatele) a `publicReservationSchema` (rezervace, jak ji
vidí celý den). Obě potřebuje přehled dne i realtime broadcast a `src/realtime` nesmí
importovat ze `src/api`.

`fixtures.ts` je schválně v `__fixtures__/`, který `tsconfig.lib.json` vylučuje — samo o sobě
nestačilo, že ho nikdo nereexportuje, protože pořád byl v překladovém programu knihovny.

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

Na oRPC se tenhle kontrakt mapuje 1:1 — `details` a oRPC `data` je totéž pole. Definice kódů
(HTTP status, defaultní zpráva) jsou v `api/errors.ts`, podrobnosti v
`doc/decision/0018-mapovani-error-kontraktu-na-orpc.md`.

---

## oRPC procedury

Router je jeden objekt `contract` v `api/router.ts`. **Seskupení je autorizační hranice:**
všechno pod `admin.` vyžaduje `role: 'ADMIN'`, všechno ostatní stačí aktivnímu uživateli.

`FORBIDDEN` deklaruje **každá** procedura — sedí na sdíleném builderu `authed`, protože
deaktivovaný uživatel (`active: false`, tak funguje offboarding) je odmítnutý dřív, než se
spustí handler. V tabulkách níž se proto neopakuje; `—` ve sloupci chyb znamená „nic nad rámec
`FORBIDDEN`".

**Vstupní schéma má každá procedura, i ta bez argumentů.** oRPC dovoluje `.input()` vynechat,
ale vynechané schéma znamená, že se omylem poslaný payload tiše zahodí. Čtyři procedury bez
argumentů (`overview` je nemá, jde o `spot.list`, `me.get`, `me.regenerateIcsToken`,
`admin.window.get`) proto deklarují sdílené `noInputSchema` z `api/errors.ts` — to bere
`undefined` (jak přijde volání přes RPC) i `{}` (jak přijde GET bez parametrů přes OpenAPI),
ale cokoliv s klíčem odmítne. V tabulkách je jejich vstup psaný jako `—`.

**Kdy nastane `VALIDATION_FAILED`.** Znamená „požadavek je strukturálně v pořádku, ale porušuje
doménové pravidlo, na které je potřeba sáhnout do databáze" — ne špatný formát, ten odchytí
schéma a vrací ho oRPC vlastní chybou. Každá procedura, která ho deklaruje, má konkrétní spouštěč:

| procedura | co ho vyvolá |
| --- | --- |
| `reservation.create`, `waitlist.join` | místo existuje, ale je deaktivované |
| `reservation.create`, `waitlist.join` | `date` není pracovní den (víkend nebo český státní svátek) |
| `reservation.previewBulk`, `reservation.confirmBulk` | totéž pro preferované místo uživatele |
| `me.updateSettings` | preferované místo je deaktivované |
| `admin.spot.create`, `admin.spot.update` | `group` mimo povolenou sadu skupin parkoviště |
| `admin.user.update` | změna role, kterou nelze provést (poslední admin) |
| `admin.window.update` | kombinace `openDaysBefore` a `lockMode`, kterou nelze uplatnit |

`waitlist.join` je v tabulce dvakrát schválně: obě pravidla se dají zjistit až z databáze
(deaktivované místo) nebo z kalendáře svátků, a schéma je odchytit neumí. Že `date` musí být
pracovní den, plyne z `canReserve` (viz níž) — jednodenní rezervace na sobotu nebo na 28. 9.
proto musí spadnout, a `VALIDATION_FAILED` je jediný deklarovaný kód, který na to sedí.
(Hromadná rezervace to řeší jinak: tam je nepracovní den per-day výsledek
`UNAVAILABLE` / `NOT_A_BUSINESS_DAY` uvnitř úspěšné odpovědi, ne chyba celé dávky.)

`admin.window.months` `VALIDATION_FAILED` **nedeklaruje**. Rozsah `from`–`to` je celý hlídaný
strukturálně: `from <= to` refinementem a délka rozsahu proti `MAX_MONTH_WINDOW_SPAN`
(`libs/shared-types`), stejně jako `MAX_BULK_BOOKING_DAYS` u hromadné rezervace. Klient tak
limit zná ze schématu a nemusí ho objevovat odmítnutím.

`overview.day` ho **nedeklaruje** — je to čtení a žádné doménové pravidlo tam strukturálně
platné datum porušit nemůže (den mimo všechna okna se vrátí s `canReserve: false`, ne chybou).
Deklarovat kód, který procedura nikdy nevrátí, je podle `doc/decision/0018-*` stejná chyba jako
vrátit nedeklarovaný.

### Přehled dne

| procedura | vstup | výstup | další chyby |
| --- | --- | --- | --- |
| `overview.day` | `{ date }` | `{ date, window, canReserve, spots[], viewerReservationId }` | — |

Jedním dotazem všechno, co potřebuje obrazovka parkoviště: každé aktivní místo, kdo ho drží,
kolik lidí je za ním ve frontě, kde stojí volající — **a stav rezervačního okna pro ten den**.
Okno jede s odpovědí schválně, aby FE nemusel dělat druhý dotaz a nemohl vykreslit mřížku dne
proti zastaralému oknu.

Dvě pole, která se nesmí plést:

- `window` — `MonthWindowOverview` měsíce, do kterého `date` spadá. Pravdu nese `state`;
  `lockMode !== 'AUTO'` znamená, že stav **přepsal admin** a `windowFrom`/`windowTo` jsou jen
  hypotetické (co by udělalo automatické pravidlo).
- `canReserve` — jestli **tenhle** uživatel smí **tenhle** den rezervovat. Už v sobě má okno,
  výjimku pro admina, minulost i pracovní den. **FE si to nesmí dopočítávat z `window`** —
  admin oknem omezený není a to je fakt, který žije na backendu.

Read-only: zamčený ani neotevřený den se nevyhazuje jako chyba, jen se ohlásí ve `window`.

Uživatelé jiných lidí jdou ven jako `userSummarySchema` — `pick` tří polí (`id`, `name`,
`licensePlate`). `email`, `oktaId` a hlavně `icsToken` se do cizího prohlížeče nikdy nedostanou.

### Rezervace

| procedura | vstup | výstup | další chyby |
| --- | --- | --- | --- |
| `reservation.create` | `{ parkingSpotId, date }` | `Reservation` | `NOT_FOUND`, `SPOT_ALREADY_RESERVED`, `RESERVATION_LIMIT_REACHED`, `PAST_DATE`, `OUT_OF_HORIZON`, `RESERVATIONS_LOCKED`, `VALIDATION_FAILED`, `CONFLICT` |
| `reservation.cancel` | `{ reservationId }` | `{ reservationId, date, parkingSpotId, promoted }` | `NOT_FOUND`, `CONFLICT` |

`reservation.cancel` **záměrně nedeklaruje žádnou okenní chybu.** Podle `doc/decision/0004-*`
smí běžný uživatel zrušit svoji rezervaci kdykoliv, i v zamčeném měsíci — zámek brání v braní
míst, ne v jejich vracení. Cizí rezervaci pokrývá `FORBIDDEN`; admin smí zrušit jakoukoliv.

`promoted: true` znamená, že uvolněné místo rovnou dostal první ve frontě. Automatické povýšení
je systémová akce a zámek na ni neplatí, takže může nastat i v zamčeném měsíci.

`SPOT_ALREADY_RESERVED` je poctivá odpověď na obsazené místo; `CONFLICT` je užší případ prohraného
závodu mezi kontrolou a insertem, který unique constraint na (místo, den) změní v chybu místo
dvojité rezervace.

### Waitlist

| procedura | vstup | výstup | další chyby |
| --- | --- | --- | --- |
| `waitlist.join` | `{ parkingSpotId, date }` | `{ entry, position }` | `NOT_FOUND`, `ALREADY_IN_WAITLIST`, `CANNOT_WAITLIST_OWN_SPOT`, `SPOT_NOT_OCCUPIED`, `RESERVATION_LIMIT_REACHED`, `PAST_DATE`, `OUT_OF_HORIZON`, `RESERVATIONS_LOCKED`, `VALIDATION_FAILED`, `CONFLICT` |
| `waitlist.leave` | `{ waitlistEntryId }` | `{ waitlistEntryId, parkingSpotId, date }` | `NOT_FOUND`, `OUT_OF_HORIZON`, `RESERVATIONS_LOCKED`, `CONFLICT` |

Obě jsou zápisy, takže obě jsou zamčeným oknem blokované — `doc/decision/0004-*` jmenuje
„odejít z fronty" výslovně, protože odchod přerovnává všechny za tebou.

`RESERVATION_LIMIT_REACHED` u `join` není překlep: povýšení by uživateli dalo druhou rezervaci
na den, kde už jednu má, takže ho fronta odmítne rovnou, místo aby ho nikdy nepovýšila.

`OUT_OF_HORIZON` u `leave` vypadá nedosažitelně (do neotevřeného měsíce se nedalo přihlásit),
ale dosažitelné je: admin sníží `openDaysBefore` a měsíc se vrátí do `NOT_YET_OPEN`, zatímco
záznamy v něm už existují.

Povýšení z fronty **není procedura** — děje se na backendu při zrušení a hlásí se realtime
eventem (Task 5).

### Hromadná rezervace

| procedura | vstup | výstup | další chyby |
| --- | --- | --- | --- |
| `reservation.previewBulk` | `{ dates[] }` | `{ month, preferredParkingSpotId, days[], summary }` | `PAST_DATE`, `OUT_OF_HORIZON`, `RESERVATIONS_LOCKED`, `VALIDATION_FAILED` |
| `reservation.confirmBulk` | `{ dates[] }` (tentýž) | totéž + id zapsaných řádků | navíc `CONFLICT` |

`previewBulk` **nic nezapisuje** — žádnou rezervaci, žádnou frontu, žádný audit. Okenní chyby
deklaruje stejně jako `confirmBulk`: navrhnout rozvrh na měsíc, který uživatel nesmí rezervovat,
znamená ukázat mu plán, který nikdy nepotvrdí.

Den je diskriminovaná unie na `outcome`:

| outcome | nese |
| --- | --- |
| `SPOT_ASSIGNED` | `parkingSpotId`, `parkingSpotLabel`, `isPreferredSpot` |
| `QUEUED` | `parkingSpotId`, `parkingSpotLabel`, `waitlistPosition` |
| `UNAVAILABLE` | `reason` (`ALREADY_HAS_RESERVATION` / `NOT_A_BUSINESS_DAY` / `NO_SPOTS_AVAILABLE`) |

Ve výsledku z `confirmBulk` má `SPOT_ASSIGNED` navíc `reservationId` a `QUEUED` navíc
`waitlistEntryId` — každá varianta výsledku je nadmnožinou téže varianty návrhu.

**Rozdíl mezi návrhem a skutečností počítá klient** spárováním obou polí podle `date`; server
návrh nezná a znát nemá. Proč, a proč vstup zůstává jen seznamem dnů, je v
`doc/decision/0019-navrh-a-potvrzeni-hromadne-rezervace.md`.

Vstup validuje **jen strukturu**: neprázdný, max `MAX_BULK_BOOKING_DAYS` (31), bez duplicit,
všechny dny v jednom měsíci. Víkendy, svátky ani minulost ne — to je den-eligibilita a patří
do service vrstvy, stejně jako okno (ruling window-2).

### Místa

| procedura | vstup | výstup | další chyby |
| --- | --- | --- | --- |
| `spot.list` | — | `{ spots[] }` | — |
| `admin.spot.list` | `{ includeInactive = false, group? }` | `{ spots[] }` | — |
| `admin.spot.create` | `{ label, group }` | `ParkingSpot` | `CONFLICT`, `VALIDATION_FAILED` |
| `admin.spot.update` | `{ id, label?, group?, active? }` | `ParkingSpot` | `NOT_FOUND`, `CONFLICT`, `VALIDATION_FAILED` |
| `admin.spot.deactivate` | `{ id }` | `ParkingSpot` | `NOT_FOUND`, `CONFLICT` |

`spot.list` existuje i pro běžného uživatele, protože nastavení potřebuje picker pro
`preferredParkingSpotId`. Vrací jen aktivní místa a nebere filtry.

`CONFLICT` u `create`/`update` je duplicitní `label` (unikátní v celém parkovišti), u
`deactivate` místo, které má budoucí rezervace — admin je musí vyřešit dřív, než ho stáhne.
Deaktivace je vždycky soft delete; řádek se nemaže kvůli cizím klíčům z rezervací a auditu.

### Uživatelé

| procedura | vstup | výstup | další chyby |
| --- | --- | --- | --- |
| `admin.user.list` | `{ role?, active?, search? }` | `{ users[] }` | — |
| `admin.user.update` | `{ id, role?, active? }` | `AdminUser` | `NOT_FOUND`, `CONFLICT`, `VALIDATION_FAILED` |

Uživatelé se přes API **nezakládají** (provisioning z Okta tokenu při prvním přihlášení) ani
nemažou (offboarding = `active: false`).

`adminUserSchema` je `userSchema.omit({ icsToken: true })` — token je jediné tajemství na entitě
a admin nemá důvod držet cizí. `omit` je zvolený schválně: nové pole na entitě se v adminu
objeví samo, což je u administrativního pohledu bezpečnější směr než `pick`.

Admin smí měnit jen roli a aktivitu; jméno, e-mail a SPZ patří uživateli. `CONFLICT` hlídá dva
způsoby, jak si systém zamknout: degradovat/deaktivovat posledního aktivního admina a
deaktivovat sám sebe.

### Nastavení uživatele

| procedura | vstup | výstup | další chyby |
| --- | --- | --- | --- |
| `me.get` | — | `User` (vlastní, včetně `icsToken`) | — |
| `me.updateSettings` | `{ licensePlate?, preferredParkingSpotId? }` | `User` | `NOT_FOUND`, `VALIDATION_FAILED` |
| `me.regenerateIcsToken` | — | `{ icsToken }` | — |

`me.get` vrací `icsToken`, protože je to token volajícího a obrazovka nastavení z něj skládá
adresu feedu.

`me.updateSettings` je částečná změna se **třemi** stavy na pole:

| hodnota | význam |
| --- | --- |
| pole chybí | neměnit |
| `null` | vymazat (žádná SPZ / žádné preferované místo) |
| hodnota | nastavit |

Obě pole jsou na entitě nullable, takže „vymazat" musí jít vyjádřit; samotné `.partial()` by to
od „neměnit" nerozeznalo. `NOT_FOUND` je neexistující preferované místo, `VALIDATION_FAILED`
míření na deaktivované.

`preferredParkingSpotId` se používá **výhradně** jako první volba při hromadné rezervaci; na
běžnou jednodenní rezervaci nemá vliv (`doc/decision/0004-*`).

### ICS feed

Feed samotný je **mimo oRPC** — `plan.md` §Contract-first ho jmenuje jako jedinou výjimku.
Kalendářní klienti (Outlook, Google) stahují prostou URL a nejde je naučit posílat hlavičky,
takže feed nemůže jet po RPC transportu ani po session cookie. Je to obyčejný `GET`
autentizovaný neuhodnutelným tokenem v cestě.

Kontrakt proto nevlastní endpoint, ale **tvar URL**, aby se `apps/api` (které ho servíruje)
a `apps/web` (které ho zobrazuje) nemohly rozejít:

```ts
ICS_FEED_BASE_PATH        // '/api/calendar'   (včetně globálního prefixu apps/api)
ICS_FEED_FILE_EXTENSION   // '.ics'
buildIcsFeedPath(token)   // '/api/calendar/<token>.ics'
buildIcsFeedUrl(base, token)  // 'https://host/api/calendar/<token>.ics'
```

`buildIcsFeedUrl` ořízne koncová lomítka v `base` a token percent-enkóduje. Prázdný token nebo
prázdné `base` vyhodí — jinak by vznikla URL mířící na kolekci místo na uživatele.

`me.regenerateIcsToken` vrací **jen token**, ne URL: kontrakt neví, na jakém originu je nasazení
dostupné, a nemá to hádat. URL složí klient helperem. Regenerace okamžitě zneplatní starou
adresu, takže UI musí uživateli říct, že si musí předplatné v kalendáři vyměnit.

Procedura **nedeklaruje `CONFLICT`**. Jediná představitelná kolize je unique constraint na
čerstvě vygenerovaném náhodném tokenu, což není stav, se kterým by klient uměl něco udělat —
je to pokyn k opakování. **Task 12 proto musí generovat v retry smyčce uvnitř handleru**, ne
posílat ven chybu, na kterou UI nemá copy. Zdůvodnění: `doc/decision/0021-*`.

### Rezervační okno (admin)

| procedura | vstup | výstup | další chyby |
| --- | --- | --- | --- |
| `admin.window.get` | — | `ReservationWindowSettings` | — |
| `admin.window.update` | `{ openDaysBefore?, lockMode? }` | `ReservationWindowSettings` | `VALIDATION_FAILED`, `CONFLICT` |
| `admin.window.months` | `{ from, to }` (`YYYY-MM`) | `{ months[], settings }` | — |

`admin.window.update` je **náhrada, ne patch**: vstupem je přímo `reservationWindowSettingsSchema`,
takže vynechané pole spadne na svůj **default** (`openDaysBefore: 7`, `lockMode: 'AUTO'`), ne na
aktuálně uloženou hodnotu. Pole jsou dvě, admin formulář vždy vykreslí obě — „PUT nahrazuje
zdroj" se čte líp než patch, jehož výsledek závisí na neviditelném stavu. **Posílej obě.**

`admin.window.months` vrací měsíce vzestupně a k nim nastavení, pod kterým byly stavy odvozené,
aby admin záložka vykreslila tabulku i formulář z jedné odpovědi. `from <= to` se kontroluje ve
schématu — `YYYY-MM` se řadí lexikograficky, takže na to není potřeba datumová aritmetika.
Délka rozsahu je omezená `MAX_MONTH_WINDOW_SPAN` (24 měsíců) taky ve schématu, takže procedura
nedeklaruje `VALIDATION_FAILED` — nezbylo jí doménové pravidlo, které by strukturálně platný
vstup mohl porušit.

Běžný uživatel žádnou z těchhle procedur nevolá; stav okna pro konkrétní den dostane
v `overview.day`.

---

## Realtime (`@lets-park/contract/realtime`)

Socket.io půlka kontraktu má **vlastní vstupní bod**. Není to kosmetika: `@lets-park/contract`
táhne `@orpc/contract`, a na realtime cestě nemá RPC builder co dělat — ani v prohlížečovém
bundlu, který jen otevírá socket, ani v gateway. Pravidla:

- **Nic pod `src/realtime` neimportuje ze `src/api`.** Obě větve berou sdílená schémata ze
  `src/schemas`; proto tam leží i `userSummarySchema` a `publicReservationSchema`.
- **Kořenový `src/index.ts` realtime nereexportuje.** Jeden barrel by tu izolaci zrušil
  jedním řádkem.
- Důkaz je `src/realtime/no-orpc.spec.ts`: prochází **skutečný modulový graf** od
  `realtime/index.ts` a padá na jakémkoliv `@orpc/*` i na jakémkoliv souboru z `api/`.
  ESLint by to neuhlídal — `@orpc/contract` je pro tuhle lib povolený a `@orpc/client` je
  v repu nainstalovaný. Test má vlastní kontrolu: stejný walker musí v `api/index.ts`
  `@orpc/contract` **najít**, jinak by prošel jen proto, že nehledá.

### Roomy

Jeden room na jeden den, `day:YYYY-MM-DD`, přes `roomForDate(date)`. Všechno, co obrazovka
parkoviště kreslí, je vázané na jeden den; room na místo by násobil joiny velikostí parkoviště
a jeden globální room by posílal provoz všech dnů všem. Jméno se **odvozuje, nikde se neukládá**,
takže se server a klient nemůžou rozejít. `roomForDate` je čistá funkce a na nevalidním datu
**vyhazuje** — room je cíl broadcastu, ne řetězec, který se dá vzít na slovo.

### Server → client eventy

Všechny se posílají **až po commitu** transakce (Task 15) a jdou do celého day roomu.

| event | payload | kdy |
| --- | --- | --- |
| `cell:locked` | `{ date, parkingSpotId, lockedBy, expiresAt }` | někdo začal upravovat buňku; UI kreslí „právě upravuje …" |
| `cell:unlocked` | `{ date, parkingSpotId }` | zámek uvolněn, vypršel nebo spadl se socketem |
| `reservation:created` | `{ date, parkingSpotId, reservation }` | volné místo je nově obsazené |
| `reservation:cancelled` | `{ date, parkingSpotId, reservationId }` | místo je volné a **zůstává** volné |
| `reservation:reassigned` | `{ date, parkingSpotId, cause, previousReservationId, reservation, fromWaitlistEntryId }` | místo změnilo držitele uvnitř jedné transakce |
| `waitlist:updated` | `{ date, parkingSpotId, waitlistCount }` | fronta u buňky se prodloužila nebo zkrátila |

**Jména.** `<předmět>:<příčestí minulé>`, dvojtečka, malá písmena, předmět v jednotném čísle.
Minulý čas je informace: event oznamuje něco, co už se stalo a je zacommitované. Příkazy
opačným směrem jsou v rozkazovacím způsobu (`cell:lock`), takže směr se pozná z názvu.
`cell` je jediný nedoménový předmět a je záměrný — zámek drží dvojici (`parkingSpotId`, `date`),
tedy jednu **buňku** mřížky den × místo, a `spot:locked` by se četlo jako „tohle místo je
zamčené každý den", což je něco jiného a neexistujícího. `plan.md` i zadání Tasku 24 už tomu
říkají „cell-lock".

> **`cell:locked` nemá nic společného s `MonthLockState.LOCKED`.** To je zavřené rezervační okno
> celého měsíce; tohle je jeden uživatel editující jednu buňku po dobu ~30 s. Žádný payload
> výše nenese stav okna a **stav okna se nikdy nebroadcastuje** — viz „Co se nebroadcastuje".

**Jedna transakce = jeden event.** Zrušení, po kterém se rovnou povýšil první z fronty, pošle
`reservation:reassigned` **místo** `reservation:cancelled`, nikdy oba. Dvojice cancel + create
by u všech klientů buňku nejdřív probliknula prázdnou.

**`reservation:reassigned` je vlastní event schválně** (ruling `window-1`): automatické povýšení
je systémová akce a zámek okna na ni neplatí, takže `reservation:created` v zamčeném měsíci by
vypadal jako porušení okna. Že to nebyla akce uživatele, říká jméno; **která** systémová akce to
byla, říká `cause` (`RESERVATION_REASSIGN_CAUSES` v `shared-types`, dnes jediná hodnota
`WAITLIST_PROMOTION` — viz `doc/decision/0022-*`).

### Client → server příkazy

| příkaz | payload | ack |
| --- | --- | --- |
| `day:subscribe` | `{ date }` | — |
| `day:unsubscribe` | `{ date }` | — |
| `cell:lock` | `{ date, parkingSpotId }` | `{ result: 'ACQUIRED', expiresAt }` nebo `{ result: 'HELD_BY_OTHER', lockedBy, expiresAt }` |
| `cell:unlock` | `{ date, parkingSpotId }` | — |

**Server vždy validuje příchozí client→server eventy.** Gateway (Task 15) najde jméno eventu
v `CLIENT_TO_SERVER_EVENT_SCHEMAS`, payload prožene `safeParse` a **teprve pak** pustí handler;
neplatný payload se zahodí a jméno, které v registru není, se neobsluhuje vůbec. Aby to bylo
pravidlo a ne přání, platí tři věci:

1. Registr schémat je zároveň to, z čeho je odvozený typ `ClientToServerEvents` — příkaz bez
   schématu se nedá deklarovat.
2. Žádné schéma nepoužívá `z.any()`, `z.unknown()`, `z.record()` ani passthrough. Vstupní
   payloady jsou navíc `strictObject`: neznámý klíč se **odmítá**, ne tiše zahazuje.
   (Odchozí eventy zůstávají mírné — klient musí snést server nasazený napřed, server takovou
   povinnost vůči klientovi nemá.)
3. Povrch je co nejmenší. Čtyři příkazy, dva tvary payloadu, **nic doménového**: rezervaci přes
   socket založit ani zrušit nejde. Socket veze odběry a editační zámek, mutace jdou přes API,
   kde je autorizace a kontrola okna.

**Heartbeat není samostatný příkaz.** Znovu poslaný `cell:lock` na buňku, kterou volající už
drží, TTL **prodlouží** — je to idempotentní, o jeden příkaz na vstupu míň, a klient, který
ztratil přehled o svém stavu, nemůže rozbít stav serveru.

Zámek je **rezervace úmyslu, ne rezervace místa.** Nic nezabookuje; rezervace pořád vzniká přes
API, které si všechno ověří znovu. Klient, který zámek přeskočí, dostane z `reservation.create`
`CONFLICT` místo hezčí hlášky — zámek je laskavost vůči druhému uživateli, ne autorizační krok.

### Co se nebroadcastuje

- **Nic, co je relativní k divákovi.** Event jde celému roomu, takže v něm nemůže být
  `viewerWaitlistPosition` ani nic podobného. Klient, kterému se mohlo změnit vlastní pořadí ve
  frontě, si den načte znovu.
- **Nic tajného.** Cizí uživatel jde ven výhradně jako `userSummarySchema` (`id`, `name`,
  `licensePlate`); `email`, `oktaId` a `icsToken` se do roomu nedostanou.
- **Kdo stojí ve frontě.** `waitlist:updated` veze jen počet, protože přesně tolik se
  o frontě dozví cizí člověk i z `overview.day`.
- **Stav rezervačního okna.** Změna `admin.window.update` se realtime nešíří; banner se
  srovná při příštím `overview.day`. Je to vědomá mezera: event, který by nikdo neemitoval, je
  stejná chyba jako nedeklarovaný kód (`doc/decision/0021-*`), a Task 15 broadcast okna nemá
  v zadání. Až se ukáže, že vteřiny zastaralého banneru vadí, přidá se `window:updated`
  **nejdřív do kontraktu**.

### Jak přidat event

1. Payload jako Zod schéma do `realtime/events.ts` (ven) nebo `realtime/commands.ts` (dovnitř).
   Odvozuj ze `schemas/` — `cellRefSchema` už nese dvojici (`date`, `parkingSpotId`).
2. Zaregistruj ho v `realtime/event-maps.ts`. Tím zároveň vznikne položka
   v `ServerToClientEvents` / `ClientToServerEvents`; ty se nepíšou ručně, jsou to mapované typy
   nad registrem.
3. Doplň očekávaný seznam v `realtime/event-maps.spec.ts` a napiš test payloadu.
4. Popiš ho v tabulce výš.

---

## Jak přidat proceduru

1. **Schémata vstupu a výstupu** jako pojmenované konstanty (`fooInputSchema`,
   `fooOutputSchema`) v souboru podle domény v `api/`. Odvozuj z entit (`.pick()`, `.omit()`,
   `.partial()`), nikdy neopisuj. Typ přes `z.infer`.
2. **Proceduru** postav na builderu `authed` (nese `FORBIDDEN`), přidej `.input()`, `.output()`
   a `.errors(contractErrors(...))`. **Procedura bez deklarovaných chyb je skoro jistě špatně** —
   a stejně tak procedura, která deklaruje kód, pro který neumíš pojmenovat spouštěč.
   `.input()` se **nevynechává**: procedura bez argumentů dostane `noInputSchema`.
3. **Zapoj ji do `router.ts`** — pod `admin.`, jestli vyžaduje roli.
4. **Test vedle** (`*.spec.ts`): platný vstup, neplatný vstup, a co má výstup zaručit.
5. **Doplň `EXPECTED_PROCEDURES` a `EXPECTED_ERROR_CODES` v `api/router.spec.ts`.** Ty dva
   seznamy jsou úmyslně ruční — každá změna povrchu API je pak vidět v diffu.
6. **Popiš ji tady**, v tabulce příslušné sekce.

Co se **nepřidává**: procedura vracející ad-hoc tvar chyby, validace potřebující data z databáze
(patří do service vrstvy) a jakýkoliv import z `@orpc/client` nebo `@orpc/server` — kontrakt
nesmí sáhnout na transport a ESLint to vynucuje.

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
| hromadná rezervace | `BULK_DAY_OUTCOMES`, `BULK_UNAVAILABLE_REASONS`, `MAX_BULK_BOOKING_DAYS` |
| rezervační okno | `isMonthOpen`, `monthLockState`, `reservationWindowRange`, `MAX_MONTH_WINDOW_SPAN` |
| realtime | `RESERVATION_REASSIGN_CAUSES`, `CELL_LOCK_RESULTS` |

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
- `doc/decision/0016-uzavrene-vycty-a-uuid-v-kontraktu.md` – proč je verze UUID nevázaná
- `doc/decision/0018-mapovani-error-kontraktu-na-orpc.md` – `details` = oRPC `data`, statusy
- `doc/decision/0019-navrh-a-potvrzeni-hromadne-rezervace.md` – proč rozdíl počítá klient
- `doc/decision/0020-orpc-je-esm-only-jest-ho-musi-transpilovat.md` – nutná Jest konfigurace
- `doc/decision/0021-deklarovana-chyba-musi-mit-dosazitelny-spoustec.md` – proč se kód bez
  spouštěče odstraňuje a limit patří do schématu
- `doc/decision/0022-nazvy-realtime-eventu-a-jedna-transakce-jeden-event.md`
- `doc/decision/0023-realtime-je-samostatny-vstupni-bod-a-mapy-se-odvozuji.md`
