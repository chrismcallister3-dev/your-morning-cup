# Catalog validation and navigation baseline

Test 02 introduced this suite against `main` commit
`02c62dbc41e0e55939e993ad58ebf5d930dcfe74`. Test 03 starts from merged Test 02
commit `4c71af7100648b05094a75eede7a893bc68cc85d` and adds independent Deep Dive
selection on the development branch `test/multiple-deep-dives`.
The published editorial catalog, HTML, CSS, assets, and deployment configuration
remain unchanged. The development JavaScript changes are not deployed by this work.

## Required baseline: Node only

Use Node.js 22 or newer. No package installation is needed for catalog validation.
From the repository root:

```sh
node tests/catalog-validator.mjs
node tests/catalog-validator.mjs tests/fixtures/catalog.multiple-deep-dives.json
node --test tests/catalog.test.mjs
```

The first command validates the real catalog. It prints `PASS` and exits 0 for
valid data; otherwise it prints `FAIL`, lists field-specific errors, and exits 1.
It also accepts an alternative JSON file without modifying it:

```sh
node tests/catalog-validator.mjs /path/to/candidate-catalog.json
```

The test-runner command runs both catalogs plus in-memory invalid fixtures and
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

The browser suite serves only prototype files on an ephemeral,
loopback-only HTTP port, launches headless Chromium, and closes both afterward.
The sandbox must allow loopback sockets and browser subprocesses. This managed
environment required execution outside its restricted command sandbox. The tests
do not access source websites, publish content, or write to the repository.

Coverage includes:

- Static fallback after a simulated catalog HTTP failure.
- Static and JSON-generated Deep Dive card behavior at 390px and 1200px widths,
  with a verified nonzero article scroll position before navigation.
- Independent Pine Creek, Lumina, and original fossil article selection through
  their associated discovery cards; repeated and different card selections reset
  article scroll to zero.
- Both panels retain their positions when switching tabs. The selected article
  remains unchanged across tab switches, for both single- and multiple-dive data.
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

Desktop tabs remain hidden as before. Tests invoke their DOM click pathway to
check the same navigation code at desktop widths without changing that design.

## Test 03 implementation and fixture isolation

`catalog-loader.js` indexes Deep Dives by ID. Each generated discovery button
captures the article referenced by that item's `deepDiveId`. A click renders
that article and dispatches the `ymc:open-dive` DOM event on the application root.
`app.js` listens for that event and uses the existing `go('deep', true)` path,
which shows the panel and resets article scroll after it is visible. Static HTML
buttons retain their existing behavior. Missing story-to-dive references reject
catalog rendering before the existing cards are replaced.

Ordinary tabs and the Back button do not render an article or request a reset.
Thus tab switches keep the current article and reading position, while Discover
continues to use its existing scroll-restoration code. The featured article is
still selected initially, so existing single-dive editions continue to work.
No per-article scroll history is introduced: every discovery-card opening starts
at the top, including reselecting the same article.

`tests/fixtures/catalog.multiple-deep-dives.json` copies the November 2 edition,
retains its fossil article, and adds **two additional** test articles (three total):

| Discovery | Additional Deep Dive |
| --- | --- |
| `2026-11-02-02` | `pine-creek-landscape` |
| `2026-11-02-07` | `lumina-cosmic-dawn` |

The fixture has a distinct edition ID, a `TEST CONTENT` label, test-only editorial
status, and explicit not-for-publication notices in both added articles. The
articles discuss the landscape and simulation substantively but are development
material based on the existing discovery summaries; they have not received
independent factual or editorial review.

The application still fetches only `content/catalog.json`. Browser tests intercept
that response with the fixture in memory. The test server does not expose fixture
paths, and no production fixture switch or query parameter is added. Nothing in
this work publishes an edition or changes deployment settings.

Node tests pin the published catalog's SHA-256 and verify the fixture retains all
existing editorial text, the original article, the date, discovery order, and
featured-dive ID. Only test metadata, the two associations, and two articles differ.
The byte guard intentionally needs explicit review if the published edition is
legitimately updated in future work.

Both defects recorded in Test 02 are corrected in the development JavaScript:
generated cards now select their own article and reset scroll. The prior
`KNOWN DEFECT` assertions now require the corrected behavior. No refresh, refill,
personalization, saving, or published editorial changes are included.

## Recorded Test 03 results

- Node.js 24.22.1, preinstalled Playwright 1.62.1, Chromium 155.0.8059.79 on Linux.
- Catalog suite: **50 passed, 0 failed**. Both catalogs pass, invalid fixtures fail
  meaningfully, and the published-edition preservation checks pass.
- Browser suite: **10 child checks passed** (11 tests including the parent),
  **0 failed, 0 skipped**. Combined result: **61 passed**.
- No CI workflow is added; run these commands locally or in a future separately
  authorized CI integration. Green catalog-only results do not imply the optional
  browser suite ran.
