/**
 * `@lets-park/api-client` — the wrapper lib that owns `@orpc/client`.
 *
 * Two things come out of here and nothing else needs to:
 *
 * - {@link createApiClient} / {@link ApiClient} — the transport, typed from
 *   `libs/contract`;
 * - {@link toContractError} / {@link errorStatus} — reading a failure back as a
 *   member of the contract's closed error enum.
 *
 * See `doc/wrappers.md` for why the direct import is banned everywhere else.
 */
export type { AccessTokenProvider, ApiClient, ApiClientOptions, ApiFetch } from './lib/api-client';
export { createApiClient } from './lib/api-client';
export type { ContractError } from './lib/errors';
export { errorStatus, toContractError } from './lib/errors';
