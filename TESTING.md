# Catalog validation and navigation baseline

This suite was introduced against `main` commit
`02c62dbc41e0e55939e993ad58ebf5d930dcfe74`. It adds test tooling only.
The prototype, editorial catalog, CSS, assets, and deployment configuration are unchanged.

## Required baseline: Node only

Use Node.js 22 or newer. No package installation is needed for catalog validation.
From the repository root:

```sh
node tests/catalog-validator.mjs
node --test tests/catalog.test.mjs
```

The first command validates the real catalog. It prints `PASS` and exits 0 for
valid data; otherwise it prints `FAIL`, lists field-specific errors, and exits 1.
It also accepts an alternative JSON file without modifying it:

```sh
node tests/catalog-validator.mjs /path/to/candidate-catalog.json
```

The second command runs the current catalog plus in-memory invalid fixtures and
CLI exit-code checks. Negative tests pass when invalid data is rejected with the
expected diagnostic. CLI tests use temporary files outside the checkout and
remove them afterward. A failed assertion produces a nonzero exit code.

The test-side contract checks:

- Root object, schema version 1, editorial status, and collection types.
- Unique, non-empty discovery IDs and Deep Dive IDs.
- Supported sections and `story`/`quote` kinds; required story or quote fields.
- A source object on every discovery, with a label and absolute HTTP(S) URL
  without embedded credentials. Requiring sources is an explicit editorial
  baseline rule; the existing renderer itself allows them to be omitted.
- Edition ID, label, real ISO calendar date, and a non-empty, unique selection
  of existing discovery IDs.
- Non-empty article HTML and valid story/featured Deep Dive references.

Unselected catalog items are allowed. The validator does not require exactly
eight discoveries, parse reading-time labels, enforce date freshness, or change
the application's catalog architecture. It does not fetch sources, verify facts,
validate/sanitize article HTML, or check links embedded inside that HTML.

## Optional browser regression tests

```sh
node --test tests/browser.test.mjs
```

These use Playwright and Chromium if already available. Without either, the
browser group explicitly reports **SKIP**; this is not evidence of browser
coverage. To require browser coverage and fail if prerequisites are missing:

```sh
YMC_REQUIRE_BROWSER=1 node --test tests/browser.test.mjs
```

The commands above use POSIX environment-variable syntax. In other shells set
`YMC_REQUIRE_BROWSER` before invoking Node. `CHROMIUM_PATH` may specify an existing
Chromium executable; otherwise the suite tries `/usr/bin/chromium`, then the
Playwright browser installation. Playwright must be resolvable by Node's
`require`, either in the environment or via `NODE_PATH`.

For an optional isolated Linux setup, outside the checkout:

```sh
npm install --prefix /tmp/ymc-browser-tools --no-save --package-lock=false playwright@1.62.1
NODE_PATH=/tmp/ymc-browser-tools/node_modules CHROMIUM_PATH=/path/to/chromium YMC_REQUIRE_BROWSER=1 node --test tests/browser.test.mjs
```

Replace `/path/to/chromium` with an installed browser. If none is installed,
provision Chromium separately before running this optional suite. No dependencies
or browsers are downloaded automatically by the tests. No packages were installed
when establishing this baseline.

Run both groups together with:

```sh
YMC_REQUIRE_BROWSER=1 node --test tests/*.test.mjs
```

The browser suite serves only existing prototype files on an ephemeral,
loopback-only HTTP port, launches headless Chromium, and closes both afterward.
The sandbox must allow loopback sockets and browser subprocesses. This managed
environment required execution outside its restricted command sandbox. The tests
do not access source websites, publish content, or write to the repository.

Coverage includes:

- Static fallback after a simulated catalog HTTP failure.
- Static and JSON-generated Deep Dive card behavior at 390px and 1200px widths,
  with a verified nonzero article scroll position before navigation.
- Discover scroll restoration after returning from Deep Dive.
- Mobile arrow/Home/End keyboard navigation, selected state, focus, and tab order.
- Catalog card count and featured article rendering, finite-feed end marker,
  external link attributes, and Library placeholder.
- Desktop three-panel display with hidden tabs.

Card navigation uses DOM button clicks deliberately, so Playwright's automatic
scroll-into-view does not change the seeded Discover scroll position. Keyboard
tests use browser keyboard events. This is Chromium coverage at two viewport
widths, not real-device, pointer-hit-target, Safari, Firefox, or assistive
technology certification. Finite-feed coverage checks the count after scrolling
to the end; it does not prove the absence of every possible future timed effect.

## Known defects: documented, not fixed

1. **Generated Deep Dive cards retain the old article scroll position.**
   `app.js:1` gives static `[data-dive]` buttons `go('deep', true)`, which resets
   scroll. `catalog-loader.js:27` instead clicks the Deep Dive tab, invoking
   `go('deep')`. The browser tests named `KNOWN DEFECT` assert this current
   behavior at both widths. Their passing means the defect was reproduced,
   not that retaining scroll is the desired product behavior. A future approved
   fix should change those expectations to require zero.
2. **Per-story Deep Dive IDs do not select an article.**
   `catalog-loader.js:13,27,33` always renders the featured dive and uses a story's
   ID only to decide whether to create a button. The current catalog has one
   linked dive, so its relationships are valid. Multi-article navigation is not
   operational and is not claimed by these tests.

Proposed production changes, requiring separate approval: route generated card
navigation through the same scroll-reset path as static cards; separately decide
whether/how story-specific IDs should select articles. Neither is implemented in
this branch. No refresh, refill, personalization, saving, or editorial changes
are included.

## Recorded baseline results

- Node.js 24.22.1, preinstalled Playwright 1.62.1, Chromium 155.0.8059.79 on Linux.
- Catalog suite: **47 passed, 0 failed**. The unchanged real catalog passes.
- Browser suite: **6 child checks passed** (7 tests including the parent),
  **0 failed, 0 skipped**. Both scroll-reset defect checks reproduce the behavior.
- No CI workflow is added; run these commands locally or in a future separately
  authorized CI integration. Green catalog-only results do not imply the optional
  browser suite ran.
