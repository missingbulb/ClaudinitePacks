import { test } from 'node:test';
import assert from 'node:assert/strict';
import { entriesIn, withTargeting } from '../../../tasks/adopt-requested-packs/protocol.mjs';

test('adopt-requested-packs: a requested body reads back its entries, and an unreadable one is null', () => {
  const body = withTargeting('Adopt these.\n\n```json\n[{"id": "acme-pack", "config": {"k": 1}}]\n```\n', { blockedBy: 4 });
  assert.match(body, /^Task: claudinite-lifecycle\/adopt-requested-packs\nBlocked-by: #4\n\n/);
  assert.deepEqual(entriesIn(body), [{ id: 'acme-pack', config: { k: 1 } }]);
  assert.equal(entriesIn('```json\n{"id": "acme-pack"}\n```'), null);
  assert.equal(entriesIn('no block'), null);
});
