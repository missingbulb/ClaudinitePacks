import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { keyId, readRoots } from './sign.mjs';

test('keys/ holds only keys/roots', () => {
  assert.deepEqual(readdirSync(fileURLToPath(new URL('../../keys/', import.meta.url))), ['roots']);
});

test('keys/roots holds the key ceremony root and standby root, and nothing else', () => {
  const roots = readRoots(fileURLToPath(new URL('../../keys/roots/', import.meta.url)));
  assert.deepEqual(roots.map((r) => keyId(r)).sort(), ['196c6acb9cc31774', 'ea85f35421f375fc']);
});

test('sign.mjs reaches no key file: it imports only node: modules and names no keys/ path', () => {
  const src = readFileSync(new URL('./sign.mjs', import.meta.url), 'utf8');
  const imports = [...src.matchAll(/^\s*import\b[^'"]*['"]([^'"]+)['"]/gm)].map((m) => m[1]);
  assert.ok(imports.length > 0);
  assert.deepEqual(imports.filter((s) => !s.startsWith('node:')), []);
  assert.doesNotMatch(src, /keys\//);
});
