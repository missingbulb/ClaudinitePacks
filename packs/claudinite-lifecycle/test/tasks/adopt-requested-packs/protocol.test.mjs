import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { LABEL, MARK, MEMBER_TASK_ID, REQUESTED_TITLE, SUSPECTED_TITLE, entriesIn, withTargeting } from '../../../tasks/adopt-requested-packs/protocol.mjs';
import { CN, needsCn } from '../../../../../tools/test/cn-tasks.mjs';

// This copy of the add-packs protocol is the member half's; the fleet's half is
// the engine's, and `cn fleet protocol --json` prints it. A drift between the
// two strands every work list the fleet files: a title this task does not know
// is a work list nobody adopts.
test('adopt-requested-packs: the protocol is the one cn fleet writes', needsCn, () => {
  const r = spawnSync(CN, ['fleet', 'protocol', '--json'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const fleet = JSON.parse(r.stdout);
  assert.deepEqual(
    { label: LABEL, mark: MARK, memberTaskId: MEMBER_TASK_ID, requestedTitle: REQUESTED_TITLE, suspectedTitle: SUSPECTED_TITLE },
    { label: fleet.label, mark: fleet.mark, memberTaskId: fleet.memberTaskId, requestedTitle: fleet.requestedTitle, suspectedTitle: fleet.suspectedTitle },
  );
});

test('adopt-requested-packs: a requested body reads back its entries, and an unreadable one is null', () => {
  const body = withTargeting('Adopt these.\n\n```json\n[{"id": "acme-pack", "config": {"k": 1}}]\n```\n', { blockedBy: 4 });
  assert.match(body, /^Task: claudinite-lifecycle\/adopt-requested-packs\nBlocked-by: #4\n\n/);
  assert.deepEqual(entriesIn(body), [{ id: 'acme-pack', config: { k: 1 } }]);
  assert.equal(entriesIn('```json\n{"id": "acme-pack"}\n```'), null);
  assert.equal(entriesIn('no block'), null);
});
