# 0001 – Parallel phase execution via git worktrees

**Date:** 2026-08-28 · **Status:** accepted

## What

Phases from `plan.md` are implemented by subagents. Independent phases run **in
parallel**, each parallel branch in its own git worktree; after a clean review the
branch is merged into `feat/lets-park-mvp`, and only on the merged state does the
phase gate (`nx run-many -t lint,test,build`) run.

Wave topology:

| Wave | Branch A (main tree) | Branch B (worktree) |
| --- | --- | --- |
| 1 | Task 1–2 (Phase 0 scaffolding) | – |
| 2 | Task 3–5 (Phase 1 contract) | Task 6–8 (Phase 2+3 design system) |
| 3 | Task 9–16 (Phase 5 backend) | Task 17–22 (Phase 4 wrapper libs) |
| 4 | Task 23–27 (Phase 6 frontend) | – |
| 5 | Task 28–29 (Phase 7 e2e + operations) | – |

## Why

- The user explicitly requested it ("implement mutually independent phases in
  parallel").
- The `subagent-driven-development` skill otherwise forbids parallel implementation
  subagents because of conflicts in a single working tree. The user's instruction
  takes precedence, but the conflicts are real → we address them through isolation,
  not by ignoring them.
- `plan.md` requires a strict phase order. We parallelize only where **no data or
  type dependency** exists between phases: the contract (Zod/oRPC) does not depend
  on the design system and vice versa; the backend does not depend on the FE
  wrapper layers.

## How

- Each parallel branch gets its own worktree (`Agent` tool, `isolation: "worktree"`).
- A worktree has no `node_modules` or gitignored files → the agent runs `npm install`
  itself; the brief is handed to it as an absolute path into the main tree.
- Expected merge conflicts are limited to shared configuration
  (`package.json`, `package-lock.json`, `tsconfig.base.json`, `nx.json`, ESLint config).
  Resolution: take both sides manually, regenerate `package-lock.json` via
  `npm install`.
- The `plan.md` phase gate (it builds, tests pass) is evaluated **only on the merged
  state**, not inside the worktree.

## Risk if this is wrong

Merge conflicts in the Nx configuration could cost more time than the
parallelization saves. Fallback: run the remaining waves sequentially in the main
tree – the change is local (just the dispatch strategy), already-completed commits
are not discarded.
