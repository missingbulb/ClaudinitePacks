// A repo's health, as data: its own CI, its scheduler's heartbeat, and what one parked
// item costs a person. Pure: no clock, no I/O, no DOM.

import { STATUS_NEEDS_HUMAN_APPROVAL, STATUS_NEEDS_HUMAN_ACTION } from '../read/queue-vocabulary.mjs';

const ms = (t) => (t == null ? null : new Date(t).getTime());

// The repo's OWN CI, which is a different question from the scheduler's health: one
// says whether this project builds, the other whether Claudinite is running here. They
// are read from the same list and must never be conflated — a green scheduler on a
// repo whose tests are red is not a healthy repo.
//
// The default branch's most recent completed run is the answer; a `schedule` run is
// excluded because that is the queue's own scheduler run, reported separately.
export function ciStatus(runs, defaultBranch) {
  const mine = (runs ?? []).filter((r) => r.event !== 'schedule'
    && (!defaultBranch || !r.head_branch || r.head_branch === defaultBranch));
  const inFlight = mine.some((r) => r.status === 'in_progress' || r.status === 'queued');
  const last = mine.find((r) => r.status === 'completed');
  if (!last) return { state: inFlight ? 'running' : 'unknown', at: null, name: null };
  const state = last.conclusion === 'success' ? 'passing'
    : (last.conclusion === 'cancelled' || last.conclusion === 'skipped') ? 'unknown'
      : 'failing';
  return { state: inFlight ? 'running' : state, at: ms(last.created_at), name: last.name ?? null, url: last.html_url ?? null };
}

// The scheduler's own health. Only the workflow that drives the queue matters here —
// a failing unrelated CI run is the repo's business, not the scheduler's — so runs
// are filtered to scheduled ones before anything is counted.
//
// THE HEARTBEAT NEEDS A SECOND SOURCE. The runs listing is one page across every
// workflow the repo has — the scheduler, the executor and the repo's own CI — so on
// a busy repo that page covers a few hours, and a repo whose last scheduler run is
// older than it is indistinguishable from one that has never run. "Never ran" is
// exactly the critical verdict, so the difference is not one to guess at.
//
// The fold's hour tier is that second source: three days of per-hour scheduler counts,
// appended past its own watermark from a listing it pages properly. It is coarser —
// an hour, not a timestamp — so it is used as a FLOOR: it can only push `lastAt`
// further back than the live page reached, and can only turn "never ran" into "ran".
// A repo with no fold reads its heartbeat from the live page alone and says so.
export function summariseRuns(runs, now, usage = null) {
  const scheduled = runs.filter((r) => r.event === 'schedule');
  const completed = scheduled.filter((r) => r.status === 'completed');
  const inFlight = runs.filter((r) => r.status === 'in_progress' || r.status === 'queued').length;

  // Consecutive failures from the most recent backwards: one failure is noise, a run
  // of them is a scheduler that has stopped working.
  let consecutiveFailures = 0;
  for (const r of completed) {
    if (r.conclusion === 'success') break;
    if (r.conclusion === 'cancelled' || r.conclusion === 'skipped') continue;
    consecutiveFailures += 1;
  }

  const liveLastAt = scheduled.map((r) => ms(r.created_at)).filter(Boolean).sort((a, b) => b - a)[0] ?? null;
  const foldedLastAt = lastFoldedScheduler(usage);
  const lastAt = liveLastAt !== null && (foldedLastAt === null || liveLastAt >= foldedLastAt)
    ? liveLastAt : foldedLastAt;

  return {
    scheduled: scheduled.length,
    inFlight,
    consecutiveFailures,
    lastAt,
    // Where that timestamp came from, and therefore how precise it is: a live run is
    // exact, a folded hour is the hour it started in. `null` when neither answered.
    lastAtSource: lastAt === null ? null : (lastAt === liveLastAt ? 'live' : 'folded'),
    // Whether the fold was read at all, so a repo with none can say its heartbeat
    // rests on one page of runs rather than implying the two agreed.
    foldRead: Boolean(usage?.hours),
    // No scheduled run in EITHER source is not "healthy" — it is "we have never seen
    // this repo's scheduler", which the page must be able to say. A repo with no
    // fold can still only be reporting the page's own depth, which `foldRead` states.
    everRan: scheduled.length > 0 || foldedLastAt !== null,
  };
}

// The newest hour the fold recorded a scheduler run in, as that hour's start. A floor,
// never a claim about the minute: the tier counts runs per hour and says nothing about
// where inside one they landed.
export function lastFoldedScheduler(usage) {
  const hours = usage?.hours;
  if (!hours) return null;
  const newest = Object.entries(hours)
    .filter(([, row]) => typeof row?.scheduler === 'number' && row.scheduler > 0)
    .map(([hour]) => hour)
    .sort()
    .pop();
  return newest ? ms(`${newest}:00:00Z`) : null;
}

// What one parked item costs a person, in minutes, by WHAT THE PARK ASKS FOR (owner,
// 2026-08-22). Per kind rather than one flat rate, because the four parks are disjoint
// by remedy and cost accordingly: diagnosing a break is not merging a PR, and averaging
// them into one number made the figure mean four things at once.
//
// Keyed by the count names below, which are the triage labels one layer up:
// `broken` is `task:needs-human-failure` PLUS any park whose kind cannot be decoded
// (`parkOf` falls back to `failure`), so an unclassified park is priced as the thing
// it is treated as everywhere else.
export const PARK_MINUTES = Object.freeze({
  broken: 15,
  actions: 10,
  decisions: 3,
});

// An approval is priced by SIZE, not by kind: a two-line docs merge and a nine-file
// refactor are the same label and not the same read.
export const APPROVAL_RATE = Object.freeze({ minutes: 1, lines: 200 });

// Minutes to approve a PR of `changedLines`, or the rate's own floor when the size is
// unknown — which is every approval today, and deliberately not hidden. The page never
// reads a PR's size: `projectPull` keeps no line counts and the PRs arrive on the
// issues listing, which carries none, so a size would cost one extra request per open
// approval against `budget.mjs`'s ladder. Unknown stays unknown rather than becoming a
// zero or a guessed average: the floor is the smallest thing the rate can honestly say,
// which is what makes the total a LOWER BOUND rather than an estimate that might be high.
export const approvalMinutes = (changedLines = null) =>
  (Number.isFinite(changedLines) && changedLines > 0
    ? Math.max(1, Math.ceil((changedLines / APPROVAL_RATE.lines) * APPROVAL_RATE.minutes))
    : APPROVAL_RATE.minutes);

// ONE parked item's own minutes, from the rates above — so a figure shown against a
// single item is one term of that sum rather than a second estimate. `park` is the
// item's own classification and nothing else: whether it blocks, and its triage label.
// Anything that is not a park has no figure at all here, by the same rule that keeps
// scheduler faults and recovery-rule trips out of the total.
export function parkMinutes(park) {
  if (!park) return null;
  // An undecodable park is priced as the thing it is treated as everywhere else.
  if (park.blocking || !park.triage) return PARK_MINUTES.broken;
  if (park.triage === STATUS_NEEDS_HUMAN_APPROVAL) return approvalMinutes();
  if (park.triage === STATUS_NEEDS_HUMAN_ACTION) return PARK_MINUTES.actions;
  return PARK_MINUTES.decisions;
}

// The one caveat a single item's figure carries, and only the approvals carry it: the
// page never reads a PR's size, so an approval is charged the rate's floor and its
// figure can only be low.
export const parkMinutesNote = (park) =>
  (parkMinutes(park) != null && !park.blocking && park.triage === STATUS_NEEDS_HUMAN_APPROVAL
    ? 'PR size unread, so a lower bound'
    : null);
