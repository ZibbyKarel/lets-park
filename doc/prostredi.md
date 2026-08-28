# Prostředí – env proměnné, Docker stack, fail-fast validace

Tento dokument popisuje, **jaké env proměnné aplikace potřebují**, **jak spustit lokální
Docker stack** a **jak se dev/e2e liší od produkce** (jen hodnotami proměnných, nikdy
kódem). Zdroj pravdy pro tvar proměnných je Zod schéma v `apps/api/src/env.ts` a
`apps/web/src/env.ts` – tento dokument je popisný, ne autoritativní; při rozchodu věř kódu.

---

## Filozofie: fail-fast, žádné testovací větve

Obě aplikace validují svoje env proměnné hned při startu přes Zod schéma. Pokud proměnná
chybí nebo má špatný tvar, aplikace **okamžitě spadne** se srozumitelnou hláškou, která
jmenuje proměnnou (nikdy ne její hodnotu):

- **`apps/api`** – validace běží uvnitř `ConfigModule.forRoot({ validate: validateApiEnv })`
  (`apps/api/src/app/app.module.ts`). Selhání validace vyhodí výjimku ještě před
  `app.listen()`, takže proces nikdy nezačne přijímat requesty s nevalidní konfigurací.
- **`apps/web`** – validace běží v `apps/web/src/instrumentation.ts` → `register()`, což
  Next.js zavolá přesně jednou při startu serveru (`next dev` / `next start`). Chybu odsud
  Next.js sám o sobě neukončí proces (zůstal by běžet a vracet 500), proto
  `apps/web/src/instrumentation-node.ts` po zalogování chyby volá `process.exit(1)` – proces
  je tak stejně "mrtvý" jako u API. Detaily a proč to není v `next.config.ts`, viz
  `doc/decision/0008-web-env-validace-instrumentation-hook.md`.

**Dev, e2e i produkce běží přesně ten samý kód.** Liší se jen hodnoty proměnných – v dev/e2e
míří `AUTH_OKTA_ISSUER` na `mock-oauth2-server` běžící v Dockeru, v produkci na skutečný Okta
issuer. Nikde v kódu není `if (isTest)` ani jiná testovací zkratka pro auth.

---

## Env proměnné

### `apps/api` (`apps/api/src/env.ts`)

| proměnná | tvar | k čemu je |
| --- | --- | --- |
| `NODE_ENV` | `development` \| `test` \| `production` | běžný Node přepínač prostředí |
| `PORT` | celé číslo 1–65535 | port, na kterém NestJS HTTP server poslouchá |
| `DATABASE_URL` | absolutní URL | connection string do Postgresu (`postgresql://user:pass@host:port/db`) |
| `AUTH_OKTA_ISSUER` | absolutní URL | OIDC issuer, jehož JWKS API používá k validaci příchozích JWT |
| `AUTH_OKTA_AUDIENCE` | neprázdný string | očekávaný `aud` claim v JWT |
| `CORS_ALLOWED_ORIGINS` | čárkou oddělený seznam absolutních URL | CORS allow-list; žádný wildcard |
| `LOG_LEVEL` | `fatal`\|`error`\|`warn`\|`info`\|`debug`\|`trace` | úroveň logování pro `nestjs-pino` (přijde v pozdější fázi) |

Schéma je psáno tak, aby šlo v dalších fázích **jen přidávat** klíče (Slack, ICS,
throttler) – žádný stávající klíč se nesmí rozvolnit.

### `apps/web` (`apps/web/src/env.ts`)

| proměnná | tvar | k čemu je |
| --- | --- | --- |
| `NODE_ENV` | `development` \| `test` \| `production` | Next.js si ji nastavuje sám pro `dev`/`build`/`start` |
| `NEXT_PUBLIC_API_URL` | absolutní URL | base URL API, na kterou web volá (včetně `/api` prefixu) |
| `AUTH_SECRET` | string, min. 32 znaků | klíč Auth.js pro podpis/šifrování session cookie |
| `AUTH_OKTA_ISSUER` | absolutní URL | stejný OIDC issuer jako u API |
| `AUTH_OKTA_CLIENT_ID` | neprázdný string | OAuth2 client ID webové aplikace |
| `AUTH_OKTA_CLIENT_SECRET` | neprázdný string | OAuth2 client secret webové aplikace |

### Proměnné jen pro `docker-compose.yml`

Tyhle nečte žádná z aplikací – slouží jen ke konfiguraci `postgres` kontejneru. Musí se ručně
shodovat s přihlašovacími údaji zakódovanými v `DATABASE_URL` výše (jedno se neodvozuje od
druhého).

| proměnná | k čemu je |
| --- | --- |
| `POSTGRES_USER` | uživatel vytvořený v `postgres` kontejneru |
| `POSTGRES_PASSWORD` | jeho heslo |
| `POSTGRES_DB` | výchozí databáze |

---

## Kde která proměnná bydlí (dva `.env`, ne jeden)

`.env.example` je jeden soubor v rootu repa, ale reálně z něj vzniknou **dvě** kopie – běh
obou aplikací totiž čte proměnné z různých adresářů (podrobné proč je v
`doc/decision/0009-env-file-topologie-a-compose-profily.md`):

- **root `.env`** – čte ho `docker compose` (substituce v `docker-compose.yml`) a `apps/api`
  spuštěné přes `nx serve api` (NestJS `ConfigModule` čte `.env` relativně k `process.cwd()`,
  což je pro tento Nx exekutor root repa).
- **`apps/web/.env`** – čte ho `apps/web` spuštěné přes `nx run web:dev` / `next build` /
  `next start` (Next.js načítá env soubory relativně ke svému vlastnímu adresáři, ne k rootu
  repa).

```bash
cp .env.example .env
cp .env.example apps/web/.env
```

Skutečné `.env` soubory jsou v `.gitignore` – nikdy se necommitují.

---

## Jak spustit lokální stack

1. Zkopírovat env soubory (viz výše).
2. Nastartovat infrastrukturu (Postgres + mock OIDC; `adminer` navíc v `dev` profilu):

   ```bash
   docker compose --profile dev up -d
   ```

   Bez `--profile dev` naběhnou jen `postgres` a `mock-oauth2-server` – to stačí, pokud
   `adminer` nepotřebujete.

   `web` a `api` v `docker-compose.yml` jsou jen **placeholdery** za profilem `app` – nemají
   ještě produkční Dockerfile (ten vznikne v Tasku 29) a `docker compose up` je bez
   explicitního `--profile app` nespustí. Do té doby se obě aplikace pouští na hostu:

   ```bash
   npx nx run api:serve   # NestJS, port podle PORT v .env (výchozí 3000)
   npx nx run web:dev -- -p 4200   # Next.js; -p 4200, aby nekolidoval s API na 3000
   ```

3. Ověřit, že Postgres je zdravý:

   ```bash
   docker compose ps postgres   # STATUS má obsahovat "healthy"
   ```

4. Ověřit, že mock OIDC server běží – discovery dokument musí odpovědět:

   ```bash
   curl -s http://localhost:8080/default/.well-known/openid-configuration | head -c 200
   ```

   Očekávaná odpověď obsahuje `"issuer":"http://localhost:8080/default"` a URL na
   `authorize`/`token`/`jwks` endpointy. `mock-oauth2-server` (image
   `ghcr.io/navikt/mock-oauth2-server`) běží bez namountovaného `JSON_CONFIG` – vestavěný
   issuer `default` je pro tuhle fázi dostačující.

5. (Volitelně) Otevřít Adminer na `http://localhost:8081` a připojit se k Postgresu pomocí
   `POSTGRES_USER`/`POSTGRES_PASSWORD`/`POSTGRES_DB` z `.env`, host `postgres`, port `5432`.

**Docker démon na vývojovém stroji, kde vznikl tento dokument, neběžel** – ověřeno jen
`docker compose config` (viz níže), `docker compose up` nebylo možné reálně vyzkoušet. Než
to poprvé zkusíte, ověřte aspoň syntaxi bez démona:

```bash
docker compose config
docker compose --profile dev config
docker compose --profile app config
```

---

## Demonstrace fail-fast (bez Dockeru)

### API

```bash
# DATABASE_URL chybí úmyslně
NODE_ENV=development PORT=3000 \
AUTH_OKTA_ISSUER=http://localhost:8080/default AUTH_OKTA_AUDIENCE=api://default \
CORS_ALLOWED_ORIGINS=http://localhost:4200 LOG_LEVEL=info \
node dist/apps/api/main.js
```

Proces skončí s `exit code 1` a chybou `ExceptionHandler`, která jmenuje `DATABASE_URL` a
nikdy nevypisuje žádnou hodnotu.

### Web

```bash
cd apps/web
env -i PATH="$PATH" HOME="$HOME" ../../node_modules/.bin/next start -p 4310
```

Server nahodí HTTP port, ale hned potom instrumentation hook zjistí, že chybí
`NEXT_PUBLIC_API_URL`, `AUTH_SECRET`, `AUTH_OKTA_ISSUER`, `AUTH_OKTA_CLIENT_ID` a
`AUTH_OKTA_CLIENT_SECRET`, vypíše je a proces skončí s `exit code 1`.

Reálné výstupy obou příkazů (z vývojového stroje, bez Dockeru) jsou v
`.superpowers/sdd/implementation-plan/task-2-report.md`.
