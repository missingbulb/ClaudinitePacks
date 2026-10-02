import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as w from '../../../tasks/usage-fold/queue-wire.mjs';
import { cnTasks, needsCn } from '../../../../../tools/test/cn-tasks.mjs';

// THE DRIFT GUARD for `tasks/usage-fold/queue-wire.mjs`, the fold's own copy of the
// queue's wire. The split is forced — packs share no code and the queue is the
// engine's — so the copy is run over one corpus with `cn tasks grammar` and `cn tasks
// queue`, and the first label set, title, body, path, record or anchor the two read
// differently fails here rather than as a wrong count in a folded file.

const LABEL_SETS = [
  [], [w.STATUS_READY], [w.STATUS_BLOCKED], [w.STATUS_RUNNING_EXECUTOR], [w.STATUS_RUNNING_AGENT],
  [w.STATUS_NEEDS_HUMAN_ACTION], [w.STATUS_NEEDS_HUMAN_DECISION], [w.STATUS_NEEDS_HUMAN_APPROVAL], [w.STATUS_NEEDS_HUMAN_FAILURE],
  [w.STATUS_DONE], [w.STATUS_REJECTED], [w.STATUS_DONE, w.OUTCOME_DELIVERED], [w.ORIGIN_AD_HOC], [w.ORIGIN_AD_HOC, w.STATUS_READY],
  [w.ORIGIN_PLANNED, w.STATUS_READY], [w.ORIGIN_MANUAL], [w.ORIGIN_GITHUB, w.STATUS_NEEDS_HUMAN_FAILURE],
  [w.LEGACY_BLOCKED], [w.LEGACY_READY], [w.LEGACY_EXECUTING], [w.LEGACY_AGENT], [w.NEEDS_HUMAN],
  ['task:needs-human-approval'], ['task:needs-human-oddity'], [w.LEGACY_TASK_DONE], [w.LEGACY_TASK_OBSOLETE],
  [w.OUTCOME_DONE], [w.OUTCOME_OBSOLETE], [w.OUTCOME_DELIVERED], [w.STATUS_READY, w.STATUS_NEEDS_HUMAN_ACTION],
  [w.STATUS_NEEDS_HUMAN_APPROVAL, w.STATUS_NEEDS_HUMAN_FAILURE], ['bug'],
];

const TITLES = [
  `${w.WORK_PREFIX} acme-pack/acme-task`, `${w.WORK_PREFIX} acme-pack/acme-task for #12`, `${w.WORK_PREFIX} barriers/acme-task`,
  `${w.WORK_PREFIX} tidy-repo/acme-task`, `${w.WORK_PREFIX} static-website/acme-task`,
  `${w.WORK_PREFIX} acme-pack`, 'acme-pack/acme-task', `${w.WORK_PREFIX}  acme-pack/acme-task  x `, '',
];

const BLOCK = (lines) => `${w.MACHINE_BLOCK_START}\n${lines}\n${w.MACHINE_BLOCK_END}`;
const BODIES = [
  '', 'packs/acme-pack/tasks/acme-task/task.md\n',
  'packs/acme-pack/tasks/acme-task/task.md\nNot-before: 2026-01-01T00:00:00Z\nBlocked-by: #3, #4\nRequest: #9\nModel: opus\nMerge: yes\nEnds-when: #5 closed\nTarget-branch: b\nTarget-pr: #6\nSupersedes: #7\n',
  'packs/acme-pack/tasks/acme-task/task.md\nMerge: never\nWoken: 2026-02-02T00:00:00Z\n',
  'packs/acme-pack/tasks/acme-task/task.md\nMerge: under:docs && doc-changes; reject:wide\nModel: gpt\nEnds-when: #5 merged\n',
  `My own words about the thing.\n\n${BLOCK('packs/acme-pack/tasks/acme-task/worker.mjs\nBlocked-by: #2')}\n`,
  'Blocked-by: #2 #x, #3\nNot-before: soon\n',
];

const TASK_PATHS = [
  'packs/acme-pack/tasks/acme-task/task.md', '.claudinite/shared/packs/acme-pack/tasks/acme-task/task.md',
  '.claudinite/local/packs/acme-pack/tasks/acme-task/task.md', 'packs/claudinite-tasks/queue/tasks/acme-task/task.md',
  'engine/scheduler/queue/tasks/acme-task/task.md', '.claudinite/shared/packs/claudinite-tasks/public/implement-request.md',
  'packs/barriers/tasks/acme-task/task.md', 'acme-task/task.md', '',
];

const RECORDS = [
  `${w.TASK_EXEC_TAG} v1 acme-pack/acme-task [s1] success`,
  `2026-10-02T00:00:00.0000000Z ${w.TASK_EXEC_TAG} v1 acme-pack/acme-task [s1] failed`,
  `${w.TASK_EXEC_TAG} v1 acme-pack/acme-task [s1] task-gone`,
  `${w.TASK_EXEC_TAG} v1 acme-pack/acme-task [s1] invalid`,
  `${w.TASK_EXEC_TAG} v1 acme-pack/acme-task [s1] exploded`,
  `${w.TASK_EXEC_TAG} v2 acme-pack/acme-task [s1] success`,
  `${w.RUN_COST_TAG} v1 executor [7] calls=3 pick=10 claim=2 code-work=300 hand-off=1 converge=4`,
  `${w.RUN_COST_TAG} v1 scheduler [8] calls=12 list=5 ask=6 repair=0 drain=9 bogus=4`,
  `${w.RUN_COST_TAG} v1 scheduler [9] list=5`,
  `${w.RUN_COST_TAG} v1 janitor [9] calls=1`,
  'nothing of the kind',
];

const INSTANTS = [
  '2026-10-02T00:00:00Z', '2026-10-02T12:34:56Z', '2026-10-04T00:00:00Z', '2026-10-04T23:59:59Z', '2026-10-05T00:00:00Z',
  '2026-11-01T00:00:00Z', '2026-12-31T23:59:59Z', '2027-01-01T00:00:00Z', '2028-02-29T12:00:00Z',
];
const FREQUENCIES = ['daily', 'weekly', 'monthly', 'manual'];

const issue = (labels, i) => ({ number: i + 1, title: `${w.WORK_PREFIX} acme-pack/acme-task`, body: '', state: 'closed', labels });
const parkOf = (it) => (w.isParked(it) ? w.statusOf(it).slice(w.PARK_PREFIX.length) : null);

test('the fold decodes a work item exactly as the engine does', needsCn, () => {
  const engine = cnTasks('grammar', { titles: TITLES, bodies: BODIES, issues: LABEL_SETS.map(issue), taskPaths: TASK_PATHS });
  const diffs = [];
  const same = (what, fold, cn) => {
    try { assert.deepStrictEqual(fold, cn); } catch { diffs.push(`${what}: fold ${JSON.stringify(fold)} engine ${JSON.stringify(cn)}`); }
  };
  LABEL_SETS.forEach((labels, i) => {
    const it = issue(labels, i);
    const e = engine.issues[i];
    same(`statusOf ${labels}`, w.statusOf(it), e.status);
    same(`statusesOn ${labels}`, w.statusesOn(it), e.statuses);
    same(`park ${labels}`, parkOf(it), e.park);
    same(`outcomeOf ${labels}`, w.outcomeOf(it), e.outcome);
    same(`isQueueItem ${labels}`, w.isQueueItem(it), e.queueItem);
  });
  TITLES.forEach((t, i) => same(`title ${JSON.stringify(t)}`, w.parseWorkItemTitle(t), engine.titles[i]));
  BODIES.forEach((b, i) => {
    same(`body ${JSON.stringify(b)}`, w.parseWorkItemBody(b), engine.bodies[i].fields);
    same(`human ${JSON.stringify(b)}`, String(b).replace(/<!-- claudinite-item -->\n?[\s\S]*?\n?<!-- \/claudinite-item -->/, '').trim(), engine.bodies[i].human);
  });
  TASK_PATHS.forEach((p, i) => same(`path ${p}`, w.taskIdFromPath(p), engine.taskPaths[i]));
  assert.deepEqual(diffs, []);
});

test('the fold reads a run record exactly as the engine does', needsCn, () => {
  const { records } = cnTasks('queue', { records: RECORDS });
  const diffs = [];
  RECORDS.forEach((line, i) => {
    for (const [what, fold, cn] of [['exec', w.parseTaskExec(line), records[i].exec], ['cost', w.parseRunCost(line), records[i].cost]]) {
      try { assert.deepStrictEqual(fold, cn); } catch { diffs.push(`${what} ${line}: fold ${JSON.stringify(fold)} engine ${JSON.stringify(cn)}`); }
    }
  });
  assert.deepEqual(diffs, []);
  assert.deepEqual(w.parseTaskExecs(RECORDS.join('\n')), records.map((r) => r.exec).filter(Boolean));
  assert.deepEqual(w.parseRunCosts(RECORDS.join('\n')), records.map((r) => r.cost).filter(Boolean));
});

// The engine answers where the NEXT period opens and how long a period is; the fold's
// anchor is where the current one opened. The two agree when the fold's anchor is the
// last period start at or before `now` whose successor is the engine's `next`.
test('the fold opens a cadence\'s period where the engine does', needsCn, () => {
  const cases = FREQUENCIES.flatMap((frequency) => INSTANTS.map((now) => ({ frequency, now })));
  const { anchors } = cnTasks('queue', { anchors: cases });
  const diffs = [];
  cases.forEach(({ frequency, now }, i) => {
    const anchor = w.anchorInstant(frequency, now);
    const { next } = anchors[i];
    if (frequency === 'manual') {
      if (anchor !== null || next !== null) diffs.push(`manual at ${now}: fold ${anchor} engine ${next}`);
      return;
    }
    const nextMs = new Date(next).getTime();
    const ok = anchor.getTime() <= new Date(now).getTime()
      && anchor.getTime() < nextMs
      && w.anchorInstant(frequency, next).getTime() === nextMs
      && w.anchorInstant(frequency, nextMs - 1).getTime() === anchor.getTime();
    if (!ok) diffs.push(`${frequency} at ${now}: fold opens ${anchor.toISOString()}, engine's next is ${next}`);
  });
  assert.deepEqual(diffs, []);
});
