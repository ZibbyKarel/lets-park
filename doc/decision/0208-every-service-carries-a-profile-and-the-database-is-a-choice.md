# 0208 – Every service carries a profile, and the database is a choice

**Date:** 2026-09-03 · **Status:** accepted

## What

No service in `docker-compose.yml` is profile-less any more. `postgres` answers
to `dev` and to `db`; `mock-oauth2-server` and `adminer` to `dev`; `migrate`,
`api` and `web` to `app`. A bare `docker compose up` therefore starts nothing.

`migrate` and `api` declare their dependency on `postgres` as
`condition: service_healthy` **and** `required: false`.

This supersedes point 2 of
`doc/decision/0009-env-file-topology-and-compose-profiles`, which recorded
`postgres` and `mock-oauth2-server` as deliberately profile-less.

## Why

The deployment this file is meant to describe is a single API container, a
single web container, and a database that is very often somebody else's — RDS,
Cloud SQL, a DBA with a backup schedule. Before this change `postgres` had no
profile, so `--profile app` — the production invocation — started a PostgreSQL
container alongside them. At best that container is idle and pays for itself in
memory. At worst it is the one that gets written to: `DATABASE_URL` is a string,
a wrong one resolves inside the compose network before it resolves outside it,
and the failure mode is not an error but a second, plausible-looking database
that quietly diverges from the real one.

Making the database a named choice makes that mistake loud instead of silent.

`required: false` is the mechanism, and it is not optional. Compose validates
`depends_on` against the *whole* file, not against the active profiles, so
profiling `postgres` without it makes the production invocation fail outright:

```
$ docker compose --profile app config --services
service "migrate" depends on undefined service "postgres": invalid compose project
EXIT=1
```

With `required: false` the same command exits 0 and lists `api migrate web`.
The relaxation is only about presence: when the `db` profile *is* on, the
service exists and `service_healthy` is still enforced, so the local ordering —
Postgres healthy, `migrate` exits 0, `api` ready, `web` — is unchanged.

The same reasoning covers the mock issuer, which took `dev` earlier in this task
for a sharper version of the same reason: it signs a token for any subject asked
of it, and a default that starts it is a default that eventually starts it in
production.

## How

- `postgres`: `profiles: ['dev', 'db']`.
- `migrate.depends_on.postgres` and `api.depends_on.postgres`: `required: false`,
  with a comment saying why at each site and the full reasoning on `postgres`.
- The four invocations are listed at the top of `docker-compose.yml` and as a
  table in `README.md` §"Which profile".
- `doc/environment.md` no longer claims that a profile-less `up` starts
  `postgres`; `0009` carries a superseded-in-part note.

**This is the file's one deliberate departure from the task brief**, which asks
literally for "`docker compose up` starts the entire stack". It is stated as a
departure in `docker-compose.yml`'s header and in `README.md` §"Which profile",
which are the two places a reader holding the brief would look. The entire stack
includes the mock issuer; a command that starts it by default is one
`--profile`-less invocation away from an authentication bypass in production.
Naming the profile costs a reader one flag.

## Risk if this is wrong

Somebody runs `docker compose up`, sees nothing start, and concludes the file is
broken. Mitigated by the header comment, which is the first thing in the file
and lists all four invocations.

The narrower risk is `required: false` silently masking a genuinely missing
database — `api` would start, fail its own `DATABASE_URL` check at boot, and
report `/health/ready` 503 rather than being held back by Compose. That is the
correct behaviour for a managed database, which Compose cannot health-check
anyway, and the failure is loud in both the logs and the healthcheck.

## Verified

```
docker compose --env-file .env.docker --profile app config --services
  → api migrate web                                              EXIT 0
docker compose --env-file .env.docker --profile db --profile app config --services
  → api migrate postgres web                                     EXIT 0
docker compose --env-file .env.docker --profile dev config --services
  → adminer mock-oauth2-server postgres                          EXIT 0
docker compose --env-file .env.docker config --services
  → (empty)                                                      EXIT 0
```
