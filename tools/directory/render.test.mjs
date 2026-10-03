import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readShelf, render, stableVersions } from './render.mjs';

const RENDER = fileURLToPath(new URL('./render.mjs', import.meta.url));
const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));

function acmeShelf() {
  const root = mkdtempSync(join(tmpdir(), 'acme-directory-'));
  const put = (id, manifest) => {
    mkdirSync(join(root, id));
    writeFileSync(join(root, id, 'pack.json'), JSON.stringify(manifest));
  };
  put('acme-pack', { version: '61001.2', ruleRoutingGuidance: { belongs: 'acme | things', excludes: 'not\nthese' }, requires: ['acme-pack-l'] });
  put('acme-pack-l', { version: '61001.1', seededByDefault: true, relevanceDetector: { about: 'an acme.json', paths: 'acme\\.json$' } });
  put('acme-hidden', { version: '61001.1', hidden: true });
  mkdirSync(join(root, 'not-a-pack'));
  return root;
}

const CATALOG = { v: 1, serial: 3, packs: [
  { id: 'acme-pack', version: '61001.1', channel: 'stable' },
  { id: 'acme-pack', version: '61001.2', channel: 'canary' },
  { id: 'acme-pack-l', version: '61001.1', channel: 'canary' },
] };

test('a row per offered pack, sorted, with the stable version the catalog names and a hidden pack left out', () => {
  const doc = render(readShelf(acmeShelf()), stableVersions(CATALOG));
  const rows = doc.split('\n').filter((l) => l.startsWith('| `'));
  assert.deepEqual(rows, [
    '| `acme-pack` | 61001.2 | 61001.1 | acme \\| things | not these | declared by hand (opt-in) | `acme-pack-l` |',
    '| `acme-pack-l` | 61001.1 | — |  |  | seeded at adoption; fingerprinted: an acme.json | — |',
  ]);
  assert.doesNotMatch(doc, /acme-hidden/);
  assert.match(doc, /tools\/directory\/render\.mjs/);
  assert.equal(render(readShelf(acmeShelf()), stableVersions(CATALOG)), doc, 'rendering is deterministic');
});

test('render.mjs --check passes on a current doc and fails, exit 1, on one that drifted', () => {
  const shelf = acmeShelf();
  const catalog = join(shelf, 'catalog.json');
  writeFileSync(catalog, JSON.stringify(CATALOG));
  const out = join(shelf, 'directory.md');
  const run = (...args) => spawnSync(process.execPath, [RENDER, '--packs', shelf, '--catalog', catalog, '--out', out, ...args], { encoding: 'utf8' });
  assert.equal(run().status, 0);
  const ok = run('--check');
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  writeFileSync(out, readFileSync(out, 'utf8') + '\nhand edit\n');
  const bad = run('--check');
  assert.equal(bad.status, 1, bad.stdout + bad.stderr);
  assert.match(bad.stdout, /pack directory is stale/);
});

// The Stable column moves only when a person promotes a version, so the committed doc is held to
// the real catalog where the shelf's CI has the vendored branch; here, the real manifests.
test('the real shelf: every offered pack has its row at its manifest version', () => {
  const packs = readShelf(join(REPO_ROOT, 'packs'));
  assert.ok(packs.length > 0);
  const doc = readFileSync(join(REPO_ROOT, 'packs/directory.GENERATED.md'), 'utf8');
  for (const p of packs) {
    const row = new RegExp(`^\\| \`${p.id}\` \\| ${p.version.replace(/\./g, '\\.')} \\|`, 'm');
    if (p.hidden) assert.doesNotMatch(doc, new RegExp(`^\\| \`${p.id}\` \\|`, 'm'), p.id);
    else assert.match(doc, row, `${p.id} ${p.version}`);
  }
});
