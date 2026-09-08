/**
 * The single place components attach to TanStack Query.
 *
 * The `QueryClient` is a required prop rather than created here: a client
 * created inside the component would be re-created on every render, throwing
 * the cache away each time, and Next.js needs one instance per request on the
 * server and one per browser session on the client. Deciding that is the app's
 * job; this wrapper only makes sure `@tanstack/react-query` is not imported to
 * do it.
 *
 * Like `IntlProvider` in `libs/i18n`, this file carries no `'use client'`
 * directive — the app marks its own provider boundary as a client component
 * and composes both providers there.
 */

import type { ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';

export interface QueryProviderProps {
  /** Built with `createQueryClient()`; one instance per app/request. */
  readonly client: QueryClient;
  readonly children: ReactNode;
}

export function QueryProvider({ client, children }: QueryProviderProps) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
