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

// The pack-version-history task orders VERSIONS.md rows with its own copy of the release index's
// version order, since a pack imports nothing from tools/; both are run over every pair here.
test('the version-history task orders pack versions as the release index does', async () => {
  const { compareVersions: index } = await import('../release/index.mjs');
  const { compareVersions: history } = await import('../../packs/claudinite-canon-curation/tasks/pack-version-history/order.mjs');
  const versions = ['61001', '61001.1', '61001.9', '61001.10', '61002.3', '61002.3.0', '0.0.0', '1.0', '0.60101.1', '1.61004.0',
    '1.61004.1', '1.61004.2', '1.61004.10', '1.61005.1', '2.60101.1', '1.61300.1', '01.61004.1'];
  const differing = versions.flatMap((a) => versions.map((b) => [a, b])).filter(([a, b]) => Math.sign(index(a, b)) !== Math.sign(history(a, b)));
  assert.deepEqual(differing, []);
});
