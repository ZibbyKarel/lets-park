/**
 * Watching a page's realtime traffic from outside the browser: which day rooms
 * it has joined, and — when asked — what it sent and received.
 *
 * ## Why a precondition exists at all
 *
 * `cell:locked` is a **broadcast, and broadcasts are not replayed**. The
 * gateway sends one to the room for `date` at the moment a hold is taken
 * (`realtime.gateway.ts`), and a socket that joins that room a hundred
 * milliseconds later is never told about the hold that already exists — the
 * contract has no procedure to ask for current locks, and `useCellLocks` says
 * as much in its own docs: after a reconnect the map "starts empty and refills
 * from the renewal heartbeat every holder is sending". That heartbeat fires at
 * half the TTL, so the gap is up to fifteen seconds wide.
 *
 * That is a deliberate product property, not a defect (a lock is a courtesy;
 * `reservation.create` re-checks everything regardless). But it means a test
 * that opens two pages and immediately takes a hold on one of them is asking
 * about an event that may have been sent to nobody. {@link waitForDayRoom} is
 * the missing precondition: the listener has to be listening before the thing
 * it listens for happens.
 *
 * **An honest note about what this did and did not fix.** It was written to
 * explain a 25%-failure flake in `cell-lock.spec.ts`, and it did not: with the
 * wait in place the suite still failed 2 runs in 20. It was then blamed on
 * `StrictMode` giving each page a second socket.io connection — **also wrong**,
 * and wrong twice over: the suite runs the *built* app, where `StrictMode` does
 * not double-invoke effects at all.
 *
 * The actual cause was the spec colliding with itself — two tests, one bay, one
 * persona, `fullyParallel: true`, and a `LockService.release` then keyed by
 * user (`cell-lock.spec.ts`'s `SPOTS` map, `doc/decision/0187-*`; that release
 * is keyed by connection since `doc/decision/0220-*`). This module is
 * kept because the race it closes is real regardless, and because a socket that
 * never connects now fails with a sentence instead of a tile that stayed grey.
 *
 * There was a third wrong reading, and it came from *this file's own log*: the
 * "one page in three opens a second socket" defect `doc/decision/0187-*`
 * recorded as unexplained. `page.on('websocket')` spans a whole `Page`, and six
 * of this suite's pages navigate or reload a second time — a second document,
 * which opens a second socket because it should. `doc/decision/0221-*` has the
 * re-measurement. Two things here exist so that reading cannot be made again:
 * a `LOAD` line per document in the trace, and
 * {@link installRealtimeSocketCounter}, which counts per document rather than
 * per page.
 *
 * ## Why it reads the wire
 *
 * `day:subscribe` has no acknowledgement (the gateway's handler returns
 * `void`), the connection status is not rendered anywhere a locator can reach
 * (`lot-header.tsx` surfaces only the `rejected` state), and adding either
 * would be shaping the application around its tests. What *is* observable from
 * outside is the emit itself, on whichever transport carries it: socket.io
 * opens on HTTP long-polling and upgrades to a WebSocket, so both are watched.
 * The recorder is attached when the page is created, before any navigation, so
 * it cannot miss the first one.
 *
 * ## The tracing switch
 *
 * `E2E_TRACE_REALTIME=1` prints every `day:*` and `cell:*` packet each page
 * sends or receives, plus each WebSocket it opens and each document it loads.
 * (A socket belongs to the document whose `LOAD` line precedes it; the pairing
 * is the whole point — see the third wrong reading above.) That filter is a **safety
 * property, not a convenience**: the socket.io CONNECT packet carries the
 * access token in its `auth` payload, and it matches neither name, so no
 * credential can reach the log. Nothing else is ever printed — except the
 * socket URLs on `OPEN`/`CLOSE`, which are credential-free for a reason that
 * lives in `libs/realtime-client` rather than here (see {@link tracer}).
 *
 * Each line names a **page**, not a persona — `user#1`, `user#2` — because two
 * pages of one persona can be live at once and a shared label makes their
 * traces read like one page misbehaving. See {@link nextPageLabel}.
 */

import { expect, type Page } from '@playwright/test';
import { SOCKET_IO_PATH } from '@lets-park/contract/realtime';

/** Socket.io event packets carry the event name as a quoted JSON string. */
const SUBSCRIBE = '"day:subscribe"';

/** `YYYY-MM-DD`, the only date shape the contract uses. */
const DATE_PATTERN = /\d{4}-\d{2}-\d{2}/u;

/**
 * Every date this page has asked to subscribe to, in order of first request.
 *
 * A `Set` rather than a "current room": `goToDate` steps through days, so a
 * page subscribes and unsubscribes several times on its way to the target, and
 * what a caller wants to know is whether the one it cares about was ever
 * reached. Unsubscription is not tracked because no spec navigates *away* from
 * the day it is about to assert on.
 */
type SubscribedDates = ReadonlySet<string>;

const recorders = new WeakMap<Page, Set<string>>();

/**
 * Pulls the dates out of one socket.io payload, if it is a `day:subscribe`.
 *
 * The payload is matched as text rather than parsed: engine.io v4 frames a
 * polling request as one or more packets separated by `\x1e`, each prefixed
 * with a type digit, and reimplementing that framing here would be a second
 * protocol implementation to keep correct. Splitting on the event name and
 * taking the first date after each occurrence reads exactly the one field this
 * module needs, and cannot mistake a `day:unsubscribe` for a subscription
 * because that name does not contain this one as a quoted whole.
 */
function subscribedDatesIn(payload: string): string[] {
  if (!payload.includes(SUBSCRIBE)) return [];
  return payload
    .split(SUBSCRIBE)
    .slice(1)
    .flatMap((rest) => {
      const match = DATE_PATTERN.exec(rest);
      return match === null ? [] : [match[0]];
    });
}

/**
 * Starts recording this page's day-room subscriptions.
 *
 * Call once, on a freshly created page and before it navigates — `await`ed,
 * because with `E2E_TRACE_REALTIME` set it installs an init script, and an init
 * script registered after the first navigation misses the document it was
 * meant to watch. Idempotent, so a fixture may call it without knowing whether
 * a spec will use the result.
 */
export async function recordDayRoomSubscriptions(page: Page, persona = '?'): Promise<void> {
  if (recorders.has(page)) return;

  const dates = new Set<string>();
  recorders.set(page, dates);
  const trace = tracer(nextPageLabel(persona));

  const record = (payload: string): void => {
    trace('OUT', payload);
    for (const date of subscribedDatesIn(payload)) dates.add(date);
  };

  // Every document this page loads, so a socket in the trace can be attributed
  // to the document that opened it. Without this line the log answers "how many
  // sockets did this page open" and gets read as "how many did it hold at
  // once" — which is the misreading `doc/decision/0187-*` recorded as an
  // unexplained defect and `doc/decision/0221-*` retires. A page that navigates
  // twice opens two sockets and is behaving perfectly.
  //
  // `LOAD` fires when the document's load event completes, which can be *after*
  // the socket its own React tree opened — so the trace tells you how many
  // documents and how many sockets a page had, but not reliably in which order.
  // The `DOC` lines below are what attribute a socket to a document, and they
  // do it from inside the document rather than by reading the order of two
  // event streams.
  page.on('load', () => trace('LOAD', page.url()));

  if (isTracing()) {
    await installRealtimeSocketCounter(page);
    page.on('console', (message) => {
      const text = message.text();
      if (text.startsWith(DOC_MARKER)) trace('DOC', text.slice(DOC_MARKER.length + 1));
    });
  }

  // Before the transport upgrade: each emit is the body of an XHR POST to
  // `/socket.io/`.
  page.on('request', (request) => {
    const body = request.postData();
    if (body !== null) record(body);
  });

  // After it: each emit is a text frame. Binary frames carry a Buffer payload
  // and no `day:subscribe` — engine.io only uses them for binary attachments,
  // which this contract has none of.
  page.on('websocket', (socket) => {
    // How many connections *one page* opens is a claim people have got wrong
    // from these logs before — see {@link nextPageLabel}.
    trace('OPEN', socket.url());
    socket.on('close', () => trace('CLOSE', socket.url()));
    socket.on('framesent', (frame) => {
      if (typeof frame.payload === 'string') record(frame.payload);
    });
    socket.on('framereceived', (frame) => {
      if (typeof frame.payload === 'string') trace('IN', frame.payload);
    });
  });
}

/** Packets worth printing. Deliberately narrow — see the file header. */
const TRACEABLE = /"(day|cell):[a-z]+"/u;

/** Trace directions whose text is a URL or an id rather than a socket.io packet. */
const URL_DIRECTIONS = new Set(['OPEN', 'CLOSE', 'LOAD', 'DOC']);

/** Prefix the in-page counter puts on the console line it writes per socket. */
const DOC_MARKER = '[rt-doc]';

/** Whether the tracing switch is on. */
function isTracing(): boolean {
  return !!process.env['E2E_TRACE_REALTIME'];
}

/** How many pages each persona has had so far, across this worker. */
const pageOrdinals = new Map<string, number>();

/**
 * A label that identifies one **page**, not one persona.
 *
 * This exists because the first version did not, and it cost two people a wrong
 * conclusion. `fullyParallel: true` runs the tests of one file in separate
 * workers, so two `userPage`s can be live at the same moment; labelled only
 * `user`, their traces interleave into what reads exactly like a single page
 * opening two sockets — and, since both pages sit in the same day room, into
 * what reads like "the holder heard its own `cell:locked`" when in fact a
 * *different* page heard it. Both readings were made, and both were wrong.
 *
 * The label carries Playwright's worker index as well as a per-worker ordinal,
 * because every worker starts its own counter and a bare `user#1` would collide
 * across workers exactly the way a bare `user` collided across tests — the same
 * mistake one level up. `w0/user#1` is one page and can be nothing else.
 */
function nextPageLabel(persona: string): string {
  const ordinal = (pageOrdinals.get(persona) ?? 0) + 1;
  pageOrdinals.set(persona, ordinal);
  return `w${process.env['TEST_WORKER_INDEX'] ?? '?'}/${persona}#${ordinal}`;
}

/**
 * The `E2E_TRACE_REALTIME` printer for one page, or a no-op when it is unset.
 *
 * Resolved once per page rather than per packet so that the common case — the
 * switch being off — costs one closure and nothing else.
 */
function tracer(label: string): (direction: string, text: string) => void {
  if (!isTracing()) return () => undefined;
  return (direction, text) => {
    // `OPEN`/`CLOSE`/`LOAD` bypass the filter because their text is a URL, not
    // a packet. That is safe here and not by accident: `socket.ts` sends the
    // token only through the handshake `auth` callback — no `query`, no
    // `extraHeaders` — so a socket.io URL carries no credential, and this app
    // puts nothing in a page URL either. The guarantee therefore lives in
    // `libs/realtime-client` and in the routes, not in this line; if either
    // ever changes, this branch needs a filter of its own.
    if (!URL_DIRECTIONS.has(direction) && !TRACEABLE.test(text)) return;
    // A short clock rather than a timestamp: what these lines are read for is
    // the *order* of packets across two pages, and milliseconds-within-the-run
    // is the smallest thing that shows it.
    console.log(`[rt ${Date.now() % 100_000} ${label}] ${direction} ${text.slice(0, 160)}`);
  };
}

/** Where the counter installed by {@link installRealtimeSocketCounter} keeps its tally. */
const COUNTER_KEY = '__letsParkRealtimeSocketUrls';

/**
 * Counts the realtime connections **one document** opens.
 *
 * This is the instrument the page-level socket trace cannot be: `page.on
 * ('websocket')` spans a whole `Page`, so a page that reloads or navigates
 * twice reports two sockets and reads exactly like one page holding two at
 * once. That reading is what `doc/decision/0187-*` recorded as an unexplained
 * "one page in three opens a second socket" defect, and it was wrong — see
 * `doc/decision/0221-*`.
 *
 * An init script is the fix, because Playwright runs one **per document**: each
 * navigation gets a fresh realm and therefore a fresh, empty tally, so what
 * {@link realtimeSocketsInDocument} returns is scoped to the document currently
 * loaded and to nothing else.
 *
 * Install before the page navigates. Counts constructions rather than open
 * connections deliberately: a socket that was built and immediately abandoned
 * is still a connection this app asked for, and hiding it would be the sort of
 * defence that lets the bug it is guarding against back in.
 */
export async function installRealtimeSocketCounter(page: Page): Promise<void> {
  await page.addInitScript(
    ([socketPath, marker]: readonly [string, string]) => {
      // Idempotent: a spec may ask for the counter on a page the fixture has
      // already instrumented (both do, whenever `E2E_TRACE_REALTIME` is set),
      // and installing twice would both double-wrap `WebSocket` and throw on
      // the non-configurable property below.
      if ('__letsParkRealtimeSocketUrls' in window) return;

      const urls: string[] = [];
      // `Object.defineProperty` rather than a plain assignment so the tally
      // cannot be overwritten by anything the app does.
      Object.defineProperty(window, '__letsParkRealtimeSocketUrls', { value: urls });

      // An id for *this document*. It is what makes a trace line attributable:
      // a page's `websocket` and `load` events are two streams whose order can
      // interleave, but a line written from inside the document cannot be
      // mistaken for one written from a different document.
      const documentId = Math.random().toString(36).slice(2, 8);

      const OriginalWebSocket = window.WebSocket;
      // A `Proxy` rather than a subclass: it forwards `prototype`, statics and
      // `instanceof` unchanged, so nothing the socket.io client does can tell
      // the difference between this and the constructor it expected.
      window.WebSocket = new Proxy(OriginalWebSocket, {
        construct(target, args: [string | URL, (string | string[])?]) {
          const url = String(args[0] ?? '');
          if (url.includes(socketPath)) {
            urls.push(url);
            // Never the URL: this line is for counting, and the trace already
            // prints the URL once per socket from outside the page.
            console.log(`${marker} ${documentId} #${urls.length}`);
          }
          return Reflect.construct(target, args, target);
        },
      });
    },
    [SOCKET_IO_PATH, DOC_MARKER] as const
  );
}

/**
 * How many realtime connections the **currently loaded document** has opened.
 *
 * Requires {@link installRealtimeSocketCounter} to have run before the page
 * navigated; throws rather than returning `0` if it did not, because a counter
 * that silently reports zero would make "one page, one socket" pass on a page
 * that was never instrumented.
 */
export async function realtimeSocketsInDocument(page: Page): Promise<number> {
  return page.evaluate((key: string) => {
    const urls = (window as unknown as Record<string, string[] | undefined>)[key];
    if (urls === undefined) {
      throw new Error(`installRealtimeSocketCounter() did not run for ${window.location.href}`);
    }
    return urls.length;
  }, COUNTER_KEY);
}

/** What this page has subscribed to so far. Empty if it is not being recorded. */
export function subscribedDates(page: Page): SubscribedDates {
  return recorders.get(page) ?? new Set<string>();
}

/**
 * Blocks until this page's socket has asked to join the room for `date`.
 *
 * Poll rather than wait on one event, because the subscription may already
 * have happened by the time a spec asks — `expect.poll` handles both, and the
 * thing being polled is a local `Set`, not the browser.
 *
 * The timeout is generous because what it is waiting for is a whole session
 * coming up: the page's `useSession` resolving, `libs/auth` handing over an
 * access token, the handshake, and only then the subscribe. On a cold
 * `next dev` route that is seconds, and a shorter budget here would trade one
 * flake for another.
 */
export async function waitForDayRoom(page: Page, date: string): Promise<void> {
  await expect
    .poll(() => subscribedDates(page).has(date), {
      timeout: 30_000,
      message: `the page never emitted day:subscribe for ${date} — its socket did not connect`,
    })
    .toBe(true);
}
