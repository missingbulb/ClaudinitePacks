// The slice of the work-item queue's vocabulary the mark's writer reads: the status
// labels and every legacy spelling of them, the ad-hoc mark's own label, and the
// machine block a member's adoption writes into the issue body. The queue is the
// engine's (`cn`), whose wire this is; packs share no code, so this pack carries the
// copy, and `test/tasks/fleet-add-missing-packs/queue-vocabulary.test.mjs` holds it
// to the engine's own answers through `cn tasks grammar`.

// --- the canonical vocabulary (PRINCIPLES.md, the migration of #1119) -------------
// Every label the machinery writes is one of three things — the item's single
// STATUS, its lifelong ORIGIN, or the URGENCY flag — and all of them live in the
// `task:` namespace. These are the spellings a reader compares against: decode
// first (`statusOf`, `originOf`), then compare, so an item filed by any engine
// version answers the same question the same way.
export const STATUS_PREFIX = 'task:status:';

export const PARK_PREFIX = `${STATUS_PREFIX}needs-human-`;

export const STATUS_BLOCKED = `${STATUS_PREFIX}blocked`;

export const STATUS_READY = `${STATUS_PREFIX}waiting-for-executor`;

export const STATUS_RUNNING_EXECUTOR = `${STATUS_PREFIX}running-executor`;

export const STATUS_RUNNING_AGENT = `${STATUS_PREFIX}running-agent`;

export const STATUS_NEEDS_HUMAN_ACTION = `${PARK_PREFIX}action`;

export const STATUS_NEEDS_HUMAN_DECISION = `${PARK_PREFIX}decision`;

export const STATUS_NEEDS_HUMAN_APPROVAL = `${PARK_PREFIX}approval`;

export const STATUS_NEEDS_HUMAN_FAILURE = `${PARK_PREFIX}failure`;

export const STATUS_DONE = `${STATUS_PREFIX}done`;

export const STATUS_REJECTED = `${STATUS_PREFIX}rejected`;

// The four statuses an OPEN item may wear before it parks or converges. An open
// item wearing no decodable status at all is off the state machine — a torn label
// swap's leavings, which the janitor repairs (docs/PRINCIPLES.md).
export const LIVE_STATUSES = Object.freeze([
  STATUS_BLOCKED, STATUS_READY, STATUS_RUNNING_EXECUTOR, STATUS_RUNNING_AGENT,
]);

// THE PARK KINDS. A park is ONE label - `task:status:needs-human-<kind>`
// — and the kind is what the human is being asked for, which is the whole
// difference between a queue a person can skim and one they have to read.
//
// The four are disjoint by REMEDY, not by cause:
//   action   — something outside the code must change: a secret set, a scope
//              granted, a routine's prompt or endpoint fixed, an item re-created
//              with the parameter it was missing. Mechanical; no judgement.
//   decision — the run stopped mid-flight and what happens next is a choice:
//              re-queue or abandon, does the half-done work stand, was the
//              ceiling violation acceptable.
//   approval — the run SUCCEEDED and deliberately left an unmerged PR. The only
//              park that is not a fault; the human merges it or closes it.
//   failure  — the run broke: a bug, a contract-forbidden shape, a malformed or
//              forged item. Someone diagnoses and fixes code.
// `failure` is the default a park falls back to, so an unclassified park reads as
// "diagnose me" rather than quietly joining the mechanical lane.
// Ordered as a decoder prefers them when an item somehow wears more than one:
// `failure` first, the conservative lane. The two-label era's sub-labels
// (`task:needs-human-<kind>`) are read by the grammar's `parkOf` and written by nobody.
export const PARK_KINDS = Object.freeze(['failure', 'action', 'decision', 'approval']);

export const PARK_STATUSES = Object.freeze(PARK_KINDS.map((k) => `${PARK_PREFIX}${k}`));

export const STATUS_LABELS = Object.freeze([
  ...LIVE_STATUSES, ...PARK_STATUSES, STATUS_DONE, STATUS_REJECTED,
]);

// THE ORIGIN (docs/PRINCIPLES.md) — who asked for this item, worn for the
// item's whole life beside whatever status it holds.
export const ORIGIN_PREFIX = 'task:origin:';

export const ORIGIN_AD_HOC = `${ORIGIN_PREFIX}ad-hoc`;

// --- the legacy spellings, written never and read forever ----------------------
// Every spelling any fielded engine has written. They are literals rather than
// aliases of the constants above precisely because those constants moved: a decode
// map built from them would have mapped today's spelling to itself and forgotten
// the vocabulary it exists to read (PRINCIPLES.md).
// @legacy-tolerance advisory:none retire:#1642
export const LEGACY_BLOCKED = 'task:blocked';

// @legacy-tolerance advisory:none retire:#1642
export const LEGACY_READY = 'task:ready';

// @legacy-tolerance advisory:none retire:#1642
export const LEGACY_EXECUTING = 'task:executing';

// @legacy-tolerance advisory:none retire:#1642
export const LEGACY_AGENT = 'task:agent';

// @deprecated The bare park of the two-label era. A park is ONE label now
// (`task:status:needs-human-<kind>`); this is still read — on its own it decodes to
// `failure`, the conservative lane — and still ensured, because an open item filed
// by a fielded engine wears it. Its one live writer is the session-side dispatch
// flow, which labels an anomaly with it for triage (`src/session/dispatch.mjs`).
export const NEEDS_HUMAN = 'needs-human';

// @deprecated The pre-2026-08-19 terminal spellings. Kept exported so a fielded
// pack that imports them still loads, and READ wherever an outcome is decoded:
// labels are stored data on closed issues fleet-wide, so a decoder that stopped
// recognising these would turn every historical run into an un-outcomed one.
export const OUTCOME_DONE = 'outcome:done';

export const OUTCOME_OBSOLETE = 'outcome:obsolete';

// @deprecated The pre-#1119 terminal spellings in the `task:` namespace, the
// generation between `outcome:*` and today's statuses. Read forever, same reason.
// @legacy-tolerance advisory:none retire:#1642
export const LEGACY_TASK_DONE = 'task:done';

// @legacy-tolerance advisory:none retire:#1642
export const LEGACY_TASK_OBSOLETE = 'task:obsolete';

// --- the machine block (docs/PRINCIPLES.md) ----------------------------------
// A one-issue request's item IS the issue somebody marked, so the item's fields
// share a body a person authored and keeps editing. They live in one delimited
// block, appended at adoption and rewritten in place after that: everything outside
// it belongs to the human, everything inside it to the machine, and a parser that
// read the whole body would take a sentence of prose for a field.
//
// A `[claudinite-work]` item has no block — its whole body is the machine's — so
// every reader here falls back to the whole text, which is what keeps items filed
// before the one-issue model draining unchanged.
export const MACHINE_BLOCK_START = '<!-- claudinite-item -->';

export const MACHINE_BLOCK_END = '<!-- /claudinite-item -->';

// The mark's label as the engine ensures it in every member.
export const MARK_LABEL = { name: ORIGIN_AD_HOC, color: 'bfd4f2', description: 'Claudinite queue: asked for by a person — their own issue, adopted as the work item itself' };

// --- the decode: legacy spellings are written never, read forever ---------------
// Labels are STORED DATA: open items filed by a fielded engine wear its spellings,
// closed items keep theirs forever, and members converge on their own schedules. So
// every reader here goes through one pass that maps every spelling ever written
// straight to today's — never through a literal comparison against one of them.
//
// The `task:*` entries come out when no OPEN item wears one (#1913); the two
// `outcome:*` entries never do, because a closed item's labels are stored data and
// dropping them would turn every historical run into an un-outcomed one.
// @legacy-tolerance advisory:none retire:#1913
const LEGACY_STATUS = new Map([
  [LEGACY_BLOCKED, STATUS_BLOCKED],
  [LEGACY_READY, STATUS_READY],
  [LEGACY_EXECUTING, STATUS_RUNNING_EXECUTOR],
  [LEGACY_AGENT, STATUS_RUNNING_AGENT],
  [LEGACY_TASK_DONE, STATUS_DONE], [OUTCOME_DONE, STATUS_DONE],
  [LEGACY_TASK_OBSOLETE, STATUS_REJECTED], [OUTCOME_OBSOLETE, STATUS_REJECTED],
]);

// @legacy-tolerance advisory:none retire:#1913
const LEGACY_PARK_RE = /^task:needs-human-(.+)$/;

// The park an issue's labels name, canonical, or null. Both shapes decode here:
// today's single `task:status:needs-human-<kind>` and the legacy pair
// (`needs-human` plus a sub-label). A kind nobody here knows — a bare legacy park,
// or a word a newer engine invented — reads as `failure`, the conservative lane.
function parkOf(names) {
  const kinds = [
    ...names.filter((n) => n.startsWith(PARK_PREFIX)).map((n) => n.slice(PARK_PREFIX.length)),
    ...names.map((n) => LEGACY_PARK_RE.exec(n)?.[1]).filter(Boolean),
  ];
  if (!kinds.length && !names.includes(NEEDS_HUMAN)) return null;
  return `${PARK_PREFIX}${PARK_KINDS.find((k) => kinds.includes(k)) ?? 'failure'}`;
}

// GitHub hands labels back as objects on the issues API and as bare strings in
// some fixtures; accept either.
export const labelNames = (issue) =>
  (issue?.labels ?? []).map((l) => (typeof l === 'string' ? l : l?.name)).filter(Boolean);

// Every distinct status an issue's labels decode to. One entry per status, so an
// item mid-flip — wearing a legacy spelling beside its canonical one — reads as the
// ONE status it is, and only genuinely conflicting labels read as more than one
// (the dashboard's `torn`).
export function statusesOn(issue) {
  const names = labelNames(issue);
  const out = new Set();
  const park = parkOf(names);
  if (park) out.add(park);
  for (const n of names) {
    if (STATUS_LABELS.includes(n) && !n.startsWith(PARK_PREFIX)) out.add(n);
    else if (LEGACY_STATUS.has(n)) out.add(LEGACY_STATUS.get(n));
  }
  return [...out];
}

// THE status an issue wears, canonical, or null for one wearing none. A park wins
// over anything else present: a torn transition that left a state label beside a
// park must read as parked, or the queue would pick up an item a human owns.
export function statusOf(issue) {
  const worn = statusesOn(issue);
  return worn.find((s) => s.startsWith(PARK_PREFIX))
    ?? STATUS_LABELS.find((s) => worn.includes(s))
    ?? null;
}

// Every spelling that MEANS `status` — what a transition out of it has to clear,
// since the item may wear any engine's. Leaving a park clears every park spelling
// whatever its kind: a re-queue takes the item out of the human's hands entirely.
export function spellingsOf(status) {
  if (String(status ?? '').startsWith(PARK_PREFIX)) {
    return [...PARK_STATUSES, ...PARK_KINDS.map((k) => `task:needs-human-${k}`), NEEDS_HUMAN];
  }
  const legacy = [...LEGACY_STATUS].filter(([, canonical]) => canonical === status).map(([l]) => l);
  return [status, ...legacy];
}

const BLOCK_RE = /<!-- claudinite-item -->\n?([\s\S]*?)\n?<!-- \/claudinite-item -->/;

// The machine's half of a body, or null where there is no block at all.
export const machineBlockOf = (body) => BLOCK_RE.exec(String(body ?? ''))?.[1] ?? null;

// Replace the block, or append one to a body that has none. The human's text is
// never rewritten — an append lands after it, separated by a blank line.
export function withMachineBlock(body, block) {
  const text = String(body ?? '');
  const wrapped = `${MACHINE_BLOCK_START}\n${block.replace(/\s*$/, '')}\n${MACHINE_BLOCK_END}`;
  if (BLOCK_RE.test(text)) return text.replace(BLOCK_RE, wrapped);
  return `${text.replace(/\s*$/, '')}\n\n${wrapped}\n`;
}

