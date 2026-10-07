import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summariseRuns, ciStatus, APPROVAL_RATE, approvalMinutes, lastFoldedScheduler } from '../src/derive/health.mjs';

const NOW = Date.parse('2026-08-17T12:00:00Z');

test('only scheduled runs count toward scheduler health', () => {
  const runs = [
    { event: 'push', status: 'completed', conclusion: 'failure', created_at: '2026-08-17T11:00:00Z' },
    { event: 'schedule', status: 'completed', conclusion: 'success', created_at: '2026-08-17T10:00:00Z' },
  ];
  const s = summariseRuns(runs, NOW);
  assert.equal(s.consecutiveFailures, 0, 'a failing CI push is not a failing scheduler');
  assert.equal(s.scheduled, 1);
  assert.equal(s.everRan, true);
});

// The runs listing is ONE page across every workflow a repo has, so on a busy repo
// it covers a few hours — and a scheduler whose last run is older than that page reads
// exactly like one that has never run. "Never ran" is the critical verdict, so the
// difference cannot be left to the page's depth.
test('the heartbeat is topped up from the fold when the runs page does not reach it', () => {
  const usage = { hours: { '2026-08-17T02': { scheduler: 1 }, '2026-08-16T23': { scheduler: 2 } } };
  // A page of runs with no scheduler run on it at all — every slot spent on CI.
  const runs = [{ event: 'push', status: 'completed', conclusion: 'success', created_at: '2026-08-17T11:00:00Z' }];

  const blind = summariseRuns(runs, NOW);
  assert.equal(blind.everRan, false, 'without the fold, the page can only say it has never seen one');
  assert.equal(blind.foldRead, false, 'and says so, rather than implying two sources agreed');

  const seen = summariseRuns(runs, NOW, usage);
  assert.equal(seen.everRan, true);
  assert.equal(seen.lastAt, Date.parse('2026-08-17T02:00:00Z'), 'the newest folded hour, as its start');
  assert.equal(seen.lastAtSource, 'folded', 'coarse, and the row can say so');
});

test('the fold is a FLOOR — a live run newer than it still wins', () => {
  const usage = { hours: { '2026-08-17T02': { scheduler: 1 } } };
  const runs = [{ event: 'schedule', status: 'completed', conclusion: 'success', created_at: '2026-08-17T11:30:00Z' }];
  const s = summariseRuns(runs, NOW, usage);
  assert.equal(s.lastAt, Date.parse('2026-08-17T11:30:00Z'));
  assert.equal(s.lastAtSource, 'live', 'an exact timestamp beats an hour bucket');
});

test('an hour the fold recorded no scheduler run in is not a heartbeat', () => {
  assert.equal(lastFoldedScheduler({ hours: { '2026-08-17T02': { scheduler: 0, executor: 3 } } }), null);
  assert.equal(lastFoldedScheduler({ hours: {} }), null);
  assert.equal(lastFoldedScheduler(null), null, 'a repo with no fold reads its heartbeat live, and says so');
});

test('a cancelled run neither breaks nor clears a failure streak', () => {
  const runs = ['failure', 'cancelled', 'failure'].map((conclusion, i) => ({
    event: 'schedule', status: 'completed', conclusion, created_at: new Date(NOW - i * 3600e3).toISOString(),
  }));
  assert.equal(summariseRuns(runs, NOW).consecutiveFailures, 2);
});

test('never having run is distinct from passing', () => {
  const s = summariseRuns([], NOW);
  assert.equal(s.everRan, false);
  assert.equal(s.consecutiveFailures, 0);
  assert.equal(s.lastAt, null);
});

test('in-flight counts any event, since a run in progress is a run in progress', () => {
  assert.equal(summariseRuns([{ event: 'push', status: 'in_progress' }], NOW).inFlight, 1);
});

test('CI is the default branch\'s own runs, never the scheduler\'s', () => {
  const runs = [
    { event: 'schedule', status: 'completed', conclusion: 'failure', head_branch: 'main', created_at: '2026-08-17T10:00:00Z' },
    { event: 'push', status: 'completed', conclusion: 'success', head_branch: 'main', created_at: '2026-08-17T09:00:00Z' },
  ];
  assert.equal(ciStatus(runs, 'main').state, 'passing');
});

test('CI reports failing, and a run in flight outranks the last conclusion', () => {
  const failed = [{ event: 'push', status: 'completed', conclusion: 'failure', head_branch: 'main', created_at: '2026-08-17T09:00:00Z' }];
  assert.equal(ciStatus(failed, 'main').state, 'failing');
  assert.equal(ciStatus([{ event: 'push', status: 'in_progress', head_branch: 'main', created_at: '2026-08-17T09:00:00Z' }, ...failed], 'main').state, 'running');
});

test('a branch that is not the default one says nothing about CI here', () => {
  const runs = [{ event: 'push', status: 'completed', conclusion: 'failure', head_branch: 'a-branch', created_at: '2026-08-17T09:00:00Z' }];
  assert.equal(ciStatus(runs, 'main').state, 'unknown');
});

// An approval is priced by the PR's size, and the page cannot read a PR's size — so the
// rate charges its floor and the total is a lower bound. The floor must never be zero:
// an approval nobody has measured is still a merge somebody has to do.
test('an approval is priced by size, and an unknown size costs the floor', () => {
  assert.equal(approvalMinutes(200), APPROVAL_RATE.minutes);
  assert.equal(approvalMinutes(201), 2, 'a part-full 200 lines is a whole minute');
  assert.equal(approvalMinutes(1000), 5);
  assert.equal(approvalMinutes(1), 1, 'never below the floor');
  assert.equal(approvalMinutes(null), APPROVAL_RATE.minutes, 'unknown is the floor, never a zero');
  assert.equal(approvalMinutes(), APPROVAL_RATE.minutes);
});
