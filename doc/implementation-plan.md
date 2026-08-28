# Implementační plán – Let's Park

Rozpad `plan.md` (závazná specifikace) na úkoly pro subagenty. **`plan.md` je autorita** –
tento dokument je jen jeho rozpad do dispatchovatelných kusů. Při rozporu vyhrává `plan.md`.

- Vizuální zdroj pravdy: `doc/design/` (viz `doc/design/README.md`)
- Rozhodnutí: `doc/decision/`
- Dokumentace k jednotlivým oblastem: `doc/<oblast>.md`

> **Dvě rozhodnutí uživatele mění `plan.md` a platí pro celý projekt:**
> `doc/decision/0004-rozsah-mvp-vcetne-funkci-z-designu.md` (rezervační okno se zámkem,
> hromadná rezervace a preferované místo **patří do MVP**; v konfliktu s `plan.md` vyhrává
> design) a `doc/decision/0005-npm-scope-lets-park.md` (scope je `@lets-park/*`; kdekoliv
> `plan.md` píše `@myorg/…`, čti `@lets-park/…`). Přečti obě, než začneš.

### Pořadí provádění

Task čísla nejsou pořadí. Skutečné pořadí a paralelní větve:

| Vlna | Větev A (hlavní strom) | Větev B (worktree) |
| --- | --- | --- |
| 1 | 1 → 2 | – |
| 2 | 3 → 4 → 5 | 6 → 7 → 8 |
| 3 | 9 → 10 → 11 → 12 → 13 → **30** → 14 → 15 → 16 | 17 → 18 → 19 → 20 → 21 → 22 |
| 4 | 23 → 24 → **31** → 25 → 26 → 27 | – |
| 5 | 28 → 29 | – |

## Global Constraints

Platí pro **každý** úkol; reviewer je dostává v každém dispatchi.

1. **Contract-first.** Žádný endpoint, DTO ani realtime event nesmí existovat v kódu dřív,
   než existuje v `libs/contract`. Zod schémata jsou jediný zdroj pravdy; TS typy vždy
   `z.infer<...>`, nikdy ručně duplikované na FE i BE.
2. **Zod v4 only.** `class-validator` / `class-transformer` se v NestJS nepoužívají.
3. **Typované chyby.** Jednotný error shape (`code`, `message`, volitelně `details`)
   a uzavřený výčet doménových kódů. Backend nikdy nevrací ad-hoc tvar chyby.
4. **Date-only sémantika.** Rezervační den je `z.iso.date()` (`YYYY-MM-DD`) v kontraktu
   a `DATE` v Postgresu. Nikdy timestamp. „Dnešek" a hranice dne vždy v `Europe/Prague`,
   jediná implementace v `libs/shared-types` (viz `doc/decision/0003-*`).
5. **Design-system-first.** tokens → primitives → compounds → doménová kompozice (jen
   v `apps/web`). Design systém je domain-free: žádné „ParkingSpot"/„Reservation"
   v `libs/design-system/*`. Compounds smí importovat primitives, nikdy naopak.
   Ručně psané hodnoty barev/spacingu mimo tokeny jsou zakázané.
6. **Wrapper vrstvy jsou povinné.** Aplikační/feature kód nikdy neimportuje přímo:
   `react-hook-form` (→ `libs/form`), `@tanstack/react-table` (→ `libs/design-system/compounds`),
   `@tanstack/react-query` (→ `libs/query`), `@orpc/client` (→ `libs/api-client`),
   `socket.io-client` (→ `libs/realtime-client`), `next-auth` (→ `libs/auth`),
   `ical-generator` (→ `libs/calendar-export`), `next-intl` (→ `libs/i18n`).
   Vynuceno ESLintem (Nx `enforce-module-boundaries` + `no-restricted-imports`).
7. **Provozní základ patří do MVP** (není to „monitoring"): fail-fast Zod validace env,
   `nestjs-pino` (žádný `console.log`), `@nestjs/terminus` health endpointy, graceful
   shutdown, helmet + CORS allow-list + `@nestjs/throttler`, globální exception filter,
   secrets jen z env.
8. **Co NEDĚLAT:** Sentry / metriky / APM / alerting; Slack slash commands ani interaktivní
   Block Kit (jen odchozí `chat.postMessage`); Redis / BullMQ / message brokery (jen
   abstrakce + zdokumentovaná upgrade cesta); testovací backdoory v auth (dev i e2e jde
   přes `mock-oauth2-server` stejným kódem jako produkce).
9. **Verze jsou závazné:** Nx 23, Next.js 16 (App Router, React 19), NestJS 11, Prisma 7
   (`prisma-client` generator, `@prisma/adapter-pg`, `prisma.config.ts`), Tailwind CSS v4
   (CSS-first), Storybook 10, TanStack Query v5, Socket.io v4, oRPC + Zod v4,
   next-auth v5, PostgreSQL 17. Minor verze ověř při instalaci; majory neměň.
10. **Nepiš API těchto knihoven z hlavy.** oRPC ↔ NestJS, Prisma 7, Tailwind v4 CSS-first
    a Auth.js v5 jsou čerstvé – ověř aktuální API přes context7 / oficiální dokumentaci
    (skilly `prisma:*`, `zod:use-zod`, `tanstack-query`, `tanstack-table` jsou k dispozici).
11. **Testy píšeš souběžně** s kódem dané fáze, ne zpětně. Výstup testů musí být čistý
    (žádné varování a šum).
12. **Jazyk:** kód, identifikátory a komentáře anglicky; UI copy a `doc/` česky.
13. **Dokumentace je součást úkolu.** Každý úkol dopíše/aktualizuje svůj `doc/*.md`.
    Každé netriviální rozhodnutí → nový soubor v `doc/decision/` ve formátu
    „co / proč / jak / riziko" (viz existující).

---

## Task 1 — Nx 23 workspace, aplikace, lint, formát, skripty

**Fáze 0, body 1 a 4.** Hlavní strom, žádná paralelní větev.

Vytvoř Nx 23 monorepo **v existujícím repozitáři** (`/Users/zibar/Workspace/lets-park`,
větev `feat/lets-park-mvp`). Repozitář už obsahuje `plan.md` (gitignorovaný),
`CLAUDE.md`, `README.md`, `doc/` – nic z toho nesmíš smazat ani přepsat.

1. Inicializace Nx 23 workspace s npm jako package managerem, `nx.json` s cache
   a `targetDefaults` pro `build`, `lint`, `test`.
2. `apps/web` – Next.js 16 aplikace (App Router, React 19, TypeScript).
3. `apps/api` – NestJS 11 aplikace.
4. `apps/web-e2e` – Playwright projekt (zatím jen scaffolding + jeden smoke test, který
   projde bez běžícího stacku nebo je označen jako skipped s komentářem proč).
5. `apps/api-e2e` – projekt pro Jest integrační testy proti reálné Postgres (zatím jen
   scaffolding + config; testy přijdou v Tasku 13).
6. TypeScript **strict** napříč workspace (`strict: true`, `noUncheckedIndexedAccess`,
   `noImplicitOverride`, `exactOptionalPropertyTypes` pokud nekoliduje s Nx generátory —
   pokud koliduje, zapni jen ty, co projdou, a rozdíl zdůvodni v reportu).
7. ESLint flat config s:
   - Nx `@nx/enforce-module-boundaries` a **tagy** připravenými pro cílovou strukturu:
     `type:app`, `type:feature`, `type:ui`, `type:util`, `type:contract`, `type:data`
     a scope tagy `scope:web`, `scope:api`, `scope:shared`.
     Pravidla: `type:app` smí na cokoliv; `type:ui` (design systém) nesmí na `type:feature`
     ani `type:app`; `libs/design-system/primitives` nesmí importovat
     `libs/design-system/compounds`; `type:contract` nesmí importovat nic kromě `zod`
     a `type:util`.
   - `no-restricted-imports` zakazující v `apps/**` a ve feature kódu přímé importy:
     `react-hook-form`, `@tanstack/react-table`, `@tanstack/react-query`, `@orpc/client`,
     `socket.io-client`, `next-auth`, `ical-generator`, `next-intl`
     (s výjimkou příslušné wrapper lib, která je importovat smí).
     Chybová hláška musí říct, kterou wrapper lib má vývojář použít.
   - Zákaz `console.log` v `apps/api/**` a `libs/**` (povol `console` jen v skriptech).
8. Prettier + `.editorconfig`, jednotný formát pro TS/TSX/JSON/MD.
9. Skripty v `package.json`: `lint`, `test`, `build`, `typecheck`,
   `affected` (`nx affected -t lint,test,build`), `format`, `format:check`.
   Připraveno pro CI, ale **žádný pipeline soubor nevytvářej**.
10. Dokumentace: `doc/workspace.md` – struktura repa, jak spustit lint/test/build,
    co znamenají Nx tagy a jak se přidává nová lib se správnými tagy.

**Ověření (musí projít a doložit v reportu):** `npm run lint`, `npm run typecheck`,
`npm run build` na čistém workspace, plus ukázka, že ESLint skutečně odmítne
zakázaný import (přidej dočasný soubor, ukaž chybu, soubor smaž).

**Rozsah – co NEdělat:** žádné doménové libs, žádný Docker (Task 2), žádné Prisma,
žádný Tailwind config nad rámec toho, co Nx generátor pro Next vytvoří.

---

## Task 2 — Validace env (Zod), `.env.example`, Docker Compose skeleton

**Fáze 0, body 2 a 3.** Navazuje na Task 1 (hlavní strom).

1. `apps/api/src/env.ts` a `apps/web/src/env.ts` – Zod v4 schéma env proměnných,
   fail-fast při startu se **srozumitelnou** chybou (vypiš, které proměnné chybí/jsou
   nevalidní, nikdy nevypisuj jejich hodnoty).
   - API (minimální schéma pro tuto fázi): `NODE_ENV`, `PORT`, `DATABASE_URL`,
     `AUTH_OKTA_ISSUER`, `AUTH_OKTA_AUDIENCE`, `CORS_ALLOWED_ORIGINS`, `LOG_LEVEL`.
   - Web: `NODE_ENV`, `NEXT_PUBLIC_API_URL`, `AUTH_SECRET`, `AUTH_OKTA_ISSUER`,
     `AUTH_OKTA_CLIENT_ID`, `AUTH_OKTA_CLIENT_SECRET`.
   - V NestJS napojeno přes `ConfigModule.forRoot({ validate })`; v Next.js validace při
     buildu/bootu.
   - Schéma je připravené na rozšíření v pozdějších fázích (Slack, ICS, throttler).
2. `.env.example` v repu se všemi proměnnými, komentáři a dev hodnotami mířícími na
   `mock-oauth2-server` a lokální Postgres. Žádné skutečné secrets.
3. `docker-compose.yml`:
   - `postgres:17` s healthcheckem (`pg_isready`), pojmenovaným volume, dev credentials
     z `.env`.
   - `ghcr.io/navikt/mock-oauth2-server` nakonfigurovaný jako OIDC issuer pro dev/e2e.
   - `adminer` pouze v dev profilu (`profiles: [dev]`).
   - **placeholder služby** `web` a `api` (build context připravený, ale skutečné
     produkční Dockerfiles vzniknou až v Tasku 29 – uveď to komentářem).
4. Dokumentace: `doc/prostredi.md` – seznam env proměnných a co dělají, jak spustit
   stack (`docker compose up`), jak se dev/e2e liší od produkce jen hodnotami env
   (žádné testovací větve v kódu), jak ověřit, že mock OIDC běží.

**Ověření:** `npm run build` prochází; spuštění app s chybějící povinnou proměnnou
skončí okamžitým pádem se srozumitelnou hláškou (dolož výstupem).
`docker compose config` validuje soubor **bez potřeby běžícího démona** – Docker démon na
tomto stroji neběží, takže `docker compose up` neověřuj; napiš to do reportu.

---

## Task 3 — `libs/shared-types` + entity schémata a error kontrakt v `libs/contract`

**Fáze 1, body 1 (část) a 2–3.** Hlavní strom, běží paralelně s Taskem 6.

1. `libs/shared-types` (tag `type:util`, `scope:shared`, **žádná** závislost na Zodu ani
   next-intl):
   - date-only typ `DateOnly` (`YYYY-MM-DD` string) + parser/serializer,
   - `todayInPrague()`, `startOfDayInPrague()`, porovnání a posun dní v Europe/Prague,
   - české státní svátky (pohyblivé i pevné) pro daný rok – čistá funkce,
   - konstanty domény: `ParkingGroup` (`IT` | `SHARED`), `UserRole` (`USER` | `ADMIN`).
   - **`isMonthOpen(targetDate, openDaysBefore, lockMode, today)`** – čistá funkce
     rezervačního okna, přesně dle `doc/decision/0004-*` (`FORCE_OPEN` → true,
     `FORCE_LOCKED` → false, `AUTO` → `today >= prvníDenMěsíce - openDaysBefore && today <
     prvníDenMěsíce`), a `monthLockState(...)` vracející
     `NOT_YET_OPEN` | `OPEN` | `LOCKED`. Vše v Europe/Prague.
   - Unit testy včetně přechodu letního času, přelomu roku a přelomu měsíce
     (den před oknem, první den okna, poslední den okna, první den měsíce).
2. `libs/contract/src/schemas` (tag `type:contract`):
   - Zod v4 schémata entit: `User`, `ParkingSpot`, `Reservation`, `WaitlistEntry`,
     `AuditLog` – přesně dle doménového modelu v `plan.md`, **plus rozšíření
     z `doc/decision/0004-*`**:
     - `User.preferredParkingSpotId` (nullable),
     - `ReservationWindowSettings` = `{ openDaysBefore: int 1–31 (default 7),
       lockMode: 'AUTO' | 'FORCE_OPEN' | 'FORCE_LOCKED' (default 'AUTO') }`,
     - `MonthLockState` = `'NOT_YET_OPEN' | 'OPEN' | 'LOCKED'` + schéma přehledu měsíce
       (měsíc, rozsah okna od–do, stav).
   - `dateOnlySchema` = `z.iso.date()` + validace rezervačního horizontu (viz `plan.md`
     §Byznys pravidla) postavená nad helpery z `libs/shared-types`.
   - Error kontrakt: schéma error shapu (`code`, `message`, `details?`) a **uzavřený výčet**
     doménových error kódů: `SPOT_ALREADY_RESERVED`, `RESERVATION_LIMIT_REACHED`,
     `PAST_DATE`, `OUT_OF_HORIZON`, `NOT_FOUND`, `FORBIDDEN`, `ALREADY_IN_WAITLIST`,
     `CANNOT_WAITLIST_OWN_SPOT`, `SPOT_NOT_OCCUPIED`, `VALIDATION_FAILED`, `CONFLICT`,
     **`RESERVATIONS_LOCKED`** (měsíc je mimo rezervační okno).
   - Typy odvozené výhradně přes `z.infer`.
3. Unit testy schémat: validní vstupy, nevalidní vstupy, hraniční data (dnešek,
   včerejšek, poslední povolený den horizontu, den o jeden za horizontem, přestupný rok).
4. Dokumentace: `doc/kontrakt.md` (zakládá se zde, doplní ho Task 4 a 5) – jak je kontrakt
   strukturovaný, jak se přidává nové schéma, proč jsou typy odvozené.

**Rozsah:** žádné oRPC procedury (Task 4), žádné realtime schéma (Task 5), žádná
implementace endpointů.

---

## Task 4 — oRPC API kontrakt v `libs/contract`

**Fáze 1, bod 1 (procedury).** Navazuje na Task 3.

Entry point `@lets-park/contract` (`libs/contract/src/api`). Definuj oRPC kontrakt
(`@orpc/contract`) se všemi doménovými procedurami a typovanými chybami:

- **Přehled dne** – jedním dotazem: spoty + rezervace + počty ve waitlistu pro daný den.
- **Rezervace** – create, cancel.
- **Waitlist** – join, leave.
- **Správa míst (admin)** – list, create, update, deactivate.
- **Správa uživatelů (admin)** – list, update (role, aktivita).
- **Nastavení uživatele** – čtení a změna SPZ **a preferovaného parkovacího místa**.
- **ICS token** – regenerace + helper/konstanta pro sestavení ICS URL
  (ICS feed samotný je mimo oRPC, viz `plan.md` §Contract-first, výjimka).
- **Rezervační okno** (viz `doc/decision/0004-*`):
  - čtení a změna nastavení (`openDaysBefore`, `lockMode`) – jen admin,
  - přehled stavů měsíců (měsíc, rozsah okna, `MonthLockState`) pro admin záložku,
  - stav okna pro konkrétní den je součástí odpovědi **přehledu dne**, aby FE nemusel
    dělat druhý dotaz.
- **Hromadná rezervace** – dvě procedury:
  - `previewBulk` (vstup: seznam dnů v jednom měsíci) → **read-only návrh**: pro každý den
    buď přidělené místo (a příznak, zda jde o preferované), nebo pozice ve frontě.
    Nic nezapisuje.
  - `confirmBulk` (vstup: tentýž seznam dnů) → provede zápis a vrátí **skutečný** výsledek
    (může se lišit od návrhu, pokud mezitím někdo místo obsadil).

Každá procedura má vstupní i výstupní schéma a deklarované chybové kódy z Tasku 3.
Vše přes `z.infer`, nic ručně.

Unit testy: pro každou proceduru validní i nevalidní vstup; test, že ICS URL helper
sestaví správný tvar.

Doplň `doc/kontrakt.md` o seznam procedur a jejich sémantiku.

**Rozsah:** čistě kontrakt a typy – **žádná implementace**.

---

## Task 5 — Realtime kontrakt (`@lets-park/contract/realtime`)

**Fáze 1, bod 4.** Navazuje na Task 3 (může běžet po Tasku 4).

Samostatný entry point `@lets-park/contract/realtime` (`libs/contract/src/realtime`), který
**netahá oRPC závislosti**:

- Zod schémata payloadů eventů: `cell:locked`, `cell:unlocked`,
  `reservation:created`, `reservation:cancelled`, `reservation:reassigned`,
  `waitlist:updated` (přesná jména sjednoť a zdůvodni).
- Z nich odvozené `ServerToClientEvents` / `ClientToServerEvents`.
- Helper pro název roomu per den (`roomForDate(date: DateOnly)`).
- Payloady **referencují sdílená entity schémata** ze `src/schemas` – nic se neduplikuje.

Unit testy schémat + testu, že import `@lets-park/contract/realtime` nezavleče `@orpc/*`
(např. kontrolou závislostí v build outputu nebo explicitním test-casem na module graph).

Doplň `doc/kontrakt.md` o realtime část a o pravidlo „server vždy validuje příchozí
client→server eventy".

---

## Task 6 — Design tokeny (`libs/design-system/tokens`)

**Fáze 2.** Paralelní větev (worktree), běží současně s Tasky 3–5.

Zdroj pravdy: **`doc/design/ds/colors_and_type.css`** (viz `doc/design/README.md`).

1. TS objekty/konstanty s celou paletou, spacing scale, typografií, radii, stíny, motion
   a breakpointy – 1:1 podle `colors_and_type.css` (barvy, `--fs-*`, `--lh-*`,
   `--tracking-*`, `--space-*`, `--radius-*`, `--shadow-*`, `--dur-*`, `--ease-*`,
   `--container*`). Breakpointy, které v CSS nejsou explicitně, odvoď z designu a označ
   komentářem.
2. Build skript generující `tokens.css` s CSS custom properties z TS zdroje.
3. Tailwind v4 setup: `@import "tailwindcss"` + `@theme inline` mapující custom properties
   na Tailwind theme. Žádné ručně psané duplicity hodnot.
4. `@font-face` deklarace pro NHaasGroteskDS s fallback stackem; fonty zkopíruj
   z `doc/design/ds/fonts/` do assetů lib.
5. **Snapshot test**, který hlídá, že vygenerovaný `tokens.css` odpovídá TS tokenům
   (běží v CI a spadne, když někdo změní jedno bez druhého).
6. Dokumentace: `doc/design-system.md` – jak tokeny fungují, jak se přidává nový token,
   proč je generovaný CSS commitnutý (nebo proč není), jak se to napojuje na Tailwind v4.

---

## Task 7 — Storybook 10 + primitivy, dávka 1

**Fáze 3, body 1–3 (část).** Navazuje na Task 6 ve stejné paralelní větvi.

1. Storybook 10 pro `libs/design-system/primitives`: `@tailwindcss/vite` ve `viteFinal`,
   import `tokens.css` v `preview.ts`, light theme dle designu.
2. Primitivy: **Button, Input, Select, Checkbox, Radio, Badge, Avatar, Switch, Stepper**.
   Vzhled a varianty odvoď z `doc/design/lets-park-design.dc.html` a screenshotů
   (`doc/design/screens/`) – např. pill radius u CTA (`--radius-cta`), primární modrá
   `#008FFF`, sekundární „outline" tlačítko, danger varianta („Zrušit rezervaci").
3. Ke každému primitivu **story souběžně** s komponentou (varianty a stavy: default,
   hover, focus, disabled, error, loading).
4. Unit testy (Jest + Testing Library): interakce, `role`/aria, focus management,
   klávesnice.
5. Doplň `doc/design-system.md` o soupis primitivů a jejich API.

**Připomínka:** primitivy jsou **domain-free** – žádná zmínka o parkovacím místě
ani rezervaci.

---

## Task 8 — Primitivy, dávka 2 (overlay a navigace)

**Fáze 3, dokončení.** Navazuje na Task 7 ve stejné paralelní větvi.

Primitivy: **Modal/Dialog, Dropdown/Menu, Tabs, Tooltip, Toast/Notification**.
Stejná pravidla jako Task 7 (story + testy souběžně, domain-free).

Zvláštní důraz na přístupnost, protože tyhle komponenty jsou nejrizikovější:
focus trap a návrat focusu u Modalu, `Escape`, `aria-modal`, klávesová navigace
v Dropdownu a Tabs (šipky, Home/End), `aria-describedby` u Tooltipu, `role="status"`
u Toastu.

Vizuál modálu ověř proti `doc/design/screens/08-modal-reserve.png`,
`09-modal-queue.png`, `11-settings.png`; dropdown proti `02-avatar-menu.png`;
tabs proti `05-admin-window.png`.

Doplň `doc/design-system.md`.

---

## Task 9 — `libs/database`: Prisma 7 schéma, migrace, seed

**Fáze 5, bod 1.** Hlavní strom, začátek backend větve.

1. Prisma 7: `prisma.config.ts`, `prisma-client` generator s **outputem uvnitř lib**
   (ne do `node_modules`), povinný driver adapter `@prisma/adapter-pg`.
2. Schéma přesně dle `plan.md` §Doménový model – `User`, `ParkingSpot`, `Reservation`,
   `WaitlistEntry`, `AuditLog` – **včetně všech unique constraintů a indexů**:
   - `Reservation` unique `(parkingSpotId, date)`
   - `Reservation` unique `(userId, date)`
   - `WaitlistEntry` unique `(parkingSpotId, userId, date)`
   - indexy na `date`
   - `date` je sloupec typu `DATE` (`@db.Date`), nikdy timestamp
   - `AuditLog.payload` je `Json` (JSONB), tabulka append-only
   - **`User.preferredParkingSpotId`** – nullable FK na `ParkingSpot`, `onDelete: SetNull`
   - **`ReservationWindowSettings`** – singleton tabulka (jeden řádek, vynucený
     constraintem – zdůvodni zvolený způsob v `doc/databaze.md`) s `openDaysBefore`
     a `lockMode`; seed vytvoří default `7` / `AUTO`
3. Migrace + seed skript: parkovací místa dle reálného layoutu
   (IT: `E2.92`–`E2.95`; Shared: `E2.96`, `E2.65`, `E2.66`, `E2.61`, `E2.62`) a dev
   uživatelé odpovídající mock OIDC.
4. Exportovaný `PrismaService`-friendly klient (samotný Nest modul až v Tasku 10/12).
5. Dokumentace: `doc/databaze.md` – ERD (textově nebo mermaid), proč hard delete + AuditLog
   místo soft delete, jak spustit migraci a seed, jak zálohovat (`pg_dump`, pár řádků).

---

## Task 10 — `apps/api`: provozní základ

**Fáze 5, bod 2.** Navazuje na Task 9.

Implementuj celý princip 4 z `plan.md`:

- rozšíření env schématu z Tasku 2 o vše, co API potřebuje,
- `nestjs-pino` (JSON logy, request-id korelace, log level z env, žádný `console.log`),
- `@nestjs/terminus`: `/health/live` a `/health/ready` (readiness kontroluje DB),
- `app.enableShutdownHooks()` + graceful shutdown (přestat přijímat spojení, dokončit
  requesty, zavřít DB pool; zavření Socket.io doplní Task 15 – nech tam připravený hook),
- `helmet`, CORS s allow-listem originů z env, `@nestjs/throttler` (globální limit +
  připravená přísnější varianta pro endpointy bez session),
- limity velikosti payloadu,
- **globální exception filter** mapující doménové výjimky a Prisma chyby (`P2002` →
  `SPOT_ALREADY_RESERVED` / 409, `P2025` → `NOT_FOUND`) na kontraktové error kódy z Tasku 3;
  stack trace se loguje, klientovi nikdy neposílá.

Unit testy exception filteru (mapování Prisma chyb) a health endpointů.

Dokumentace: `doc/provoz-api.md` – co všechno je v provozním základu, jak se chová při
chybějící env, jak vypadá log record, co dělá readiness.

---

## Task 11 — Auth: JWKS validace Okta tokenů, guards, JIT provisioning

**Fáze 5, bod 3.** Navazuje na Task 10.

- `passport-jwt` + `jwks-rsa`: validace issuer/audience/expiry, dynamické klíče z JWKS URL
  (konfigurace z env → v dev míří na `mock-oauth2-server`, v produkci na Oktu, **beze změny
  kódu**).
- `AuthGuard` (výchozí pro celé API) a `RolesGuard` pro `ADMIN`.
- JIT provisioning: při prvním requestu se uživatel založí/spáruje podle `oktaId`,
  fallback podle emailu; deaktivovaný uživatel (`active: false`) dostane `FORBIDDEN`.
- Vygenerování `icsToken` (`crypto.randomBytes`) při provisioningu.
- Znovupoužitelná JWKS validační služba, kterou ve Tasku 15 použije i Socket.io gateway.

Testy: platný token, expirovaný token, špatný issuer, špatná audience, neznámý uživatel
(JIT), deaktivovaný uživatel, role guard.

**Zákaz:** žádný credentials provider ani testovací větev v kódu.

Dokumentace: `doc/auth.md` – celý flow FE→BE→JWKS, jak se to testuje proti mock OIDC,
co se stane při rotaci klíčů.

---

## Task 12 — Doménové moduly: spoty, uživatelé, nastavení, AuditLog

**Fáze 5, bod 4 (část).** Navazuje na Task 11.

Implementace kontraktu z Tasku 4 přes `@orpc/nest` (`@Implement`):

- **ParkingSpots** – admin CRUD (list, create, update, deactivate).
- **Users (admin)** – list, změna role, deaktivace (nikdy hard delete).
- **User settings** – čtení/změna SPZ a preferovaného místa, regenerace ICS tokenu.
- **Rezervační okno (admin)** – čtení/změna `openDaysBefore` a `lockMode`, přehled stavů
  měsíců; změna nastavení jde do AuditLogu. Stav se počítá funkcí `isMonthOpen`
  z `libs/shared-types` (Task 3), **nikdy se needuplikuje**.
- **Přehled dne** – jeden dotaz vracející spoty + rezervace + počty ve waitlistu
  **+ stav rezervačního okna pro daný den**.
- **AuditLog service** – append-only zápis u všech admin zásahů a mutací; použije ho
  i Task 13.

Unit testy služeb (Jest), včetně toho, že se AuditLog opravdu zapisuje.

Dokumentace: `doc/api-moduly.md`.

---

## Task 13 — Rezervace, waitlist a auto-promote v transakci

**Fáze 5, body 4 (rezervace/waitlist) a 8.** Navazuje na Task 12. **Nejrizikovější úkol.**

Byznys pravidla přesně dle `plan.md` §Byznys pravidla:

- rezervovat lze jen dnešek a budoucnost (Europe/Prague),
- **rezervační okno** (nahrazuje pravidlo „max do konce následujícího měsíce", viz
  `doc/decision/0004-*`): pro běžného uživatele je create rezervace, waitlist join
  i waitlist leave povolený **jen když je měsíc cílového dne otevřený**
  (`isMonthOpen` z `libs/shared-types`); jinak kontraktová chyba `RESERVATIONS_LOCKED`.
  **Zrušení vlastní rezervace je povolené vždy.** Admin není oknem omezen vůbec.
  Kontrola je na backendu, ne jen v UI.
- max 1 rezervace na uživatele a den, max 1 rezervace na místo a den,
- admin ruší cizí rezervace (→ AuditLog s actorem), uživatel jen svoji,
- zrušení = hard delete + AuditLog,
- **auto-promote**: jedna Prisma interaktivní transakce, `SELECT ... FOR UPDATE`
  přes `$queryRaw` na waitlist řádky daného místa+dne řazené `createdAt, id`;
  promotuje se první čekající **bez jiné rezervace týž den**; ostatní jeho waitlist
  zápisy na tentýž den se smažou; prázdný waitlist → místo zůstane volné,
- transakce je minimální – **žádné Slack volání ani broadcast uvnitř**; notifikace
  a realtime se spouští až **po commitu** (připrav rozhraní, které Task 15 a 16 naplní),
- `P2002` → retry / konzistentní kontraktová chyba,
- waitlist join jen na obsazené místo; vlastník rezervace se nemůže zapsat na své místo.

**Integrační testy proti reálné Postgres** (`apps/api-e2e`, Docker):
souběžné zrušení (paralelní transakce), prázdný waitlist, více čekajících,
čekající s kolizní rezervací týž den, promote + konflikt unique constraintu,
**rezervace v uzamčeném měsíci (user → `RESERVATIONS_LOCKED`, admin → projde),
zrušení vlastní rezervace v uzamčeném měsíci (projde)**.

> Docker démon na tomto stroji **neběží**. Testy napiš tak, aby se spouštěly proti
> `docker compose up postgres`, a v reportu jasně napiš, že je nebylo možné lokálně
> spustit, pokud to tak bude. Nesnaž se je obejít mockem – to je proti `plan.md`.

Dokumentace: `doc/waitlist.md` – sekvenční diagram zrušení + promote, proč row-lock,
co se děje při souběhu, co se stane po commitu.

---

## Task 14 — ICS feed (`libs/calendar-export` + controller)

**Fáze 5, bod 5.** Navazuje na Task 12.

- `libs/calendar-export` – service generující ICS z doménových dat přes `ical-generator`
  (jediné místo, kde se `ical-generator` importuje).
- Nest controller **mimo oRPC kontrakt**: `GET /calendar/:icsToken.ics`,
  auth per-user náhodným tokenem z URL, `Content-Type: text/calendar`, cache headers,
  **přísnější rate limit** (`@nestjs/throttler`).
- Regenerace tokenu už existuje z Tasku 12 – ověř, že stará URL přestane fungovat.

Testy: validní token vrátí validní ICS s očekávanými událostmi; neplatný token → 404
(ne 401, aby se nedaly tokeny enumerovat – zdůvodni v `doc/decision/`);
regenerovaný token zneplatní starý.

Dokumentace: `doc/ics.md`.

---

## Task 15 — Socket.io gateway, `LockService`, broadcasty po commitu

**Fáze 5, bod 6.** Navazuje na Task 13.

- Nativní NestJS `@WebSocketGateway` (Socket.io v4), handshake auth: token
  v `socket.handshake.auth.token` (**nikdy v query stringu**), validace stejnou JWKS
  logikou jako REST guard (služba z Tasku 11), nevalidní → disconnect; při reconnectu
  se validuje znovu.
- Server **validuje příchozí client→server eventy** proti Zod schématům z Tasku 5.
- Roomy per den (`roomForDate`).
- `LockService`: interface + **in-memory implementace** s TTL ~30 s a prodlužováním
  (heartbeat). Redis implementace se **neimplementuje** – jen zdokumentuj upgrade cestu.
- Vlastní `IoAdapter` abstrakce, aby šel `@socket.io/redis-adapter` doplnit bez zásahu
  do gateway kódu.
- Broadcast změn rezervací/waitlistu **až po commitu** transakce (napoj na hook z Tasku 13).
- Doplň graceful shutdown z Tasku 10 o korektní zavření Socket.io.

Testy: TTL a prodloužení zámku, konflikt dvou zámků, odmítnutí nevalidního handshake,
odmítnutí nevalidního payloadu, broadcast až po commitu.

Dokumentace: `doc/realtime.md` – včetně explicitní upgrade cesty na Redis adapter a Redis
`SET NX PX` locky.

---

## Task 16 — Slack integrace a plánované joby

**Fáze 5, bod 7.** Navazuje na Task 13.

- Izolovaná service nad `@slack/web-api`: notifikace o uvolnění místa, DM při přeobsazení
  z waitlistu (mapování uživatele přes `users.lookupByEmail`), denní souhrn.
- Denní souhrn přes `@nestjs/schedule`, cron v **Europe/Prague**. U jobu **komentářem**
  zdokumentuj omezení při 2+ replikách a upgrade cestu (BullMQ repeatable jobs / leader
  election).
- **Selhání Slacku nikdy neshodí doménovou operaci**: timeout, jednoduchý retry s backoffem,
  chyby se logují. Celé vypínatelné přes `SLACK_ENABLED`.

**Zákaz:** žádné slash commands, žádný interaktivní Block Kit – jen odchozí
`chat.postMessage`.

Testy: Slack selže → doménová operace projde; `SLACK_ENABLED=false` → žádné volání;
retry/backoff; cron se plánuje ve správné zóně.

Dokumentace: `doc/slack.md`.

---

## Task 17 — `libs/i18n`

**Fáze 4, bod 6.** Paralelní větev (worktree), běží současně s backendem.

- Wrapper nad next-intl (jediné místo, kde se next-intl importuje).
- **Re-export** date logiky z `libs/shared-types` (viz `doc/decision/0003-*`) pod stabilním
  API, aby feature kód importoval jen `@lets-park/i18n`.
- České svátky + víkendy pro zvýraznění v date liště.
- Formátování dat v češtině (`pondělí 28. září 2026`, `září`, `2026`) – přesně podle
  `doc/design/screens/07-lot.png` a `05-admin-window.png`.
- Překladové klíče pro kontraktové error kódy → srozumitelné české hlášky.

Testy: formátování, svátky (pevné i pohyblivé), víkendy, mapování error kódů.

Dokumentace: `doc/i18n.md`.

---

## Task 18 — `libs/form`

**Fáze 4, bod 1.** Navazuje na Task 17 (a na primitivy z Tasků 7–8).

Wrapper nad React Hook Form + Zod resolver (jediné místo, kde se `react-hook-form`
importuje): `useAppForm`, `FormProvider`, `FormField` renderující DS primitivy
(`Input`, `Select`, `Checkbox`) s napojenou validací a error stavem.

Testy: validace ze Zod schématu se promítne do error stavu primitivu; submit;
že se dá formulář postavit **bez** přímého importu `react-hook-form`.

Dokumentace: `doc/wrappery.md` (zakládá se zde, doplní Tasky 19–22).

---

## Task 19 — `libs/api-client` + `libs/query`

**Fáze 4, body 2–3.** Navazuje na Task 18.

- `libs/api-client`: instance oRPC klienta napojená na `@lets-park/contract`, auth header
  (access token dodá `libs/auth`, Task 20 – zatím přes injektovatelný provider),
  mapování kontraktových chyb na typované error kódy.
- `libs/query`: konfigurace TanStack Query v5 clienta (retry, staleTime, error handling
  nad kontraktovými kódy), wrapper hooky napojené na oRPC klient
  (`@orpc/tanstack-query`).

Testy: wrapper korektně deleguje; chybová odpověď se mapuje na kontraktový kód;
retry se **neopakuje** u 4xx doménových chyb.

Doplň `doc/wrappery.md`.

---

## Task 20 — `libs/auth`

**Fáze 4, bod 5.** Navazuje na Task 19.

Wrapper nad next-auth v5 / Auth.js (jediné místo, kde se `next-auth` importuje):

- Okta OIDC provider, konfigurace z env,
- **refresh token rotation v `jwt` callbacku** – access token se obnovuje před expirací,
- expose access tokenu pro `libs/api-client` a `libs/realtime-client` **server-safe cestou**
  (nikdy localStorage),
- hooky `useSession`, `useRequireAuth` a server-side helpery.

Testy: refresh se spustí před expirací; selhání refreshe vede k odhlášení, ne k tichému
401; token se nikdy nedostane do localStorage.

Doplň `doc/wrappery.md` a `doc/auth.md` o frontendovou část.

---

## Task 21 — `libs/realtime-client`

**Fáze 4, bod 4.** Navazuje na Task 20.

Wrapper nad `socket.io-client` s typy z `@lets-park/contract/realtime`:
`useRealtimeConnection` (handshake auth token z `libs/auth`, reconnect logika),
`useCellLock` (heartbeat prodlužování zámku, uvolnění při unmountu/odpojení).

Testy: reconnect znovu posílá token; heartbeat prodlužuje zámek; unmount uvolní zámek;
příchozí event se validuje proti schématu.

Doplň `doc/wrappery.md` a `doc/realtime.md` o klientskou část.

---

## Task 22 — `libs/design-system/compounds`

**Fáze 4, bod 7.** Navazuje na Task 8 (může běžet paralelně s 18–21 v téže větvi).

- `DataTable` – wrapper nad TanStack Table (jediné místo, kde se `@tanstack/react-table`
  importuje), stylovaný DS tokeny; řazení a prázdný stav dle
  `doc/design/screens/03-admin-users.png` a `04-admin-spots.png`.
- `EmptyState`, `ConfirmDialog`.
- Story + testy souběžně; **stále domain-free**.

Doplň `doc/design-system.md`.

---

## Task 23 — `apps/web`: shell, routing, login, health

**Fáze 6, bod 1.** Hlavní strom, po mergi obou větví.

- Next.js 16 App Router struktura, root layout s DS tokeny a fonty,
- providery: `libs/query`, `libs/auth`, `libs/i18n`, `libs/realtime-client`,
- login stránka pro nepřihlášené: prázdná stránka s jedním centrálním tlačítkem
  „Login přes OKTA Verify" – vizuál dle `doc/design/screens/canvas-default.png`,
- horní lišta: logo vlevo, avatar + dropdown vpravo (Nastavení, u admina i Správa,
  Odhlásit se) – dle `02-avatar-menu.png`,
- `/api/health` route handler,
- definované loading / empty / error stavy jako sdílené kusy pro další obrazovky.

Dokumentace: `doc/frontend.md`.

---

## Task 24 — Hlavní obrazovka parkoviště + realtime

**Fáze 6, body 2–3.** Navazuje na Task 23. **Nejnáročnější FE úkol.**

- Layout parkoviště dle `doc/design/screens/07-lot.png` a `01-lot-admin.png`:
  asfaltový podklad, bílé dělicí linky, skupiny `IT` a `SHARED` vizuálně oddělené
  s počtem volných míst vpravo.
- Volné místo = prázdný box s `+`; obsazené = stylizované auto shora v brand barvě
  se jménem uživatele a SPZ; waitlist badge s počtem čekajících; cell-lock stav
  (šrafování + ikonka + „právě upravuje …") dle designu.
- Modály: „Rezervovat místo" (`08-modal-reserve.png`), „Přidat se do fronty"
  (`09-modal-queue.png` – držitel + pořadí ve frontě + „Zrušit rezervaci" pro oprávněné).
- **Stav rezervačního okna** (viz `doc/decision/0004-*`), přesně dle designu:
  - banner nad parkovištěm – zelený „Rezervace na … jsou otevřené — zapisovat lze do …",
    žlutý při uzamčeno; skrytý, když to design skrývá (`14-lot-user-lockstate-off.png`),
  - v uzamčeném měsíci se volná místa běžnému uživateli zobrazí jako „rezervace uzamčeny"
    (symbol `⊘`) a **nejsou klikatelná pro rezervaci**; kliknutí otevře vysvětlující modal,
  - ve frontovém modalu se v uzamčeném měsíci zobrazí žlutá poznámka a akce „Přidat se do
    fronty" je skrytá; „Zrušit rezervaci" (vlastní) zůstává dostupné,
  - admin má i po uzamčení plný přístup, včetně `⋯` menu na dlaždici místa
    (úprava/zrušení cizí rezervace).
- Tlačítko **„Hromadná rezervace"** v hlavičce – pro běžného uživatele v uzamčeném měsíci
  skryté a zablokované i na úrovni akce; modal implementuje Task 31.
- Data přes `libs/query` + `libs/api-client`; realtime přes `libs/realtime-client`.
  **Realtime eventy invalidují/patchují query cache – jeden konzistentní mechanismus,
  žádné ad-hoc lokální stavy.**
- Loading / empty / error stav; kontraktové error kódy → české hlášky přes `libs/i18n`.

Dokumentace: doplň `doc/frontend.md` o realtime strategii (kdy invalidace, kdy patch).

---

## Task 25 — Spodní date-navigační lišta

**Fáze 6, bod 4.** Navazuje na Task 24.

Fixní spodní lišta dle `doc/design/screens/07-lot.png`: prev/next šipky, aktuální datum
uprostřed, selektor měsíce a roku, tlačítko „Dnes". Zvýraznění českých svátků
(„STÁTNÍ SVÁTEK · DEN ČESKÉ STÁTNOSTI", žluté pozadí lišty) a víkendů přes `libs/i18n`.

Změna dne mění realtime room i query klíč – ověř testem, že se odhlásí ze starého roomu.

---

## Task 26 — Nastavení profilu (SPZ + ICS)

**Fáze 6, bod 5.** Navazuje na Task 23.

Modal „Nastavení" dle `doc/design/screens/11-settings.png`:

- formulář přes `libs/form` – SPZ **a preferované parkovací místo** (select nad aktivními
  místy, prázdná volba povolena); popisek dle designu: „SPZ se předplní při každé rezervaci
  místa. Preferované místo použijeme přednostně u hromadné rezervace.",
- **sekce ICS** (v designu chybí, ale `plan.md` ji vyžaduje): zobrazení a zkopírování
  subscription URL + tlačítko regenerace tokenu s potvrzením (`ConfirmDialog`).
  Vizuálně drž styl designu; zdůvodni umístění v `doc/decision/`.

---

## Task 27 — Admin sekce

**Fáze 6, bod 6.** Navazuje na Task 25 a 26.

Stránka „Správa" se záložkami dle `doc/design/screens/03-admin-users.png`,
`04-admin-spots.png`, `06-admin-overview.png`:

- **Přehled parkoviště** – admin pohled na den,
- **Uživatelé** – `DataTable`, deaktivace, změna role,
- **Parkovací místa** – `DataTable`, CRUD,
- **Rezervační okno** – dle `doc/design/screens/05-admin-window.png`:
  vlevo karta „Otevření nového měsíce" (stepper „Otevřít X dní předem" + režim zámku
  Automaticky / Vynutit otevřeno / Vynutit uzamčeno), vpravo karta „Stav měsíců"
  se seznamem nejbližších měsíců, rozsahem okna a badge
  Otevřeno / Uzamčeno / Zatím neotevřeno.

Vizuální identita stejná jako zbytek appky.

---

## Task 28 — Playwright e2e

**Fáze 7, body 1–3.**

- Login flow proti `mock-oauth2-server` (reálný OIDC redirect flow), session cachovaná
  přes `storageState` (gitignored).
- Scénáře: login; vytvoření rezervace; zrušení rezervace a auto-promote z waitlistu;
  realtime cell lock mezi dvěma uživateli (dva browser konteksty); admin úprava cizí
  rezervace; ICS export (stažení feedu přes token URL a validace obsahu).
- Doplnění chybějících unit testů dle coverage.

Dokumentace: `doc/testovani.md` – jaké vrstvy testů existují, jak je spustit,
co potřebuje běžící Docker.

---

## Task 29 — Docker produkce, runbook, finalizace dokumentace

**Fáze 7, body 4–5.**

- Finalizace `docker-compose.yml` – plně funkční `docker compose up` spouštějící celý
  stack včetně mock OIDC.
- Produkční Dockerfiles pro `web` i `api`: multi-stage, non-root user, `HEALTHCHECK`.
- Aktualizace `CLAUDE.md` o **reálné** příkazy (build, lint, test, e2e).
- `README.md` – krátký provozní runbook (pár řádků, ne esej): start stacku, migrace, seed,
  regenerace ICS tokenu, zálohy Postgres (`pg_dump`), upgrade cesty (Redis adapter a locky,
  BullMQ).
- Kontrola, že `doc/` je kompletní a konzistentní; index `doc/README.md`.

---

## Task 30 — Hromadná rezervace: backend alokátor a transakce

**Rozšíření dle `doc/decision/0004-*`.** Běží mezi Taskem 13 a 14 (hlavní strom).

Implementace procedur `previewBulk` a `confirmBulk` z Tasku 4.

**Alokátor** (pro každý vybraný den, dny se zpracovávají vzestupně):

1. Pokud má uživatel `preferredParkingSpotId` a to místo je ten den volné → přiděl ho
   a označ výsledek jako `preferred`.
2. Jinak vezmi první volné aktivní místo podle deterministického pořadí
   (skupina `IT` před `SHARED`, uvnitř skupiny podle `label`) – **žádná náhoda**,
   aby byl náhled a potvrzení konzistentní.
3. Pokud ten den není volné žádné místo → zařaď do fronty na místo s **nejkratší frontou**
   (tiebreak podle `label`) a vrať výslednou pozici.
4. Den, kdy už uživatel rezervaci má, se přeskočí s vysvětlením (pravidlo 1 rezervace
   na uživatele a den).
5. Víkendy a české svátky se odmítnou už validací vstupu.

**Rozdíl mezi preview a confirm:**

- `previewBulk` je **read-only** – nesmí nic zapsat ani zamknout.
- `confirmBulk` běží v **jedné interaktivní transakci** a musí být odolný proti tomu, že se
  stav mezi náhledem a potvrzením změnil: kolize (`P2002`) neshodí celou dávku, ale ten den
  spadne do fronty. Výsledek se vrací uživateli, aby viděl, co se skutečně stalo.
- Rezervační okno se kontroluje pro celý cílový měsíc; běžný uživatel v uzamčeném měsíci
  dostane `RESERVATIONS_LOCKED` (admin projde).
- AuditLog zápis za každou vytvořenou rezervaci i waitlist zápis.
- Broadcasty a Slack notifikace **až po commitu** (stejný hook jako Task 13).

Testy: preview nic nezapíše; deterministické pořadí (dvakrát stejný vstup → stejný výstup);
preferované místo má přednost; plný den → fronta s korektní pozicí; den s existující
rezervací se přeskočí; **integrační test proti reálné Postgres**: souběžné `confirmBulk`
dvou uživatelů na stejné dny neporuší unique constrainty a oba dostanou konzistentní výsledek.

Dokumentace: doplň `doc/waitlist.md` (nebo nový `doc/hromadna-rezervace.md`) o strategii
alokátoru a o to, proč je preview read-only.

---

## Task 31 — Hromadná rezervace: FE modal

**Rozšíření dle `doc/decision/0004-*`.** Běží po Tasku 24 (hlavní strom).

Modal dle `doc/design/screens/10-modal-bulk.png`, dva kroky:

1. **Výběr dní** – kalendářní mřížka měsíce, sloupce `PO ÚT ST ČT PÁ SO NE`
   (víkendy vizuálně v zákrytu vpravo). Víkendy a české svátky jsou **nevybratelné**
   (`libs/i18n`). Pod mřížkou text „Víkendy a svátky nelze vybrat." a „Preferované místo:
   `<label>`". CTA: „Vyberte dny" → „Vygenerovat rozvrh (N dní)".
2. **Návrh rozvrhu** – seznam řádků `datum · den v týdnu` + přidělené místo + badge
   `Rezervováno · preferované` (zelená), `Rezervováno` (modrá) nebo `N. ve frontě` (žlutá).
   Souhrn „X dní s místem, Y dní ve frontě." CTA „Potvrdit rozvrh", zpět na výběr.

Po potvrzení se výsledek porovná s návrhem – pokud se liší, uživatel to musí vidět
(ne tichý rozdíl). Invalidace query cache pro dotčené dny.

Pro běžného uživatele v uzamčeném měsíci je vstup do modalu skrytý i zablokovaný.
