import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  readCheckBuild, checkBuildReport, renderCheckBuildReport,
} from '../../../tasks/usage-fold/check-build.mjs';
import { countEntries, foldDays, addDayToWeek, encodeUsage, decodeUsage } from '../../../tasks/usage-fold/fold-usage.mjs';

// The engine's breadcrumbs reach the transcript in the hooks' output: SessionStart's
// in its context, Stop's on stderr - both recorded as meta user turns.
const hookTurn = (...lines) => ({ type: 'user', isMeta: true, message: { content: lines.join('\n') } });
const fileOf = (date, sessionId, entries) => ({ date, issue: 0, sessionId, counts: countEntries(entries) });

test('readCheckBuild reads the build and its waits, each recorded line once', () => {
  const stop = hookTurn('[cn] buildwait stop ok 4200ms', '[cn] build compiled ok 5712ms', '[cn] checks stop ok 4300ms');
  const got = readCheckBuild([
    hookTurn('# Claudinite engine 1.61005.1', '[cn] build started ok 3ms', '[cn] hooks session-start ok 40ms'),
    stop,
    stop, // one emission the harness recorded twice
    hookTurn('[cn] buildwait check timeout 600000ms'),
  ]);
  assert.deepEqual(got, {
    cached: 0, started: 1, compiledMs: 5712, compiledOk: 1,
    waits: { stop: { waits: 1, totalMs: 4200, maxMs: 4200, timeouts: 0 }, check: { waits: 1, totalMs: 600000, maxMs: 600000, timeouts: 1 } },
  });
});

test('readCheckBuild: a cached session waited nothing, a failed build says so, and no line is null', () => {
  assert.deepEqual(readCheckBuild([hookTurn('[cn] build cached ok 2ms')]), { cached: 1, started: 0, waits: {} });
  assert.equal(readCheckBuild([hookTurn('[cn] build compiled error 900ms')]).compiledOk, 0);
  assert.equal(readCheckBuild([hookTurn('[cn] checks stop ok 4ms')]), null, 'an engine that leaves no build line is not a session that built nothing');
});

test('foldDays files each session\'s build once, and its waits by event', () => {
  const start = hookTurn('[cn] build started ok 3ms');
  const stop = hookTurn('[cn] buildwait stop ok 4200ms', '[cn] build compiled ok 5712ms');
  const days = foldDays([
    fileOf('2026-10-05', 's1', [start, stop]),
    fileOf('2026-10-05', 's1', [start, stop, hookTurn('[cn] hooks stop ok 3ms')]), // the session-end tail, a superset
    fileOf('2026-10-05', 's2', [hookTurn('[cn] build cached ok 2ms')]),
    fileOf('2026-10-05', 's3', [hookTurn('[cn] hooks stop ok 3ms')]),
  ]);
  const day = days['2026-10-05'];
  assert.deepEqual(day.buildSessions, {
    s1: { cached: 0, started: 1, compiledMs: 5712, compiledOk: 1, waits: 1, waitMs: 4200, waitMaxMs: 4200 },
    s2: { cached: 1, started: 0, waits: 0, waitMs: 0, waitMaxMs: 0 },
  });
  assert.deepEqual(day.buildWaits, { stop: { waits: 1, sessions: 1, totalMs: 4200, maxMs: 4200, timeouts: 0 } });
});

test('a week keeps each session\'s build once and its slowest wait as a peak', () => {
  const day = (ms) => foldDays([fileOf('2026-09-28', 's1', [hookTurn(`[cn] buildwait stop ok ${ms}ms`, '[cn] build compiled ok 5000ms')])])['2026-09-28'];
  const week = addDayToWeek(addDayToWeek(undefined, day(100)), day(300));
  assert.deepEqual(week.buildWaits.stop, { waits: 2, sessions: 2, totalMs: 400, maxMs: 300, timeouts: 0 });
  assert.equal(week.buildSessions.s1.compiledMs, 5000, 'a session spanning two days is one build, not two');
  // …and the file carries it through the tuple shape and back.
  const back = decodeUsage(JSON.parse(JSON.stringify(encodeUsage({ weeks: { '2026-W40': week } })))).weeks['2026-W40'];
  assert.deepEqual(back.buildSessions, week.buildSessions);
  assert.deepEqual(back.buildWaits, week.buildWaits);
});

const weekOf = (sessions, waits = {}) => ({ days: 7, buildSessions: sessions, buildWaits: waits });

test('the report is the last closed week against the one before, a median over the sample', () => {
  const weeks = {
    '2026-W39': weekOf({ a: { cached: 1, started: 0, waits: 0, waitMs: 0, waitMaxMs: 0 } }),
    '2026-W40': weekOf({
      a: { cached: 0, started: 1, compiledMs: 5700, compiledOk: 1, waits: 1, waitMs: 4200, waitMaxMs: 4200 },
      b: { cached: 0, started: 1, compiledMs: 200, compiledOk: 1, waits: 0, waitMs: 0, waitMaxMs: 0 },
      c: { cached: 0, started: 1, compiledMs: 900, compiledOk: 0, waits: 0, waitMs: 0, waitMaxMs: 0 },
      d: { cached: 1, started: 0, waits: 0, waitMs: 0, waitMaxMs: 0 },
    }, { stop: { waits: 1, sessions: 1, totalMs: 4200, maxMs: 4200, timeouts: 0 } }),
    '2026-W41': weekOf({ e: { cached: 1, started: 0, waits: 0, waitMs: 0, waitMaxMs: 0 } }), // still open
  };
  const r = checkBuildReport(weeks, '2026-W41');
  assert.equal(r.window, '2026-W40');
  assert.equal(r.previous, '2026-W39');
  assert.deepEqual(r.current, {
    sessions: 4,
    builds: { cached: 1, compiledOk: 2, compiledError: 1, unreported: 0 },
    compiled: { count: 3, medianMs: 900, maxMs: 5700 },
    waited: { sessions: 1, totalMs: 4200, maxMs: 4200 },
    waitsByEvent: { stop: { waits: 1, sessions: 1, totalMs: 4200, maxMs: 4200, timeouts: 0 } },
  });
  // A week with no compile has NO compiled figure - not a zero-second build.
  assert.equal('compiled' in r.prior, false);
  assert.deepEqual(r.prior.waited, { sessions: 0, totalMs: 0, maxMs: 0 });
});

test('a week no session reported a build in is absent, and so is a report with nothing in it', () => {
  const r = checkBuildReport({ '2026-W40': weekOf({ a: { cached: 1, started: 0, waits: 0, waitMs: 0, waitMaxMs: 0 } }), '2026-W39': { days: 7 } }, '2026-W41');
  assert.equal(r.prior, null);
  assert.deepEqual(renderCheckBuildReport(checkBuildReport({}, '2026-W41')), []);
  const lines = renderCheckBuildReport(r).join('\n');
  assert.match(lines, /2026-W40/);
  assert.match(lines, /not recorded/);
});
