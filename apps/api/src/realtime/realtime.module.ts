import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DomainEventPublisher } from '../reservations/reservation-events';
import { InMemoryLockService, LockService } from './lock.service';
import { RealtimeGateway } from './realtime.gateway';
import { RealtimeDomainEventPublisher } from './realtime.publisher';

/**
 * The realtime half of the API: the Socket.io gateway, the editing-hold
 * registry, and the implementation of the after-commit broadcast seam.
 *
 * ## Why the publisher lives here and not in `ReservationsModule`
 *
 * `DomainEventPublisher` is declared in `reservations/reservation-events.ts`
 * because that is where the events are *produced*; it is bound here because
 * this is where they are *delivered*. `ReservationsModule` imports this module
 * and drops its `NoopDomainEventPublisher` binding, which is the one line Task
 * 13 left for this task to change.
 *
 * That direction — reservations importing realtime — is the one that does not
 * close a cycle: this module imports `reservation-events.ts` for the token and
 * the `DomainEvent` type, a file that imports nothing from `realtime/`.
 *
 * `AuthModule` is imported for `JwksVerifierService` and `AuthUserService`,
 * which it exports for exactly this reason (`doc/decision/0042-*`): the
 * handshake must reuse the process's single JWKS client rather than open a
 * second one with its own cache, rate limiter and rotation moment.
 * `PrismaService` and `GracefulShutdownService` arrive from global modules.
 */
@Module({
  imports: [AuthModule],
  providers: [
    // The abstract class is the injection token, so a replacement — the Redis
    // implementation, if this ever stops being a single instance — cannot
    // silently have the wrong shape.
    { provide: LockService, useClass: InMemoryLockService },
    RealtimeGateway,
    { provide: DomainEventPublisher, useClass: RealtimeDomainEventPublisher },
  ],
  exports: [DomainEventPublisher, LockService, RealtimeGateway],
})
export class RealtimeModule {}
