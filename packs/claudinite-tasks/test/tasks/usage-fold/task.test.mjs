import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import usageFoldJson from '../../../tasks/usage-fold/task.json' with { type: 'json' };
import { terms as localTerms, checkoutRoot } from '../../../tasks/usage-fold/preconditions.mjs';
import { TASKS_USAGE_PATH, encodeTasksUsageFile, renderTasksUsageFile } from '../../../tasks/usage-fold/tasks-usage-format.mjs';

const AT = '2026-09-05T16:00:00Z';
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
