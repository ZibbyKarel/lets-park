/**
 * Named, not a star. `errors.ts` also holds the tools a procedure is *defined*
 * with — `authed`, `contractErrors`, `noInputSchema`, `NoInput`,
 * `errorDataSchema` — and publishing those from `@lets-park/contract` makes
 * "define a procedure outside `libs/contract`" a supported move, which is the
 * one thing the contract-first rule exists to make impossible. They stay
 * inside the lib, where the ten procedure modules and `errors.spec.ts` reach
 * them through `./errors`.
 *
 * `ERROR_DEFINITIONS` is different in kind: it is the code→status→message
 * table a consumer legitimately reads, and both apps do
 * (`ContractExceptionFilter`, `DomainError`, `toContractError`).
 */
export { ERROR_DEFINITIONS } from './errors';
export * from './ics';
export * from './overview';
export * from './reservations';
export * from './waitlist';
export * from './bulk';
export * from './spots';
export * from './users';
export * from './me';
export * from './reservation-window';
export * from './router';
