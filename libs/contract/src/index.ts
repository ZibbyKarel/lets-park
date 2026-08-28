/**
 * `@lets-park/contract` — the API entry point of the contract lib.
 *
 * Task 3 exports the shared entity schemas and the error contract; Task 4 adds
 * the oRPC procedures under `src/api`, and Task 5 adds the Socket.io event
 * schemas behind the separate `@lets-park/contract/realtime` entry point.
 *
 * `schemas/` holds what both branches share, so it is exported first; `api/`
 * builds the procedures on top of it.
 */
export * from './schemas';
export * from './api';
