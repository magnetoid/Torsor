// Newer Node runtimes (22+) ship a built-in, experimental global `localStorage` /
// `sessionStorage` that exists on `globalThis` even when non-functional (it throws unless
// launched with `--localstorage-file`). Vitest's jsdom environment only copies a `window` key
// onto the test global when that key isn't *already* present on `global` (see `populateGlobal`
// in vitest's jsdom environment) — so on those Node versions, jsdom's real, working Storage
// implementation gets silently shadowed by Node's broken one, and any code that touches
// `localStorage` (e.g. authStore's token persistence) throws at module-init time.
//
// Point the globals at jsdom's own implementation so tests behave the same across Node
// versions, whether or not Node's built-in Web Storage happens to be present.
const jsdomWindow = (globalThis as unknown as { jsdom?: { window: Window } }).jsdom?.window;
if (jsdomWindow) {
  for (const key of ['localStorage', 'sessionStorage'] as const) {
    Object.defineProperty(globalThis, key, {
      configurable: true,
      enumerable: true,
      get: () => jsdomWindow[key],
    });
  }
}
