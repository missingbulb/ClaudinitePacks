import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const FILE = new URL('../../.node-version', import.meta.url);

test('.node-version holds one integer major and this Node runs it', () => {
  const text = readFileSync(FILE, 'utf8');
  assert.match(text, /^\d+\n?$/, '.node-version must hold a single integer major');
  const major = text.trim();
  assert.equal(process.versions.node.split('.')[0], major, `running Node ${process.versions.node}, .node-version pins ${major}`);
});
