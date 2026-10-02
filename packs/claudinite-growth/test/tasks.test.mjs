import { test } from 'node:test';
import assert from 'node:assert/strict';
import dedupJson from '../tasks/growth-dedup/task.json' with { type: 'json' };
import logsPruneJson from '../tasks/logs-prune/task.json' with { type: 'json' };
import { verdictWithTerms, needsCn } from '../../../tools/test/cn-tasks.mjs';

const PACK_DIR = new URL('..', import.meta.url).pathname;
// The cadence term reads the task's own run history at a chosen instant: an empty
// history holds, and the signal under test decides. The built-in terms are the
// engine's own (`cn tasks precondition`); a task's local terms are its preconditions.mjs.
const AT = '2026-09-05T16:00:00Z';
const NO_RUNS = { runs: { list: [] } };
const verdictFor = (task, signals, config = {}, item = null) =>
  verdictWithTerms(`${PACK_DIR}tasks/${task.id}`, task.preconditions, { ...NO_RUNS, ...signals }, { now: AT, config, item });
const [dedup, logsPrune] = [dedupJson, logsPruneJson];

// --- growth-dedup (the pruning stage) ----------------------------------------
// Its precondition composes a built-in `mount-moved` with a built-in
// `commits-under:` via `||` — the pack's own design, so it is kept as a
// mechanism-level exercise rather than a unit test of either term.

// Presence is not asked: adoption seeds the repo's own local pack and the nightly
// never removes it, so movement is the whole gate. It reads that movement off the
// window's own changed paths — the generic `commits-under:` condition — rather than
// a collector field of its own.
test('growth-dedup: local-pack movement alone fires it, with no presence question', needsCn, async () => {
  const moved = await verdictFor(dedup, { commits: { touchedPaths: ['.claudinite/local/packs/x/RULES.md'] }, sharedMount: { changedPacks: [] } });
  assert.equal(moved.run, true);
  assert.equal((await verdictFor(dedup, { commits: { touchedPaths: ['src/app.mjs'] }, sharedMount: { changedPacks: [] } })).run, false);
  assert.equal((await verdictFor(dedup, { commits: {}, sharedMount: { changedPacks: [] } })).run, false);
});

test('growth-dedup: a declared pack moving in the mount fires it (and names the packs)', needsCn, async () => {
  const v = await verdictFor(dedup, { commits: { touchedPaths: [] }, sharedMount: { changedPacks: ['acme-pack'] } });
  assert.equal(v.run, true);
  assert.match(v.reason, /acme-pack/);
  assert.match(v.context.join(' '), /acme-pack/);
});

// --- logs-prune (retention on the conversation-logs branch) ------------------
// `log-past-retention` is this task's own precondition term (retention math and
// the opt-out reading live beside its declaration), so its decisions are kept.

test('logs-prune: fires on age alone, which is what makes it independent of activity', needsCn, async () => {
  // A CLOCK crossing a boundary, and deliberately no repo-movement condition beside
  // it: the prune must keep firing on exactly the repos that went quiet, which is
  // where logs sit long enough to expire.
  const v = await verdictFor(logsPrune, {
    conversationLogs: { present: true, retentionDays: 10, oldestLogAgeDays: 14 },
  });
  assert.equal(v.run, true);
  assert.match(v.reason, /retention 10d/);
});

test('logs-prune: no branch, a declared opt-out, or nothing aged yet — all silent', needsCn, async () => {
  assert.match((await verdictFor(logsPrune, { conversationLogs: { present: false } })).reason, /nothing captured/);
  // Capture-only is declared now, never inferred from a missing key (#1620): an
  // undeclared retention takes the default, and only a non-positive one is silent.
  assert.match((await verdictFor(logsPrune, { conversationLogs: { present: true, retentionDays: 0 } })).reason, /capture-only/);
  assert.match((await verdictFor(logsPrune, { conversationLogs: { present: true, oldestLogAgeDays: 30 } })).reason, /retention 10d/);
  for (const signals of [
    { conversationLogs: { present: true, retentionDays: 10, oldestLogAgeDays: 3 } },
    // The boundary: at exactly retention the log has not yet aged OUT.
    { conversationLogs: { present: true, retentionDays: 10, oldestLogAgeDays: 10 } },
    // A branch with retention set but no logs at all — no age to compare.
    { conversationLogs: { present: true, retentionDays: 10, oldestLogAgeDays: null } },
  ]) {
    const v = await verdictFor(logsPrune, signals);
    assert.equal(v.run, false);
    assert.match(v.reason, /nothing to prune/);
  }
});
