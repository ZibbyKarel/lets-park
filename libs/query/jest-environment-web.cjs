/**
 * jsdom, with one consistent set of fetch/stream Web APIs — Node's.
 *
 * `libs/query`'s tests drive a real `RPCLink`, which builds a `Request`, reads a
 * `Response`, and passes TanStack Query's `AbortSignal` into it. jsdom 26 does
 * not implement most of that: probed in this project, a bare jsdom environment
 * has `Headers`, `FormData`, `Blob`, `File` and `AbortController`, but **not**
 * `fetch`, `Request`, `Response`, `ReadableStream`, `WritableStream`,
 * `TransformStream`, `TextEncoder`, `TextDecoder` or `structuredClone`. Without
 * them, merely importing `@orpc/client` fails with
 * `ReferenceError: TransformStream is not defined`.
 *
 * Filling in only the *missing* names is not enough, and this was found by
 * running it: jsdom's own `AbortController` produces a signal that Node's
 * `Request` rejects — `RequestInit: Expected signal ("AbortSignal {}") to be an
 * instance of AbortSignal`. The whole family has to come from one realm, so
 * every name below is replaced rather than defaulted.
 *
 * A Jest environment module is loaded in the **Node** realm, so `globalThis`
 * here is Node's — which is what makes handing Node's implementations to the
 * jsdom context possible at all. It cannot be done from `setupFiles`: by then
 * `globalThis` is jsdom's, and Node's `fetch`, `Request` and `Response` are not
 * reachable through any `require`. That is also why no polyfill dependency is
 * added: Node already has these, and sharing one implementation is what keeps
 * `instanceof` working between the object a test builds and the one
 * `@orpc/client` builds.
 *
 * Scope is deliberately this lib only. `libs/i18n` and `libs/form` render
 * components and touch no network, so they keep plain jsdom.
 *
 * See `doc/decision/0037-*`.
 */

const JSDOMEnvironment = require('jest-environment-jsdom').default;

/**
 * The fetch/stream family, taken from Node as a set.
 *
 * `Headers`, `FormData`, `Blob`, `File` and `AbortController` exist in jsdom
 * too and are still overridden — a `Request` built from Node's class and a
 * `FormData` built from jsdom's do not mix.
 */
const WEB_GLOBALS = [
  'fetch',
  'Request',
  'Response',
  'Headers',
  'FormData',
  'Blob',
  'File',
  'ReadableStream',
  'WritableStream',
  'TransformStream',
  'TextEncoder',
  'TextDecoder',
  'structuredClone',
  'AbortController',
  'AbortSignal',
];

class WebApiJSDOMEnvironment extends JSDOMEnvironment {
  constructor(config, context) {
    super(config, context);

    const unavailable = WEB_GLOBALS.filter((name) => globalThis[name] === undefined);
    if (unavailable.length > 0) {
      // Fail loudly rather than leave jsdom's half-set in place and let the
      // failure surface later as an unrelated-looking TypeError.
      throw new Error(
        `This Node runtime does not provide: ${unavailable.join(', ')}. ` +
          'jest-environment-web.cjs cannot give jsdom a consistent fetch implementation.'
      );
    }

    for (const name of WEB_GLOBALS) {
      this.global[name] = globalThis[name];
    }
  }
}

module.exports = WebApiJSDOMEnvironment;
