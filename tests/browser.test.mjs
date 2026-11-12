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
    const multiple = JSON.parse(await readFile(new URL('./fixtures/catalog.multiple-deep-dives.json', import.meta.url), 'utf8'));
    const open = async (width, fallback = false, data = catalog) => {
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
      else if (data !== catalog) await page.route('**/content/catalog.json', route => route.fulfill({ json: data }));
      await page.goto(origin);
      if (fallback) {
        await fallbackWarning;
        await page.waitForFunction(() => document.querySelector('.hero p[style]').textContent.includes('October 28'));
        assert.deepEqual(failures, ['fallback']);
      } else {
        await page.waitForFunction(label => document.querySelector('.hero p[style]').textContent === label, data.edition.label);
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

      await t.test(`published single-dive JSON card resets Deep Dive scroll at ${width}px`, async () => {
        const page = await open(width);
        try {
          await page.locator('.tab[data-go="deep"]').evaluate(button => button.click());
          const prior = await page.locator('#ymc-scroll-deep').evaluate(node => { node.scrollTop = 180; return node.scrollTop; });
          assert.ok(prior > 0, 'article must be scrollable for this regression to be meaningful');
          await page.locator('#ymc-back').evaluate(button => button.click());
          await page.locator('#ymc-scroll-discover').evaluate(node => { node.scrollTop = 140; });
          const discover = await page.locator('#ymc-scroll-discover').evaluate(node => node.scrollTop);
          await page.locator('[data-dive]').first().evaluate(button => button.click());
          assert.equal(await page.locator('#ymc-scroll-deep').evaluate(node => node.scrollTop), 0);
          assert.equal(await page.locator('#ymc-deep .article').innerHTML(), catalog.deepDives[0].html);
          await page.locator('#ymc-back').evaluate(button => button.click());
          assert.equal(await page.locator('#ymc-scroll-discover').evaluate(node => node.scrollTop), discover);
        } finally { await page.close(); }
      });

      await t.test(`independent articles, card resets, tab preservation, and Discover restoration at ${width}px`, async () => {
        const page = await open(width, false, multiple);
        try {
          const tab = name => page.locator(`.tab[data-go="${name}"]`).evaluate(button => button.click());
          const deep = page.locator('#ymc-scroll-deep');
          const discover = page.locator('#ymc-scroll-discover');
          const article = page.locator('#ymc-deep .article');
          assert.equal(await article.innerHTML(), catalog.deepDives[0].html, 'featured dive remains the initial article');
          assert.equal(await page.locator('[data-dive]').count(), 3);
          // Revisit Pine Creek after Lumina, then the original fossil article.
          // This checks that distinct and repeated card selections always reset.
          for (const id of ['pine-creek-landscape', 'lumina-cosmic-dawn', 'pine-creek-landscape', 'fossil-timeline']) {
            const expected = multiple.deepDives.find(d => d.id === id);
            const discovery = multiple.items.find(item => item.deepDiveId === id);
            const button = page.locator('#ymc-discover .item').filter({
              has: page.getByRole('heading', { name: discovery.title, exact: true }),
            }).getByRole('button', { name: 'Take a Deeper Dive?' });
            assert.equal(await button.getAttribute('data-dive'), id, 'button belongs to the associated discovery');
            const before = await discover.evaluate(node => { node.scrollTop = 140; return node.scrollTop; });
            assert.ok(before > 0, 'Discover must be scrolled before leaving');
            await button.evaluate(button => button.click());
            assert.equal(await page.locator('.pane.active').getAttribute('id'), 'ymc-deep');
            assert.equal(await article.innerHTML(), expected.html);
            assert.equal(await deep.evaluate(node => node.scrollTop), 0, `${id} opens at the top`);

            const reading = await deep.evaluate(node => { node.scrollTop = 180; return node.scrollTop; });
            assert.ok(reading > 0, `${id} must be scrollable`);
            await tab('discover');
            assert.equal(await discover.evaluate(node => node.scrollTop), before);
            const updated = await discover.evaluate(node => { node.scrollTop = 210; return node.scrollTop; });
            await tab('deep');
            assert.equal(await article.innerHTML(), expected.html, 'tab switch must not replace the selected article');
            assert.equal(await deep.evaluate(node => node.scrollTop), reading, 'tab switch preserves article position');
            await tab('discover');
            assert.equal(await discover.evaluate(node => node.scrollTop), updated, 'tabs preserve updated Discover position');
            await tab('deep');
            assert.equal(await deep.evaluate(node => node.scrollTop), reading, 'repeated tab switches preserve reading position');
            await page.locator('#ymc-back').evaluate(button => button.click());
            assert.equal(await discover.evaluate(node => node.scrollTop), updated, 'Back restores Discover position');

            await button.evaluate(button => button.click());
            assert.equal(await article.innerHTML(), expected.html);
            assert.equal(await deep.evaluate(node => node.scrollTop), 0, 'reselecting the same article also resets');
            await deep.evaluate(node => { node.scrollTop = 180; });
            await page.locator('#ymc-back').evaluate(button => button.click());
            assert.equal(await discover.evaluate(node => node.scrollTop), updated);
          }
          assert.equal(await page.locator('#ymc-discover .item').count(), multiple.edition.discoveryIds.length);
          assert.equal(await page.locator('.edition-end').count(), 1);
        } finally { await page.close(); }
      });

      await t.test(`single-dive edition preserves both panel positions across tabs at ${width}px`, async () => {
        const page = await open(width);
        try {
          const tab = name => page.locator(`.tab[data-go="${name}"]`).evaluate(button => button.click());
          const discover = page.locator('#ymc-scroll-discover');
          const deep = page.locator('#ymc-scroll-deep');
          const before = await discover.evaluate(node => { node.scrollTop = 140; return node.scrollTop; });
          assert.ok(before > 0);
          await tab('deep');
          const reading = await deep.evaluate(node => { node.scrollTop = 180; return node.scrollTop; });
          assert.ok(reading > 0);
          await tab('discover');
          assert.equal(await discover.evaluate(node => node.scrollTop), before);
          await tab('deep');
          assert.equal(await deep.evaluate(node => node.scrollTop), reading);
          assert.equal(await page.locator('#ymc-deep .article').innerHTML(), catalog.deepDives[0].html);
          assert.equal(await page.locator('[data-dive]').count(), 1);
          assert.equal(await page.locator('.hero p[style]').textContent(), catalog.edition.label);
          assert.equal(await page.locator('body').textContent().then(text => text.includes('TEST CONTENT')), false);
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
