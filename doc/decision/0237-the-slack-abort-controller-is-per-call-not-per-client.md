# 0237 – The Slack abort controller is per call, not per client

## What

`SlackClient`'s in-flight `AbortController` moved from a mutable instance field
(`private currentAttempt`) into an `AsyncLocalStorage`. `attempt()` runs the
call inside `inFlight.run(controller, …)`, and the factory's `signal()` getter
reads `inFlight.getStore()?.signal`.

## Why

`SlackClient` is a singleton. The `WebClient`'s `requestInterceptor` reads
`signal()` when axios builds each request — a **microtask** after `attempt()`
wrote the field — so two calls started in the same tick both read whichever
controller was written last.

The final review reproduced this against the real `@slack/web-api` from this
repo's `node_modules`, replicating the exact pattern (singleton field,
interceptor getter, two `chat.postMessage` calls in one tick):

```
signals attached to the two in-flight requests: [ 'B', 'B' ]
A aborted? false   B aborted? false
after A.abort() -> A request still in flight? YES (A never got its own signal)
```

Both consequences are precisely the ones the class comment says the abort
exists to prevent:

- **A's timeout aborts a controller attached to nothing.** A's HTTP request
  keeps running, and a slow-but-successful response gets delivered twice — once
  for the attempt that timed out, once for its retry.
- **Symmetrically, B's timeout aborts a signal also attached to A's request**,
  failing a call that had not timed out and sending it round the retry loop. A
  genuine duplicate message.

The class asserted: *"There is no window in this method in which an attempt is
known to have timed out but has not yet been aborted."* True of one call at a
time; false of two.

**Reachability is ordinary.** `SlackDomainEventPublisher.publish` and
`notifyPromotions` each `detach` one **un-awaited** chain per event and per
notice, so any two overlapping cancellations produce concurrent calls on the one
client, and the daily summary job can overlap with either.

**Why review missed it:** every abort assertion in
`slack-client.service.spec.ts` drives a single sequential client. Nothing in the
suite exercised two concurrent calls on one `SlackClient`.

## Why `AsyncLocalStorage` and not a per-attempt `WebClient`

Both were on the table. A `WebClient` built per attempt closes the controller
over lexically and cannot be confused — but it discards the axios instance and
its keep-alive on every attempt, and it splits the "built even when disabled,
one code path" arrangement the constructor deliberately keeps.

The one thing that could sink the `AsyncLocalStorage` version is the SDK's own
scheduler: `@slack/web-api` puts each request through a `p-queue`, and a task a
queue starts from *another* task's completion would inherit the wrong async
context. That was **measured rather than reasoned**, against the real SDK from
this repo's `node_modules`, with six concurrent calls against a server that
never answers — more than the queue's default concurrency:

```
attached = [ 'C0', 'C1', 'C2', 'C3', 'C4', 'C5' ]
distinct = 6 of 6
```

Every request saw its own store. The context survives both the interceptor's
microtask hop and the queue.

## How it is kept true

`slack-client.service.spec.ts` — "two calls in flight on the same client" —
starts two `postToChannel` calls in one tick against a server set to `'hang'`,
records the signal each outgoing request was actually handed (a new `onSignal`
hook on the spec's factory, mirroring the production `requestInterceptor`), and
asserts:

- the two signals are **distinct objects** — under the field they were one
  object twice;
- when the first call's timeout fires, exactly the **first** signal is aborted
  and the second is not;
- the second then fails on its own timer, and both requests reached the wire.

Reverting the service to the instance field turns the first of those red.

## Risk

`AsyncLocalStorage` has a measurable cost per context, and this adds one per
Slack attempt. Slack calls are already off the request path and rate-limited by
Slack itself, so the volume is notifications-per-cancellation, not
requests-per-second. If the SDK ever schedules a request outside the async
context that queued it, `signal()` returns `undefined` and the request goes out
**without** a signal — the pre-abort behaviour, i.e. a timed-out attempt that is
not torn down, not a wrongly torn-down one. That is the safe direction, and the
spec above would not catch it, so it is written down here.
