import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

// Optional integration layer: catalog tests themselves need only Node.
let chromium;
let unavailable;
try {
  ({ chromium } = createRequire(import.meta.url)('playwright'));
} catch {
  unavailable = 'Optional browser tests require an available playwright package; see TESTING.md.';
}
const executablePath = process.env.CHROMIUM_PATH ||
  (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
if (chromium && !existsSync(executablePath || chromium.executablePath())) {
  unavailable = 'Chromium is missing; set CHROMIUM_PATH or provide a Playwright Chromium installation.';
}

test('prototype browser regression baseline', {
  skip: unavailable && !process.env.YMC_REQUIRE_BROWSER ? unavailable : false,
}, async t => {
  assert.equal(unavailable, undefined, unavailable);
  const allowed = new Map([
    ['/', ['index.html', 'text/html']],
    ['/index.html', ['index.html', 'text/html']],
    ['/app.js', ['app.js', 'text/javascript']],
    ['/catalog-loader.js', ['catalog-loader.js', 'text/javascript']],
    ['/styles.css', ['styles.css', 'text/css']],
    ['/content/catalog.json', ['content/catalog.json', 'application/json']],
    ['/assets/coffee-cup.svg', ['assets/coffee-cup.svg', 'image/svg+xml']],
    ['/assets/morning-cup-icon.png', ['assets/morning-cup-icon.png', 'image/png']],
  ]);
  // Serve only the existing prototype, on loopback and an ephemeral port.
  const server = createServer(async (request, response) => {
    const entry = allowed.get(new URL(request.url, 'http://localhost').pathname);
    if (!entry) { response.writeHead(404).end(); return; }
    try {
      const body = await readFile(new URL(`../${entry[0]}`, import.meta.url));
      response.writeHead(200, { 'Content-Type': entry[1], 'Cache-Control': 'no-store' }).end(body);
    } catch {
      response.writeHead(500).end();
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const origin = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    const catalog = JSON.parse(await readFile(new URL('../content/catalog.json', import.meta.url), 'utf8'));
    const open = async (width, fallback = false) => {
      const page = await browser.newPage({ viewport: { width, height: 850 } });
      const failures = [];
      page.on('pageerror', error => failures.push(error.message));
      page.on('console', message => {
        if (message.type() === 'warning' && message.text().startsWith('Morning Cup:')) failures.push('fallback');
      });
      const fallbackWarning = fallback ? page.waitForEvent('console', {
        predicate: message => message.type() === 'warning' && message.text().startsWith('Morning Cup:'),
      }) : undefined;
      if (fallback) await page.route('**/content/catalog.json', route => route.fulfill({ status: 503, body: '' }));
      await page.goto(origin);
      if (fallback) {
        await fallbackWarning;
        await page.waitForFunction(() => document.querySelector('.hero p[style]').textContent.includes('October 28'));
        assert.deepEqual(failures, ['fallback']);
      } else {
        await page.waitForFunction(label => document.querySelector('.hero p[style]').textContent === label, catalog.edition.label);
        assert.deepEqual(failures, []);
      }
      return page;
    };

    for (const width of [390, 1200]) {
      await t.test(`static HTML card resets Deep Dive scroll at ${width}px`, async () => {
        const page = await open(width, true);
        try {
          // Visit Deep Dive first so its scroll container exists in the mobile layout.
          await page.locator('.tab[data-go="deep"]').evaluate(button => button.click());
          const prior = await page.locator('#ymc-scroll-deep').evaluate(node => { node.scrollTop = 180; return node.scrollTop; });
          assert.ok(prior > 0, 'article must be scrolled before exercising the reset');
          await page.locator('#ymc-back').evaluate(button => button.click());
          const discover = await page.locator('#ymc-scroll-discover').evaluate(node => { node.scrollTop = 140; return node.scrollTop; });
          await page.locator('[data-dive]').first().evaluate(button => button.click());
          assert.equal(await page.locator('#ymc-scroll-deep').evaluate(node => node.scrollTop), 0);
          await page.locator('#ymc-back').evaluate(button => button.click());
          assert.equal(await page.locator('#ymc-scroll-discover').evaluate(node => node.scrollTop), discover);
        } finally { await page.close(); }
      });

      await t.test(`KNOWN DEFECT: JSON card retains prior Deep Dive scroll at ${width}px`, async () => {
        const page = await open(width);
        try {
          await page.locator('.tab[data-go="deep"]').evaluate(button => button.click());
          const prior = await page.locator('#ymc-scroll-deep').evaluate(node => { node.scrollTop = 180; return node.scrollTop; });
          assert.ok(prior > 0, 'article must be scrollable for this regression to be meaningful');
          await page.locator('#ymc-back').evaluate(button => button.click());
          await page.locator('#ymc-scroll-discover').evaluate(node => { node.scrollTop = 140; });
          const discover = await page.locator('#ymc-scroll-discover').evaluate(node => node.scrollTop);
          await page.locator('[data-dive]').first().evaluate(button => button.click());
          assert.equal(await page.locator('#ymc-scroll-deep').evaluate(node => node.scrollTop), prior,
            'characterization of existing defect; a deliberate production fix must update this expectation');
          await page.locator('#ymc-back').evaluate(button => button.click());
          assert.equal(await page.locator('#ymc-scroll-discover').evaluate(node => node.scrollTop), discover);
        } finally { await page.close(); }
      });
    }

    await t.test('mobile keyboard navigation, selected state, Library placeholder, and finite feed', async () => {
      const page = await open(390);
      try {
        assert.equal(await page.locator('#ymc-discover .item').count(), catalog.edition.discoveryIds.length);
        assert.equal(await page.locator('#ymc-deep .article').innerHTML(), catalog.deepDives.find(d => d.id === catalog.edition.featuredDiveId).html);
        await page.locator('.tab[data-go="discover"]').focus();
        for (const [key, section] of [['ArrowRight', 'deep'], ['End', 'library'], ['Home', 'discover'], ['ArrowLeft', 'library']]) {
          await page.keyboard.press(key);
          assert.equal(await page.locator('.tab[aria-selected="true"]').getAttribute('data-go'), section);
          assert.equal(await page.locator('.tab[tabindex="0"]').count(), 1);
          assert.equal(await page.locator('.pane.active').getAttribute('id'), `ymc-${section}`);
          assert.equal(await page.locator(':focus').getAttribute('data-go'), section);
        }
        await page.keyboard.press('Home');
        await page.locator('#ymc-scroll-discover').evaluate(node => { node.scrollTop = node.scrollHeight; });
        await page.evaluate(() => new Promise(requestAnimationFrame));
        assert.equal(await page.locator('#ymc-discover .item').count(), catalog.edition.discoveryIds.length);
        assert.equal(await page.locator('.edition-end').count(), 1);
        assert.match(await page.locator('.edition-end').innerText(), /Your cup is empty/);
        assert.match(await page.locator('#ymc-library').textContent(), /under construction/);
        assert.equal(await page.locator('#ymc-discover .linkline a').first().getAttribute('rel'), 'noopener noreferrer');
      } finally { await page.close(); }
    });

    await t.test('desktop displays all three panels and hides tabs', async () => {
      const page = await open(1200);
      try {
        assert.equal(await page.locator('.tabs').isVisible(), false);
        for (const id of ['discover', 'deep', 'library']) assert.equal(await page.locator(`#ymc-${id}`).isVisible(), true);
      } finally { await page.close(); }
    });
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
});
