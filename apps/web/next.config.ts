import { resolve } from 'node:path';
import type { NextConfig } from 'next';

// Environment validation deliberately does NOT happen here. `next.config.ts`
// is also loaded by Nx's `@nx/next` plugin to infer project graph metadata
// (e.g. for `lint`/`typecheck`/`graph`), so anything that throws in this file
// would break those commands whenever a full runtime `.env` isn't present.
// Fail-fast validation instead lives in `src/instrumentation.ts`'s
// `register()`, which Next.js calls only when an actual server instance
// boots (`next dev` / `next start`) — see `doc/decision/0008-*` and
// `doc/environment.md`.

const nextConfig: NextConfig = {
  // Emit `.next/standalone` — a self-contained server plus only the
  // node_modules files the build actually traced. That is what
  // `apps/web/Dockerfile` copies; without it the image would have to carry the
  // whole workspace `node_modules` (an order of magnitude larger, and full of
  // build tooling a running server must not have).
  //
  // It is additive: `.next/` keeps everything it had, so `nx run web:start`
  // (`next start`) and the Playwright suite that depends on it are unaffected.
  output: 'standalone',

  // Where tracing starts. This is an Nx monorepo: `apps/web` has no
  // node_modules of its own, they are hoisted to the workspace root, and a
  // trace rooted at `apps/web` would silently miss every one of them. Next.js
  // infers a root by walking up for a lockfile and would land here anyway —
  // stating it removes the inference (and the warning it prints) and makes the
  // resulting `.next/standalone/apps/web/server.js` layout the Dockerfile
  // copies from a documented fact rather than an observed one.
  outputFileTracingRoot: resolve(__dirname, '..', '..'),
};

export default nextConfig;
