# 0032 – `/health/live` na databázi nesahá, `/health/ready` ano – a s timeoutem

**Datum:** 2026-08-28 · **Stav:** přijato

## Co

Dvě sondy, dva různé významy:

| endpoint | co dělá | co znamená selhání |
| --- | --- | --- |
| `/health/live` | nic – `health.check([])` | proces je zaseknutý → **restartovat** |
| `/health/ready` | skutečný `SELECT 1` do Postgresu | instance nemůže obsluhovat → **vyřadit z rotace** |

`SELECT 1` je obalený timeoutem `HEALTH_DB_TIMEOUT_MS` (výchozí 3000 ms). Když se nestihne,
sonda selže s důvodem `Database did not respond in time`.

Důvod selhání je záměrně **hrubý** – `Database is unreachable`, nikdy původní chyba driveru.

Obě sondy jsou mimo globální prefix `/api` (výjimka v `setGlobalPrefix`) a mimo rate-limit
(`@SkipThrottle()`), a `nestjs-pino` je nezapisuje do request logu (`exclude`).

## Proč

**Proč liveness nesmí sáhnout na databázi.** Když spadne Postgres a liveness na něj sahá,
orchestrátor začne restartovat *všechny* instance API. Ty se po restartu nespustí (nebo
spustí a hned zas selžou), takže výpadek databáze se změní na restart smyčku celé aplikace –
a až se databáze vrátí, přijde ještě thundering herd znovupřipojení. Liveness odpovídá na
otázku „je tenhle proces zaseknutý?", a na tu je odpověď „ne" i tehdy, když je databáze pryč.

**Proč readiness naopak sáhnout musí.** Readiness sonda, která vrátí 200, i když je Postgres
dole, je horší než žádná: rozbité nasazení vypadá zdravě a orchestrátor na něj pustí provoz,
který umí produkovat jen 500. Tohle je explicitní požadavek zadání, ne úvaha.

**Proč timeout.** Zaseknutý Postgres – plný connection pool, síťová černá díra – způsobí, že
`SELECT 1` nikdy nedoběhne. Bez timeoutu se sonda nezasekne „na chvíli", ale **napořád**, a
zaseknutá sonda se pro většinu orchestrátorů čte jako „ještě startuje", ne „rozbité". To je
zase ta horší z obou možných chyb. Timeout musí zůstat citelně pod probe timeoutem
orchestrátoru, jinak ho nikdy nestihne předběhnout.

**Proč hrubý důvod.** `/health/ready` bývá dosažitelné většímu okruhu lidí než logy. Chybová
hláška `pg` driveru běžně obsahuje host, jméno databáze a někdy uživatele – tohle je
konfigurační detail infrastruktury, ne informace pro toho, kdo sondu čte.

**Proč sondy mimo `/api`.** Cestu ke sondě konfiguruje ten, kdo nasazuje. Schovat ji pod
prefix, který patří routování aplikace, znamená svázat deployment konfiguraci s rozhodnutím
o tvaru API.

## Jak

`DatabaseHealthIndicator` používá `HealthIndicatorService.check(key)` a `up()`/`down()`
(API `@nestjs/terminus` v11, ne zděděný `HealthIndicator` z v10). Selhaná kontrola vyplave
jako `ServiceUnavailableException`, tedy HTTP 503.

Timer se ruší v `finally` – bez toho by si proces po *každé úspěšné* sondě držel živý timer
až `HEALTH_DB_TIMEOUT_MS`.

`health.spec.ts` běží proti `PrismaService` dvojníkovi se třemi chováními (`up` / `down` /
`hang`) a ověřuje mimo jiné, že liveness při rozbité databázi **vůbec nezavolá `ping()`**,
že readiness ho zavolá právě jednou, a že se v odpovědi neobjeví ani host ani jméno databáze.

## Riziko, když je to špatně

Kdyby někdo do `/health/live` přidal kontrolu databáze „pro úplnost", chová se to normálně
až do prvního výpadku Postgresu – a v tu chvíli se z výpadku databáze stane výpadek celé
aplikace včetně restart smyčky. Je to jednořádková změna s nepřiměřeným dopadem a v testech
ji chytí jedině ten explicitní test na `prisma.pings === 0`, který proto v `health.spec.ts`
je.

Druhá past: `HEALTH_DB_TIMEOUT_MS` nastavený **výš** než probe timeout orchestrátoru celý
mechanismus vypne – orchestrátor sondu utne dřív, než stihne odpovědět, a chová se to jako
zaseknutá sonda, tedy přesně to, čemu se timeout snaží zabránit.
