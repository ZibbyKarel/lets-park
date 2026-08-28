# Provoz API – logování, sondy, shutdown, bezpečnostní základ

Tenhle dokument popisuje **provozní základ `apps/api`**: co se stane při startu, co se
loguje, na co odpovídají health sondy, jak proces korektně končí a co API chrání na vstupu.
Zdroj pravdy je kód; při rozchodu věř kódu.

Nastavení env proměnných (včetně výchozích hodnot) je v `doc/environment.md`.

---

## Co provozní základ obsahuje

| oblast | kde to je | poznámka |
| --- | --- | --- |
| fail-fast validace env | `apps/api/src/env.ts` | Zod, běží uvnitř `ConfigModule.forRoot({ validate })` |
| strukturované logování | `apps/api/src/logging/logger.options.ts` | `nestjs-pino`, JSON, `doc/decision/0036-*` |
| health sondy | `apps/api/src/health/` | `@nestjs/terminus`, `doc/decision/0035-*` |
| graceful shutdown | `apps/api/src/shutdown/` | `GracefulShutdownService` |
| globální filtr chyb | `apps/api/src/common/filters/` | `doc/decision/0032-*`, `doc/decision/0033-*` |
| rate limiting | `apps/api/src/common/throttling/` | `@nestjs/throttler`, `doc/decision/0034-*` |
| helmet, CORS, prefix, limit těla | `apps/api/src/configure-app.ts` | volá to `main.ts` i testy |

Co tu **není a nemá být**: Sentry, metriky, APM, alerting, Redis, BullMQ ani message broker.
Strukturované logování, sondy a graceful shutdown jsou provozní hygiena, ne monitoring.

### Jak se to testuje

HTTP wiring (prefix, helmet, CORS, parsery, shutdown hooky) je schválně vytažené do
`apps/api/src/configure-app.ts`, aby ho `main.ts` i testy volaly **stejnou funkcí**.
`apps/api/src/app/http-pipeline.spec.ts` pak nastartuje skutečný Nest server na náhodném
portu a pouští proti němu reálné requesty.

Není to kosmetika. Dvě chyby, které měl tenhle základ při odevzdání – 413 vracené jako 500
a přepsané tělo readiness sondy – byly obě **neviditelné pro test, který volá metodu
kontroleru přímo**, protože obě vznikaly až ve složení (body parser → filtr, terminus →
filtr). Test, který si pipeline poskládá po svém, by se navíc rozešel s `main.ts` a schoval
je stejně dobře. Proto ta jedna sdílená funkce.

**Pravidlo:** jakékoli tvrzení o tom, co API vrací po drátě, patří ověřit v
`http-pipeline.spec.ts`. Úvaha nad kódem na to nestačí – u obou chyb výše zněla přesvědčivě
a byla špatně.

---

## Chování při chybějící nebo špatné env proměnné

Validace běží v `ConfigModule.forRoot({ validate: validateApiEnv })`, tedy při vyhodnocení
`AppModule` – **dřív, než proces začne poslouchat na portu**. Vypíší se *všechny* vadné
proměnné najednou, každá s tím, co je na ní špatně, a proces skončí s `exit code 1`.

Skutečný výstup (chybí `DATABASE_URL`, `BODY_LIMIT` je `100` bez jednotky):

```
[Nest] 41685  - 08/28/2026, 2:12:32 PM     LOG [NestFactory] Starting Nest application...
[Nest] 41685  - 08/28/2026, 2:12:32 PM   ERROR [ExceptionHandler] Error: Invalid or missing environment variables for api. Fix these and restart:
  - DATABASE_URL: Invalid input: expected string, received undefined
  - BODY_LIMIT: must be a byte size with a unit, e.g. "100kb"
    at Object.validateApiEnv [as validate] (dist/apps/api/main.js:3098:15)
    …
```

Dvě věci, které z toho stojí za zapamatování:

- **Hláška nikdy nevypíše hodnotu proměnné**, jen její jméno a očekávání. Je proto bezpečné
  ji nalepit do ticketu nebo do chatu.
- **Tenhle výstup není JSON.** Pino se instaluje až v `main.ts` přes
  `app.useLogger(app.get(Logger))`, což se při selhání validace nestihne. Viz
  „Riziko" v `doc/decision/0036-*`.

Reprodukce bez Dockeru: přeložit (`npx nx build api`) a spustit `node dist/apps/api/main.js`
s neúplným prostředím – návod v `doc/environment.md`, sekce „Demonstrace fail-fast".

---

## Jak vypadá záznam v logu

Jeden JSON objekt na řádek, na stdout. Aplikační řádek:

```json
{"level":"info","time":1787919198163,"app":"api","env":"production","reservationId":"b1e2...","message":"Reservation created"}
```

Řádek o dokončeném requestu (zachyceno proti holému serveru s tímhle pino nastavením – v
ostrém provozu má `res.headers` navíc celou sadu hlaviček od helmetu):

```json
{"level":"info","time":1787919198176,"app":"api","env":"production","req":{"id":"0dce0a5c-6c80-4d74-86d4-ac204bb4deaf","method":"POST","url":"/api/reservations","headers":{"host":"127.0.0.1:63307","user-agent":"curl/8","content-length":"2"}},"res":{"statusCode":201,"headers":{"x-request-id":"0dce0a5c-6c80-4d74-86d4-ac204bb4deaf"}},"responseTime":1,"message":"request completed"}
```

Pevná pole:

| pole | hodnota |
| --- | --- |
| `level` | jméno úrovně (`info`, `warn`, `error`), ne číslo |
| `message` | text zprávy – ne pinem výchozí `msg` |
| `app` | vždy `"api"` |
| `env` | hodnota `NODE_ENV` |
| `req.id` | korelační id requestu |

**Korelace.** `req.id` je hodnota příchozí hlavičky `x-request-id`, pokud dorazila, jinak
nové UUID. Tatáž hodnota se vrací v response hlavičce `x-request-id` – uživatel hlásící
chybu má tedy co citovat a je to grepovatelné.

Výjimka: `genReqId` běží uvnitř pino-http middlewaru, který je pro obě health sondy vypnutý
(`exclude`, viz níže). **Odpovědi na `/health/live` a `/health/ready` proto hlavičku
`x-request-id` nenesou.** Je to důsledek toho, že se sondy nelogují, ne opomenutí.

**Redakce.** Hlavičky `authorization`, `cookie` a `set-cookie` se ze záznamu odstraňují.
V ukázce výše request nesl `authorization: Bearer secret-token` i `cookie: session=abc`;
v logu nejsou. Pozor: redakce je seznam **konkrétních cest** – nová hlavička s tajemstvím se
musí přidat ručně (`apps/api/src/logging/logger.options.ts`).

**Úroveň request řádku:** 5xx nebo vyhozená chyba → `error`, 4xx → `warn`, jinak `info`.

**Health sondy se do request logu nezapisují** – běžely by každých pár sekund a pohřbily by
skutečný provoz.

Ve vývoji čitelný výstup: `npx nx run api:serve | npx pino-pretty`. `pino-pretty` **není**
závislost projektu, důvody v `doc/decision/0036-*`.

---

## Health sondy

Obě jsou **mimo globální prefix `/api`** – deployment konfigurace nemá být svázaná
s routováním aplikace. Cesty jsou tedy `http://host:PORT/health/live` a
`/health/ready`, ne `/api/health/…`. Obě jsou zároveň vyjmuté z rate-limitu.

### `GET /health/live`

Na databázi **nesahá** a sáhnout nesmí. Odpovídá na otázku „je tenhle proces zaseknutý?".
Vrací 200, i když je Postgres úplně mimo.

Selhání = orchestrátor má proces **restartovat**.

### `GET /health/ready`

Provede **skutečný `SELECT 1`** do Postgresu (`PrismaService.ping()`), obalený timeoutem
`HEALTH_DB_TIMEOUT_MS` (výchozí 3000 ms).

Selhání = orchestrátor má instanci **vyřadit z rotace**, ne restartovat. Signalizuje se
HTTP **503** (`ServiceUnavailableException`).

Odpověď při nedostupné databázi (HTTP 503, zachyceno reálným requestem na sestavenou
aplikaci – `apps/api/src/app/http-pipeline.spec.ts`):

```json
{"status":"error","info":{},"error":{"database":{"reason":"Database is unreachable","timeoutMs":3000,"status":"down"}},"details":{"database":{"reason":"Database is unreachable","timeoutMs":3000,"status":"down"}}}
```

Odpověď, když je databáze v pořádku (HTTP 200):

```json
{"status":"ok","info":{"database":{"responseTimeMs":0,"status":"up"}},"error":{},"details":{"database":{"responseTimeMs":0,"status":"up"}}}
```

Důvod je záměrně hrubý – chybová hláška `pg` driveru obsahuje host, jméno databáze a někdy
uživatele, a `/health/ready` bývá dosažitelné většímu okruhu lidí než logy. Při vypršení
timeoutu je `reason` místo toho `Database did not respond in time`.

> **Pozor při úpravách filtru.** Tělo health checku je **jediné** 5xx tělo, které
> `ContractExceptionFilter` propouští ven; všechna ostatní nahrazuje konstantou (viz
> `doc/decision/0033-*`). Původní verze filtru tuhle výjimku neměla, takže sonda sice
> vracela 503, ale s tělem `{"statusCode":500,"message":"Internal server error"}` – status
> správně, obsah bezcenný. Odhalil to až reálný request; test, který volal metodu
> kontroleru přímo, to vidět nemohl.

**`HEALTH_DB_TIMEOUT_MS` musí zůstat citelně pod probe timeoutem orchestrátoru.** Vyšší
hodnota mechanismus vypne: orchestrátor sondu utne dřív, než stihne odpovědět.

Proč zrovna tohle rozdělení a proč timeout: `doc/decision/0035-*`.

---

## Graceful shutdown

`main.ts` volá `app.enableShutdownHooks()` **před** `listen()`, aby byl obsloužen i SIGTERM,
který přijde během startu. Na SIGTERM/SIGINT pak Nest: přestane přijímat nová spojení →
nechá doběhnout rozpracované requesty → zavolá `onModuleDestroy` (tam
`PrismaService` zavře connection pool) → zavolá `onApplicationShutdown`.

### Hook, který má použít Task 15

```
GracefulShutdownService.registerCloser
```

(`apps/api/src/shutdown/graceful-shutdown.service.ts`)

Socket.io se sám nezavře. Živý WebSocket není „rozpracovaný request", takže se ho HTTP
shutdown nedotkne a proces visí až do kill timeoutu orchestrátoru. Gateway se proto musí
zaregistrovat:

```ts
// v onModuleInit gateway, nebo v konstruktoru jejího modulu
gracefulShutdown.registerCloser('socket.io', async () => {
  await new Promise<void>((resolve) => this.server.close(() => resolve()));
});
```

Vlastnosti, na které se dá spolehnout:

- Closery běží v `onApplicationShutdown`, tedy až poté, co HTTP přestalo přijímat spojení.
- Každý je **awaitovaný** a **individuálně odchycený** – closer, který vyhodí výjimku, se
  zaloguje a ostatní i tak doběhnou. Poloviční zavření procesu je horší než hlučný log.
- Registrace téhož jména podruhé předchozí closer **nahradí**, takže modul, který se
  reinicializuje, nenaduplikuje closery.
- Closer musí vždy doběhnout nebo selhat – **nikdy viset**. Shutdown se na něj čeká.

---

## Chyby na výstupu

Globální filtr `ContractExceptionFilter` je registrovaný přes `APP_FILTER` v `AppModule`
(ne přes `useGlobalFilters` v `main.ts`), aby ho dostaly i testy, které bootují jen modul.

**Stack trace se vždycky loguje a nikdy neodesílá klientovi.**

Doménová chyba vypadá takhle (tvar oRPC, kterému rozumí klient na frontendu):

```json
{"defined":false,"code":"SPOT_ALREADY_RESERVED","status":409,"message":"…","data":{}}
```

Transportní selhání (neexistující routa, zahozeno throttlerem, tělo přes limit) i neznámá
chyba si nechávají Nest tvar `{ statusCode, message }`; u neznámé chyby je tělo konstantní
`{"statusCode":500,"message":"Internal server error"}`.

Nejdůležitější mapování: unique constraint `Reservation (parkingSpotId, date)` je to, co
dělá dvojitou rezervaci nemožnou při souběhu. Poražený požadavek v tom závodě dostane
`SPOT_ALREADY_RESERVED` (409), ne 500. Detaily a celá mapovací tabulka: `doc/decision/0032-*`,
tvary odpovědí `doc/decision/0033-*`.

---

## Rate limiting, helmet, CORS, limit těla

**Rate limiting.** Registrovaný je jediný throttler: `THROTTLE_LIMIT` requestů za
`THROTTLE_TTL_MS` (výchozí 300 / minutu), globálně přes `APP_GUARD`.

Přísnější tier pro endpointy **bez session** je připravený, ale zatím nikde nepoužitý – je to
dekorátor `StrictThrottle()` v `apps/api/src/common/throttling/throttle-tiers.ts`
(`THROTTLE_STRICT_LIMIT` / `THROTTLE_STRICT_TTL_MS`, výchozí 20 / minutu). Tasky 11–12
rozhodnou, na které routy patří:

```ts
@StrictThrottle()
@Get('ics/:token')
feed() { … }
```

Registrovat ho jako druhý pojmenovaný throttler **nelze** – `@nestjs/throttler` aplikuje
každý registrovaný throttler na každou routu, takže by přísný limit platil na celém API.
Viz `doc/decision/0034-*`.

Čítače jsou in-memory. To odpovídá jednoinstančnímu cíli MVP; při škálování by se limit
vynásobil počtem instancí a řeší se výměnou `ThrottlerStorage`, ne změnou téhle struktury.

> **Omezení: API zatím počítá limit podle IP socketu.** `ThrottlerGuard` bucketuje podle
> `req.ip` a Express ho bere ze socketu, protože **`trust proxy` není nastavené**. Za
> reverzní proxy (nginx, traefik, ingress) proto všichni klienti spadnou do **jednoho**
> bucketu a `THROTTLE_LIMIT` se stane sdíleným rozpočtem celé uživatelské základny – jeden
> hlučný klient odstřihne ostatní.
>
> Než se API nasadí za proxy, musí se to vyřešit: `app.set('trust proxy', …)` s **počtem
> hopů nebo CIDR rozsahem**, nikdy holé `true` – to by klientovi dovolilo podvrhnout
> `X-Forwarded-For` a limitu se úplně vyhnout. Task 10 to nenastavuje, protože topologie
> nasazení zatím není rozhodnutá a špatná hodnota je horší než žádná.

**Helmet** je zapnutý ve výchozí konfiguraci (`app.use(helmet())`).

**CORS** je explicitní allow-list z `CORS_ALLOWED_ORIGINS`, `credentials: true`. Nikdy
`origin: true` ani `*` – API se autentizuje cookie/bearerem, takže odražený origin by byl
CSRF plocha.

**Limit těla** je `BODY_LIMIT` (výchozí `100kb`) pro JSON i urlencoded. Nest má vlastní body
parser vypnutý (`bodyParser: false` v `NestFactory.create`), aby byly zaregistrované parsery
právě jedny a nezáleželo na pořadí. Schéma odmítá `BODY_LIMIT` bez jednotky: `100` znamená
pro body-parser *bajty*, což skoro nikdy není to, co člověk psal.

Příliš velké tělo dostane **413** (zachyceno reálným requestem):

```json
{"statusCode":413,"message":"request entity too large"}
```

> **Pozor při úpravách filtru.** Body parser nevyhazuje `HttpException`, ale
> `PayloadTooLargeError` z knihovny `http-errors`. Původní verze filtru ji nepoznala, takže
> propadla do větve „neočekávaná chyba" a vracela **500 se zalogovaným stackem** – špatná
> třída statusu a zároveň způsob, jak může anonymní volající zaplavit error log. Filtr ji
> teď rozpoznává podle příznaku `expose`, kterým `http-errors` sám označuje hlášky bezpečné
> pro klienta. Viz `doc/decision/0033-*`.

**Tajemství jsou výhradně z env** – v repozitáři není žádná zakódovaná hodnota.
