import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  summariseMember, summariseRuns, freshnessOf, FRESHNESS_STATES, NO_ROSTER, rankMembers, rollUp, packSpread, taskSpread,
  ciStatus, attentionBreakdown,
  memberAttention, fleetAttention, estimateMinutes, estimateNote,
  PARK_MINUTES, APPROVAL_RATE, approvalMinutes, lastFoldedScheduler,
} from '../src/derive/fleet.mjs';
import { parseRoster } from '../src/read/roster.mjs';
import { memberFromFile } from '../src/read/member.mjs';
import {
  STATUS_BLOCKED, STATUS_READY, STATUS_RUNNING_EXECUTOR, STATUS_RUNNING_AGENT, NEEDS_HUMAN, STATUS_NEEDS_HUMAN_APPROVAL, STATUS_NEEDS_HUMAN_DECISION,
  STATUS_NEEDS_HUMAN_ACTION, OUTCOME_DONE, OUTCOME_DELIVERED, OUTCOME_OBSOLETE, STATUS_DONE,
} from '../src/read/queue-vocabulary.mjs';

const NOW = Date.parse('2026-08-17T12:00:00Z');

// The manager's roster artifact as the engine renders it: `{ version, generated, owner,
// members: [fleet.Verdict] }`, the field names the engine's own JSON tags.
const verdict = (repo, state, detail = '', over = {}) => ({
  repo, defaultBranch: 'main', scope: 'covered', shape: 'cn', covered: true, dormant: false,
  ...(state ? { freshness: { state, detail } } : {}), ...over,
});
const roster = (...members) => parseRoster(JSON.stringify({ version: 1, generated: '2026-08-17T06:00:00Z', owner: 'o', members }, null, 2));
const ROSTER = roster(verdict('o/a', 'fresh'), verdict('o/b', 'fresh'));

const decl = (over = {}) => ({
  packs: [{ id: 'acme-pack-b', version: 3 }, { id: 'acme-pack', version: 5 }],
  ...over,
});

const item = (over = {}) => ({
  number: 1,
  title: '[claudinite-work] acme-pack/acme-task-d',
  body: 'packs/acme-pack/tasks/acme-task-d/task.md\n',
  state: 'open',
  labels: [STATUS_READY],
  created_at: '2026-08-17T04:00:00Z',
  updated_at: '2026-08-17T04:00:00Z',
  closed_at: null,
  comments: 0,
  ...over,
});

const read = (over = {}) => ({
  repo: 'o/a',
  declaration: decl(),
  items: [],
  runs: [],
  paths: ['packs/acme-pack/tasks/acme-task-d/task.json'],
  ...over,
});

// --- the three absences are three different answers -----------------------------

test('an unreadable member is its own state, not a broken one', () => {
  const s = summariseMember({ repo: 'o/a', error: { status: 404 } }, { now: NOW });
  assert.equal(s.status, 'unreadable');
  assert.match(s.reasons[0].text, /not visible to you/);
  // A repo you cannot see is a permissions fact, not an alarm — it must not compete
  // with a genuinely broken member for attention.
  assert.equal(s.level, 'info');
});

test('read failures are described by their cause', () => {
  const at = (status) => summariseMember({ repo: 'o/a', error: { status } }, { now: NOW }).reasons[0].text;
  assert.match(at(403), /forbidden/);
  assert.match(at(401), /credential was rejected/);
  assert.match(summariseMember({ repo: 'o/a', error: { message: 'boom' } }, { now: NOW }).reasons[0].text, /boom/);
});

test('a repo that does not run Claudinite is not-adopted, never zero-everything', () => {
  const s = summariseMember({ repo: 'o/a', declaration: null }, { now: NOW });
  assert.equal(s.status, 'not-adopted');
  assert.equal(s.level, 'info');
  assert.equal(s.open, undefined, 'it reports no counts at all rather than misleading zeros');
});

test('a healthy adopted member has no reasons and reads ok', () => {
  const s = summariseMember(read({ items: [item()] }), { now: NOW, roster: ROSTER });
  assert.equal(s.status, 'adopted');
  assert.equal(s.level, 'ok');
  assert.deepEqual(s.reasons, []);
});

// --- attention is earned ---------------------------------------------------------

// The triage split: only a failure park — or one an older
// engine left unclassified — is a broken run. The other three are a person's inbox,
// and a fleet view that alarms identically on all four teaches the reader to ignore
// the alarm.
test('an unclassified park is critical — it is a broken run', () => {
  const s = summariseMember(read({ items: [item({ labels: [NEEDS_HUMAN] })] }), { now: NOW, roster: ROSTER });
  assert.equal(s.level, 'critical');
  assert.equal(s.parked, 1);
  assert.match(s.reasons[0].text, /parked broken/);
});

test('an action or decision park is serious, and an approval park is a waiting PR', () => {
  const decision = summariseMember(
    read({ items: [item({ labels: [NEEDS_HUMAN, STATUS_NEEDS_HUMAN_DECISION] })] }), { now: NOW, roster: ROSTER },
  );
  assert.equal(decision.level, 'serious');
  assert.match(decision.reasons[0].text, /parked for a person/);

  const approval = summariseMember(
    read({ items: [item({ labels: [NEEDS_HUMAN, STATUS_NEEDS_HUMAN_APPROVAL] })] }), { now: NOW, roster: ROSTER },
  );
  assert.equal(approval.level, 'warning');
  assert.match(approval.reasons[0].text, /waiting for approval/);
  assert.equal(approval.parked, 1, 'an approval park still counts as parked');
});

test('an item past its leash is serious, and counted apart from parked', () => {
  const stale = new Date(NOW - 5 * 3600e3).toISOString();
  const s = summariseMember(read({ items: [item({ labels: [STATUS_RUNNING_EXECUTOR], updated_at: stale })] }), { now: NOW, roster: ROSTER });
  assert.equal(s.level, 'serious');
  assert.equal(s.warned, 1);
  assert.equal(s.parked, 0);
});

// One red run is noise; a run of them is a member that has stopped working, and the
// two must not read the same.
test('a single scheduler failure is serious and a streak is critical', () => {
  const runs = (concs) => concs.map((conclusion, i) => ({
    event: 'schedule', status: 'completed', conclusion,
    created_at: new Date(NOW - i * 3600e3).toISOString(),
  }));
  // The member must otherwise be healthy, or another rule supplies the level and the
  // assertion passes without the run signal doing anything.
  const at = (concs) => summariseMember(
    read({ items: [item()], runs: runs(concs) }), { now: NOW, roster: ROSTER },
  ).level;
  assert.equal(at(['failure', 'success']), 'serious');
  assert.equal(at(['failure', 'failure']), 'critical');
  assert.equal(at(['success', 'failure']), 'ok', 'an older failure below a success is spent');
});

// The signal no per-repo page can show you: the scheduler was never wired up at all.
test('declared tasks with no work item ever is surfaced', () => {
  const s = summariseMember(read({ items: [], paths: ['packs/acme-pack/tasks/acme-task-d/task.json'] }), { now: NOW, roster: ROSTER });
  assert.equal(s.level, 'serious');
  assert.match(s.reasons.find((r) => /no work item/.test(r.text)).text, /1 task declared/);
});

test('a member declaring no tasks is not accused of never running them', () => {
  const s = summariseMember(read({ items: [], paths: [] }), { now: NOW, roster: ROSTER });
  assert.equal(s.declaredTasks, 0);
  assert.equal(s.reasons.find((r) => /no work item/.test(r.text)), undefined);
});

// --- freshness, from the manager's roster -----------------------------------------

test('every state the engine publishes passes through with its detail', () => {
  for (const state of FRESHNESS_STATES) {
    assert.deepEqual(freshnessOf(verdict('o/a', state, `${state} because`)), { state, detail: `${state} because` });
  }
});

// The three absences are three different sentences, and none of them reads as current.
test('no roster, no row and an unjudged row are each unknown, saying which', () => {
  assert.deepEqual(freshnessOf(null, { rostered: false }), { state: 'unknown', detail: NO_ROSTER });
  assert.match(freshnessOf(null).detail, /no row for this repo/);
  assert.match(freshnessOf(verdict('o/a', null, '', { error: 'boom' })).detail, /could not judge it: boom/);
  assert.match(freshnessOf(verdict('o/a', null, '', { covered: false })).detail, /declaring no packs/);
  for (const f of [freshnessOf(null, { rostered: false }), freshnessOf(null), freshnessOf(verdict('o/a', null))]) {
    assert.equal(f.state, 'unknown');
  }
});

// A newer engine may publish a state this page has never heard of; it is named, not
// mapped onto the nearest one this page knows.
test('a state newer than the page is unknown and quotes the state', () => {
  const f = freshnessOf(verdict('o/a', 'some-future-state'));
  assert.equal(f.state, 'unknown');
  assert.match(f.detail, /some-future-state/);
});

test('a row the roster read as dormant is dormant, whatever freshness it carries', () => {
  assert.equal(freshnessOf(verdict('o/a', 'behind', 'x', { dormant: true })).state, 'dormant');
});

// GitHub's names are case-insensitive, and the enumeration and the sweep need not
// spell one alike.
test('the roster finds a member under any casing of its name', () => {
  const s = summariseMember(read({ repo: 'O/A', items: [item()] }), { now: NOW, roster: roster(verdict('o/a', 'behind', 'acme-pack 1 → 2')) });
  assert.equal(s.freshness.state, 'behind');
});

test('a roster that is not one parses to null rather than an empty fleet', () => {
  assert.equal(parseRoster('not json'), null);
  assert.equal(parseRoster('{"version":1}'), null);
  assert.equal(parseRoster('[]'), null);
});

test('with no roster every member\'s freshness is unknown and raises no reason', () => {
  const s = summariseMember(read({ items: [item()] }), { now: NOW });
  assert.equal(s.freshness.state, 'unknown');
  assert.deepEqual(s.reasons.filter((r) => r.kind === 'mount'), []);
});

// Nothing converges a member with no stamp or no scheduler, so waiting never clears
// it; a behind member's own nightly update does.
test('no-stamp and no-scheduler are warnings, behind is routine', () => {
  const at = (state) => summariseMember(read({ items: [item()] }), { now: NOW, roster: roster(verdict('o/a', state, `${state} detail`)) })
    .reasons.find((r) => r.kind === 'mount');
  assert.equal(at('behind').level, 'info');
  assert.equal(at('no-stamp').level, 'warning');
  assert.equal(at('no-scheduler').level, 'warning');
  assert.equal(at('no-stamp').text, 'no-stamp detail');
  assert.equal(at('fresh'), undefined);
  assert.equal(at('node'), undefined);
});

// A cn member's row carries what its own member file says it runs.
test('a cn member\'s engine and shape ride along from its member file', () => {
  const member = memberFromFile(JSON.stringify({
    version: 1, settings: { path: '.claudinite/settings.yaml', format: 'yaml' },
    engine: { package: '@claudinite/cn', version: '61003.1', channel: 'stable' },
    packs: { channel: 'stable', declared: [{ id: 'acme-pack' }] }, dormant: false, held: { 'acme-pack': '61001.2' },
  }));
  const s = summariseMember(read({ member, declaration: member.declaration }), { now: NOW, roster: ROSTER });
  assert.equal(s.shape, 'cn');
  assert.deepEqual(s.engine, { version: '61003.1' });
  assert.deepEqual(s.packs, ['acme-pack']);
});

// --- runs ------------------------------------------------------------------------

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

// The runs listing is ONE page across every workflow a repo has, so on a busy member
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
  assert.equal(lastFoldedScheduler(null), null, 'a member with no fold reads its heartbeat live, and says so');
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

// --- ranking and rollup -----------------------------------------------------------

test('members rank worst first and ties are stable by name', () => {
  const s = (repo, level, parked = 0) => ({ repo, status: 'adopted', level, parked, warned: 0, open: { total: 0 } });
  const ranked = rankMembers([
    s('o/ok', 'ok'), s('o/bad', 'critical'), s('o/warn', 'serious'), s('o/also-bad', 'critical'),
  ]).map((x) => x.repo);
  assert.deepEqual(ranked, ['o/also-bad', 'o/bad', 'o/warn', 'o/ok']);
});

test('rollUp counts members needing attention, not raw items', () => {
  const summaries = [
    summariseMember(read({ repo: 'o/a', items: [item({ labels: [NEEDS_HUMAN] }), item({ number: 2, labels: [NEEDS_HUMAN] })] }), { now: NOW, roster: ROSTER }),
    summariseMember(read({ repo: 'o/b', items: [item()] }), { now: NOW, roster: ROSTER }),
    summariseMember({ repo: 'o/c', declaration: null }, { now: NOW }),
    summariseMember({ repo: 'o/d', error: { status: 404 } }, { now: NOW }),
  ];
  const r = rollUp(summaries);
  assert.equal(r.members, 4);
  assert.equal(r.adopted, 2);
  assert.equal(r.notAdopted, 1);
  assert.equal(r.unreadable, 1);
  assert.equal(r.parkedMembers, 1, 'one MEMBER needs you');
  assert.equal(r.parkedItems, 2, 'even though two items are parked');
  assert.equal(r.needAttention, 1);
});

test('rollUp never counts an unreadable member as healthy', () => {
  const r = rollUp([summariseMember({ repo: 'o/d', error: { status: 404 } }, { now: NOW })]);
  assert.equal(r.adopted, 0);
  assert.equal(r.needAttention, 0, 'nor as needing attention — it is simply unknown');
  assert.equal(r.unreadable, 1);
});

test('packSpread ranks packs by how many members carry them', () => {
  const spread = packSpread([
    { packs: ['acme-pack-b', 'acme-pack'] }, { packs: ['acme-pack-b'] }, { packs: ['acme-pack-b', 'acme-pack-e'] },
  ]);
  assert.deepEqual(spread[0], { pack: 'acme-pack-b', members: 3 });
  assert.deepEqual(spread.map((p) => p.pack), ['acme-pack-b', 'acme-pack', 'acme-pack-e']);
});

// The fleet-only view: one task, everywhere it runs. A shared pack's task parked in
// several members at once is a canon problem that no single repo's page reveals.
test('taskSpread aggregates one task across members, parked first', () => {
  const reads = [
    { repo: 'o/a', items: [item({ title: '[claudinite-work] acme-pack-b/acme-task-c', labels: [NEEDS_HUMAN] })] },
    { repo: 'o/b', items: [item({ title: '[claudinite-work] acme-pack-b/acme-task-c', labels: [NEEDS_HUMAN] })] },
    { repo: 'o/c', items: [item({ title: '[claudinite-work] acme-pack/acme-task-d', state: 'closed', labels: [OUTCOME_DONE] })] },
  ];
  const spread = taskSpread(reads, NOW);
  assert.equal(spread[0].key, 'acme-pack-b/acme-task-c');
  assert.equal(spread[0].members, 2);
  assert.equal(spread[0].parked, 2);
  assert.equal(spread[1].key, 'acme-pack/acme-task-d');
  assert.equal(spread[1].done, 1);
});

test('taskSpread counts a closed item with no outcome as failed, and obsolete as neither', () => {
  const reads = [{
    repo: 'o/a',
    items: [
      item({ number: 1, title: '[claudinite-work] acme-pack-b/acme-task-c', state: 'closed', labels: [] }),
      item({ number: 2, title: '[claudinite-work] acme-pack-b/acme-task-c', state: 'closed', labels: [OUTCOME_OBSOLETE] }),
      item({ number: 3, title: '[claudinite-work] acme-pack-b/acme-task-c', state: 'closed', labels: [OUTCOME_DELIVERED] }),
    ],
  }];
  const [row] = taskSpread(reads, NOW);
  assert.equal(row.failed, 1);
  assert.equal(row.done, 1);
});

// The vocabulary migration's decode side: `task:done` is today's spelling and the
// `outcome:*` labels are the fielded engine's — a member mid-migration carries both,
// and the tallies must read them as one vocabulary.
test('outcomes decode every spelling to the canonical words', () => {
  const closed = (number, labels) => item({ number, state: 'closed', labels, closed_at: '2026-08-17T06:00:00Z' });
  const s = summariseMember(read({
    items: [closed(1, [OUTCOME_DONE]), closed(2, [STATUS_DONE]), closed(3, [OUTCOME_DELIVERED]), closed(4, [OUTCOME_OBSOLETE])],
  }), { now: NOW, roster: ROSTER });
  assert.equal(s.outcomes.done, 2);
  assert.equal(s.outcomes.delivered, 1);
  assert.equal(s.outcomes.obsolete, 1);
  assert.equal(s.outcomes.none, 0);
});

test('taskSpread reads task:done as done', () => {
  const reads = [{ repo: 'o/a', items: [item({ state: 'closed', labels: [STATUS_DONE] })] }];
  assert.equal(taskSpread(reads, NOW)[0].done, 1);
});

test('taskSpread ignores issues that are not work items', () => {
  const reads = [{ repo: 'o/a', items: [item({ title: 'Claudinite tracker: Tidy Issues' })] }];
  assert.deepEqual(taskSpread(reads, NOW), []);
});

// --- state mix --------------------------------------------------------------------

test('the open state mix is counted per state, with unknown states kept apart', () => {
  const items = [
    item({ number: 1, labels: [STATUS_BLOCKED] }),
    item({ number: 2, labels: [STATUS_READY] }),
    item({ number: 3, labels: [STATUS_RUNNING_AGENT] }),
    item({ number: 4, labels: [] }),          // torn/unlabelled — a real repair case
  ];
  const s = summariseMember(read({ items }), { now: NOW, roster: ROSTER });
  assert.equal(s.open.total, 4);
  assert.equal(s.open.byState[STATUS_BLOCKED], 1);
  assert.equal(s.open.byState[STATUS_READY], 1);
  assert.equal(s.open.byState[STATUS_RUNNING_AGENT], 1);
  assert.equal(s.open.byState.other, 1, 'an unlabelled item is not silently folded into a real state');
});

test('a behind member is a reason that names the gaps, at routine severity', () => {
  const s = summariseMember(
    read({ items: [item()] }),
    { now: NOW, roster: roster(verdict('o/a', 'behind', 'acme-pack-b 2 → 3')) },
  );
  const reason = s.reasons.find((r) => r.kind === 'mount');
  assert.equal(reason.level, 'info', 'behind is routine — the nightly update catches it up');
  assert.match(reason.text, /acme-pack-b/);
});

test('one declared task is not "1 tasks"', () => {
  const one = summariseMember(read({ items: [], paths: ['packs/acme-pack/tasks/acme-task-d/task.json'] }), { now: NOW, roster: ROSTER });
  assert.match(one.reasons.find((r) => /no work item/.test(r.text)).text, /^1 task declared/);
});

// --- the member grid's three groups ----------------------------------------------

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

test('a failing repo CI is a reason, and is not the scheduler failing', () => {
  const s = summariseMember(read({
    runs: [
      { event: 'push', status: 'completed', conclusion: 'failure', head_branch: 'main', created_at: '2026-08-17T09:00:00Z' },
      { event: 'schedule', status: 'completed', conclusion: 'success', head_branch: 'main', created_at: '2026-08-17T10:00:00Z' },
    ],
    defaultBranch: 'main',
  }), { now: NOW, roster: ROSTER });
  assert.equal(s.ci.state, 'failing');
  assert.equal(s.runs.consecutiveFailures, 0);
  assert.ok(s.reasons.some((r) => /own CI is failing/.test(r.text)));
});

test('the Work group counts issues that are not queue items, and open PRs', () => {
  const plain = { ...item(), number: 41, title: 'a plain issue', created_at: '2026-08-10T00:00:00Z' };
  const s = summariseMember(read({
    items: [item(), plain, { ...plain, number: 42, state: 'closed' }],
    prs: [
      { number: 7, title: 'a pr', created_at: '2026-08-12T00:00:00Z', draft: false },
      { number: 8, title: 'a draft', created_at: '2026-08-13T00:00:00Z', draft: true },
    ],
  }), { now: NOW, roster: ROSTER });

  assert.equal(s.work.issues, 1);
  assert.equal(s.work.issuesOldest, Date.parse('2026-08-10T00:00:00Z'));
  assert.equal(s.work.prs, 1);
  assert.equal(s.work.drafts, 1);
});

test('the head commit and the repo\'s stars ride along from reads already made', () => {
  const s = summariseMember(read({ head: { sha: 'abc', committedAt: '2026-08-16T00:00:00Z' }, stars: 12 }),
    { now: NOW, roster: ROSTER });
  assert.equal(s.stars, 12);
  assert.equal(s.lastCommit, Date.parse('2026-08-16T00:00:00Z'));
});

// --- what kind of human attention -------------------------------------------------

// The rollup counts MEMBERS, which is the length of the morning's list. What the list
// is made of is a separate question, and merging three merges to approve with three
// broken lanes into one word is what this exists to stop.
test('the attention breakdown names each kind of park separately', () => {
  const rows = attentionBreakdown({ broken: 1, decisions: 1, approvals: 3 });
  assert.deepEqual(rows.map((r) => r.text), [
    '1 task broken', '1 item needing a decision', '3 items needing approval',
  ]);
});

test('the breakdown is worst first, so the top line is the one to act on', () => {
  const rows = attentionBreakdown({
    approvals: 2, decisions: 1, broken: 1, schedulersFailing: 1,
    tripping: 1, schedulersNeverRan: 1,
  });
  assert.deepEqual(rows.map((r) => r.level),
    ['critical', 'critical', 'serious', 'serious', 'warning', 'serious']);
});

// A kind nobody is waiting on is ABSENT. A tile that lists "0 items needing approval"
// beside a real alarm is teaching its reader to skim the list.
test('a kind with nothing waiting on it is left out, not reported as zero', () => {
  assert.deepEqual(attentionBreakdown({}), []);
  assert.deepEqual(attentionBreakdown({ broken: 0, approvals: 0 }), []);
});

// One vocabulary, two callers. The row and the fleet tile itemise through the same
// function, so the two can never describe the same parks in different words.
test('a member and the fleet reach the breakdown through the same counts', () => {
  const one = summariseMember(
    read({ items: [item({ labels: [NEEDS_HUMAN, STATUS_NEEDS_HUMAN_APPROVAL] })] }), { now: NOW, roster: ROSTER },
  );
  assert.deepEqual(memberAttention(one),
    { broken: 0, decisions: 0, actions: 0, approvals: 1, tripping: 0, schedulersFailing: 0, schedulersNeverRan: 0 });
  assert.deepEqual(attentionBreakdown(memberAttention(one)).map((r) => r.text), ['1 item needing approval']);

  // The fixture member has no scheduled runs, so the fleet side legitimately carries a
  // scheduler fact the member row's own counts do not — a member-shaped thing, counted
  // in members, and only the fleet has more than one member to count.
  const roll = fleetAttention(rollUp([one]));
  assert.equal(roll.approvals, 1);
  assert.deepEqual(attentionBreakdown(roll).map((r) => r.text),
    ['1 item needing approval', '1 scheduler never ran']);
});

test('the rollup carries the split the breakdown reads', () => {
  const roll = rollUp([
    summariseMember(read({ items: [item({ labels: [NEEDS_HUMAN, STATUS_NEEDS_HUMAN_APPROVAL] })] }), { now: NOW, roster: ROSTER }),
    summariseMember(read({ repo: 'o/b', items: [item({ labels: [NEEDS_HUMAN] })] }), { now: NOW, roster: ROSTER }),
  ]);
  assert.equal(roll.parkedApprovals, 1);
  assert.equal(roll.parkedHolding, 1, 'an unclassified park falls back to failure, which holds the lane');
  assert.equal(roll.parkedInbox, 0);
});

// The two halves of the inbox are one bucket to a reader and two rates to the estimate,
// so the rollup has to carry them apart — and a park whose kind nobody can decode must
// not drift into the cheap lane on its way through.
test('the rollup splits an action park from a decision park', () => {
  const roll = rollUp([
    summariseMember(read({ items: [
      item({ number: 1, labels: [NEEDS_HUMAN, STATUS_NEEDS_HUMAN_ACTION] }),
      item({ number: 2, labels: [NEEDS_HUMAN, STATUS_NEEDS_HUMAN_DECISION] }),
      item({ number: 3, labels: [NEEDS_HUMAN] }),
    ] }), { now: NOW, roster: ROSTER }),
  ]);
  assert.equal(roll.parkedActions, 1);
  assert.equal(roll.parkedDecisions, 1);
  assert.equal(roll.parkedInbox, 2, 'the two together are still the inbox');
  assert.equal(roll.parkedHolding, 1, 'the undecodable park stays broken, not a decision');
  assert.equal(estimateMinutes(fleetAttention(roll)),
    PARK_MINUTES.actions + PARK_MINUTES.decisions + PARK_MINUTES.broken);
});

// --- the estimate ------------------------------------------------------------------

// Per kind, because the four parks are disjoint by remedy: what matters is that each
// rate is applied to the right count and that nothing which is not a queue of work for
// a person is counted into it at all.
test('each park kind costs its own rate', () => {
  assert.equal(estimateMinutes({ broken: 1 }), 15);
  assert.equal(estimateMinutes({ actions: 1 }), 10);
  assert.equal(estimateMinutes({ decisions: 1 }), 3);
  assert.equal(estimateMinutes({ approvals: 1 }), 1);
  assert.equal(estimateMinutes({ broken: 2, actions: 1, decisions: 3, approvals: 4 }), 30 + 10 + 9 + 4);
  assert.equal(estimateMinutes({}), 0);
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

// A trip is not a park: it wears no label, it is derived from an item's age against the
// engine's leashes, and the janitor clears it. Counting it as a person's minutes was the
// old flat rate's doing.
test('a recovery-rule trip is not minutes of a person\'s time', () => {
  assert.equal(estimateMinutes({ tripping: 4 }), 0);
  assert.equal(estimateMinutes({ broken: 1, tripping: 9 }), PARK_MINUTES.broken);
  assert.ok(attentionBreakdown({ tripping: 4 }).length, 'but it is still reported');
});

// The published arithmetic. A figure a reader cannot check is a figure they can only
// trust, and the one thing this one cannot know has to say so itself.
test('the note shows the arithmetic and admits the unread PR sizes', () => {
  assert.equal(estimateNote({}), 'nothing parked');
  assert.equal(estimateNote({ broken: 2, decisions: 1 }), '15×2 broken + 3×1 decision');
  assert.match(estimateNote({ approvals: 1 }), /lower bound/);
  assert.doesNotMatch(estimateNote({ broken: 1 }), /lower bound/,
    'nothing is unread when no approval is waiting');
});

// A broken scheduler is not a queue of tasks to work through, and folding it in would
// make the figure mean two things at once.
test('a scheduler fault is not minutes of a person\'s time', () => {
  assert.equal(estimateMinutes({ schedulersFailing: 3, schedulersNeverRan: 2 }), 0);
  assert.ok(attentionBreakdown({ schedulersFailing: 3 }).length, 'but it is still reported');
});

// The reason a row can drop a park from its prose without losing it: the ranking
// reads every reason, and only the rendering filters by kind.
test('every reason carries the kind that says where the row shows it', () => {
  const s = summariseMember(
    read({ items: [item({ labels: [NEEDS_HUMAN, STATUS_NEEDS_HUMAN_DECISION] })] }),
    { now: NOW, roster: roster(verdict('o/a', 'no-stamp', 'no stamp')) },
  );
  assert.ok(s.reasons.length >= 2);
  for (const r of s.reasons) assert.ok(r.kind, `a reason with no kind cannot be placed: ${r.text}`);
  assert.ok(s.reasons.some((r) => r.kind === 'park'));
  assert.ok(s.reasons.some((r) => r.kind === 'mount'));
  assert.equal(s.level, 'serious', 'the level still weighs the reasons the row will not spell out');
});

// The breakdown is read two ways now: as sentences where there is room for them, and
// as a mark where there is not. A mark cannot re-derive which kind a sentence is by
// matching its words, so each row carries its kind and the pieces the short line is
// built from.
test('each breakdown row carries its kind and the count the short line reads', () => {
  const rows = attentionBreakdown({ broken: 2, decisions: 1, approvals: 3 });
  assert.deepEqual(rows.map((r) => [r.kind, r.count, r.short]), [
    ['broken', 2, 'broken'],
    ['decisions', 1, 'decision'],
    ['approvals', 3, 'approvals'],
  ]);
  // And the sentence is still exactly what it was, because the tiles print it.
  assert.deepEqual(rows.map((r) => r.text), [
    '2 tasks broken', '1 item needing a decision', '3 items needing approval',
  ]);
});

// --- which repos the fleet speaks about, and what it says about them --------------
// Owner, 2026-09-13: an archived repo is out of the fleet; a dormant member is out of
// the mount and scheduler questions and out of every fleet-wide operation; a member
// with no meaningful commits lately is marked sleepy but stays fully in the fleet.

const dormantDecl = (over = {}) => decl({
  packs: [{ id: 'acme-pack-b', version: 3 }, { id: 'claudinite-tasks', config: { dormant: true } }], // @real-entity dormancy is that pack's own setting
  ...over,
});

const commitWindow = (commits, over = {}) => ({
  since: new Date(NOW - 90 * 86400e3).toISOString(),
  complete: true,
  commits,
  ...over,
});

const commitAt = (daysAgo, over = {}) => ({
  sha: `sha${daysAgo}`,
  at: new Date(NOW - daysAgo * 86400e3).toISOString(),
  message: 'Add a thing',
  author: 'a-person',
  ...over,
});

test('an archived repo is out of the fleet, whatever it declares', () => {
  const s = summariseMember(read({ archived: true, private: true }), { now: NOW, roster: ROSTER });
  assert.equal(s.status, 'archived');
  assert.equal(s.private, true);
  assert.match(s.reasons[0].text, /archived/);
});

test('a member carries GitHub\'s private flag through, adopted or not', () => {
  assert.equal(summariseMember(read({ private: true }), { now: NOW, roster: ROSTER }).private, true);
  assert.equal(summariseMember({ repo: 'o/a', declaration: null, private: false }, { now: NOW }).private, false);
});

test('a dormant member is neither measured for its freshness nor judged on its scheduler', () => {
  const s = summariseMember(read({
    declaration: dormantDecl(),
    runs: [{ event: 'schedule', status: 'completed', conclusion: 'failure', created_at: '2026-08-17T04:00:00Z' }],
  }), { now: NOW, roster: roster(verdict('o/a', 'behind', 'acme-pack-b 2 → 3')) });

  assert.equal(s.dormant, true);
  assert.equal(s.freshness.state, 'dormant');
  assert.deepEqual(s.reasons.filter((r) => r.kind === 'scheduler'), []);
  assert.deepEqual(s.reasons.filter((r) => r.kind === 'mount').map((r) => r.level), ['info']);
  assert.match(s.reasons.find((r) => r.kind === 'mount').text, /not measured/);
  assert.equal(s.level, 'info', 'an obedient repo is not an alarm');
});

test('the contrast case: the same freshness and scheduler on an AWAKE member are findings', () => {
  const s = summariseMember(read({
    runs: [{ event: 'schedule', status: 'completed', conclusion: 'failure', created_at: '2026-08-17T04:00:00Z' }],
  }), { now: NOW, roster: roster(verdict('o/a', 'behind', 'acme-pack-b 2 → 3')) });
  assert.equal(s.freshness.state, 'behind');
  assert.ok(s.reasons.some((r) => r.kind === 'scheduler'));
});

test('the rollup counts machinery faults over the awake members only', () => {
  const asleep = summariseMember(read({
    repo: 'o/asleep',
    declaration: dormantDecl(),
    runs: [{ event: 'schedule', status: 'completed', conclusion: 'failure', created_at: '2026-08-17T04:00:00Z' }],
  }), { now: NOW, roster: ROSTER });
  const awake = summariseMember(read({ repo: 'o/awake' }), { now: NOW, roster: ROSTER });
  const roll = rollUp([asleep, awake]);
  assert.equal(roll.behindMembers, 0);
  assert.equal(roll.failingMembers, 0);
  assert.equal(roll.dormantMembers, 1);
  assert.equal(roll.adopted, 2, 'it is still a member — dormancy is about upkeep, not membership');
});

test('sleepy is decided on MEANINGFUL commits, by the claudinite-tasks test', () => {
  const machineryOnly = summariseMember(read({
    windowCommits: commitWindow([
      commitAt(1, { message: 'Claudinite maintenance: converge the mount' }),
      commitAt(2, { author: 'github-actions[bot]' }),
      commitAt(3, { message: 'Regenerate the board\n\nClaudinite-Task: acme-pack/acme-task-g\n' }),
      commitAt(40),
    ]),
  }), { now: NOW, roster: ROSTER });
  assert.equal(machineryOnly.sleep.state, 'sleepy');
  assert.equal(machineryOnly.dormant, false, 'sleepy is not dormancy — every sweep still reaches it');

  const worked = summariseMember(read({
    windowCommits: commitWindow([commitAt(1), commitAt(40)]),
  }), { now: NOW, roster: ROSTER });
  assert.equal(worked.sleep.state, 'awake');
});

test('a member whose commit listing was not read is unknown, never sleepy', () => {
  const s = summariseMember(read({ windowCommits: undefined }), { now: NOW, roster: ROSTER });
  assert.equal(s.sleep.state, 'unknown');
  assert.equal(rollUp([s]).sleepyMembers, 0);
});

test('a commit window that starts inside the fortnight cannot answer the question', () => {
  const s = summariseMember(read({
    windowCommits: commitWindow([], { since: new Date(NOW - 3 * 86400e3).toISOString() }),
  }), { now: NOW, roster: ROSTER });
  assert.equal(s.sleep.state, 'unknown');
});
