import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  parseDescriptor, parseValues, valueOf, listItems, windowDelta,
  descriptorPathIn, declaredPackIds, readContributions, liveSourcesNeeded,
  valuesPath, legacyValuesPath, MAX_LIST_ITEMS, MAX_REPO_WIDGETS,
} from '../src/read/contributions.mjs';
import { FLAT_DASHBOARD_PATH } from '../src/read/flat.mjs';

const NOW = Date.UTC(2026, 7, 22, 12, 0, 0);

const descriptor = (over = {}) => JSON.stringify({
  widgets: [
    { id: 'stars', kind: 'stat', label: 'stars', noun: 'stars', glyph: '★', source: 'repo-stars' },
    { id: 'landed', kind: 'window', label: 'requirements changed', noun: 'reqs' },
    { id: 'last', kind: 'event', label: 'last release', source: 'latest-release' },
    { id: 'recent', kind: 'list', label: 'recently changed' },
  ],
  repo: ['stars', 'landed', 'last', 'recent'],
  ...over,
});

// --- discovery ---------------------------------------------------------------------

// THE TWO-ROOT FORM. The canon runs this from its own root and every member from a
// vendored mount, so a pattern anchored to either alone works everywhere except the
// tree it was written in.
test('a descriptor is found under both the canon root and a vendored mount', () => {
  assert.equal(descriptorPathIn(['packs/acme-pack-d/dashboard.json'], 'acme-pack-d'), 'packs/acme-pack-d/dashboard.json');
  assert.equal(
    descriptorPathIn(['.claudinite/shared/packs/acme-pack-d/dashboard.json'], 'acme-pack-d'),
    '.claudinite/shared/packs/acme-pack-d/dashboard.json',
  );
  assert.equal(descriptorPathIn(['packs/acme-pack-d/pack.mjs'], 'acme-pack-d'), null);
  // Not a prefix match: a pack whose id is a prefix of another's must not claim it.
  assert.equal(descriptorPathIn(['packs/git-github-extra/dashboard.json'], 'acme-pack-d'), null);
});

test('declared pack ids read both entry shapes', () => {
  assert.deepEqual(
    declaredPackIds({ packs: ['acme-pack', { id: 'acme-pack-d', config: {} }, { noId: true }, null] }),
    ['acme-pack', 'acme-pack-d'],
  );
});

// --- the descriptor ----------------------------------------------------------------

test('a descriptor resolves its views by id and reports the sources it needs', () => {
  const d = parseDescriptor(descriptor(), 'demo');
  assert.equal(d.fault, null);
  assert.deepEqual(d.repo, ['stars', 'landed', 'last', 'recent']);
  assert.deepEqual([...d.sources].sort(), ['generated', 'latest-release', 'repo-stars']);
  assert.equal(d.widgets.get('stars').glyph, '★');
});

// A member may run a pack version whose widget list is shorter than the ids a view
// names, so an unresolvable id is DROPPED rather than rendering an empty slot.
test('a view id naming no widget is dropped, not rendered', () => {
  const d = parseDescriptor(descriptor({ repo: ['stars', 'ghost'] }), 'demo');
  assert.deepEqual(d.repo, ['stars']);
});

test('the repo card is capped, and the cap does not silently reorder', () => {
  const many = Array.from({ length: 9 }, (_, i) => ({ id: `w${i}`, kind: 'stat', label: `w${i}`, noun: 'n' }));
  const d = parseDescriptor(JSON.stringify({ widgets: many, repo: many.map((w) => w.id) }), 'demo');
  assert.equal(d.repo.length, MAX_REPO_WIDGETS);
  assert.deepEqual(d.repo, ['w0', 'w1', 'w2', 'w3', 'w4', 'w5']);
});

// A glyph is recognition only, so a pack must not be able to buy a row of emoji by
// writing a longer string.
test('a glyph is one grapheme or none', () => {
  const one = (g) => parseDescriptor(JSON.stringify({ widgets: [{ id: 'w', kind: 'stat', label: 'w', glyph: g }] }), 'd').widgets.get('w').glyph;
  assert.equal(one('★'), '★');
  assert.equal(one('★★★'), null);
  assert.equal(one(''), null);
  assert.equal(one(42), null);
});

// A descriptor the reader cannot use becomes ONE named fault — never a broken page.
test('an unusable descriptor faults with a reason rather than throwing', () => {
  for (const [text, needle] of [
    ['{ not json', 'not valid JSON'],
    ['[]', 'not an object'],
    ['{}', 'no widgets array'],
    ['{"widgets":[{"no":"id"}]}', 'no usable widget'],
  ]) {
    const d = parseDescriptor(text, 'demo');
    assert.ok(d.fault?.includes(needle), `${text} → ${d.fault}`);
  }
});

// A kind newer than this page is KEPT rather than dropped, so the reader can say which
// widget it does not understand instead of silently rendering a shorter card.
test('an unknown kind is kept and marked, and resolves to its own state', () => {
  const d = parseDescriptor(JSON.stringify({ widgets: [{ id: 'w', kind: 'sparkline', label: 'w' }], repo: ['w'] }), 'demo');
  const w = d.widgets.get('w');
  assert.equal(w.known, false);
  assert.deepEqual(d.repo, ['w']);
  assert.equal(valueOf(w, { values: { values: { w: { value: 1 } } } }).state, 'unknown-kind');
});

// --- values and their absences -----------------------------------------------------

// UNKNOWN IS NOT ZERO, and there are four distinct ways to have no number.
test('every way of having no value is its own state', () => {
  const w = parseDescriptor(descriptor(), 'd').widgets.get('landed');
  assert.equal(valueOf(w, { values: undefined }).state, 'not-read');
  assert.equal(valueOf(w, { values: null }).state, 'no-file');
  assert.equal(valueOf(w, { values: { values: {} } }).state, 'absent');
  assert.equal(valueOf(w, { values: { values: { landed: { value: 3 } } } }).state, 'ok');
});

test('a live source distinguishes not-read from a repo that has none', () => {
  const d = parseDescriptor(descriptor(), 'd');
  const stars = d.widgets.get('stars');
  assert.equal(valueOf(stars, { live: {} }).state, 'not-read');
  assert.equal(valueOf(stars, { live: { stars: null } }).state, 'absent');
  assert.deepEqual(valueOf(stars, { live: { stars: 18 } }), { state: 'ok', value: { value: 18 } });

  const last = d.widgets.get('last');
  assert.equal(valueOf(last, { live: {} }).state, 'not-read');
  assert.equal(valueOf(last, { live: { release: null } }).state, 'absent');
  assert.equal(valueOf(last, { live: { release: { text: 'v1', at: null } } }).state, 'ok');
});

test('an unreadable values file is not an empty one', () => {
  assert.equal(parseValues(null), null);
  assert.equal(parseValues('{ broken').fault, 'unreadable');
  assert.deepEqual(parseValues('{"generatedAt":"x","values":{"a":{"value":1}}}'),
    { generatedAt: 'x', values: { a: { value: 1 } } });
});

// --- a widget's figures -------------------------------------------------------------

// The repo card has nothing else to compare a window against, so it keeps the previous.
test('a window widget carries its change against the previous window', () => {
  assert.deepEqual(windowDelta({ value: 12, previous: 7 }), { dir: 'up', by: 5, previous: 7 });
});

// A short list that looks complete is worse than no list.
test('a list caps its items and counts what it dropped', () => {
  const items = Array.from({ length: MAX_LIST_ITEMS + 3 }, (_, i) => ({ text: `REQ-${i}` }));
  const out = listItems({ items });
  assert.equal(out.shown.length, MAX_LIST_ITEMS);
  assert.equal(out.omitted, 3);
});

// The page must not lend its origin to whatever string a pack wrote.
test('a list item link is dropped unless it is https', () => {
  const out = listItems({ items: [
    { text: 'a', url: 'https://example.test/x' },
    { text: 'b', url: 'javascript:alert(1)' },
    { text: 'c', url: 'http://example.test/x' },
  ] });
  assert.deepEqual(out.shown.map((i) => i.url), ['https://example.test/x', null, null]);
});

// --- reading ------------------------------------------------------------------------

const fakeGh = (files) => ({
  getTextAtSha: async (_repo, _sha, path) => (path in files ? files[path] : null),
});

test('only declared packs with a descriptor in the tree are read', async () => {
  const asked = [];
  const gh = {
    getTextAtSha: async (_r, _s, path) => { asked.push(path); return path.endsWith('dashboard.json') ? descriptor() : null; },
  };
  const out = await readContributions({
    repo: 'o/r', sha: 'sha1', token: 't', gh,
    declaration: { packs: ['acme-tools', 'acme-pack'] },
    // `acme-pack` is declared but ships no descriptor; nothing is asked about it.
    paths: ['packs/acme-tools/dashboard.json', 'packs/acme-pack/pack.mjs'],
  });
  assert.deepEqual(out.map((c) => c.pack), ['acme-tools']);
  assert.ok(!asked.some((p) => p.includes('acme-pack')), asked.join(','));
});

test('a values file is read only when some widget actually asks for one', async () => {
  const liveOnly = JSON.stringify({ widgets: [{ id: 's', kind: 'stat', label: 's', noun: 's', source: 'repo-stars' }], repo: ['s'] });
  const asked = [];
  const gh = { getTextAtSha: async (_r, _s, path) => { asked.push(path); return path.endsWith('dashboard.json') ? liveOnly : null; } };
  await readContributions({
    repo: 'o/r', sha: 's', token: 't', gh,
    declaration: { packs: ['acme-pack-d'] }, paths: ['packs/acme-pack-d/dashboard.json'],
  });
  assert.ok(!asked.some((p) => p.includes(valuesPath('acme-pack-d'))), asked.join(','));
});

// A read the budget declined is not a pack with nothing to say.
test('a withheld descriptor read reports itself as withheld', async () => {
  const gh = { getTextAtSha: async () => { throw new Error('budget'); } };
  const [c] = await readContributions({
    repo: 'o/r', sha: 's', token: 't', gh,
    declaration: { packs: ['acme-pack-d'] }, paths: ['packs/acme-pack-d/dashboard.json'],
  });
  assert.equal(c.withheld, true);
  assert.equal(c.descriptor, undefined);
});

test('live sources are collected only from packs that name them', () => {
  const gen = { descriptor: parseDescriptor(JSON.stringify({ widgets: [{ id: 'a', kind: 'stat', label: 'a', noun: 'a' }] }), 'p') };
  assert.deepEqual([...liveSourcesNeeded([gen])], []);
  const live = { descriptor: parseDescriptor(descriptor(), 'p') };
  assert.deepEqual([...liveSourcesNeeded([live])].sort(), ['latest-release', 'repo-stars']);
});

test('a pack that reads a values file gets it parsed', async () => {
  const gh = fakeGh({
    'packs/demo/dashboard.json': descriptor(),
    [valuesPath('demo')]: JSON.stringify({ generatedAt: '2026-08-22T00:00:00Z', values: { landed: { value: 5, previous: 8, window: '2w' } } }),
  });
  const [c] = await readContributions({
    repo: 'o/r', sha: 's', token: 't', gh,
    declaration: { packs: ['demo'] }, paths: ['packs/demo/dashboard.json'],
  });
  assert.equal(c.values.values.landed.value, 5);
  assert.equal(valueOf(c.descriptor.widgets.get('landed'), { values: c.values }).state, 'ok');
});

// A converged member carries every declared pack's descriptor in one flat file, so
// the page spends one read on all of them and none per pack.
test('a member\'s flat descriptor file answers every pack in one read', async () => {
  const asked = [];
  const flat = JSON.stringify({ version: 1, dashboards: {
    'acme-tools': { path: 'packs/acme-tools/dashboard.json', declaration: JSON.parse(descriptor()) },
    'acme-undeclared': { path: 'packs/acme-undeclared/dashboard.json', declaration: JSON.parse(descriptor()) },
  } });
  const gh = { getTextAtSha: async (_r, _s, path) => { asked.push(path); return path === FLAT_DASHBOARD_PATH ? flat : null; } };
  const out = await readContributions({
    repo: 'o/r', sha: 's', token: 't', gh,
    declaration: { packs: ['acme-tools', 'acme-pack'] },
    paths: [FLAT_DASHBOARD_PATH, 'packs/acme-tools/dashboard.json'],
  });
  assert.deepEqual(out.map((c) => c.pack), ['acme-tools']);
  assert.ok(!out[0].descriptor.fault, out[0].descriptor.fault);
  assert.ok(!asked.some((p) => p.endsWith('/dashboard.json')), asked.join(','));
});

// A pack whose writer has not yet moved its values off the old path still shows them.
test('values still at their old path are read there, and only there', async () => {
  const asked = [];
  const values = JSON.stringify({ generatedAt: '2026-08-22T00:00:00Z', values: { landed: { value: 5, previous: 8, window: '2w' } } });
  const gh = { getTextAtSha: async (_r, _s, path) => {
    asked.push(path);
    if (path === 'packs/demo/dashboard.json') return descriptor();
    return path === legacyValuesPath('demo') ? values : null;
  } };
  const [c] = await readContributions({
    repo: 'o/r', sha: 's', token: 't', gh,
    declaration: { packs: ['demo'] }, paths: ['packs/demo/dashboard.json', legacyValuesPath('demo')],
  });
  assert.equal(c.values.values.landed.value, 5);
  assert.ok(!asked.includes(valuesPath('demo')), 'a member that has not moved spends no read on the new path');
});

// --- the shipped descriptor ----------------------------------------------------------

// The first caller, and the one that proves the contract carries its own weight: the
// star count the dashboard used to draw itself.
test('git-github contributes stars, and they resolve', () => {
  const d = parseDescriptor(readFileSync(new URL('../../git-github/dashboard.json', import.meta.url), 'utf8'), 'git-github'); // @real-entity the pack that actually ships the descriptor this reads
  assert.equal(d.fault, null);
  const w = d.widgets.get(d.repo[0]);
  assert.deepEqual(valueOf(w, { live: { stars: 18 } }), { state: 'ok', value: { value: 18 } });
});
