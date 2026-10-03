import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nodeStamp, memberFromNode, memberFromFile, readMember, MEMBER_PATH, NODE_SETTINGS_PATH } from '../src/read/member.mjs';
import { isDormant } from '../src/read/dormancy.mjs';

// --- the Node stamp, by the frozen engine's rules ------------------------------------

// Each expectation is the frozen Node engine's own `installedVersions` answer over the
// same declaration, recorded once: that engine no longer changes, so the record is the
// reference, and the page carries its rules because it imports nothing from an engine.
const RECORDED = [
  [{ engineVersion: '0' }, null, {}],
  [{ engineVersion: 0 }, 0, {}],
  [{ engineVersion: '60928.01' }, null, {}],
  [{ engineVersion: ' 60928.1 ' }, ' 60928.1 ', {}],
  [{ engineVersion: '1.0' }, null, {}],
  [{ engineVersion: 12 }, 12, {}],
  [{ engineVersion: 3.5 }, null, {}],
  [{ engineVersion: -1 }, null, {}],
  [{ engineVersion: '60928.1' }, '60928.1', {}],
  [{ packs: [{ id: 'tidy-repo', version: 2 }] }, null, { basics: 2 }], // @real-entity the retired spelling and the id the rename map resolves it to
  [{ packs: [{ id: 'tidy-repo', version: 2 }, { id: 'basics', version: 5 }] }, null, { basics: 5 }], // @real-entity as above, both spellings present
  [{ packs: [{ id: 'basics', version: 5 }, { id: 'tidy-repo', version: 2 }] }, null, { basics: 5 }], // @real-entity as above, in the other order
  [{ packs: ['acme-pack', { id: 'acme-pack-b', version: '61001.2' }, { id: 'acme-pack-c', version: '1.0' }, { id: 'acme-pack-d' }] }, null, { 'acme-pack-b': '61001.2' }],
  [null, null, {}],
  [{}, null, {}],
  [{ packs: 'x' }, null, {}],
];

test('the Node stamp reads exactly as the frozen engine read it', () => {
  const diffs = RECORDED.filter(([raw, engine, held]) => {
    const got = nodeStamp(raw);
    return JSON.stringify(got) !== JSON.stringify({ engine: engine === null ? null : { version: engine }, held });
  }).map(([raw]) => JSON.stringify(raw));
  assert.deepEqual(diffs, []);
});

test('a Node member keeps its declaration whole and lists its packs by id', () => {
  const raw = { packs: ['acme-pack', { id: 'acme-pack-b', version: '61001.2', config: { a: 1 } }, { nope: true }], engineVersion: '61001.1' };
  const m = memberFromNode(raw);
  assert.equal(m.shape, 'node');
  assert.equal(m.settingsPath, NODE_SETTINGS_PATH);
  assert.deepEqual(m.declared, [{ id: 'acme-pack', config: undefined }, { id: 'acme-pack-b', config: { a: 1 } }]);
  assert.deepEqual(m.engine, { version: '61001.1' });
  assert.equal(m.declaration, raw);
  assert.equal(memberFromNode([]), null);
});

// --- the member file ------------------------------------------------------------------

const FILE = {
  version: 1,
  settings: { path: '.claudinite/settings.toml', format: 'toml' },
  engine: { package: '@claudinite/cn', version: '61003.1', channel: 'stable' },
  packs: { channel: 'canary', declared: [{ id: 'acme-pack' }, { id: 'acme-pack-b', config: { x: 1 }, via: 'acme-pack' }] },
  dormant: true,
  held: { 'acme-pack': '61001.2', 'acme-pack-b': 7 },
};

test('a cn member is read off its member file, its dormancy as stated', () => {
  const m = memberFromFile(JSON.stringify(FILE));
  assert.equal(m.shape, 'cn');
  assert.equal(m.settingsPath, '.claudinite/settings.toml');
  assert.deepEqual(m.declared, [{ id: 'acme-pack', config: undefined }, { id: 'acme-pack-b', config: { x: 1 } }]);
  assert.equal(m.dormant, true);
  assert.deepEqual(m.engine, { version: '61003.1' });
  assert.deepEqual(m.held, { 'acme-pack': '61001.2' }, 'a held version that is not a string is not a version');
  assert.deepEqual(m.declaration, { packs: [{ id: 'acme-pack' }, { id: 'acme-pack-b', config: { x: 1 } }] });
});

// The contrast: an engine-less member file (packs not yet loadable) reads as no engine,
// and a dormant field the file does not state as a boolean reads unknown, never awake:
// `null`, which the dormancy predicate still treats as not dormant.
test('an engine-less member file reads as no engine, and an unstated dormancy as unknown', () => {
  const m = memberFromFile(JSON.stringify({ ...FILE, engine: null, dormant: 'true' }));
  assert.equal(m.engine, null);
  assert.equal(m.dormant, null);
  const { dormant: _omit, ...withoutDormant } = FILE;
  assert.equal(memberFromFile(JSON.stringify(withoutDormant)).dormant, null);
  assert.equal(memberFromFile(JSON.stringify({ ...FILE, dormant: false })).dormant, false);
  assert.equal(isDormant(memberFromFile(JSON.stringify(withoutDormant))), false);
});

test('a member file the page cannot read is a named fault', () => {
  assert.match(memberFromFile('{').fault, /not valid JSON/);
  assert.match(memberFromFile('{"packs":{}}').fault, /no packs\.declared/);
  assert.match(memberFromFile('[]').fault, /no packs\.declared/);
});

// --- which file is read -----------------------------------------------------------------

const ghWith = (files) => {
  const asked = [];
  return {
    asked,
    getTextAtSha: async (_repo, _sha, path) => { asked.push(path); return files[path] ?? null; },
  };
};

test('the member file is asked first, and a cn member never falls back to its settings', async () => {
  const gh = ghWith({ [MEMBER_PATH]: JSON.stringify(FILE), [NODE_SETTINGS_PATH]: '{"packs":["acme-pack-z"]}' });
  const { member } = await readMember({ repo: 'o/a', sha: 's', token: 't', gh });
  assert.equal(member.shape, 'cn');
  assert.deepEqual(gh.asked, [MEMBER_PATH]);
});

test('a member file that is unreadable is a fault, not a fall back to the Node file', async () => {
  const gh = ghWith({ [MEMBER_PATH]: '{', [NODE_SETTINGS_PATH]: '{"packs":["acme-pack"]}' });
  const out = await readMember({ repo: 'o/a', sha: 's', token: 't', gh });
  assert.equal(out.member, null);
  assert.match(out.fault, /not valid JSON/);
});

test('a Node member is read at its settings file, and a repo with neither is not a member', async () => {
  const node = await readMember({ repo: 'o/a', sha: 's', token: 't', gh: ghWith({ [NODE_SETTINGS_PATH]: '{"packs":["acme-pack"]}' }) });
  assert.equal(node.member.shape, 'node');
  assert.deepEqual(await readMember({ repo: 'o/a', sha: 's', token: 't', gh: ghWith({}) }), { member: null });
  const bad = await readMember({ repo: 'o/a', sha: 's', token: 't', gh: ghWith({ [NODE_SETTINGS_PATH]: 'nope' }) });
  assert.match(bad.fault, /not valid JSON/);
});

// A caller already holding the tree listing spends no request on a file it lacks.
test('a known tree listing skips the file that is not there', async () => {
  const gh = ghWith({ [NODE_SETTINGS_PATH]: '{"packs":["acme-pack"]}' });
  await readMember({ repo: 'o/a', sha: 's', token: 't', gh, paths: [NODE_SETTINGS_PATH] });
  assert.deepEqual(gh.asked, [NODE_SETTINGS_PATH]);
});
