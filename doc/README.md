# `doc/`

Everything written about this project that is not `plan.md`. Two kinds of
document, and the difference matters when you are deciding where to write
something new:

- **Topic documents** (`doc/*.md`) describe **how a part of the system works
  right now**. They are rewritten as the system changes; they carry no history.
- **Decision records** (`doc/decision/*.md`) describe **one choice, once** —
  what was decided, why, how it is implemented, and what it costs. They are
  append-only: a superseded record is not deleted, it is superseded by a new
  one that says so.

`plan.md` (Czech, git-ignored) is the binding specification and outranks
everything here. `doc/implementation-plan.md` is its breakdown into tasks.

This index is generated from the filesystem and accounts for every file under
`doc/`: 22 topic documents, 181 decision records, and `doc/design/`.

---

## Topic documents

| Document | What it is for |
| --- | --- |
| [`admin.md`](admin.md) | The `/sprava` section: the four admin tabs — day lot, users, spots, reservation window — and what each one may change. |
| [`api-modules.md`](api-modules.md) | How `apps/api` serves the contract: the oRPC transport, the domain modules behind it, and the rule each module owns. |
| [`api-operations.md`](api-operations.md) | The API's operational baseline: startup, structured logging, the `/health/*` probes, graceful shutdown, throttling and input limits. |
| [`auth.md`](auth.md) | How a person becomes an identified caller — Okta sign-in in `apps/web`, JWKS validation in `apps/api`, JIT provisioning, refresh, and what is public. |
| [`bulk-reservation.md`](bulk-reservation.md) | The bulk allocator: `reservation.previewBulk` / `confirmBulk`, how a month's days are assigned, and the transaction that confirms them. |
| [`bulk-reservation-modal.md`](bulk-reservation-modal.md) | The front end of that allocator — the `Hromadná rezervace` modal in `apps/web/src/lot/`. |
| [`contract.md`](contract.md) | `libs/contract`, the single source of truth for every FE↔BE shape, and how to add a schema, a procedure or an error to it. |
| [`database.md`](database.md) | The PostgreSQL schema, Prisma 7 setup, migrations, the development seed, and backups. |
| [`design-system.md`](design-system.md) | The tokens and primitives layers: what a token is, how the CSS is generated, and what a primitive may and may not know. |
| [`environment.md`](environment.md) | Every environment variable the two apps need, how the local Docker stack is started, and how dev, e2e and production differ (values only, never code). |
| [`frontend.md`](frontend.md) | `apps/web`: the route tree, the single client boundary, provider order, the sign-in flow and the screen states. |
| [`i18n.md`](i18n.md) | `libs/i18n` — the only place allowed to import `next-intl` — and how Czech UI copy is organised. |
| [`open-items.md`](open-items.md) | Everything the build deliberately left undone: deferred minors, parked findings, and the two gaps where an enforcement mechanism does not actually enforce. |
| [`ics.md`](ics.md) | The personal calendar subscription: what the feed serves, how its URL is authenticated, and what has been verified about it. |
| [`implementation-plan.md`](implementation-plan.md) | `plan.md` broken into dispatchable tasks. The plan of record for what is built when. |
| [`realtime.md`](realtime.md) | The Socket.io connection: the rooms, the events, the cell lock, and what the client does with each broadcast. |
| [`rulings.md`](rulings.md) | The 103 judgment calls the implementation run made where `plan.md` was silent — what was decided, why, and what each costs if it is wrong. |
| [`slack.md`](slack.md) | The outbound-only Slack notifications and the scheduled jobs that carry them: what the API tells Slack, when, and what happens when Slack is broken, off, or scaled. |
| [`testing.md`](testing.md) | The four test layers, what each is for, how to run it, and what must be running first. |
| [`waitlist.md`](waitlist.md) | Reservations, the queue, and the auto-promotion that hands a cancelled spot to the next person in the same transaction. |
| [`workspace.md`](workspace.md) | The Nx monorepo: project layout, the checks, the module boundaries, and how to add a lib that is governed by them. |
| [`wrappers.md`](wrappers.md) | The mandatory wrapper libs — form, api-client, query, auth, realtime-client, calendar-export — and why app code may never import their dependencies directly. |

## `doc/design/`

The finished visual design, downloaded locally so it does not depend on a link
staying alive (`doc/decision/0002-visual-design-source-of-truth`).

| Path | What it is |
| --- | --- |
| [`design/README.md`](design/README.md) | What was exported, from where, and how to read it. |
| `design/lets-park-design.dc.html` | The design canvas itself. |
| `design/ds/colors_and_type.css`, `design/ds/support.js` | The source palette and type scale the tokens were derived from. |
| `design/ds/fonts/*.otf` | Eight Neue Haas Grotesk faces (`doc/decision/0012-otf-fonts-committed-without-verified-license`). |
| `design/screens/*.png` | 14 numbered screen exports plus two canvas overviews — the reference every screen was built against. |

## Decision records

**Cite a record by its full slug, never by `NNNN-*`.** Five numbers are used
twice — 0011, 0012, 0013, 0024 and 0025 — and are deliberately not renumbered;
the slugs are unique. See
[`0207-duplicate-decision-numbers-are-kept-and-citations-carry-slugs`](decision/0207-duplicate-decision-numbers-are-kept-and-citations-carry-slugs.md)
for why, and take the next number from the end of this list.

- [`0001-parallel-subagent-execution`](decision/0001-parallel-subagent-execution.md) — Parallel phase execution via git worktrees
- [`0002-visual-design-source-of-truth`](decision/0002-visual-design-source-of-truth.md) — Visual design: downloaded locally, tokens from the Shoptet DS
- [`0003-date-helpers-in-shared-types`](decision/0003-date-helpers-in-shared-types.md) — Europe/Prague date logic lives in `libs/shared-types`, not `libs/i18n`
- [`0004-mvp-scope-includes-design-features`](decision/0004-mvp-scope-includes-design-features.md) — MVP scope also includes features that exist only in the design
- [`0005-npm-scope-lets-park`](decision/0005-npm-scope-lets-park.md) — The npm scope is `@lets-park`, not `@myorg`
- [`0006-nx-layout-project-json-and-path-aliases`](decision/0006-nx-layout-project-json-and-path-aliases.md) — Nx layout: `project.json` + path aliases in `tsconfig.base.json`
- [`0007-eslint-boundaries-ds-tags-and-contract`](decision/0007-eslint-boundaries-ds-tags-and-contract.md) — ESLint boundaries: the `ds:*` tag dimension and external contract imports
- [`0008-web-env-validation-instrumentation-hook`](decision/0008-web-env-validation-instrumentation-hook.md) — Web env-variable validation lives in `instrumentation.ts`, not `next.config.ts`
- [`0009-env-file-topology-and-compose-profiles`](decision/0009-env-file-topology-and-compose-profiles.md) — One `.env.example`, three targets; `web`/`api` in `docker-compose.yml` sit behind a profile
- [`0010-generated-tokens-css-is-committed`](decision/0010-generated-tokens-css-is-committed.md) — The generated `tokens.css` is committed and excluded from Prettier
- [`0011-breakpoints-are-derived`](decision/0011-breakpoints-are-derived.md) — Breakpoints are derived, not sourced
- [`0011-derived-control-tokens-and-rounding`](decision/0011-derived-control-tokens-and-rounding.md) — Derived control tokens and rounding dimensions from the design
- [`0012-focus-ring-and-native-elements-in-primitives`](decision/0012-focus-ring-and-native-elements-in-primitives.md) — An extra focus ring beyond the design, and native elements in the primitives
- [`0012-otf-fonts-committed-without-verified-license`](decision/0012-otf-fonts-committed-without-verified-license.md) — `.otf` fonts are committed without a verified license, with a mandatory fallback
- [`0013-calendar-arithmetic-and-single-timezone-boundary`](decision/0013-calendar-arithmetic-and-single-timezone-boundary.md) — Date arithmetic is calendar-based; the timezone is resolved at a single boundary
- [`0013-storybook-10-without-nx-storybook-and-without-addons`](decision/0013-storybook-10-without-nx-storybook-and-without-addons.md) — Storybook 10 configured by hand, without `@nx/storybook` and without addons
- [`0014-dateonly-is-an-unbranded-string`](decision/0014-dateonly-is-an-unbranded-string.md) — `DateOnly` is an unbranded `string`
- [`0015-timestamps-in-contract-are-iso-strings`](decision/0015-timestamps-in-contract-are-iso-strings.md) — Timestamps in the contract are ISO strings, not `Date`
- [`0016-closed-enums-and-uuid-in-contract`](decision/0016-closed-enums-and-uuid-in-contract.md) — Closed enums in the contract: AuditLog actions and UUID identifiers
- [`0017-npm-allowlist-on-type-dimension-and-tag-layer-foundation`](decision/0017-npm-allowlist-on-type-dimension-and-tag-layer-foundation.md) — The npm allow-list hangs off the `type:` dimension; `libs/shared-types` gets `layer:foundation`
- [`0018-mapping-error-contract-to-orpc`](decision/0018-mapping-error-contract-to-orpc.md) — The error contract maps onto oRPC 1:1, `details` = `data`
- [`0019-draft-and-confirm-bulk-reservation`](decision/0019-draft-and-confirm-bulk-reservation.md) — The bulk-reservation preview and confirmation share a shape; the client computes the diff
- [`0020-orpc-is-esm-only-jest-must-transpile-it`](decision/0020-orpc-is-esm-only-jest-must-transpile-it.md) — `@orpc/contract` is ESM-only; Jest has to transpile it
- [`0021-declared-error-must-have-a-reachable-trigger`](decision/0021-declared-error-must-have-a-reachable-trigger.md) — A declared error must have a reachable trigger
- [`0022-realtime-event-names-and-one-transaction-one-event`](decision/0022-realtime-event-names-and-one-transaction-one-event.md) — Realtime event names and the rule "one transaction = one event"
- [`0023-realtime-is-a-separate-entry-point-and-maps-are-derived`](decision/0023-realtime-is-a-separate-entry-point-and-maps-are-derived.md) — Realtime is a separate entry point, and its event maps are derived from a registry
- [`0024-czech-month-declension-genitive-vs-nominative`](decision/0024-czech-month-declension-genitive-vs-nominative.md) — Czech month declension: genitive vs. nominative in `libs/i18n`
- [`0024-prisma-client-inside-libs-database-and-committed`](decision/0024-prisma-client-inside-libs-database-and-committed.md) — The Prisma client is generated inside `libs/database` and committed
- [`0025-next-intl-esm-jest-transform`](decision/0025-next-intl-esm-jest-transform.md) — `next-intl` is ESM-only; Jest in `libs/i18n` must also transpile `@orpc`
- [`0025-uuid-v7-as-primary-key`](decision/0025-uuid-v7-as-primary-key.md) — Primary keys are client-generated UUID v7
- [`0026-singleton-settings-enforced-by-check-constraint`](decision/0026-singleton-settings-enforced-by-check-constraint.md) — The `ReservationWindowSettings` singleton is enforced by a `CHECK` constraint
- [`0027-hard-delete-and-append-only-auditlog`](decision/0027-hard-delete-and-append-only-auditlog.md) — Hard delete + an append-only `AuditLog`, instead of soft delete
- [`0028-nodeenv-must-not-leak-into-next-build-from-env-files`](decision/0028-nodeenv-must-not-leak-into-next-build-from-env-files.md) — `NODE_ENV` must not reach `next build` from `.env` files
- [`0029-documentation-is-english-ui-copy-stays-czech`](decision/0029-documentation-is-english-ui-copy-stays-czech.md) — Documentation is written in English; UI copy stays in Czech
- [`0030-form-field-is-a-generic-render-prop-not-a-primitive-import`](decision/0030-form-field-is-a-generic-render-prop-not-a-primitive-import.md) — `FormField` is a generic render prop; `libs/form` does not import the design system
- [`0031-use-app-form-parameterized-by-tin-tout`](decision/0031-use-app-form-parameterized-by-tin-tout.md) — `useAppForm` is parameterized by `TIn`/`TOut`, not by `TSchema` — no cast
- [`0032-p2002-maps-by-meta-target`](decision/0032-p2002-maps-by-meta-target.md) — Prisma `P2002` is mapped to a contract code by `meta.target`
- [`0033-transport-errors-keep-the-nest-shape`](decision/0033-transport-errors-keep-the-nest-shape.md) — Transport errors keep Nest's shape; unknown errors return a bare 500
- [`0034-one-registered-throttler-strict-tier-is-an-override`](decision/0034-one-registered-throttler-strict-tier-is-an-override.md) — Only one throttler is registered; the stricter tier is an override
- [`0035-liveness-does-not-touch-the-database-readiness-does-with-a-timeout`](decision/0035-liveness-does-not-touch-the-database-readiness-does-with-a-timeout.md) — `/health/live` does not touch the database, `/health/ready` does – with a timeout
- [`0036-logs-are-always-json-no-pretty-transport`](decision/0036-logs-are-always-json-no-pretty-transport.md) — Logs are always JSON, even in development; no pretty transport
- [`0037-libs-query-tests-need-nodes-fetch-not-jsdoms`](decision/0037-libs-query-tests-need-nodes-fetch-not-jsdoms.md) — `libs/query`'s tests run on Node's fetch, not jsdom's, via a custom Jest environment
- [`0038-libs-query-spec-tsconfig-must-not-be-commonjs`](decision/0038-libs-query-spec-tsconfig-must-not-be-commonjs.md) — `libs/query/tsconfig.spec.json` must not set `module: commonjs`
- [`0039-contract-errors-are-read-by-code-not-by-orpcs-defined-flag`](decision/0039-contract-errors-are-read-by-code-not-by-orpcs-defined-flag.md) — A contract error is recognised by its code, not by oRPC's `defined` flag
- [`0040-contract-exports-the-applied-client-type-not-the-orpc-builder`](decision/0040-contract-exports-the-applied-client-type-not-the-orpc-builder.md) — `libs/contract` exports the applied client type; `@orpc/contract` stays out of `type:util`
- [`0041-auth-failures-401-transport-403-contract`](decision/0041-auth-failures-401-transport-403-contract.md) — Authentication failure is a transport 401; a deactivated user is the contract's FORBIDDEN
- [`0042-one-jwks-client-shared-by-http-and-websocket`](decision/0042-one-jwks-client-shared-by-http-and-websocket.md) — One JWKS client and one rule set, shared by the HTTP guard and the WebSocket handshake
- [`0043-jwks-endpoint-from-oidc-discovery`](decision/0043-jwks-endpoint-from-oidc-discovery.md) — The JWKS endpoint comes from OIDC discovery, and a cache miss never becomes a bypass
- [`0044-jit-provisioning-email-fallback-rebinds-oktaid`](decision/0044-jit-provisioning-email-fallback-rebinds-oktaid.md) — JIT provisioning matches on `oktaId`, falls back to `email`, and lets the database settle races
- [`0045-the-token-endpoint-is-discovered-not-configured`](decision/0045-the-token-endpoint-is-discovered-not-configured.md) — The token endpoint and its client-authentication method come from OIDC discovery
- [`0046-libs-auth-has-a-separate-client-entry-point`](decision/0046-libs-auth-has-a-separate-client-entry-point.md) — `libs/auth` has two entry points, server and client
- [`0047-the-access-token-crosses-to-the-browser-the-refresh-token-does-not`](decision/0047-the-access-token-crosses-to-the-browser-the-refresh-token-does-not.md) — The access token crosses to the browser; the refresh token never does
- [`0048-a-failed-refresh-fails-closed-and-signs-out`](decision/0048-a-failed-refresh-fails-closed-and-signs-out.md) — A failed refresh drops the token and signs the user out, rather than retrying or serving a stale bearer
- [`0049-the-session-is-polled-because-rotation-only-runs-when-it-is-read`](decision/0049-the-session-is-polled-because-rotation-only-runs-when-it-is-read.md) — `AuthProvider` polls the session, because rotation only happens when the session is read
- [`0050-next-auth-v5-is-pinned-to-a-beta`](decision/0050-next-auth-v5-is-pinned-to-a-beta.md) — `next-auth` is pinned to an exact v5 **beta**, and `latest` must never be taken
- [`0051-concurrent-refreshes-are-coalesced-in-process-only`](decision/0051-concurrent-refreshes-are-coalesced-in-process-only.md) — Concurrent token renewals are coalesced in-process only; the cross-process race is accepted for the MVP
- [`0052-overlay-tokens-and-one-layering-scale`](decision/0052-overlay-tokens-and-one-layering-scale.md) — Overlay tokens and one layering scale
- [`0053-modal-focus-trap-is-manual-not-native-dialog`](decision/0053-modal-focus-trap-is-manual-not-native-dialog.md) — The modal's focus trap is manual, not a native `<dialog>`
- [`0054-keyboard-navigation-for-dropdown-and-tabs`](decision/0054-keyboard-navigation-for-dropdown-and-tabs.md) — Keyboard navigation for Dropdown and Tabs
- [`0055-toast-and-tooltip-are-presentational`](decision/0055-toast-and-tooltip-are-presentational.md) — Toast and Tooltip are purely presentational
- [`0056-escape-goes-to-the-innermost-open-layer`](decision/0056-escape-goes-to-the-innermost-open-layer.md) — Escape goes to the innermost open layer
- [`0057-one-nest-route-per-procedure-over-the-rpc-protocol`](decision/0057-one-nest-route-per-procedure-over-the-rpc-protocol.md) — One Nest route per procedure over oRPC's RPC protocol, not `@orpc/nest`'s `@Implement`
- [`0058-error-bodies-on-rpc-routes-carry-the-rpc-envelope`](decision/0058-error-bodies-on-rpc-routes-carry-the-rpc-envelope.md) — Error bodies on `/api/rpc` routes carry the RPC envelope; everywhere else they do not
- [`0059-reservation-window-changes-get-their-own-audit-action`](decision/0059-reservation-window-changes-get-their-own-audit-action.md) — A reservation-window change gets its own audit action
- [`0060-the-websocket-token-is-a-handshake-callback-not-a-query-string`](decision/0060-the-websocket-token-is-a-handshake-callback-not-a-query-string.md) — The websocket token is a handshake callback, not a query string
- [`0061-a-refused-handshake-is-a-terminal-status-recovered-by-a-new-socket`](decision/0061-a-refused-handshake-is-a-terminal-status-recovered-by-a-new-socket.md) — A refused handshake is a terminal status, recovered by building a new socket
- [`0062-the-cell-lock-heartbeat-uses-socket-ios-ack-timeout`](decision/0062-the-cell-lock-heartbeat-uses-socket-ios-ack-timeout.md) — The cell-lock heartbeat uses Socket.io's ack timeout, so a lost acknowledgement cannot end it
- [`0063-transport-reconnection-stays-unlimited`](decision/0063-transport-reconnection-stays-unlimited.md) — Transport reconnection stays unlimited; only handshake refusals have a ceiling
- [`0064-a-non-business-day-is-validation-failed`](decision/0064-a-non-business-day-is-validation-failed.md) — A weekend or public holiday is `VALIDATION_FAILED`, not a new error code
- [`0065-cancellation-retries-a-deadlock-not-just-a-p2002`](decision/0065-cancellation-retries-a-deadlock-not-just-a-p2002.md) — A cancellation retries a deadlock, not just the promotion's `P2002`
- [`0066-the-database-suite-gets-its-own-database`](decision/0066-the-database-suite-gets-its-own-database.md) — The database-backed suite gets its own database, not a rollback
- [`0070-datatable-is-a-real-table-not-a-grid`](decision/0070-datatable-is-a-real-table-not-a-grid.md) — `DataTable` renders a real `<table>`, not the design's CSS grid
- [`0071-empty-state-and-confirm-dialog-are-invented`](decision/0071-empty-state-and-confirm-dialog-are-invented.md) — `EmptyState` and `ConfirmDialog` are invented, not drawn
- [`0072-sorting-is-a-two-state-toggle-behind-a-wrapper-type`](decision/0072-sorting-is-a-two-state-toggle-behind-a-wrapper-type.md) — Sorting is a two-state toggle, and no TanStack type crosses the wrapper
- [`0080-the-ics-feed-answers-404-not-401`](decision/0080-the-ics-feed-answers-404-not-401.md) — 0080 — The ICS feed answers 404, never 401
- [`0081-the-rendered-feed-is-a-pure-function-of-the-data`](decision/0081-the-rendered-feed-is-a-pure-function-of-the-data.md) — 0081 — The rendered feed is a pure function of the data, so `ETag` works
- [`0082-czech-ics-copy-lives-in-libs-calendar-export`](decision/0082-czech-ics-copy-lives-in-libs-calendar-export.md) — 0082 — The feed's Czech copy lives in `libs/calendar-export`, not in `libs/i18n`
- [`0090-a-weekend-inside-a-bulk-request-is-a-per-day-fact`](decision/0090-a-weekend-inside-a-bulk-request-is-a-per-day-fact.md) — A weekend inside a bulk request is a per-day fact, not a rejected request
- [`0091-joining-a-waitlist-is-its-own-audit-action`](decision/0091-joining-a-waitlist-is-its-own-audit-action.md) — Joining a waitlist is its own audit action
- [`0092-bulk-confirmation-writes-in-date-order-and-never-lets-a-statement-fail`](decision/0092-bulk-confirmation-writes-in-date-order-and-never-lets-a-statement-fail.md) — Bulk confirmation writes in date order and never lets a statement fail
- [`0100-the-session-check-lives-in-proxy-ts-on-the-node-runtime`](decision/0100-the-session-check-lives-in-proxy-ts-on-the-node-runtime.md) — The session check lives in `proxy.ts`, on the Node runtime
- [`0101-three-endpoints-are-derived-from-one-api-url`](decision/0101-three-endpoints-are-derived-from-one-api-url.md) — Three endpoints are derived from one API URL, and none of them is it
- [`0102-the-web-app-reads-raw-process-env-in-auth-ts`](decision/0102-the-web-app-reads-raw-process-env-in-auth-ts.md) — `auth.ts` reads raw `process.env`, so `next build` stays env-free
- [`0103-the-webs-health-route-is-a-readiness-probe-for-the-pair`](decision/0103-the-webs-health-route-is-a-readiness-probe-for-the-pair.md) — `/api/health` is a readiness probe for the pair, not a liveness probe
- [`0110-the-cell-lock-ttl-is-thirty-seconds-and-configurable`](decision/0110-the-cell-lock-ttl-is-thirty-seconds-and-configurable.md) — The cell-lock TTL is 30 s, it comes from the environment, and the client's renewal budget fits inside it
- [`0111-a-lapsed-hold-is-broadcast-because-the-client-does-not-poll`](decision/0111-a-lapsed-hold-is-broadcast-because-the-client-does-not-poll.md) — A lapsed hold is broadcast, because the client deliberately does not poll
- [`0112-the-handshake-is-namespace-middleware-so-a-refusal-is-a-connect-error`](decision/0112-the-handshake-is-namespace-middleware-so-a-refusal-is-a-connect-error.md) — The handshake is authenticated in namespace middleware, so a refusal is a CONNECT_ERROR
- [`0113-socket-io-path-moves-into-the-shared-contract`](decision/0113-socket-io-path-moves-into-the-shared-contract.md) — `SOCKET_IO_PATH` moves into `@lets-park/contract/realtime`
- [`0120-canreserve-is-the-backends-answer-not-a-window-rederivation`](decision/0120-canreserve-is-the-backends-answer-not-a-window-rederivation.md) — `canReserve` is the backend's answer; the lot never re-derives it from the window
- [`0121-the-banner-quotes-a-window-date-only-under-auto`](decision/0121-the-banner-quotes-a-window-date-only-under-auto.md) — The window banner quotes a date only under `lockMode: 'AUTO'`
- [`0122-the-window-banner-is-always-rendered`](decision/0122-the-window-banner-is-always-rendered.md) — The window banner is always rendered; `showLockState` is not a hiding rule
- [`0123-realtime-patches-the-cache-and-invalidates-what-a-broadcast-cannot-carry`](decision/0123-realtime-patches-the-cache-and-invalidates-what-a-broadcast-cannot-carry.md) — A broadcast patches the cache, and additionally invalidates what it is not allowed to carry
- [`0124-other-users-cell-locks-are-component-state-not-query-data`](decision/0124-other-users-cell-locks-are-component-state-not-query-data.md) — Other users' cell locks are component state, not query data
- [`0125-the-admin-ellipsis-opens-the-same-dialog-on-purpose`](decision/0125-the-admin-ellipsis-opens-the-same-dialog-on-purpose.md) — The admin `⋯` opens the same dialog `onOpen` does, on purpose
- [`0126-a-childs-exclude-must-be-set-explicitly-or-it-silently-inherits-the-parents`](decision/0126-a-childs-exclude-must-be-set-explicitly-or-it-silently-inherits-the-parents.md) — A child tsconfig's `exclude` must be set explicitly, or it silently inherits the parent's
- [`0130-slack-is-off-by-default-and-there-is-no-dev-only-branch`](decision/0130-slack-is-off-by-default-and-there-is-no-dev-only-branch.md) — Slack is off by an env value, not by a dev-only branch
- [`0131-slack-czech-copy-stays-in-the-slack-module`](decision/0131-slack-czech-copy-stays-in-the-slack-module.md) — Slack's Czech copy stays in `apps/api/src/slack/`, and there is still no backend catalog
- [`0132-the-per-attempt-timeout-is-slackclients-own-not-axioss`](decision/0132-the-per-attempt-timeout-is-slackclients-own-not-axioss.md) — The per-attempt Slack timeout is `SlackClient`'s own timer, not axios's
- [`0135-the-after-commit-seam-is-a-composite-not-a-choice`](decision/0135-the-after-commit-seam-is-a-composite-not-a-choice.md) — The after-commit seam is a composite, not a choice between Socket.io and Slack
- [`0140-the-day-bar-is-its-own-file`](decision/0140-the-day-bar-is-its-own-file.md) — The day bar is its own file
- [`0141-the-old-room-unsubscribe-is-proven-at-the-hook-that-derives-both`](decision/0141-the-old-room-unsubscribe-is-proven-at-the-hook-that-derives-both.md) — The old-room unsubscribe is proven at the hook that derives both
- [`0150-settings-renders-as-a-modal-not-a-page`](decision/0150-settings-renders-as-a-modal-not-a-page.md) — `/nastaveni` renders as a `Modal`, not a bespoke dialog shell
- [`0151-ics-subscription-lives-in-the-settings-modal`](decision/0151-ics-subscription-lives-in-the-settings-modal.md) — The ICS subscription section lives inside the settings modal
- [`0160-the-users-table-gets-an-active-switch-the-design-does-not-draw`](decision/0160-the-users-table-gets-an-active-switch-the-design-does-not-draw.md) — The users table gets an "Aktivní" switch the design does not draw
- [`0161-the-admin-day-tab-summarises-the-lot-it-does-not-redraw-it`](decision/0161-the-admin-day-tab-summarises-the-lot-it-does-not-redraw-it.md) — The admin day tab summarises the lot; it does not redraw it
- [`0162-the-user-search-filters-the-loaded-list`](decision/0162-the-user-search-filters-the-loaded-list.md) — The user search filters the loaded list, it does not refetch
- [`0163-smazat-retires-a-spot-and-says-so-when-it-cannot`](decision/0163-smazat-retires-a-spot-and-says-so-when-it-cannot.md) — "Smazat" retires a spot, and says so when it cannot
- [`0164-parking-categories-stay-a-closed-enum`](decision/0164-parking-categories-stay-a-closed-enum.md) — Parking categories stay a closed enum; the band counts, it does not edit
- [`0165-admin-failure-copy-is-keyed-by-operation-not-by-code`](decision/0165-admin-failure-copy-is-keyed-by-operation-not-by-code.md) — Admin failure copy is keyed by (operation, code), not by code alone
- [`0166-the-reservation-window-form-saves-on-change`](decision/0166-the-reservation-window-form-saves-on-change.md) — The reservation-window form saves on change, and keeps one audit action
- [`0167-a-spot-failure-belongs-to-one-attempt-and-dies-with-it`](decision/0167-a-spot-failure-belongs-to-one-attempt-and-dies-with-it.md) — A spot failure belongs to one attempt, and dies with it
- [`0168-the-admin-tables-do-not-show-who-is-editing-a-spot`](decision/0168-the-admin-tables-do-not-show-who-is-editing-a-spot.md) — The admin tables do not show who is editing a spot
- [`0170-the-confirmed-schedule-is-laid-against-the-proposal-and-never-swallowed`](decision/0170-the-confirmed-schedule-is-laid-against-the-proposal-and-never-swallowed.md) — The confirmed schedule is laid against the proposal, and a difference is never swallowed
- [`0171-bulk-failures-get-their-own-copy-not-the-shared-error-namespace`](decision/0171-bulk-failures-get-their-own-copy-not-the-shared-error-namespace.md) — Bulk failures get their own Czech copy, one sentence per code
- [`0172-the-preferred-spot-label-has-four-states-not-two`](decision/0172-the-preferred-spot-label-has-four-states-not-two.md) — The preferred-spot label has four states, not two
- [`0173-the-locked-month-is-blocked-in-the-modal-not-only-hidden-in-the-header`](decision/0173-the-locked-month-is-blocked-in-the-modal-not-only-hidden-in-the-header.md) — The locked month is blocked in the modal, not only hidden in the header
- [`0174-the-czech-locative-month-is-a-table-because-intl-has-no-third-form`](decision/0174-the-czech-locative-month-is-a-table-because-intl-has-no-third-form.md) — The Czech locative month name is a hand-written table, because `Intl` has no third form
- [`0175-the-month-window-answer-is-its-own-contract-field`](decision/0175-the-month-window-answer-is-its-own-contract-field.md) — The month-window answer is its own contract field, because `canReserve` is per-day
- [`0176-the-locked-month-gate-never-guards-a-finished-result`](decision/0176-the-locked-month-gate-never-guards-a-finished-result.md) — The locked-month gate guards entry and confirmation, never the display of a finished result
- [`0180-the-e2e-login-types-the-claims-the-mock-issuer-does-not-mint`](decision/0180-the-e2e-login-types-the-claims-the-mock-issuer-does-not-mint.md) — The e2e login types the claims the mock issuer does not mint
- [`0181-the-e2e-suite-books-into-next-month-through-a-real-admin-setting`](decision/0181-the-e2e-suite-books-into-next-month-through-a-real-admin-setting.md) — The e2e suite books into next month, through a real admin setting
- [`0182-the-e2e-suite-runs-on-chromium-only`](decision/0182-the-e2e-suite-runs-on-chromium-only.md) — The e2e suite runs on Chromium only
- [`0183-one-navigation-carries-a-longer-timeout-for-a-reused-dev-server`](decision/0183-one-navigation-carries-a-longer-timeout-for-a-reused-dev-server.md) — One navigation carries a longer timeout, for the run that meets a dev server
- [`0184-the-e2e-database-fixture-is-a-subprocess-not-an-import`](decision/0184-the-e2e-database-fixture-is-a-subprocess-not-an-import.md) — The e2e database fixture is a subprocess, not an import
- [`0185-storage-state-is-regenerated-every-run-and-never-committed`](decision/0185-storage-state-is-regenerated-every-run-and-never-committed.md) — `storageState` is regenerated every run and never committed
- [`0186-the-e2e-suite-cannot-raise-the-api-throttle-limits`](decision/0186-the-e2e-suite-cannot-raise-the-api-throttle-limits.md) — The e2e suite cannot raise the API throttle limits
- [`0187-the-browser-e2e-suite-runs-against-the-built-app-not-next-dev`](decision/0187-the-browser-e2e-suite-runs-against-the-built-app-not-next-dev.md) — The browser e2e suite runs against the built app, not `next dev`
- [`0188-a-realtime-scenario-waits-for-the-day-room-before-it-acts`](decision/0188-a-realtime-scenario-waits-for-the-day-room-before-it-acts.md) — A realtime scenario waits for the day room before it acts
- [`0189-the-sign-out-spec-keeps-an-assertion-that-fails-about-once-in-ten`](decision/0189-the-sign-out-spec-keeps-an-assertion-that-fails-about-once-in-ten.md) — The sign-out spec keeps an assertion that fails about once in ten
- [`0200-production-images-run-non-root-over-code-they-cannot-write`](decision/0200-production-images-run-non-root-over-code-they-cannot-write.md) — Production images run non-root over code they cannot write
- [`0201-the-issuer-url-must-be-one-name-on-both-sides-of-the-network`](decision/0201-the-issuer-url-must-be-one-name-on-both-sides-of-the-network.md) — The issuer URL must be one name on both sides of the network
- [`0202-auth-url-is-required-in-a-container-because-the-request-url-is-the-bind-address`](decision/0202-auth-url-is-required-in-a-container-because-the-request-url-is-the-bind-address.md) — `AUTH_URL` is required in a container, because the request URL is the bind address
- [`0203-the-apis-runtime-modules-are-installed-with-npm-install-not-npm-ci`](decision/0203-the-apis-runtime-modules-are-installed-with-npm-install-not-npm-ci.md) — The API's runtime modules are installed with `npm install`, not `npm ci`
- [`0204-migrations-are-a-one-shot-image-not-the-apis-entrypoint`](decision/0204-migrations-are-a-one-shot-image-not-the-apis-entrypoint.md) — Migrations are a one-shot image, not the API's entrypoint
- [`0205-the-app-profile-names-every-variable-it-passes`](decision/0205-the-app-profile-names-every-variable-it-passes.md) — The app profile names every variable it passes, and has its own env file
- [`0206-ci-runs-the-database-suites-against-a-real-postgres`](decision/0206-ci-runs-the-database-suites-against-a-real-postgres.md) — CI runs the database suites against a real PostgreSQL
- [`0207-duplicate-decision-numbers-are-kept-and-citations-carry-slugs`](decision/0207-duplicate-decision-numbers-are-kept-and-citations-carry-slugs.md) — Duplicate decision numbers are kept; citations carry slugs
- [`0208-every-service-carries-a-profile-and-the-database-is-a-choice`](decision/0208-every-service-carries-a-profile-and-the-database-is-a-choice.md) — Every service carries a profile, and the database is a choice
- [`0220-giving-a-hold-back-is-keyed-by-the-connection-taking-it-is-not`](decision/0220-giving-a-hold-back-is-keyed-by-the-connection-taking-it-is-not.md) — Giving a hold back is keyed by the connection; taking one is not
- [`0221-there-is-no-duplicate-socket-a-page-is-not-a-document`](decision/0221-there-is-no-duplicate-socket-a-page-is-not-a-document.md) — There is no duplicate socket: a page is not a document
- [`0230-sign-out-revokes-the-session-because-deleting-the-cookie-cannot-win-the-race`](decision/0230-sign-out-revokes-the-session-because-deleting-the-cookie-cannot-win-the-race.md) — Sign-out revokes the session, because deleting the cookie cannot win the race
- [`0231-the-sign-out-revocations-hang-off-globalthis-because-nextjs-builds-three-auth-configs`](decision/0231-the-sign-out-revocations-hang-off-globalthis-because-nextjs-builds-three-auth-configs.md) — The sign-out revocations hang off `globalThis`, because Next.js builds three auth configs
- [`0232-the-suite-keeps-a-cookie-recorder-that-records-no-cookie-values`](decision/0232-the-suite-keeps-a-cookie-recorder-that-records-no-cookie-values.md) — The suite keeps a cookie recorder that records no cookie values
- [`0233-leaving-a-waitlist-is-exempt-from-the-reservation-window`](decision/0233-leaving-a-waitlist-is-exempt-from-the-reservation-window.md) — 0233 – Leaving a waitlist is exempt from the reservation window
- [`0234-a-promotion-announces-every-queue-it-empties-not-only-the-freed-cell`](decision/0234-a-promotion-announces-every-queue-it-empties-not-only-the-freed-cell.md) — 0234 – A promotion announces every queue it empties, not only the freed cell
- [`0235-retiring-a-spot-is-blocked-by-its-queue-as-well-as-its-reservations`](decision/0235-retiring-a-spot-is-blocked-by-its-queue-as-well-as-its-reservations.md) — 0235 – Retiring a spot is blocked by its queue as well as its reservations
- [`0236-a-bulk-confirmation-releases-the-callers-own-queues-on-days-it-reserved`](decision/0236-a-bulk-confirmation-releases-the-callers-own-queues-on-days-it-reserved.md) — 0236 – A bulk confirmation releases the caller's own queues on days it reserved
- [`0237-the-slack-abort-controller-is-per-call-not-per-client`](decision/0237-the-slack-abort-controller-is-per-call-not-per-client.md) — 0237 – The Slack abort controller is per call, not per client
- [`0238-the-no-environment-branch-scan-covers-the-whole-api-source-tree`](decision/0238-the-no-environment-branch-scan-covers-the-whole-api-source-tree.md) — 0238 – The no-environment-branch scan covers the whole API source tree
- [`0239-the-nx-scaffold-route-is-deleted-and-route-parity-is-read-from-the-compiled-app`](decision/0239-the-nx-scaffold-route-is-deleted-and-route-parity-is-read-from-the-compiled-app.md) — 0239 – The Nx scaffold route is deleted, and route parity is read from the compiled app
- [`0240-a-deadlock-on-a-raw-statement-is-p2010-not-p2034-and-the-cancel-retry-must-match-both`](decision/0240-a-deadlock-on-a-raw-statement-is-p2010-not-p2034-and-the-cancel-retry-must-match-both.md) — 0240 – A deadlock on a raw statement is `P2010`, not `P2034`, and the cancel retry must match both
- [`0241-the-waitlist-recounts-stay-inside-the-cancellation-transaction`](decision/0241-the-waitlist-recounts-stay-inside-the-cancellation-transaction.md) — 0241 – The waitlist recounts stay inside the cancellation transaction
- [`0245-the-token-refreshers-in-flight-slot-hangs-off-globalthis-for-the-same-reason-the-revocations-do`](decision/0245-the-token-refreshers-in-flight-slot-hangs-off-globalthis-for-the-same-reason-the-revocations-do.md) — 0245 – The token refresher's in-flight slot hangs off `globalThis`, for the same reason the revocations do
- [`0246-a-globalthis-fix-is-only-tested-by-loading-two-module-registries`](decision/0246-a-globalthis-fix-is-only-tested-by-loading-two-module-registries.md) — 0246 – A `globalThis` fix is only tested by loading two module registries
- [`0247-projections-of-userschema-are-allowlists-in-both-directions`](decision/0247-projections-of-userschema-are-allowlists-in-both-directions.md) — 0247 – Projections of `userSchema` are allowlists, in both directions
- [`0248-two-contract-findings-recorded-as-open-questions-rather-than-decided`](decision/0248-two-contract-findings-recorded-as-open-questions-rather-than-decided.md) — 0248 – Two contract findings recorded as open questions rather than decided
- [`0255-the-session-guard-is-mounted-by-the-top-bar-so-every-signed-in-route-has-it`](decision/0255-the-session-guard-is-mounted-by-the-top-bar-so-every-signed-in-route-has-it.md) — The session guard is mounted by the top bar, so every signed-in route has it
- [`0256-the-day-overview-is-refetched-every-time-the-socket-comes-back`](decision/0256-the-day-overview-is-refetched-every-time-the-socket-comes-back.md) — The day overview is refetched every time the socket comes back
- [`0257-a-parking-bays-state-goes-in-its-accessible-name`](decision/0257-a-parking-bays-state-goes-in-its-accessible-name.md) — A parking bay's state goes in its accessible name
- [`0258-the-bulk-modal-is-keyed-on-its-opening-rather-than-reset-in-an-effect`](decision/0258-the-bulk-modal-is-keyed-on-its-opening-rather-than-reset-in-an-effect.md) — The bulk modal is keyed on its opening rather than reset in an effect
- [`0259-the-web-apps-csp-omits-script-src-and-connect-src-on-purpose`](decision/0259-the-web-apps-csp-omits-script-src-and-connect-src-on-purpose.md) — The web app's CSP omits `script-src` and `connect-src`, on purpose
- [`0260-stepping-down-from-your-own-admin-role-is-confirmed-first`](decision/0260-stepping-down-from-your-own-admin-role-is-confirmed-first.md) — Stepping down from your own admin role is confirmed first
- [`0261-a-dropped-realtime-connection-is-named-a-not-yet-connected-one-is-not`](decision/0261-a-dropped-realtime-connection-is-named-a-not-yet-connected-one-is-not.md) — A dropped realtime connection is named; a not-yet-connected one is not
- [`0262-global-error-re-establishes-the-one-provider-it-can`](decision/0262-global-error-re-establishes-the-one-provider-it-can.md) — `global-error` re-establishes the one provider it can
- [`0265-two-below-aa-pairings-the-design-owns-are-pinned-not-fixed`](decision/0265-two-below-aa-pairings-the-design-owns-are-pinned-not-fixed.md) — 0265 – Two below-AA colour pairings the design owns are pinned, not fixed
- [`0266-badge-avatar-and-toast-read-their-text-off-the-neutral-scale`](decision/0266-badge-avatar-and-toast-read-their-text-off-the-neutral-scale.md) — 0266 – Tinted surfaces read their text off the neutral scale; the tint carries the tone
- [`0267-disabled-labels-are-dimmed-to-fg-3-not-to-invisibility`](decision/0267-disabled-labels-are-dimmed-to-fg-3-not-to-invisibility.md) — 0267 – Disabled labels are dimmed to `--fg-3`, not to invisibility
- [`0268-the-spacing-scale-is-open-by-design-and-the-enumeration-is-what-binds-it-to-the-tokens`](decision/0268-the-spacing-scale-is-open-by-design-and-the-enumeration-is-what-binds-it-to-the-tokens.md) — 0268 – The spacing scale stays open, the enumeration stays, and the comment that claimed otherwise is gone
- [`0269-the-hand-written-tailwind-bridge-is-guarded-by-a-drift-test`](decision/0269-the-hand-written-tailwind-bridge-is-guarded-by-a-drift-test.md) — 0269 – The hand-written Tailwind bridge is guarded by a drift test, and the colour list is derived
- [`0270-a-form-control-merges-aria-describedby-it-never-replaces-it`](decision/0270-a-form-control-merges-aria-describedby-it-never-replaces-it.md) — 0270 – A form control merges `aria-describedby`; it never replaces it
- [`0271-a-datatable-names-itself-once-and-a-dropdown-always-has-somewhere-to-put-focus`](decision/0271-a-datatable-names-itself-once-and-a-dropdown-always-has-somewhere-to-put-focus.md) — 0271 – A DataTable names itself once, and a Dropdown always has somewhere to put focus
- [`0275-the-development-seed-generates-its-ics-tokens`](decision/0275-the-development-seed-generates-its-ics-tokens.md) — 0275 – The development seed generates its ICS tokens, and never rewrites one
- [`0276-destructive-database-scripts-are-guarded-by-the-connection-string`](decision/0276-destructive-database-scripts-are-guarded-by-the-connection-string.md) — 0276 – Destructive database scripts are guarded by the connection string, not by `NODE_ENV`
- [`0277-a-target-checks-the-schema-against-its-own-migrations`](decision/0277-a-target-checks-the-schema-against-its-own-migrations.md) — 0277 – A target checks the schema against its own migrations and its own generated client
- [`0278-auditlog-actor-keeps-prismas-default-on-update`](decision/0278-auditlog-actor-keeps-prismas-default-on-update.md) — 0278 – `AuditLog.actor` keeps Prisma's default `onUpdate: Cascade`, and says so
- [`0279-the-api-e2e-suite-signs-in-for-real-before-it-asserts-a-refusal`](decision/0279-the-api-e2e-suite-signs-in-for-real-before-it-asserts-a-refusal.md) — 0279 – The api-e2e suite signs in for real before it asserts a refusal
- [`0285-the-browser-suite-starts-a-server-it-can-kill-and-refuses-to-adopt-one`](decision/0285-the-browser-suite-starts-a-server-it-can-kill-and-refuses-to-adopt-one.md) — 0285 – The browser suite starts a server it can kill, and refuses to adopt one
- [`0286-ci-runs-the-e2e-suites-because-nothing-else-does`](decision/0286-ci-runs-the-e2e-suites-because-nothing-else-does.md) — 0286 – CI runs the e2e suites, because nothing else does
- [`0287-the-storage-state-path-is-absolute-and-the-dockerignore-rules-are-globstarred`](decision/0287-the-storage-state-path-is-absolute-and-the-dockerignore-rules-are-globstarred.md) — 0287 – The `storageState` path is absolute, and the `.dockerignore` rules are globstarred
- [`0290-the-wrapper-ban-covers-require-and-dynamic-import-too`](decision/0290-the-wrapper-ban-covers-require-and-dynamic-import-too.md) — 0290 – The wrapper ban covers `require()` and dynamic `import()` too
- [`0295-held-by-other-recovers-by-broadcast-and-by-its-own-timer`](decision/0295-held-by-other-recovers-by-broadcast-and-by-its-own-timer.md) — 0295 – `held-by-other` recovers, by the broadcast **and** by its own timer
- [`0296-an-established-socket-is-not-re-authenticated`](decision/0296-an-established-socket-is-not-re-authenticated.md) — 0296 – An established socket is not re-authenticated mid-connection
- [`0297-the-esm-jest-transform-block-lives-in-jest-preset-js`](decision/0297-the-esm-jest-transform-block-lives-in-jest-preset-js.md) — 0297 – The ESM `transformIgnorePatterns` block lives in `jest.preset.js`
