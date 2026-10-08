// A pack's task, stub or skill may write a GitHub label only from the owner-approved list
// below: a label a task invents is a new category in every member's issue tracker, and no
// one asked for it. Adding a label here is the owner's call, never a pack change's.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

export const APPROVED_LABELS = new Set([
  'task:origin:planned',
  'task:origin:ad-hoc',
  'task:origin:manual',
  'task:status:waiting-for-executor',
  'task:status:running-executor',
  'task:status:running-agent',
  'task:status:blocked',
  'task:status:done',
  'task:status:rejected',
  'task:status:needs-human-action',
  'task:status:needs-human-decision',
  'task:status:needs-human-approval',
  'task:status:needs-human-failure',
  'task:urgent',
]);

const root = new URL('../../', import.meta.url);
const tracked = (...patterns) => execFileSync('git', ['ls-files', ...patterns], { cwd: root, encoding: 'utf8' })
  .split('\n').filter(Boolean)
  .filter((f) => !/(^|\/)(test|provenance|docs)\//.test(f) && !/\.test\.mjs$/.test(f) && !f.endsWith('VERSIONS.md'));

// The shapes a label is written in: a `labels: [...]` payload, a `--label` flag, a
// `labels=` query, an exported LABEL constant, and prose telling an agent to apply one.
const CODE_WRITES = [
  /labels\s*:\s*\[([^\]]*)\]/g,
  /--label[ =]["']?([A-Za-z0-9:_-]+)/g,
  /[?&]labels=([A-Za-z0-9:_,-]+)/g,
  /\bLABELS?\s*=\s*(['"][^;]*)/g,
];
const PROSE_WRITES = [
  /\blabel(?:led|s|ing)?\s+(?:it\s+|them\s+|with\s+|as\s+)?`([^`\s]+)`/gi,
  /`([^`\s]+)`\s+label/gi,
  /`(task:[a-z:-]+)`/g,
];
const literals = (text) => [...text.matchAll(/['"`]([^'"`]+)['"`]/g)].map((m) => m[1]);

export function labelsWritten(file, text) {
  const found = [];
  if (file.endsWith('.md')) {
    for (const re of PROSE_WRITES) for (const m of text.matchAll(re)) found.push(m[1]);
  } else {
    for (const re of CODE_WRITES) {
      for (const m of text.matchAll(re)) {
        const vals = /^['"]/.test(m[1]) || m[1].includes("'") || m[1].includes('"') ? literals(m[1]) : m[1].split(',');
        found.push(...vals.filter((v) => v && !v.includes('${') && !v.startsWith('$')));
      }
    }
  }
  return found.filter((l) => /^[a-z0-9][a-z0-9:_-]*[a-z0-9]$/i.test(l));
}

test('the scanner sees each shape a label is written in', () => {
  assert.deepEqual(labelsWritten('a.mjs', "fetch(x, { body: { title, labels: ['made-up'] } })"), ['made-up']);
  assert.deepEqual(labelsWritten('a.yml', 'gh issue create --label made-up --title t'), ['made-up']);
  assert.deepEqual(labelsWritten('a.mjs', "api(`/repos/r/issues?state=open&labels=made-up&per_page=1`)"), ['made-up']);
  assert.deepEqual(labelsWritten('a.mjs', "export const LABEL = 'made-up';"), ['made-up']);
  assert.deepEqual(labelsWritten('a.md', 'then label it `made-up` and stop'), ['made-up']);
  assert.deepEqual(labelsWritten('a.md', 'opens a `made-up` label'), ['made-up']);
  assert.deepEqual(labelsWritten('a.md', 'a plain `made-up` word'), []);
  assert.deepEqual(labelsWritten('a.md', 'the `task:` prefix, or `ndi.label` labels'), []);
});

test('every label a pack writes is on the approved list', () => {
  const files = tracked('packs/**/*.mjs', 'packs/**/*.js', 'packs/**/*.json', 'packs/**/*.yml', 'packs/**/*.yaml',
    'packs/**/*.sh', 'packs/**/*.md');
  assert.ok(files.length > 100, `only ${files.length} pack files found - the scan's scope is wrong`);
  const bad = [];
  for (const file of files) {
    for (const label of labelsWritten(file, readFileSync(new URL(file, root), 'utf8'))) {
      if (!APPROVED_LABELS.has(label)) bad.push(`${file}: ${label}`);
    }
  }
  assert.deepEqual([...new Set(bad)], []);
});
