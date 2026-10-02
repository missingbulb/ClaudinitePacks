import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as v from '../../../tasks/fleet-add-missing-packs/queue-vocabulary.mjs';
import { cnTasks, needsCn } from '../../../../../tools/test/cn-tasks.mjs';

// THE DRIFT GUARD for this task's copy of the work item's vocabulary, run over one
// corpus with `cn tasks grammar`: the status a mark's re-ask clears, and the machine
// block a rewrite must carry over, read as the engine reads them.

const LABEL_SETS = [
  [], [v.STATUS_READY], [v.STATUS_BLOCKED], [v.STATUS_RUNNING_AGENT], [v.STATUS_NEEDS_HUMAN_APPROVAL],
  [v.STATUS_NEEDS_HUMAN_FAILURE], [v.STATUS_DONE], [v.STATUS_REJECTED], [v.ORIGIN_AD_HOC],
  [v.LEGACY_READY], [v.LEGACY_AGENT], [v.NEEDS_HUMAN], ['task:needs-human-decision'], [v.LEGACY_TASK_DONE],
  [v.OUTCOME_OBSOLETE], [v.STATUS_READY, v.STATUS_NEEDS_HUMAN_ACTION],
];

const HUMAN = ['Declare these packs:\n- acme-pack\n', '', 'One line.'];
const BLOCKS = ['packs/acme-pack/tasks/acme-task/worker.mjs', 'packs/acme-pack/tasks/acme-task/worker.mjs\nBlocked-by: #2\n'];

test('the mark reads an item\'s status exactly as the engine does', needsCn, () => {
  const issues = LABEL_SETS.map((labels, i) => ({ number: i + 1, title: 'x', body: '', state: 'open', labels }));
  const engine = cnTasks('grammar', { issues }).issues;
  const diffs = issues.filter((it, i) => v.statusOf(it) !== engine[i].status).map((it) => it.labels.join(','));
  assert.deepEqual(diffs, []);
});

test('a re-attached machine block leaves the person\'s half exactly as the engine reads it', needsCn, () => {
  const bodies = HUMAN.flatMap((h) => BLOCKS.map((b) => v.withMachineBlock(h, b)));
  const engine = cnTasks('grammar', { bodies }).bodies;
  HUMAN.flatMap((h) => BLOCKS.map((b) => [h, b])).forEach(([h, b], i) => {
    assert.equal(engine[i].human, h.trim(), `the person's half of ${JSON.stringify(bodies[i])}`);
    assert.equal(v.machineBlockOf(bodies[i]).trim(), b.trim());
    assert.equal(v.withMachineBlock(bodies[i], b), bodies[i], 'replacing a block with itself changes nothing');
  });
});

test('leaving a status clears every spelling of it', () => {
  assert.ok(v.spellingsOf(v.STATUS_READY).includes(v.LEGACY_READY));
  const park = v.spellingsOf(v.STATUS_NEEDS_HUMAN_ACTION);
  for (const s of [...v.PARK_STATUSES, v.NEEDS_HUMAN]) assert.ok(park.includes(s), s);
});
