# CLAUDE.md

## Language

Everything will be written in EN by default.

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project state

This repository currently contains only a specification (`plan.md`) — no Nx workspace, no source code, and no build/lint/test tooling exist yet. There are no commands to run until Fáze 0 (scaffolding) has been executed. Once the workspace is scaffolded, this file should be updated with the actual `nx`/`npm` commands (build, lint, test, test single file/project) that `nx.json`/`package.json` define.

## Authoritative spec

`plan.md` (in Czech) is the full, binding build spec for this project — a company parking-reservation app (Nx monorepo, Next.js + NestJS, oRPC/Zod contract-first, tokenized design system, realtime via Socket.io, Slack + ICS integrations). Key technology choices (oRPC over ts-rest, Zod v4, Tailwind v4 CSS-first tokens, Auth.js v5 + Okta JWKS validation in NestJS, Prisma 7, mock OIDC server for dev/e2e) were researched and fixed in `plan.md` (§"Klíčová technologická rozhodnutí") — do not swap them without the user's approval. It is intentionally strict about **architecture and the order of work**: each phase (Fáze 0–7, listed in the file) must build and pass its tests before the next phase begins. Read `plan.md` in full before starting or continuing implementation — do not summarize/rebuild its rules from memory, and do not skip ahead in phase order.

Non-negotiable architectural rules from `plan.md` that apply to every phase (see the file for full detail):

- **Contract-first**: all FE↔BE data shapes are defined once as Zod schemas in the single `libs/contract` lib — shared entity schemas plus two entry points: `@lets-park/contract` (API, via oRPC) and `@lets-park/contract/realtime` (Socket.io events — Zod payload schemas, validated server-side). TS types are always derived (`z.infer`), never hand-duplicated. No endpoint/DTO/event may exist in code before it exists in the contract. Errors are typed contract errors; reservation dates are date-only (`YYYY-MM-DD`) in Europe/Prague.
- **Design-system-first**: tokens (`libs/design-system/tokens`) → primitives (`libs/design-system/primitives`) → compounds (`libs/design-system/compounds`, e.g. DataTable) → domain-specific composition, which lives only in app feature code. Primitives and compounds each get a Storybook story written alongside them and must stay presentation-only with no domain data; compounds may import primitives, never the reverse.
- **Mandatory wrapper layers**: app/feature code must never import react-hook-form, TanStack Query/Table, socket.io-client, next-auth, next-intl, or ical-generator directly — always through the corresponding `libs/*` wrapper (table in `plan.md`). ESLint (Nx module boundaries / `no-restricted-imports`) must enforce this. A one-off, non-recurring third-party import elsewhere in app code is acceptable only with a comment explaining why no wrapper was created — but this exception does not apply to the libraries listed above.
- Validation is Zod-only; `class-validator`/`class-transformer` are not used in NestJS.
- No Sentry/metrics/APM/alerting (next phase), no Slack slash commands or interactive Block Kit — Slack integration is outbound `chat.postMessage` notifications only. Note: structured logging (nestjs-pino), health endpoints and graceful shutdown are baseline hygiene required by `plan.md` (§"Provozní základ") and are **not** covered by the no-monitoring rule.
- Single-instance deployment is the stated target: no Redis/BullMQ/message brokers in the MVP — build the documented abstractions (`LockService`, IoAdapter) and leave the upgrade paths described in `plan.md`.

## Visual design source of truth

A finished visual design exists at the Claude Design link in `plan.md` (§"Vizuální design – zdroj pravdy"). Try to open it before inventing token/visual values for the design system (Fáze 2–3); if it's inaccessible, stop at the start of Fáze 2 and ask the user for an exported version rather than guessing, per the fallback procedure described there.

## Working style expected in this repo

- Follow the phase order in `plan.md` exactly; after each phase, report what was created and confirm the project builds (and tests pass, where relevant) before moving to the next phase.
- Write tests alongside the phase that introduces the code (Jest for units on both FE/BE, Playwright for e2e in Fáze 7), not retroactively.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
