// This repository is a cn member that curates its own shelf: what it declares, and that every
// secret a declared task or endpoint names reaches the executor.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const settings = readFileSync(join(ROOT, '.claudinite/settings.yaml'), 'utf8');
const executor = readFileSync(join(ROOT, '.github/workflows/claudinite-executor.yml'), 'utf8');

const DECLARED = ['basics', 'git-github', 'claudinite-lifecycle', 'claudinite-tasks', 'claudinite-growth', 'claudinite-canon-curation'];

// The names the executor's env passes, the stamped block and the lines above it alike.
const passed = new Set([...executor.matchAll(/^\s+([A-Z][A-Z0-9_]*): \$\{\{ secrets\.\1 \}\}$/gm)].map((m) => m[1]));

test('the settings declare the six packs on canary, the curation pack among them', () => {
  const block = settings.slice(settings.indexOf('\npacks:'));
  assert.match(block, /^ {2}channel: "canary"$/m);
  for (const id of DECLARED) {
    assert.match(block, new RegExp(`^ {4}- (?:id: )?${id}$`, 'm'), id);
  }
});

test('claudinite-tasks names the default and the fleet endpoints, each with its token secret', () => {
  for (const [name, secret] of [['default', 'CCR_ROUTINE_TOKEN'], ['fleet', 'CCR_FLEET_ROUTINE_TOKEN']]) {
    assert.match(settings, new RegExp(`^ {10}${name}:\\n {12}url: "[^"\\n]*"\\n {12}tokenSecret: "${secret}"$`, 'm'), name);
  }
});

// The secrets a pack's tasks require, from both the shelf's copy and the vendored one.
function requiredSecrets(id) {
  const out = [];
  for (const base of ['packs', '.claudinite/shared/packs']) {
    const tasks = join(ROOT, base, id, 'tasks');
    if (!existsSync(tasks)) continue;
    for (const task of readdirSync(tasks)) {
      const file = join(tasks, task, 'task.json');
      if (existsSync(file)) out.push(...(JSON.parse(readFileSync(file, 'utf8')).code_work_required_secrets ?? []));
    }
  }
  return out;
}

test('every secret a declared task or endpoint names is passed to the executor', () => {
  const named = new Set([...settings.matchAll(/tokenSecret: "([A-Z0-9_]+)"/g)].map((m) => m[1]));
  for (const id of DECLARED) for (const s of requiredSecrets(id)) named.add(s);
  named.add('FLEET_GITHUB_TOKEN');
  const missing = [...named].filter((s) => !passed.has(s));
  assert.deepEqual(missing, [], 'secrets no executor env line passes');
});
