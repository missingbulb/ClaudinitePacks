import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));

// A URL's .pathname keeps percent-escapes, so a checkout path holding a space resolves to a file
// that does not exist; fileURLToPath decodes it.
test('no tool turns a file URL into a path with .pathname', () => {
  const files = execFileSync('git', ['ls-files', 'tools/*.mjs'], { cwd: REPO_ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
  assert.ok(files.length >= 15, `only ${files.length} tool modules found`);
  const hits = files.filter((f) => /new URL\([^)]*\)\.pathname/.test(readFileSync(join(REPO_ROOT, f), 'utf8')));
  assert.deepEqual(hits, []);
});
