import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as page from '../src/derive/task-calendar.mjs';
import { cnTasks, needsCn } from '../../../tools/test/cn-tasks.mjs';

// THE DRIFT GUARD for `src/derive/task-calendar.mjs`, the dashboard's own copy of the
// engine's calendar arithmetic. The split is forced — the page computes a board in a
// browser, where cn cannot run — so the copy is run over the same inputs as the
// engine's own answers, and the first instant or declaration they answer differently
// fails here rather than on a rendered board.

const FREQUENCIES = ['daily', 'weekly', 'monthly', 'manual'];
// Every hour across a leap February, a month end and a year end.
const instants = [];
for (const start of [Date.UTC(2024, 1, 26), Date.UTC(2026, 2, 29), Date.UTC(2026, 11, 29)]) {
  for (let h = 0; h < 24 * 6; h += 1) instants.push(new Date(start + h * 3600e3));
}
const DECLARATIONS = [
  { preconditions: ['schedule:at-most-daily'] },
  { preconditions: ['schedule:at-most-weekly', 'last-run-not-failed'] },
  { preconditions: ['schedule:at-most-monthly || touched'] },
  // The retired spelling, which both still read: the page lifts a declaration out of
  // GitHub as text, so it meets it on any member that has not converged.
  { preconditions: ['due:daily'] }, { preconditions: ['touched || due:weekly'] },
  { preconditions: ['last-run-over:7d', 'last-run-not-parked'] }, { preconditions: ['touched'] },
  { preconditions: [] }, {},
];

test('the dashboard anchors every frequency exactly as the engine does', needsCn, () => {
  const cases = FREQUENCIES.flatMap((frequency) => instants.map((now) => ({ frequency, now: now.toISOString() })));
  const { anchors } = cnTasks('queue', { anchors: cases });
  const diffs = [];
  cases.forEach(({ frequency, now }, i) => {
    const next = page.nextAnchor(frequency, new Date(now));
    const mine = next == null ? null : new Date(next).toISOString();
    if (mine !== anchors[i].next) diffs.push(`nextAnchor(${frequency}, ${now}): page ${mine} engine ${anchors[i].next}`);
    if ((page.periodMs(frequency) ?? null) !== anchors[i].period) diffs.push(`periodMs(${frequency})`);
  });
  assert.deepEqual(diffs.slice(0, 5), [], `${diffs.length} disagreement(s)`);
});

test('the dashboard reads a task\'s cadence exactly as the engine does', needsCn, () => {
  const engine = cnTasks('contract', { declarations: DECLARATIONS.map((declaration) => ({ declaration, terms: {} })) });
  const diffs = [];
  DECLARATIONS.forEach((decl, i) => {
    const mine = page.cadenceOf(decl.preconditions);
    const theirs = engine[i].cadence;
    if (JSON.stringify(mine) !== JSON.stringify(theirs)) diffs.push(`cadenceOf(${JSON.stringify(decl)}): page ${JSON.stringify(mine)} engine ${JSON.stringify(theirs)}`);
  });
  assert.deepEqual(diffs, []);
});
