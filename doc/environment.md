# Environment – env variables, Docker stack, fail-fast validation

This document describes **what env variables the applications need**, **how to
start the local Docker stack**, and **how dev/e2e differ from production**
(only in variable values, never in code). The source of truth for the shape
of the variables is the Zod schema in `apps/api/src/env.ts` and
`apps/web/src/env.ts` – this document is descriptive, not authoritative; when
they disagree, trust the code.

---

## Philosophy: fail-fast, no test-only branches

Both applications validate their env variables right at startup via a Zod
schema. If a variable is missing or has the wrong shape, the application
**crashes immediately** with a readable message naming the variable (never its
value):

- **`apps/api`** – validation runs inside
  `ConfigModule.forRoot({ validate: validateApiEnv })`
  (`apps/api/src/app/app.module.ts`). A validation failure throws before
  `app.listen()`, so the process never starts accepting requests with an
  invalid configuration.
- **`apps/web`** – validation runs in `apps/web/src/instrumentation.ts` →
  `register()`, which Next.js calls exactly once at server startup (`next
  dev` / `next start`). Next.js itself doesn't terminate the process on an
  error from there (it would keep running and returning 500s), so
  `apps/web/src/instrumentation-node.ts` calls `process.exit(1)` after logging
  the error – making the process just as "dead" as the API's. Details, and
  why this isn't in `next.config.ts`, are in
  `doc/decision/0008-web-env-validation-instrumentation-hook.md`.

**Dev, e2e, and production all run exactly the same code.** Only the variable
values differ – in dev/e2e, `AUTH_OKTA_ISSUER` points at a
`mock-oauth2-server` running in Docker; in production, at the real Okta
issuer. Nowhere in the code is there an `if (isTest)` or any other test-only
shortcut for auth.

---

## Env variables

### `apps/api` (`apps/api/src/env.ts`)

| variable | shape | what it's for |
| --- | --- | --- |
| `NODE_ENV` | `development` \| `test` \| `production` | the standard Node environment switch |
| `PORT` | integer 1–65535 | the port the NestJS HTTP server listens on |
| `DATABASE_URL` | absolute URL | the Postgres connection string (`postgresql://user:pass@host:port/db`) |
| `AUTH_OKTA_ISSUER` | absolute URL | the OIDC issuer whose JWKS API is used to validate incoming JWTs |
| `AUTH_OKTA_AUDIENCE` | non-empty string | the expected `aud` claim in a JWT |
| `CORS_ALLOWED_ORIGINS` | comma-separated list of absolute URLs | the CORS allow-list; no wildcard |
| `LOG_LEVEL` | `fatal`\|`error`\|`warn`\|`info`\|`debug`\|`trace` | the log level for `nestjs-pino` |

The schema is written so that later phases can **only add** keys (Slack, ICS) –
no existing key may be loosened.

#### Operational baseline – keys with a default

These variables are **not required**; when absent, the default from the table is
used. They all belong to the operational baseline described in
`doc/api-operations.md`.

| variable | shape | default | what it's for |
| --- | --- | --- | --- |
| `THROTTLE_TTL_MS` | positive integer (ms) | `60000` | the global rate-limit window |
| `THROTTLE_LIMIT` | positive integer | `300` | requests per window, per route |
| `THROTTLE_STRICT_TTL_MS` | positive integer (ms) | `60000` | the window for the stricter tier (`StrictThrottle()`) |
| `THROTTLE_STRICT_LIMIT` | positive integer | `20` | requests per window for the stricter tier |
| `BODY_LIMIT` | a size **with a unit**, e.g. `100kb` | `100kb` | the maximum request body size |
| `HEALTH_DB_TIMEOUT_MS` | positive integer (ms) | `3000` | how long `/health/ready` waits for `SELECT 1` |

Two things that are easy to miss:

- `BODY_LIMIT` **must carry a unit.** The schema rejects a bare `100`, because to
  the Express body parser that means *one hundred bytes* – which is almost never
  what someone meant to write.
- Times are in **milliseconds** (hence the `_MS` suffix). `@nestjs/throttler` v5
  took seconds and v6 takes milliseconds; the suffix is there so the two cannot
  be confused when reading a `.env`.

**Why these have defaults instead of being required.** `.env.example` belongs to
another task's file set, so a required key would have broken every existing
`.env` with no way to update the example alongside it. The defaults in
`apps/api/src/env.ts` (`ENV_DEFAULTS`) are also the production values, so leaving
these keys out of a `.env` entirely is legitimate.

### `apps/web` (`apps/web/src/env.ts`)

| variable | shape | what it's for |
| --- | --- | --- |
| `NODE_ENV` | `development` \| `test` \| `production` | Next.js sets it itself for `dev`/`build`/`start` |
| `NEXT_PUBLIC_API_URL` | absolute URL | the API's base URL that the web app calls (including the `/api` prefix) |
| `AUTH_SECRET` | string, min. 32 characters | Auth.js's key for signing/encrypting the session cookie |
| `AUTH_OKTA_ISSUER` | absolute URL | the same OIDC issuer as the API's |
| `AUTH_OKTA_CLIENT_ID` | non-empty string | the web app's OAuth2 client ID |
| `AUTH_OKTA_CLIENT_SECRET` | non-empty string | the web app's OAuth2 client secret |

### Variables only for `docker-compose.yml`

Neither application reads these – they only configure the `postgres`
container. They must manually match the credentials encoded in
`DATABASE_URL` above (neither is derived from the other).

| variable | what it's for |
| --- | --- |
| `POSTGRES_USER` | the user created inside the `postgres` container |
| `POSTGRES_PASSWORD` | its password |
| `POSTGRES_DB` | the default database |

---

## Where each variable lives (two `.env` files, not one)

`.env.example` is a single file at the repo root, but in practice it produces
**two** copies – running both applications reads variables from different
directories (the detailed reasoning is in
`doc/decision/0009-env-file-topology-and-compose-profiles.md`):

- **root `.env`** – read by `docker compose` (substitution in
  `docker-compose.yml`) and by `apps/api` when run via `nx serve api` (NestJS's
  `ConfigModule` reads `.env` relative to `process.cwd()`, which for this Nx
  executor is the repo root).
- **`apps/web/.env`** – read by `apps/web` when run via `nx run web:dev` /
  `next build` / `next start` (Next.js loads env files relative to its own
  directory, not the repo root).

```bash
cp .env.example .env
cp .env.example apps/web/.env
```

The actual `.env` files are in `.gitignore` – they are never committed.

---

## How to start the local stack

1. Copy the env files (see above).
2. Start the infrastructure (Postgres + mock OIDC; `adminer` additionally in
   the `dev` profile):

   ```bash
   docker compose --profile dev up -d
   ```

   Without `--profile dev`, only `postgres` and `mock-oauth2-server` come up
   – that's enough if you don't need `adminer`.

   `web` and `api` in `docker-compose.yml` are only **placeholders** behind
   the `app` profile – they have no production Dockerfile yet (that arrives
   in Task 29), and `docker compose up` won't start them without an explicit
   `--profile app`. Until then, both applications run on the host:

   ```bash
   npx nx run api:serve   # NestJS, port per PORT in .env (default 3000)
   npx nx run web:dev -- -p 4200   # Next.js; -p 4200 so it doesn't collide with the API on 3000
   ```

3. Verify Postgres is healthy:

   ```bash
   docker compose ps postgres   # STATUS should include "healthy"
   ```

4. Verify the mock OIDC server is running – the discovery document must
   respond:

   ```bash
   curl -s http://localhost:8080/default/.well-known/openid-configuration | head -c 200
   ```

   The expected response includes `"issuer":"http://localhost:8080/default"`
   and URLs for the `authorize`/`token`/`jwks` endpoints. `mock-oauth2-server`
   (image `ghcr.io/navikt/mock-oauth2-server`) runs without a mounted
   `JSON_CONFIG` – the built-in `default` issuer is sufficient for this phase.

5. (Optional) Open Adminer at `http://localhost:8081` and connect to Postgres
   using `POSTGRES_USER`/`POSTGRES_PASSWORD`/`POSTGRES_DB` from `.env`, host
   `postgres`, port `5432`.

**The Docker daemon on the development machine this document was written on
was not running** – verified only with `docker compose config` (see below);
`docker compose up` could not actually be tried. Before your first attempt, at
least verify the syntax without a daemon:

```bash
docker compose config
docker compose --profile dev config
docker compose --profile app config
```

---

## Demonstrating fail-fast (without Docker)

### API

```bash
# DATABASE_URL is deliberately missing
NODE_ENV=development PORT=3000 \
AUTH_OKTA_ISSUER=http://localhost:8080/default AUTH_OKTA_AUDIENCE=api://default \
CORS_ALLOWED_ORIGINS=http://localhost:4200 LOG_LEVEL=info \
node dist/apps/api/main.js
```

The process exits with `exit code 1` and an `ExceptionHandler` error that
names `DATABASE_URL` and never prints any value. **All** invalid variables are
listed at once, not just the first. The verbatim output is in
`doc/api-operations.md`, section "Behaviour on a missing or invalid env
variable" – including the note that this particular output is not JSON yet.

### Web

```bash
cd apps/web
env -i PATH="$PATH" HOME="$HOME" ../../node_modules/.bin/next start -p 4310
```

The server opens its HTTP port, but right afterward the instrumentation hook
notices that `NEXT_PUBLIC_API_URL`, `AUTH_SECRET`, `AUTH_OKTA_ISSUER`,
`AUTH_OKTA_CLIENT_ID`, and `AUTH_OKTA_CLIENT_SECRET` are missing, prints them,
and the process exits with `exit code 1`.

The actual output of both commands (from the development machine, without
Docker) is in
`.superpowers/sdd/implementation-plan/task-2-report.md`.
