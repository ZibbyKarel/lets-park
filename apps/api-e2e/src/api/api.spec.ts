/**
 * The scaffold's `GET /api` → `{ message: 'Hello API' }` test used to live here.
 * That route was removed when the oRPC transport landed (Task 12), and the
 * assertion went stale without anyone noticing: the `e2e` target is not part of
 * `nx run-many -t lint,typecheck,test,build`, so nothing in the standard
 * verification runs this file. A test that cannot fail is worse than no test,
 * because it reads as coverage — so it is replaced rather than deleted, with
 * assertions about routes that actually exist.
 *
 * `/health/live` is deliberately *not* behind the global `/api` prefix:
 * `configure-app.ts` excludes the health controller from `setGlobalPrefix`, so a
 * probe reaches it without knowing the API's mount point.
 */
import axios from 'axios';

describe('the API is reachable', () => {
  it('answers the liveness probe without the /api prefix', async () => {
    const res = await axios.get(`/health/live`);

    expect(res.status).toBe(200);
    expect(res.data).toMatchObject({ status: 'ok' });
  });

  it('has no route at the bare /api prefix', async () => {
    const res = await axios.get(`/api`, { validateStatus: () => true });

    expect(res.status).toBe(404);
    // The 404 body carries no stack trace, whatever the log does with one.
    expect(JSON.stringify(res.data)).not.toContain('at ');
  });
});
