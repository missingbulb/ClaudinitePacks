// THE DRIFT GUARD for `parseDescriptor`, the page's own reader of a pack's
// `dashboard.json`, against `cn dashboard descriptor`, which is the same reader in the
// engine: the `descriptor-usable` check blocks on its verdict, so a descriptor the
// check passes must be one the page renders, and one the page faults must be one the
// check refuses. The split is forced — the page runs in the viewer's browser and
// imports nothing from the engine — so both read the same texts here: every
// descriptor on the shelf, and the edges each rule exists for.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readdirSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDescriptor } from '../src/read/contributions.mjs';
import { CN, needsCn } from '../../../tools/test/cn-tasks.mjs';

const PACKS = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const w = (id, kind, over = {}) => ({ id, kind, label: id.toUpperCase(), ...over });
const EDGES = {
  'not-json': '{ widgets: [',
  'an-array': '[]',
  'no-widgets': JSON.stringify({ repo: ['a'] }),
  'no-usable-widget': JSON.stringify({ widgets: [{ kind: 'stat' }, null, 7, { id: '' }] }),
  'duplicates-and-dangling': JSON.stringify({
    widgets: [w('a', 'stat', { source: 'generated' }), w('a', 'list'), w('b', 'list', { source: 'not-a-source' })],
    repo: ['a', 'zz', 'b'], fleet: { member: 'b', deployment: ['a', 'nope'] },
  }),
  'unknown-kind-member': JSON.stringify({ widgets: [w('x', 'gauge')], repo: ['x'], fleet: { member: 'x' } }),
  'glyph-and-clipping': JSON.stringify({
    widgets: [w('s', 'stat', { glyph: ' ★ ', noun: 'n'.repeat(200), label: 'l'.repeat(200) }), w('t', 'event', { glyph: '★★' })],
    repo: ['s', 't', 's', 's', 's', 's', 's', 's', 's'], fleet: { member: 's', deployment: 's' },
  }),
  'every-kind': JSON.stringify({
    widgets: ['stat', 'event', 'window', 'list'].map((k) => w(`k-${k}`, k)),
    repo: ['k-stat', 'k-event', 'k-window', 'k-list'], fleet: { member: 'k-window', deployment: ['k-list'] },
  }),
};

// The page's verdict in the engine's JSON shape: the widget map as its values in
// declaration order, the views, and the fault.
const pageVerdict = (text, pack) => {
  const d = parseDescriptor(text, pack);
  if (d.fault) return { pack, widgets: null, repo: null, fleet: null, fault: d.fault };
  return { pack, widgets: [...d.widgets.values()], repo: d.repo, fleet: { member: d.member, deployment: d.deployment }, fault: null };
};

test('the page reads every descriptor exactly as cn dashboard descriptor does', needsCn, () => {
  const dir = mkdtempSync(join(tmpdir(), 'acme-descriptor-'));
  try {
    const files = [];
    for (const pack of readdirSync(PACKS)) {
      const f = join(PACKS, pack, 'dashboard.json');
      if (existsSync(f)) files.push(f);
    }
    assert.ok(files.length > 0, 'the shelf carries descriptors to compare');
    for (const [pack, text] of Object.entries(EDGES)) {
      mkdirSync(join(dir, pack));
      writeFileSync(join(dir, pack, 'dashboard.json'), text);
      files.push(join(dir, pack, 'dashboard.json'));
    }
    const r = spawnSync(CN, ['dashboard', 'descriptor', ...files, '--json'], { encoding: 'utf8' });
    const engine = JSON.parse(r.stdout);
    assert.equal(engine.length, files.length, r.stderr);
    const diffs = [];
    for (const [i, file] of files.entries()) {
      const { file: _f, problems: _p, ...cn } = engine[i];
      const page = pageVerdict(readFileSync(file, 'utf8'), cn.pack);
      try { assert.deepEqual(page, cn); } catch (e) { diffs.push(`${cn.pack}: ${e.message}`); }
    }
    assert.deepEqual(diffs, []);
    // Both answers are exercised: a fault the page shows, and a card it renders.
    assert.ok(engine.some((v) => v.fault) && engine.some((v) => !v.fault));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
