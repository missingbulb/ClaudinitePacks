import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { CN, needsCn } from '../../../tools/test/cn-tasks.mjs';

const script = join(dirname(fileURLToPath(import.meta.url)), '..', 'write_store_codeowners.mjs');

function store(settings) {
  const root = mkdtempSync(join(tmpdir(), 'acme-store-'));
  const put = (rel, body) => { mkdirSync(dirname(join(root, rel)), { recursive: true }); writeFileSync(join(root, rel), body); };
  put('.claudinite/settings.yaml', settings);
  put('people/octocat/RULES.md', '- mine\n');
  put('people/Bad/RULES.md', '- not a login\n');
  spawnSync('git', ['init', '-q'], { cwd: root });
  spawnSync('git', ['add', '-A'], { cwd: root });
  return root;
}

const run = (root) => spawnSync(process.execPath, [script], { cwd: root, encoding: 'utf8', env: { ...process.env, CLAUDINITE_CN: CN, CLAUDE_PROJECT_DIR: root } });

test('the block is written from the store the entry config names, read through cn', needsCn, () => {
  const root = store('packs:\n  declared:\n    - id: claude-code-web-users-support\n      config:\n        repo: acme/prefs\n        path: people\n');
  try {
    const r = run(root);
    assert.equal(r.status, 0, r.stderr);
    const text = readFileSync(join(root, '.github/CODEOWNERS'), 'utf8');
    assert.match(text, /^\/people\/ @acme$/m);
    assert.match(text, /^\/people\/octocat\/ @octocat @acme$/m);
    assert.doesNotMatch(text, /Bad/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('a declaration naming no store is refused, naming the config it wants', needsCn, () => {
  const root = store('packs:\n  declared:\n    - claude-code-web-users-support\n');
  try {
    const r = run(root);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /declares no usable claude-code-web-users-support store/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
