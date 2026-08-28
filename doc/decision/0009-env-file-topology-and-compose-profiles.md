# 0009 – Jeden `.env.example`, tři cíle; `web`/`api` v `docker-compose.yml` za profilem

**Datum:** 2026-08-28 · **Stav:** přijato

## Co

1. Existuje jeden `.env.example` v rootu repa (přesně jak žádá Task 2), ale reálně se z něj
   musí vytvořit **dvě** kopie `.env`, ne jedna: `.env` v rootu (pro `docker compose` a pro
   `apps/api` spouštěné přes `nx serve api`) a `apps/web/.env` (pro `nx run web:dev` / `next
   build` / `next start`).
2. Placeholder služby `web` a `api` v `docker-compose.yml` mají `profiles: ['app']`, takže
   `docker compose up` (bez `--profile`) je nespustí.

## Proč

**1) Dvě kopie `.env`.** `@nestjs/config`'s `ConfigModule.forRoot()` bez `envFilePath` čte
`.env` relativně k `process.cwd()`. Nx exekutor `@nx/js:node`, kterým běží `api:serve`, cwd
nepřepisuje – zůstává root repa – takže root `.env` API stačí. Next.js ale env soubory
(`.env`, `.env.local`, …) načítá relativně k adresáři, ve kterém běží `next` CLI, a
`apps/web`'s `dev` target (inferovaný `@nx/next` pluginem, viz `nx.json`) má explicitně
`"cwd": "apps/web"`. Next tedy hledá `apps/web/.env`, ne root `.env` – ověřeno chováním
build/serve targetů z `project.json`, ne odhadem. Jeden sdílený `.env` v rootu by `apps/web`
prostě neviděl.

**2) `profiles: ['app']` pro `web`/`api`.** Task 2 brief žádá „placeholder služby, build
context připravený, ale skutečné Dockerfiles vzniknou až v Tasku 29". Bez Dockerfilů by
neomezený `docker compose up` skončil chybou (`dockerfile: apps/api/Dockerfile` neexistuje).
Dnešní dev workflow navíc běží obě aplikace na hostu (`nx serve`/`nx dev`), ne v kontejneru –
`docker-compose.yml` v této fázi poskytuje jen infrastrukturu (`postgres`,
`mock-oauth2-server`, volitelně `adminer`). Profil `app` je proto oddělený od profilu `dev`
(ten drží jen `adminer`, přesně podle brief) a od výchozích služeb bez profilu
(`postgres`, `mock-oauth2-server`), které chce mít každý dev pořád po ruce.

## Jak

- `.env.example` (root) má na začátku komentář vysvětlující přesně tohle rozdělení a odkaz na
  `doc/prostredi.md`.
- `doc/prostredi.md`, sekce „Jak spustit" má explicitní `cp .env.example .env && cp
  .env.example apps/web/.env`.
- `docker-compose.yml`: `web`/`api` mají `profiles: ['app']` a komentář odkazující na Task 29;
  `adminer` má `profiles: ['dev']` beze změny; `postgres`/`mock-oauth2-server` bez profilu.
- Ověřeno: `docker compose config` (bez profilu) ukáže jen `postgres` +
  `mock-oauth2-server`; `docker compose --profile app config` ukáže i `web`/`api` a validuje
  i s neexistujícím Dockerfile souborem (`config` nekontroluje, že build context/Dockerfile
  fyzicky existuje – to řeší až `docker compose build`, který v Tasku 29 poprvé poběží).

## Riziko, když je to špatně

Rozdělení `.env` na dvě kopie je snadné zapomenout a nechat `apps/web` běžet s prázdným env –
to se ale projeví okamžitě jako fail-fast pád podle `doc/decision/0008-*`, ne jako tichá
chyba, takže riziko je nízké. Jakmile Task 29 přidá skutečné Dockerfiles a produkční
kontejnerový běh obou aplikací, tahle nesymetrie zmizí sama (produkční kontejner injektuje
env přes `env_file`/orchestrátor, ne přes soubor na disku vedle `next.config.ts`) – tehdy má
smysl `docker-compose.yml`'s `web`/`api` profil `app` odstranit a nechat je jet vždy.
