import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { readCatalog, validateCatalog } from './catalog-validator.mjs';

const catalog = await readCatalog(new URL('../content/catalog.json', import.meta.url));
const multiple = await readCatalog(new URL('./fixtures/catalog.multiple-deep-dives.json', import.meta.url));
const validator = fileURLToPath(new URL('./catalog-validator.mjs', import.meta.url));
const run = path => spawnSync(process.execPath, [validator, ...(path ? [path] : [])], { encoding: 'utf8' });

test('existing editorial catalog passes the baseline contract', () => {
  assert.deepEqual(validateCatalog(catalog), []);
});

test('published November 2 catalog remains byte-for-byte unchanged', async () => {
  const bytes = await readFile(new URL('../content/catalog.json', import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),
    '54c17c455a8a3ed159115c343333d61b2bfba91856b2bbede2905243b56385af');
});

test('multiple-Deep-Dive fixture passes validation with the requested independent relationships', () => {
  assert.deepEqual(validateCatalog(multiple), []);
  assert.equal(multiple.items.find(x => x.id === '2026-11-02-02').deepDiveId, 'pine-creek-landscape');
  assert.equal(multiple.items.find(x => x.id === '2026-11-02-07').deepDiveId, 'lumina-cosmic-dawn');
  assert.equal(multiple.deepDives.length, catalog.deepDives.length + 2);
  assert.equal(multiple.edition.featuredDiveId, catalog.edition.featuredDiveId);
});

test('fixture preserves all existing editorial text and adds only test metadata, relationships, and articles', () => {
  const copy = structuredClone(multiple);
  for (const id of ['2026-11-02-02', '2026-11-02-07']) delete copy.items.find(x => x.id === id).deepDiveId;
  copy.editorialStatus = catalog.editorialStatus;
  copy.edition.id = catalog.edition.id;
  copy.edition.label = catalog.edition.label;
  for (const dive of copy.deepDives.slice(catalog.deepDives.length)) {
    assert.match(dive.html, /TEST CONTENT/);
    assert.match(dive.html, /not for publication/i);
  }
  copy.deepDives = copy.deepDives.slice(0, catalog.deepDives.length);
  assert.deepEqual(copy, catalog);
  assert.match(multiple.editorialStatus, /test-only/);
  assert.match(multiple.edition.label, /TEST CONTENT/);
  assert.notEqual(multiple.edition.id, catalog.edition.id);
});

// Mutations are made only to in-memory copies; editorial files are never rewritten.
const cases = [
  ['null root', () => null, /catalog: must be an object/],
  ['unsupported schema', d => { d.schemaVersion = 2; }, /schemaVersion/],
  ['missing editorial status', d => { delete d.editorialStatus; }, /editorialStatus/],
  ['non-array items', d => { d.items = {}; }, /items: must be an array/],
  ['invalid item', d => { d.items[0] = null; }, /items\[0\]: must be an object/],
  ['duplicate discovery ID', d => { d.items[1].id = d.items[0].id; }, /items\[1\].id: duplicate ID/],
  ['missing discovery ID', d => { delete d.items[0].id; }, /items\[0\].id/],
  ['unknown section', d => { d.items[0].section = 'Other'; }, /items\[0\].section/],
  ['unsupported kind', d => { d.items[0].kind = 'video'; }, /items\[0\].kind/],
  ...['meta', 'title', 'summary'].map(field => [`missing story ${field}`, d => { d.items[0][field] = ' '; }, new RegExp(`items\\[0\\].${field}`)]),
  ...['quote', 'attribution'].map(field => [`missing quote ${field}`, d => { delete d.items.find(x => x.kind === 'quote')[field]; }, new RegExp(`items\\[7\\].${field}`)]),
  ['missing source', d => { delete d.items[0].source; }, /items\[0\].source: must be a source object/],
  ['blank source label', d => { d.items[0].source.label = ''; }, /source.label/],
  ...['/relative', 'javascript:alert(1)', 'https://user:secret@example.com', 'not a url', 42].map(url => [
    `invalid source URL ${String(url)}`, d => { d.items[0].source.url = url; }, /source.url/,
  ]),
  ['non-array Deep Dives', d => { d.deepDives = null; }, /deepDives: must be an array/],
  ['invalid Deep Dive record', d => { d.deepDives[0] = []; }, /deepDives\[0\]: must be an object/],
  ['duplicate Deep Dive ID', d => { d.deepDives.push(structuredClone(d.deepDives[0])); }, /deepDives\[1\].id: duplicate ID/],
  ['missing Deep Dive ID', d => { delete d.deepDives[0].id; }, /deepDives\[0\].id/],
  ['empty article', d => { d.deepDives[0].html = ''; }, /deepDives\[0\].html/],
  ['dangling story Deep Dive', d => { d.items[0].deepDiveId = 'missing'; }, /items\[0\].deepDiveId: unknown Deep Dive/],
  ['invalid story Deep Dive ID', d => { d.items[0].deepDiveId = null; }, /items\[0\].deepDiveId: must be/],
  ['missing edition', d => { delete d.edition; }, /edition: must be an object/],
  ...['id', 'label', 'featuredDiveId'].map(field => [`missing edition ${field}`, d => { delete d.edition[field]; }, new RegExp(`edition.${field}`)]),
  ...['2026-02-30', '2026-13-01', '11/02/2026', null].map(date => [
    `invalid edition date ${String(date)}`, d => { d.edition.date = date; }, /edition.date/,
  ]),
  ['empty selection', d => { d.edition.discoveryIds = []; }, /edition.discoveryIds: must be a non-empty array/],
  ['non-array selection', d => { d.edition.discoveryIds = {}; }, /edition.discoveryIds: must be a non-empty array/],
  ['duplicate selection', d => { d.edition.discoveryIds.push(d.edition.discoveryIds[0]); }, /duplicate discovery reference/],
  ['dangling discovery', d => { d.edition.discoveryIds[0] = 'missing'; }, /unknown discovery "missing"/],
  ['invalid discovery reference', d => { d.edition.discoveryIds[0] = null; }, /edition.discoveryIds\[0\]: must be/],
  ['dangling featured dive', d => { d.edition.featuredDiveId = 'missing'; }, /edition.featuredDiveId: unknown Deep Dive/],
];
for (const [name, mutate, expected] of cases) {
  test(`rejects ${name} with a field-specific diagnostic`, () => {
    const copy = structuredClone(catalog);
    const changed = mutate(copy);
    const errors = validateCatalog(changed === undefined ? copy : changed);
    assert.ok(errors.some(error => expected.test(error)), JSON.stringify(errors));
  });
}

test('reports multiple independent errors together', () => {
  const copy = structuredClone(catalog);
  copy.items[0].title = '';
  copy.items[1].source = null;
  const errors = validateCatalog(copy);
  assert.ok(errors.some(e => e.includes('items[0].title')));
  assert.ok(errors.some(e => e.includes('items[1].source')));
});

test('does not require all catalog items to be selected or impose freshness', () => {
  const copy = structuredClone(catalog);
  copy.edition.discoveryIds = [copy.items[0].id];
  copy.edition.date = '2000-01-01';
  assert.deepEqual(validateCatalog(copy), []);
});

test('CLI exits zero for the repository catalog', () => {
  const result = run();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /PASS/);
});

test('CLI exits nonzero for invalid content, malformed JSON, and missing files', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ymc-validation-'));
  try {
    const path = join(directory, 'catalog.json');
    const copy = structuredClone(catalog);
    copy.edition.discoveryIds = ['missing'];
    await writeFile(path, JSON.stringify(copy));
    let result = run(path);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /edition.discoveryIds\[0\]: unknown discovery/);
    await writeFile(path, '{bad JSON');
    result = run(path);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /cannot read\/parse catalog/);
    result = run(join(directory, 'absent.json'));
    assert.equal(result.status, 1);
    assert.match(result.stderr, /cannot read\/parse catalog/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
