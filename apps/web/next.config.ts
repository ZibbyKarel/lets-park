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
  // Next.js options go here
  // See: https://nextjs.org/docs/app/api-reference/config/next-config-js
};

export default nextConfig;
