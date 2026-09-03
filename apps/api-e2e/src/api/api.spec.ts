/**
 * That the API process is up, and that the two routes outside the ordinary
 * pattern behave.
 *
 * ## A correction, and how it was found
 *
 * This file used to assert that `GET /api` answers `404`, on the stated
 * grounds that "that route was removed when the oRPC transport landed
 * (Task 12)". **It was not removed.** Task 28 ran this suite — the first time
 * anything had, because the `e2e` target is not part of
 * `nx run-many -t lint,typecheck,test,build` — and it came back red: the API's
 * own startup log still reads `Mapped {/api, GET}`, and the scaffold's
 * `AppController` → `{ message: 'Hello API' }` is still registered in
 * `app.module.ts`. What changed in Task 12 was not the route but the *guard*:
 * `JwtAuthGuard` became an `APP_GUARD`, so the stub went from answering
 * everybody to answering nobody without a token, and `404` quietly became
 * `401`.
 *
 * The assertion below is therefore the one that is true *and* worth making:
 * the stub is not reachable by a stranger, and its body is not the scaffold's.
 * Deleting the controller would be the better end state and is deliberately
 * **not** done here — it is an API change, not a test change, and
 * `auth-pipeline.spec.ts` currently uses "a route that carries no auth
 * decorator at all" as its proof that the default is deny. That is written up
 * in the task report as a follow-up rather than smuggled in under an e2e task.
 *
 * `/health/live` is deliberately *not* behind the global `/api` prefix:
 * `configure-app.ts` excludes the health controller from `setGlobalPrefix`, so a
 * probe reaches it without knowing the API's mount point.
 */
import axios from 'axios';

const anyStatus = { validateStatus: () => true } as const;

describe('the API is reachable', () => {
  it('answers the liveness probe without the /api prefix', async () => {
    const res = await axios.get(`/health/live`);

    expect(res.status).toBe(200);
    expect(res.data).toMatchObject({ status: 'ok' });
  });

  it('answers the readiness probe, which also proves the database is reachable', async () => {
    const res = await axios.get(`/health/ready`);

    expect(res.status).toBe(200);
  });

  it('serves nothing at the bare /api prefix to a caller with no token', async () => {
    const res = await axios.get(`/api`, anyStatus);

    // 401 rather than 404 — see the correction in this file's header.
    expect(res.status).toBe(401);
    const body = JSON.stringify(res.data);
    // Whatever is or is not mounted there, an anonymous caller does not see it.
    expect(body).not.toContain('Hello API');
    // And the body carries no stack trace, whatever the log does with one.
    expect(body).not.toContain('at ');
  });
});
