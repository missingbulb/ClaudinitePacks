import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import usageFoldJson from '../../../tasks/usage-fold/task.json' with { type: 'json' };
import { terms as localTerms, checkoutRoot } from '../../../tasks/usage-fold/preconditions.mjs';
import { TASKS_USAGE_PATH, encodeTasksUsageFile, renderTasksUsageFile } from '../../../tasks/usage-fold/tasks-usage-format.mjs';
import { contractOf, verdictOf, needsCn } from '../../../../../tools/test/cn-tasks.mjs';

// The usage-fold declaration and its precondition expression. The built-in terms'
// verdicts are the engine's own (`cn tasks precondition`), asked over the expression
// with the task's local term left out, since cn's decision core runs no task module;
// that term is asked directly, the way the engine's runner calls it.

const AT = '2026-09-05T16:00:00Z';
const NO_RUNS = { runs: { list: [] } };
const LOCAL = { 'runs-since-fold': { signals: [] } };
const BUILT_IN = ['schedule:at-most-daily', 'any-commit || session-captured'];

// The machinery half's term reads the checkout's own file, so its verdict is taken
// against a checkout whose run watermark is `mark`.
function checkout(mark) {
  const root = mkdtempSync(join(tmpdir(), 'usage-fold-'));
  const path = join(root, TASKS_USAGE_PATH);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, renderTasksUsageFile(encodeTasksUsageFile({ runsFoldedThrough: mark })));
  return root;
}
const verdict = (signals) => verdictOf(BUILT_IN, { ...NO_RUNS, ...signals }, { now: AT });
const machinery = (root) => {
  const before = process.env.CLAUDINITE_REPO_ROOT;
  process.env.CLAUDINITE_REPO_ROOT = root;
  try { return localTerms['runs-since-fold'].holds({}, { now: new Date(AT) }); }
  finally {
    if (before === undefined) delete process.env.CLAUDINITE_REPO_ROOT;
    else process.env.CLAUDINITE_REPO_ROOT = before;
  }
};

test('usage-fold: the expression keeps its local term in the third alternative', () => {
  assert.deepEqual(usageFoldJson.preconditions, [BUILT_IN[0], `${BUILT_IN[1]} || runs-since-fold`]);
});

// --- usage-fold (the skill-usage aggregate) ----------------------------------

test('usage-fold: the signals its gate reads are derived from its conditions', needsCn, () => {
  // Derived, never declared: the conditions name what they read, and that is the
  // whole set the executor collects before asking.
  const contract = contractOf(usageFoldJson, LOCAL);
  assert.deepEqual(contract.problems, []);
  assert.deepEqual(contract.signals, ['commits', 'conversationLogs', 'runs']);
});

test('usage-fold: a commit or a captured session in the window is what runs it', needsCn, () => {
  const commit = verdict({ commits: { count: 2 }, conversationLogs: { newestLogAgeDays: 5 } });
  assert.equal(commit.run, true);
  assert.match(commit.reason, /2 default-branch commit\(s\)/);

  const captured = verdict({ commits: { count: 0 }, conversationLogs: { newestLogAgeDays: 0.02 } });
  assert.equal(captured.run, true);
  assert.match(captured.reason, /conversation log was captured/);
});

test('usage-fold: task-authored movement counts here, unlike every other task', needsCn, () => {
  // This task measures the MACHINERY, so a task's own delivery is exactly what the
  // aggregate folds: a window whose only commit is non-substantive (a task's own)
  // still runs it, where every other movement-gated task would read it as silence.
  const machineryOnly = verdict({ commits: { count: 1, substantiveChange: false }, conversationLogs: { newestLogAgeDays: 5 } });
  assert.equal(machineryOnly.run, true);
  assert.match(machineryOnly.reason, /1 default-branch commit/);
});

test('usage-fold: a quiet period declines, and loses nothing by it', needsCn, () => {
  // The run and queue reads are watermarked, so declining defers them rather than dropping
  // them, and the dashboard tops up its freshest hours from the run listing it already fetches.
  const quiet = verdict({ commits: { count: 0 }, conversationLogs: { present: true, logCount: 40, newestLogAgeDays: 3 } });
  assert.equal(quiet.run, false);
  assert.match(quiet.reason, /no default-branch commit/);
  assert.match(quiet.reason, /no conversation log was captured/);
});

test('usage-fold: machinery that ran unfolded runs it on an otherwise silent repo', () => {
  // A repo whose only activity is its own queue has no commit and no capture, yet
  // its scheduler ticked: the machinery half has rows to fold, so the term holds.
  const behind = machinery(checkout('2026-09-04T17:00:00Z'));
  assert.equal(behind.holds, true);
  assert.match(behind.reason, /folded through 2026-09-04T17:00:00Z/);
  const caughtUp = machinery(checkout('2026-09-05T15:00:00Z'));
  assert.equal(caughtUp.holds, false);
  assert.equal(machinery(mkdtempSync(join(tmpdir(), 'usage-fold-'))).holds, true, 'a repo that never folded has everything unread');
});

test('usage-fold: the term finds the checkout from the task directory the engine asks it in', () => {
  const root = checkoutRoot({}, new URL('.', import.meta.url).pathname);
  assert.equal(checkoutRoot({}, join(root, 'packs')), root);
  assert.equal(checkoutRoot({ CLAUDINITE_REPO_ROOT: '/named' }), '/named');
});

test('usage-fold: an unknown signal is not movement — and does not wedge the task', needsCn, () => {
  // `newestLogAgeDays` is null when the branch does not exist or carries no readable
  // stamp. Unknown must not read as "a session just captured", and a missing signal
  // must not throw: a precondition that cannot be evaluated stops the task forever.
  assert.equal(verdict({ conversationLogs: { present: false, newestLogAgeDays: null } }).run, false);
  assert.equal(verdict({}).run, false);
  assert.doesNotThrow(() => verdict({ commits: {}, conversationLogs: {} }));
});

test('usage-fold: a signal that could not be read is an ERROR, never a quiet decline', needsCn, () => {
  // The whole fail direction. A decline is permanent silence nothing turns red over;
  // an error parks the item where the re-queue lever retries it.
  const failed = verdict({ commits: { error: 'the commits API answered 502' }, conversationLogs: {} });
  assert.equal(failed.run, undefined);
  assert.match(failed.error, /commits.*502/);
});
