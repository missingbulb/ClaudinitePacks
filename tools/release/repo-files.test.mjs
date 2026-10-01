import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const CODEOWNERS = fileURLToPath(new URL('../../.github/CODEOWNERS', import.meta.url));

// The last matching CODEOWNERS line wins, so the owner of a path is the last rule whose pattern
// covers it. Only the pattern forms this file may use are understood; anything else fails.
function ownersOf(text, path) {
  let owners = null;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const [pattern, ...who] = line.split(/\s+/);
    if (pattern !== '*' && !/^\/?[\w.-]+\/$/.test(pattern)) throw new Error(`CODEOWNERS pattern this test does not understand: ${pattern}`);
    if (pattern === '*' || path.startsWith(pattern.replace(/^\//, ''))) owners = who;
  }
  return owners;
}

test('.github/CODEOWNERS makes the owner review every change to packs/, tools/ and .github/', () => {
  assert.ok(existsSync(CODEOWNERS), '.github/CODEOWNERS is missing');
  const text = readFileSync(CODEOWNERS, 'utf8');
  for (const path of ['packs/basics/RULES.md', 'tools/release/release.mjs', '.github/workflows/verify-import.yml', '.github/CODEOWNERS']) {
    assert.deepEqual(ownersOf(text, path), ['@missingbulb'], path);
  }
});
