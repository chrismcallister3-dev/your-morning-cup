import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const sections = new Set([
  'The Daily Pour', 'A Little Froth', 'Something to Chew On', 'The Last Sip',
]);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = value => typeof value === 'string' && value.trim().length > 0;

// Test-side contract for the current catalog, not a replacement application loader.
// Return all actionable errors rather than failing at the first missing field.
export function validateCatalog(catalog) {
  const errors = [];
  const issue = (path, message) => errors.push(`${path}: ${message}`);
  const requiredText = (value, path) => {
    if (!text(value)) issue(path, 'must be a non-empty string');
  };
  const source = (value, path) => {
    if (!object(value)) return issue(path, 'must be a source object');
    requiredText(value.label, `${path}.label`);
    try {
      if (!text(value.url) || value.url !== value.url.trim()) throw new Error();
      const url = new URL(value.url);
      if (!['https:', 'http:'].includes(url.protocol) || !url.hostname || url.username || url.password) {
        throw new Error();
      }
    } catch {
      issue(`${path}.url`, 'must be an absolute HTTP(S) URL without credentials or surrounding whitespace');
    }
  };
  const records = (value, path) => {
    const ids = new Set();
    if (!Array.isArray(value)) {
      issue(path, 'must be an array');
      return ids;
    }
    value.forEach((record, i) => {
      if (!object(record)) return issue(`${path}[${i}]`, 'must be an object');
      requiredText(record.id, `${path}[${i}].id`);
      if (text(record.id)) {
        if (ids.has(record.id)) issue(`${path}[${i}].id`, `duplicate ID ${JSON.stringify(record.id)}`);
        ids.add(record.id);
      }
    });
    return ids;
  };

  if (!object(catalog)) return ['catalog: must be an object'];
  if (catalog.schemaVersion !== 1) issue('schemaVersion', 'must equal 1');
  requiredText(catalog.editorialStatus, 'editorialStatus');
  const itemIds = records(catalog.items, 'items');
  const diveIds = records(catalog.deepDives, 'deepDives');

  if (Array.isArray(catalog.items)) catalog.items.forEach((item, i) => {
    if (!object(item)) return;
    const path = `items[${i}]`;
    if (!sections.has(item.section)) issue(`${path}.section`, 'must name a supported Discover section');
    if (!['story', 'quote'].includes(item.kind)) issue(`${path}.kind`, 'must be story or quote');
    const fields = item.kind === 'quote' ? ['quote', 'attribution'] : ['meta', 'title', 'summary'];
    fields.forEach(field => requiredText(item[field], `${path}.${field}`));
    // Every current editorial item has a source; retain that baseline even though
    // the production renderer tolerates missing sources.
    source(item.source, `${path}.source`);
    if (Object.hasOwn(item, 'deepDiveId')) {
      requiredText(item.deepDiveId, `${path}.deepDiveId`);
      if (text(item.deepDiveId) && !diveIds.has(item.deepDiveId)) {
        issue(`${path}.deepDiveId`, `unknown Deep Dive ${JSON.stringify(item.deepDiveId)}`);
      }
    }
  });

  if (Array.isArray(catalog.deepDives)) catalog.deepDives.forEach((dive, i) => {
    if (object(dive)) requiredText(dive.html, `deepDives[${i}].html`);
  });

  if (!object(catalog.edition)) {
    issue('edition', 'must be an object');
    return errors;
  }
  const edition = catalog.edition;
  ['id', 'label', 'featuredDiveId'].forEach(field => requiredText(edition[field], `edition.${field}`));
  if (typeof edition.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(edition.date) ||
      !Number.isFinite(Date.parse(edition.date)) ||
      new Date(edition.date).toISOString().slice(0, 10) !== edition.date) {
    issue('edition.date', 'must be a real calendar date in YYYY-MM-DD format');
  }
  if (!Array.isArray(edition.discoveryIds) || edition.discoveryIds.length === 0) {
    issue('edition.discoveryIds', 'must be a non-empty array');
  } else {
    const selected = new Set();
    edition.discoveryIds.forEach((id, i) => {
      const path = `edition.discoveryIds[${i}]`;
      requiredText(id, path);
      if (!text(id)) return;
      if (selected.has(id)) issue(path, `duplicate discovery reference ${JSON.stringify(id)}`);
      selected.add(id);
      if (!itemIds.has(id)) issue(path, `unknown discovery ${JSON.stringify(id)}`);
    });
  }
  if (text(edition.featuredDiveId) && !diveIds.has(edition.featuredDiveId)) {
    issue('edition.featuredDiveId', `unknown Deep Dive ${JSON.stringify(edition.featuredDiveId)}`);
  }
  return errors;
}

export async function readCatalog(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const path = process.argv[2] ?? new URL('../content/catalog.json', import.meta.url);
  try {
    const errors = validateCatalog(await readCatalog(path));
    if (errors.length) {
      console.error(`FAIL: ${errors.length} catalog validation error(s)\n${errors.map(e => `- ${e}`).join('\n')}`);
      process.exitCode = 1;
    } else {
      console.log('PASS: catalog structure, sources, IDs, edition relationships, and Deep Dive references');
    }
  } catch (error) {
    console.error(`FAIL: cannot read/parse catalog: ${error.message}`);
    process.exitCode = 1;
  }
}
