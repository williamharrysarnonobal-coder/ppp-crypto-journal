# Tests

Local tooling, not part of the site (excluded in `.assetsignore`).

- `node tests/runall.js` runs every `sim-*.js` (unit-style checks that load
  pieces of `js/dashboard.js` by text). Exit code 0 = all passed.
- `node tests/probe-mobile.js` opens the real dashboard in headless Chrome at
  390px with a fake Supabase (`fake-supabase.js`, made-up data) and checks
  that no page scrolls sideways. Needs Google Chrome installed at the default
  path.
- One-off browser probes: write the test body into `tests/mid-dbg.txt`, run
  `node tests/mk-dbg.js` (builds `probe-dbg.js` from `probe-poststop.js`), then
  `node tests/probe-dbg.js`.

Run both before every push. Screenshots and generated files here are
gitignored.
