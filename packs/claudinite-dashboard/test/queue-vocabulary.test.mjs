import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as v from '../src/read/queue-vocabulary.mjs';
import { cnTasks, needsCn } from '../../../tools/test/cn-tasks.mjs';

// THE DRIFT GUARD for `src/read/queue-vocabulary.mjs`, the page's own copy of the work
// item's decode. The split is forced — the page reads issues in a browser, where cn
// cannot run — so the copy is run over one corpus with `cn tasks grammar`, and the
// first label set, title, body or path the two read differently fails here rather than
// on a rendered board.

const LABEL_SETS = [
  [], [v.STATUS_READY], [v.STATUS_BLOCKED, v.URGENT], [v.STATUS_RUNNING_EXECUTOR], [v.STATUS_RUNNING_AGENT],
  [v.STATUS_NEEDS_HUMAN_ACTION], [v.STATUS_NEEDS_HUMAN_DECISION], [v.STATUS_NEEDS_HUMAN_APPROVAL], [v.STATUS_NEEDS_HUMAN_FAILURE],
  [v.STATUS_DONE], [v.STATUS_REJECTED], [v.STATUS_DONE, v.OUTCOME_DELIVERED], [v.ORIGIN_AD_HOC], [v.ORIGIN_AD_HOC, v.STATUS_READY],
  [v.ORIGIN_PLANNED, v.STATUS_READY], [v.ORIGIN_MANUAL], [v.ORIGIN_GITHUB, v.STATUS_NEEDS_HUMAN_FAILURE],
  [v.LEGACY_BLOCKED], [v.LEGACY_READY], [v.LEGACY_EXECUTING], [v.LEGACY_AGENT], [v.NEEDS_HUMAN],
  ['task:needs-human-approval'], ['task:needs-human-oddity'], [v.LEGACY_TASK_DONE], [v.LEGACY_TASK_OBSOLETE],
  [v.OUTCOME_DONE], [v.OUTCOME_OBSOLETE], [v.STATUS_READY, v.STATUS_NEEDS_HUMAN_ACTION], ['bug'],
];

const TITLES = [
  `${v.WORK_PREFIX} acme-pack/acme-task`, `${v.WORK_PREFIX} acme-pack/acme-task for #12`, `${v.WORK_PREFIX} barriers/acme-task`,
  `${v.WORK_PREFIX} tidy-repo/acme-task`, `${v.WORK_PREFIX} static-website/acme-task`,
  `${v.WORK_PREFIX} acme-pack`, 'acme-pack/acme-task', `${v.WORK_PREFIX}  acme-pack/acme-task  x `, '',
];

const BLOCK = (lines) => `${v.MACHINE_BLOCK_START}\n${lines}\n${v.MACHINE_BLOCK_END}`;
const BODIES = [
  '', 'packs/acme-pack/tasks/acme-task/task.md\n',
  'packs/acme-pack/tasks/acme-task/task.md\nNot-before: 2026-01-01T00:00:00Z\nBlocked-by: #3, #4\nRequest: #9\nModel: opus\nMerge: yes\nEnds-when: #5 closed\nTarget-branch: b\nTarget-pr: #6\nSupersedes: #7\n',
  'packs/acme-pack/tasks/acme-task/task.md\nMerge: never\nWoken: 2026-02-02T00:00:00Z\n\n## Last verdict\n\n- precondition: no — nothing moved\n',
  `My own words about the thing.\n\n${BLOCK('packs/acme-pack/tasks/acme-task/worker.mjs\nBlocked-by: #2')}\n`,
  'Blocked-by: #2 #x, #3\nNot-before: soon\n',
];

const TASK_PATHS = [
  'packs/acme-pack/tasks/acme-task/task.md', '.claudinite/shared/packs/acme-pack/tasks/acme-task/task.md',
  '.claudinite/local/packs/acme-pack/tasks/acme-task/task.md', 'packs/claudinite-tasks/queue/tasks/acme-task/task.md',
  '.claudinite/shared/packs/claudinite-tasks/public/implement-request.md', 'acme-task/task.md', '',
];

const issue = (labels, i) => ({ number: i + 1, title: `${v.WORK_PREFIX} acme-pack/acme-task`, body: '', state: 'open', labels });

test('the page decodes a work item exactly as the engine does', needsCn, () => {
  const engine = cnTasks('grammar', {
    titles: TITLES, bodies: BODIES, issues: LABEL_SETS.map(issue), taskPaths: TASK_PATHS,
  });
  const diffs = [];
  const same = (what, page, cn) => {
    try { assert.deepStrictEqual(page, cn); } catch { diffs.push(`${what}: page ${JSON.stringify(page)} engine ${JSON.stringify(cn)}`); }
  };
  LABEL_SETS.forEach((labels, i) => {
    const it = issue(labels, i);
    const e = engine.issues[i];
    same(`statusOf ${labels}`, v.statusOf(it), e.status);
    same(`statusesOn ${labels}`, v.statusesOn(it), e.statuses);
    same(`parkKindOf ${labels}`, v.parkKindOf(it), e.park);
    same(`originOf ${labels}`, v.originOf(it), e.origin);
    same(`outcomeOf ${labels}`, v.outcomeOf(it), e.outcome);
    same(`isQueueItem ${labels}`, v.isQueueItem(it), e.queueItem);
    same(`isBlockingPark ${labels}`, v.isBlockingPark(it), e.blockingPark);
  });
  TITLES.forEach((t, i) => same(`title ${JSON.stringify(t)}`, v.parseWorkItemTitle(t), engine.titles[i]));
  BODIES.forEach((b, i) => {
    same(`body ${JSON.stringify(b)}`, v.parseWorkItemBody(b), engine.bodies[i].fields);
    same(`last verdict ${JSON.stringify(b)}`, v.parseLastVerdict(b), engine.bodies[i].lastVerdict);
  });
  TASK_PATHS.forEach((p, i) => same(`path ${p}`, v.taskIdFromPath(p), engine.taskPaths[i]));
  assert.deepEqual(diffs, []);
});
