import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, chmodSync, utimesSync, statSync, readdirSync, lstatSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const VENDOR = fileURLToPath(new URL('./vendor.mjs', import.meta.url));
const PACKS = fileURLToPath(new URL('../../packs/', import.meta.url));
const scratch = () => mkdtempSync(join(tmpdir(), 'acme-vendor-'));

function put(root, path, content) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
}

function acmePack(root, id = 'acme-pack', version = '60101.1') {
  const dir = join(root, id);
  put(dir, 'pack.json', JSON.stringify({ version }) + '\n');
  put(dir, 'RULES.md', '# rules\n');
  put(dir, 'test/pack.test.mjs', 'test\n');
  put(dir, 'docs/design.md', 'design\n');
  put(dir, 'provenance/RULES.md', 'why\n');
  put(dir, 'skills/acme-skill/SKILL.md', 'skill\n');
  put(dir, 'skills/acme-skill/provenance/payload.md', 'kept\n');
  put(dir, 'skills/acme-skill/test/fixture.md', 'kept\n');
  put(dir, 'updates/flow.mjs', 'kept\n');
  put(dir, `deep/${'d'.repeat(90)}/${'e'.repeat(60)}.md`, 'long path\n');
  put(dir, 'bin/run.sh', '#!/bin/sh\n');
  put(dir, 'checks/acme.go', 'package checks\n');
  put(dir, 'checks/acme_test.go', 'package checks\n');
  put(dir, 'skills/acme-skill/acme_test.go', 'kept\n');
  chmodSync(join(dir, 'bin/run.sh'), 0o755);
  return dir;
}

function vendor(...args) {
  try {
    return { status: 0, stdout: execFileSync(process.execPath, [VENDOR, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) };
  } catch (e) {
    return { status: e.status ?? 1, stdout: (e.stdout ?? '') + (e.stderr ?? '') };
  }
}

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

test('writes <id>-<version>.tar.gz and a matching .sha256 named from pack.json', () => {
  const pack = acmePack(scratch());
  const out = scratch();
  const r = vendor(pack, out);
  assert.equal(r.status, 0, r.stdout);
  const archive = readFileSync(join(out, 'acme-pack-60101.1.tar.gz'));
  assert.equal(readFileSync(join(out, 'acme-pack-60101.1.sha256'), 'utf8'), `${sha256(archive)}  acme-pack-60101.1.tar.gz\n`);
});

test('drops test/, docs/ and provenance/ at the pack root and checks/*_test.go, keeping everything else', () => {
  const pack = acmePack(scratch());
  const out = scratch();
  assert.equal(vendor(pack, out).status, 0);
  const listed = execFileSync('tar', ['-tzf', join(out, 'acme-pack-60101.1.tar.gz')], { encoding: 'utf8' }).trim().split('\n').sort();
  assert.deepEqual(listed, [
    'RULES.md',
    'bin/run.sh',
    'checks/acme.go',
    `deep/${'d'.repeat(90)}/${'e'.repeat(60)}.md`,
    'pack.json',
    'skills/acme-skill/SKILL.md',
    'skills/acme-skill/acme_test.go',
    'skills/acme-skill/provenance/payload.md',
    'skills/acme-skill/test/fixture.md',
    'updates/flow.mjs',
  ]);
});

test('extracts to the same bytes and keeps the executable bit', () => {
  const pack = acmePack(scratch());
  const out = scratch();
  assert.equal(vendor(pack, out).status, 0);
  const x = scratch();
  execFileSync('tar', ['-xzf', join(out, 'acme-pack-60101.1.tar.gz'), '-C', x]);
  assert.equal(readFileSync(join(x, 'skills/acme-skill/SKILL.md'), 'utf8'), 'skill\n');
  assert.equal(readFileSync(join(x, `deep/${'d'.repeat(90)}/${'e'.repeat(60)}.md`), 'utf8'), 'long path\n');
  assert.ok(statSync(join(x, 'bin/run.sh')).mode & 0o100);
  assert.equal(statSync(join(x, 'RULES.md')).mode & 0o111, 0);
});

test('two runs give byte-identical archives, whatever the files\' mtimes', () => {
  const pack = acmePack(scratch());
  const a = scratch();
  const b = scratch();
  assert.equal(vendor(pack, a).status, 0);
  utimesSync(join(pack, 'RULES.md'), new Date(2001, 1, 1), new Date(2001, 1, 1));
  assert.equal(vendor(pack, b).status, 0);
  const name = 'acme-pack-60101.1.tar.gz';
  assert.equal(sha256(readFileSync(join(a, name))), sha256(readFileSync(join(b, name))));
});

test('refuses a pack without a version', () => {
  const root = scratch();
  const pack = acmePack(root);
  writeFileSync(join(pack, 'pack.json'), '{}\n');
  const r = vendor(pack, scratch());
  assert.notEqual(r.status, 0);
  assert.match(r.stdout, /acme-pack.*version/);
});

test('--all builds every pack under the root and prints id, version, size and SHA-256', () => {
  const root = scratch();
  acmePack(root, 'acme-pack', '60101.1');
  acmePack(root, 'acme-other', '60102.3');
  put(root, 'README.md', 'not a pack\n');
  const out = scratch();
  const r = vendor('--all', root, out);
  assert.equal(r.status, 0, r.stdout);
  for (const [id, version] of [['acme-pack', '60101.1'], ['acme-other', '60102.3']]) {
    const file = `${id}-${version}.tar.gz`;
    const buf = readFileSync(join(out, file));
    assert.match(r.stdout, new RegExp(`${id}\\s+${version.replace('.', '\\.')}\\s+${buf.length}\\s+${sha256(buf)}`));
  }
});

test('--all fails naming the pack that has no pack.json', () => {
  const root = scratch();
  acmePack(root);
  mkdirSync(join(root, 'acme-broken'));
  const r = vendor('--all', root, scratch());
  assert.notEqual(r.status, 0);
  assert.match(r.stdout, /acme-broken/);
});

// Every test/, docs/ or updates/ folder below a pack root but not at it: the depth at which the
// design's root-only rule and Claudinite's any-depth rule would vendor different sets. Both drop
// provenance/ at the root only, so a nested one is no disagreement.
function nestedDroppedFolders(packsDir) {
  const names = new Set(['test', 'docs', 'updates']);
  const found = [];
  const walk = (dir, rel, depth) => {
    for (const name of readdirSync(dir).sort()) {
      if (!lstatSync(join(dir, name)).isDirectory()) continue;
      const path = `${rel}/${name}`;
      if (depth >= 2 && names.has(name)) found.push(path);
      walk(join(dir, name), path, depth + 1);
    }
  };
  for (const id of readdirSync(packsDir).sort()) {
    if (lstatSync(join(packsDir, id)).isDirectory()) walk(join(packsDir, id), id, 1);
  }
  return found;
}

test('the real shelf holds no test/, docs/ or updates/ folder below a pack root, so the two vendoring rules agree', () => {
  assert.deepEqual(nestedDroppedFolders(PACKS), [],
    'a nested folder makes the design\'s root-only rule and Claudinite\'s any-depth rule vendor different sets: move the folder, or decide the rule (missingbulb/ClaudinitePacks#3 item 1, #9)');
});

test('nestedDroppedFolders finds a nested test/ in a synthetic pack and ignores the root-level ones', () => {
  const root = scratch();
  acmePack(root);
  assert.deepEqual(nestedDroppedFolders(root), ['acme-pack/skills/acme-skill/test']);
});
