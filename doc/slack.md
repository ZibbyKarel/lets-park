# Slack notifications and scheduled jobs

What the API tells Slack, when, and what happens when Slack is broken, off, or
scaled to two replicas. Companion documents: `doc/api-operations.md` (logging,
health, shutdown), `doc/waitlist.md` (the promotion this notifies about),
`doc/environment.md` (the variables), `doc/decision/0130-*` and
`doc/decision/0131-*`.

Everything lives in two modules:

| Directory | What it owns |
| --- | --- |
| `apps/api/src/slack/` | the Slack client, the Czech copy, the three notifications, the daily-summary job |
| `apps/api/src/scheduling/` | `ScheduleModule.forRoot()` and `ScheduledJobRunner` — scheduling, which is not a Slack concept |

---

## 1. Outbound only

`plan.md` states this as a scope boundary and it is not a preference: **the API
never accepts anything from Slack.** No slash commands, no interactive Block
Kit, no events subscription, no request-signature verification, and therefore no
`POST /slack/*` route anywhere in `apps/api`. `SlackModule` registers **no
controller**, which is what enforces it — `slack.module.spec.ts` asserts the
module's `controllers` metadata is empty, so adding a handler fails a test
rather than passing review.

Two Slack methods are called, both outbound:

- `chat.postMessage` — every message below.
- `users.lookupByEmail` — to find the Slack account for a promoted user.

`slack.module.spec.ts` also pins that every `@slack/web-api` import in
`apps/api` is inside `slack/`, and that exactly one *shipped* file constructs a
`WebClient`.

---

## 2. The three messages

All copy is **Czech** (`doc/decision/0029-*`), plain text, and lives in
`apps/api/src/slack/slack-messages.ts` — see `doc/decision/0131-*` for why it is
there and not in `libs/i18n`.

| Trigger | Destination | Message |
| --- | --- | --- |
| a cancellation that left the spot free | `SLACK_CHANNEL_ID` | `Uvolnilo se parkovací místo E2.92 na pondělí 28. září 2026. Je volné pro kohokoli.` |
| a waitlist promotion | direct message to the promoted user | `Máte parkovací místo E2.92 na pondělí 28. září 2026. Uvolnilo se a byli jste první ve frontě.` |
| the daily summary | `SLACK_CHANNEL_ID` | `Parkování — pondělí 28. září 2026` + `Volná jsou 3 místa z 9: A1, A2, A3. Ve frontě čekají 2 lidé.` |

**Why "a spot came free" is exactly `reservation:cancelled`.** The realtime
contract already decided this: a cancellation that promoted somebody emits
`reservation:reassigned` *instead of* `reservation:cancelled`, never both
(`libs/contract/src/realtime/events.ts`). So filtering on `reservation:cancelled`
cannot announce a spot that was taken in the same transaction, and nothing in
`SlackDomainEventPublisher` re-derives that rule.

**Czech numeral agreement is real work.** `místo` / `místa` / `míst` and
`čeká` / `čekají` change with the count, in three classes (1, 2–4, 5+). Every
count-bearing phrase is built by a helper and asserted as a whole sentence in
`slack-messages.spec.ts`; a single `${count} míst` template would be wrong for
two thirds of the office.

**Dates** come from `Intl` with the `cs` locale, which is the same ICU data
`libs/i18n/src/lib/dates.ts` reaches through next-intl — so the genitive
(`25. srpna`, not the nominative `srpen`) is correct without a second month
table to drift.

---

## 3. Where the notifications are fired from

Through the **after-commit seam** Task 13 left behind:
`apps/api/src/reservations/reservation-events.ts` declares
`DomainEventPublisher`, and `ReservationsModule` now binds it (`useExisting`) to
`SlackDomainEventPublisher`.

```
ReservationsService.cancel
  └─ committedCancel()              ← the transaction, retried
  ── await resolves = COMMIT ──
  └─ publisher.publish(events)      → freed-spot notice (channel)
  └─ publisher.notifyPromotions(…)  → promotion DM
```

Three properties of that placement matter, and each is exercised:

- **Nothing is sent from inside a transaction.** A Slack message that says
  "your spot is ready" cannot be taken back the way a websocket frame can. In
  `slack.db.spec.ts`, the fake Slack starts a read on a **second connection** at
  the moment it receives the request; finding the cancellation already gone
  proves `COMMIT` had happened first.
- **Exactly once.** `cancel` publishes outside the retry loop, so a transaction
  that lost a race and was retried does not produce two messages.
- **Nothing is awaited.** The publisher fires and forgets, so a user's
  cancellation does not wait on a Slack round trip and its backoff. Every
  detached promise is caught.

### The provider Task 15 also wants

Task 15's Socket.io gateway needs the same `DomainEventPublisher` token for
`publish`. Both branches change the single binding line in
`reservations.module.ts`, so **git will conflict there, deliberately**. The
resolution is a composite provider forwarding to both implementations — not a
choice between them. The shape is written out in the class comment on
`SlackDomainEventPublisher`.

---

## 4. Failure, and why it never reaches a user

`SlackClient` is the only thing in the application that talks to Slack, and it
**never throws**. Callers get an outcome — `delivered`, `disabled`, `failed`,
or (from `SlackNotificationService`) `skipped` — so "a Slack failure never
breaks a domain operation" is true by construction rather than by every call
site remembering a `try`.

### What is retried, and what is not

Slack answers an application-level failure with **`200 OK` and
`{"ok": false, "error": "…"}`**, which `@slack/web-api` converts into a thrown
`WebAPIPlatformError`. Distinguishing that from an HTTP failure is the whole
policy:

| Slack did this | Retryable | Why |
| --- | --- | --- |
| `200 {"ok": false, "error": "channel_not_found"}` | no | Slack understood us and said no. So will the next two calls. |
| `429` with `Retry-After` | yes, after that many seconds | Slack said when to come back. |
| `500` / `503` | yes, exponential backoff | The server's problem, and it may pass. |
| `400` / `404` | no | Ours, and it will not. |
| connection reset, timeout | yes | No answer at all. |

The SDK's own ten-retries-over-thirty-minutes policy is switched off
(`retryConfig: { retries: 0 }`) so this one is ours and is testable.
`slack-client.service.spec.ts` produces **every row of that table from a real
HTTP server the real `WebClient` talks to** — a double that rejected on command
would have proved only what the double was told to do.

### Where a failure shows up

One log line per failed call, at `error` (or `warn` between retries), carrying
`operation`, `attempt`, `slackErrorCode`, `slackError`, `statusCode` and
`retryAfterMs`. Nothing else: no user is shown anything, no request fails, and
no audit row is written — a Slack outage is not a domain event.

---

## 5. The bot token

The token is a **workspace-wide credential**: whoever reads it out of a log can
post as the app into every channel it is in and read every user's email. It
comes only from `SLACK_BOT_TOKEN`, is never in the repo, never in an audit
payload, and never in a log line. Two defences, in order
(`apps/api/src/slack/slack-token-redaction.ts`):

1. **The object that would carry it is never built.** The `WebClient` is
   constructed with `attachOriginalToWebAPIRequestError: false`; without it, a
   transport failure carries the axios request — `Authorization` header included
   — on `error.original`, and pino's `err` serializer copies an error's own
   properties. `SlackClient` also never passes a raw Slack error to the logger:
   `describeSlackFailure` projects it down to scalars.
2. **What is left is scrubbed.** The configured token is removed *by value*, and
   anything shaped like a Slack credential (`xoxb-`, `xoxp-`, `xapp-`, …) is
   removed too, so a second workspace's token in an error string does not sail
   through.

**This is checked by reading real log output.** Every other spec in `apps/api`
pins `LOG_LEVEL: 'fatal'`, which is why no test in this project had ever read a
log line — and how a bearer credential reached the logs in four places on an
earlier task. The Slack specs run a real pino at `trace` into memory
(`apps/api/src/slack/testing/capture-logs.ts`) and assert that the token went out
in the request header and came back in no log line, across a platform error, a
500 and a timeout.

The promoted user's **email** is kept out of the log for the same reason at a
lower stake: the reservation id in the same line identifies the person to anyone
who needs to know.

---

## 6. `SLACK_ENABLED` and how dev avoids a real workspace

`SLACK_ENABLED` defaults to **`false`**, and `.env.example` ships it as `false`.
That single env *value* is what keeps a developer's machine from posting into a
real workspace. There is deliberately **no `NODE_ENV` branch and no "don't
really send" flag** — this project has no test-only branches anywhere
(`doc/environment.md`, and `doc/decision/0130-*` for this specific decision).

The disabled path is the **same code**: every notification still reads its data
and renders its Czech copy, and only the final call stops, at one gate inside
`SlackClient`. A message that would crash while being built therefore crashes in
development too. `slack.db.spec.ts` asserts exactly that — the database read
happens, and zero HTTP requests leave the process.

A team that wants a real Slack in dev points `SLACK_CHANNEL_ID` at a scratch
channel and uses a separate app's token. That is a change of values, not of
code.

---

## 7. The daily summary job

`apps/api/src/slack/daily-summary.job.ts`. A `CronJob` registered through
`SchedulerRegistry` (not the `@Cron` decorator, whose expression must be a
literal — the time is configuration), built from `SLACK_DAILY_SUMMARY_AT` and
`timeZone: 'Europe/Prague'`.

- **"At 08:00 Prague" is not "every 24 hours."** The Prague day is 23 hours long
  on the last Sunday of March and 25 on the last Sunday of October, so an
  interval drifts twice a year and stays wrong until a restart.
  `daily-summary.job.spec.ts` asks the real job for its next fire times across
  both 2026 transitions and asserts each is 08:00 Prague, that the UTC instants
  shift by exactly an hour, and that the neighbouring runs are 23 and 25 hours
  apart.
- **"Today" is a Prague calendar day**, via `todayInPrague()`. At 08:00 the UTC
  date agrees, but the job takes an injectable clock and the time is
  configurable down to 00:30, where it would not.
- **Non-business days are skipped in the body**, not in the cron expression,
  using the same `isBusinessDay` the reservation rules use — a `1-5` cron would
  have covered Saturday and Sunday but not 28 September.
- The job is in `SchedulerRegistry`, which is what stops it on SIGTERM:
  `SchedulerOrchestrator.beforeApplicationShutdown` deletes every registered job
  and `deleteCronJob` stops it, so a pending tick cannot hold the process open.

### `ScheduledJobRunner`

Every job body goes through `apps/api/src/scheduling/scheduled-job-runner.ts`,
which supplies the three things `@nestjs/schedule` does not:

- a body that throws is logged and swallowed, because an unhandled rejection out
  of a timer takes the Node process down;
- a body still running when the next tick arrives is **skipped**, not run
  concurrently;
- shutdown stops accepting new runs and **waits for the in-flight one**,
  registered as a closer on `GracefulShutdownService` so it happens after HTTP
  has drained and before the database pool closes.

### Two instances

**Every replica would run every job.** The overlap guard is a `Map` in one Node
process; it knows nothing about a second process. Two replicas at 08:00 Prague
post the daily summary twice, a millisecond apart. Nothing corrupts — these jobs
only read the database and post to Slack — but a user sees the message twice.

That is a known, accepted limitation of the single-instance MVP (`plan.md`: no
Redis, no BullMQ, no broker). The upgrade path, in the order it should be taken:

1. **Leader election via a PostgreSQL advisory lock.** `pg_try_advisory_lock` at
   the top of `ScheduledJobRunner.run`, released at the end; a replica that does
   not get it skips and logs. The database is already the only shared thing in
   the deployment, so this adds no infrastructure, and it replaces exactly two
   private methods (`claim`/`release`). This is the same shape `LockService`
   documents for cell locks.
2. **A repeatable-job queue (BullMQ on Redis)** if jobs ever need retries across
   a restart, a durable history, or fan-out to workers. Then the cron becomes a
   queue producer and the advisory lock is unnecessary. That is a real
   infrastructure decision and should not be taken merely to avoid a duplicate
   Slack message.

Neither is built now: an unused distributed lock is an abstraction with one
implementation and nothing to check it against.

---

## 8. Setting it up against a real workspace

1. Create a Slack app, add the bot scopes **`chat:write`** and
   **`users:read.email`**, install it to the workspace.
2. Invite the bot to the channel (`/invite @…`), or `chat.postMessage` answers
   `not_in_channel` — which is logged and, correctly, not retried.
3. Set `SLACK_ENABLED=true`, `SLACK_BOT_TOKEN` and `SLACK_CHANNEL_ID`. The API
   refuses to boot if either of the last two is missing.
4. Optionally set `SLACK_DAILY_SUMMARY_AT`. The job logs its schedule and zone
   at startup (`Daily summary job scheduled`), so the configuration is visible
   without waiting until the morning.
