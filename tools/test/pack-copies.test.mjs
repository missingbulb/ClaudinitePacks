// THE DRIFT GUARD for the worker modules several packs carry a copy of. Packs share no
// code, so each pack holds its own `github-api.mjs` (the REST calls the SDK names no
// action for) and its own `deliver.mjs` (the commit-on-the-fetched-base, force-push and
// `openPr` lane); a fix landing in one copy has to land in every copy, and this is what
// says when one was missed. The REST copies are byte-identical. The delivery copies
// differ only in their comments and in the name of their scratch index, so they are
// compared with comments stripped and that one name normalized.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const root = new URL('../../', import.meta.url);
const tracked = (pattern) => execFileSync('git', ['ls-files', pattern], { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean);
const read = (path) => readFileSync(new URL(path, root), 'utf8');

test('every pack\'s github-api.mjs is the same file', () => {
  const copies = tracked('packs/*/**/github-api.mjs');
  assert.ok(copies.length >= 2, `expected the REST copy in several packs, found ${copies.join(', ') || 'none'}`);
  const [first, ...rest] = copies;
  const differing = rest.filter((p) => read(p) !== read(first));
  assert.deepEqual(differing, [], `differs from ${first}`);
});

const code = (text) => text
  .split('\n')
  .filter((line) => !/^\s*\/\//.test(line))
  .join('\n')
  .replace(/claudinite-[a-z]+-\$\{process\.pid\}/g, 'claudinite-INDEX-${process.pid}');

test('every pack\'s deliver.mjs runs the same delivery', () => {
  const copies = tracked('packs/*/tasks/*/deliver.mjs');
  assert.ok(copies.length >= 2, `expected the delivery copy in several packs, found ${copies.join(', ') || 'none'}`);
  const [first, ...rest] = copies;
  const differing = rest.filter((p) => code(read(p)) !== code(read(first)));
  assert.deepEqual(differing, [], `differs from ${first} outside comments and the scratch index's name`);
});
