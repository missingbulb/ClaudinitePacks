import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ENTRY_KEYS, INDEX_KEYS, readIndex, serialize } from './index.mjs';

const DOC = new URL('../../docs/release.md', import.meta.url);

test('the index example in docs/release.md is exactly what the writer serializes', () => {
  const doc = readFileSync(DOC, 'utf8');
  const blocks = [...doc.matchAll(/^```json\n([\s\S]*?)^```$/gm)].map((m) => m[1]);
  const examples = blocks.filter((b) => b.includes('"serial"'));
  assert.equal(examples.length, 1, 'docs/release.md carries one index example');
  const ix = readIndex(Buffer.from(examples[0]));
  assert.deepEqual(Object.keys(ix), INDEX_KEYS);
  for (const e of ix.versions) assert.deepEqual(Object.keys(e), ENTRY_KEYS);
  assert.equal(serialize(ix).toString('utf8'), examples[0]);
});

test('docs/release.md states the reader contract and what SHA256SUMS is for', () => {
  const doc = readFileSync(DOC, 'utf8');
  assert.match(doc, /ignores unknown/);
  assert.match(doc, /SHA256SUMS[^\n]*\n?[^\n]*not a trust boundary/);
});
