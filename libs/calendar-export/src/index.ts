/**
 * `@lets-park/calendar-export` — the ICS half of the wrapper layer.
 *
 * The single place in the workspace that may import `ical-generator`
 * (`eslint.config.mjs`, `WRAPPED_LIBRARIES`). `apps/api`'s calendar controller
 * calls `buildReservationCalendar` and never sees the library underneath.
 */
export * from './lib/reservation-calendar';
