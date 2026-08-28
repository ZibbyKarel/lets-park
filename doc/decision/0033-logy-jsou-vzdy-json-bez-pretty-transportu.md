# 0033 – Logy jsou vždycky JSON, i ve vývoji; žádný pretty transport

**Datum:** 2026-08-28 · **Stav:** přijato

## Co

`nestjs-pino` zapisuje na stdout jeden JSON objekt na řádek, **ve všech prostředích včetně
vývoje**. `pino-pretty` není závislost projektu. Kdo chce ve vývoji čitelný výstup, prožene
si ho rourou:

```bash
npx nx run api:serve | npx pino-pretty
```

`console.log` se v `apps/api` nepoužívá nikde.

Pevná pole každého záznamu: `level` jako **jméno** (`"info"`, ne `30`), `time`,
`app: "api"`, `env`, a text zprávy pod klíčem `message` (ne pod výchozím pinem `msg`).

Request log má navíc `req.id` – buď hodnota příchozí hlavičky `x-request-id`, nebo nově
vygenerované UUID. Tatáž hodnota se vrací klientovi v response hlavičce `x-request-id`.

Hlavičky `authorization`, `cookie` a `set-cookie` se ze záznamu **odstraňují**
(`redact` s `remove: true`), ne maskují.

Sondy `/health/live` a `/health/ready` se do request logu nezapisují vůbec.

## Proč

**Proč žádný pretty transport.** `pino-pretty` běží jako transport ve **worker threadu**.
To je jedna další věc, kterou je potřeba zavřít při graceful shutdownu, a jeden další způsob,
jak přijít o poslední řádky před ukončením procesu – tedy přesně o ty řádky, které člověk po
pádu hledá. Roura dá vývojáři identický výstup, aniž by to bylo v procesu.

Druhý důvod: „ve vývoji pretty, na produkci JSON" znamená, že se dev a produkce liší kódem,
ne jen hodnotami proměnných. To je vzorec, kterému se projekt vyhýbá i u auth (viz
`doc/prostredi.md`).

**Proč `level` jako jméno a `message` místo `msg`.** Pino defaultně píše číselnou úroveň
(`30`) a klíč `msg`. Obojí funguje, ale vyžaduje to v log agregátoru mapovací pravidlo per
projekt. Pevné, samopopisné klíče znamenají, že se log dá nasypat kamkoli a je rovnou
čitelný.

**Proč `remove: true` a ne maskování.** Maskování nechává v záznamu prefix hodnoty. U bearer
tokenu je i prefix citlivý a hlavně – z hlediska logu není důvod tam mít cokoli; že hlavička
dorazila, se pozná z toho, že request prošel autentizací.

**Proč se sondy nelogují.** Liveness i readiness běží každých pár sekund navždy. Na úrovni
`info` by pohřbily každý skutečný request pod šum. Chyby v nich se tím neztratí – ty jdou
přes filtr a jeho vlastní logger.

**Proč `x-request-id` z příchozí hlavičky, když existuje.** Aby id nastavené proxy nebo
webovou aplikací přežilo skok do API a jeden incident se dal dohledat napříč vrstvami.
Vrácení hlavičky zpět dělá to, že uživatel hlásící chybu má co citovat – řetězec, který je
v logu grepovatelný.

## Jak

Skutečný výstup (zachyceno spuštěním, ne vymyšleno):

```json
{"level":"info","time":1787919198163,"app":"api","env":"production","reservationId":"b1e2...","message":"Reservation created"}
```

```json
{"level":"info","time":1787919198176,"app":"api","env":"production","req":{"id":"0dce0a5c-6c80-4d74-86d4-ac204bb4deaf","method":"POST","url":"/api/reservations","headers":{"host":"127.0.0.1:63307","user-agent":"curl/8","content-type":"text/plain;charset=UTF-8","content-length":"2"}},"res":{"statusCode":201,"headers":{"x-request-id":"0dce0a5c-6c80-4d74-86d4-ac204bb4deaf"}},"responseTime":1,"message":"request completed"}
```

Request nesl `authorization: Bearer secret-token` i `cookie: session=abc`; v záznamu nejsou.

Úroveň request řádku určuje `customLogLevel`: 5xx nebo vyhozená chyba → `error`, 4xx →
`warn`, jinak `info`.

## Riziko, když je to špatně

Log dostane strukturu až v okamžiku, kdy `main.ts` zavolá `app.useLogger(app.get(Logger))`.
**Všechno, co spadne dřív, vypadá jinak** – konkrétně selhání validace env proměnných vypíše
barevný Nest text, ne JSON (viz ukázka v `doc/provoz-api.md`). `bufferLogs: true` pozdrží
startovací řádky Nestu, aby jich bylo co nejmíň, ale chybu ve validaci pozdržet nelze – ta
nastane při vyhodnocení `AppModule`. Kdo sbírá logy strojově, musí počítat s tím, že úplně
první řádky padajícího procesu nemusí být JSON.

Druhé riziko: `redact` je seznam **cest**, ne vzorů podle názvu. Nová hlavička nebo pole
s tajemstvím (například `x-api-key` nebo tělo requestu) se nezredaguje samo od sebe – musí
se do seznamu přidat ručně.
