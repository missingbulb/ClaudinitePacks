// The ledger's shared arithmetic: the window against the previous window, the day
// ladder a fold is read into, and the figures and their sentences. The repo page's top
// block (`repo-ledger.mjs`) is built from these.
//
// Every figure here can be UNKNOWN: a repo that does not fold, a fold that predates a
// field, a rate table nobody set. Those states — a number, *not recorded*, and (for
// money) *unpriced* — are decided once, here, where they can be tested.
//
// NOTHING HERE FETCHES. It reduces over reads already made.

import { RATES_KEY } from './pricing.mjs';
import { DAY_MS, dayKey, dayLadder } from './days.mjs';
import {
  isQueueItem, isParked, outcomeOf,
} from '../read/queue-vocabulary.mjs';

// The block's own window. Seven days against the seven before them, over a 14-day
// ladder — which is also the sparklines' and the pulse's span, so a figure, its delta
// and its shape all read the same stretch of days.
export const WINDOW_DAYS = 7;
export const LADDER_DAYS = 14;

// How long an open item sits before it is STUCK. Three days is the spec's own bound,
// and it is the figure that feeds Start here.
export const STUCK_DAYS = 3;

const ms = (t) => (t == null ? null : new Date(t).getTime());
const finite = (n) => (typeof n === 'number' && Number.isFinite(n) ? n : null);

// Sum a field across whatever knew it, or `null`. NEVER 0 for "nobody answered": the
// whole point of the fold's absence rule is lost the moment a page adds up an empty
// list and prints the total.
export function sumKnown(values) {
  const known = (values ?? []).map(finite).filter((n) => n !== null);
  return known.length ? known.reduce((a, b) => a + b, 0) : null;
}

// A quantile over a sample, by nearest rank. `null` on an empty sample — a median of
// nothing is not zero.
export function quantile(values, p) {
  const sorted = (values ?? []).map(finite).filter((n) => n !== null).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const rank = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[rank];
}

// --- the day ladder ----------------------------------------------------------------

// One row per day: every scalar the ledger reads, summed over the folds that knew it, plus the two sub-maps the pricing and the lead times need.
// A day nobody folded carries `null` everywhere and `folded: false`, which is what
// draws a blank column rather than a floor.
export function foldDays(folding, { now, days = LADDER_DAYS } = {}) {
  const ladder = dayLadder(now, days);
  const SCALARS = [
    'sessions', 'userMessages', 'tokensIn', 'tokensOut', 'tokenSessions',
    'humanSeconds', 'agentSeconds',
    'commits', 'linesAdded', 'linesRemoved', 'releases',
  ];
  return ladder.map((day) => {
    const rows = folding.map((r) => r.usage?.days?.[day]).filter(Boolean);
    const out = { day, folded: rows.length > 0, members: rows.length };
    for (const field of SCALARS) out[field] = sumKnown(rows.map((row) => row[field]));
    // Both check scopes together, as `growthSeries` reads them: "how often did the
    // checks catch something today" is one question.
    const scopes = rows.flatMap((row) => Object.values(row.checks ?? {}));
    out.caught = scopes.length
      ? scopes.reduce((n, s) => n + (s.failures ?? 0) + (s.ciFailures ?? 0), 0) : null;
    out.checkRuns = scopes.length ? scopes.reduce((n, s) => n + (s.runs ?? 0), 0) : null;
    out.checkErrors = scopes.length ? scopes.reduce((n, s) => n + (s.errors ?? 0), 0) : null;
    // Kept as rows rather than summed: the pricing reduction wants the per-model split
    // and the lead times want one entry per PR, both across the whole window.
    out.tokensByModel = rows.map((row) => ({ tokensByModel: row.tokensByModel }));
    out.prs = rows.flatMap((row) => Object.entries(row.prs ?? {}));
    // Which member released, so the releases figure can name them rather than count.
    out.releasedBy = folding
      .filter((r) => finite(r.usage?.days?.[day]?.releases) > 0)
      .map((r) => r.repo);
    // …and which moved at all, for the pulse's hover.
    out.movedBy = folding.filter((r) => finite(r.usage?.days?.[day]?.sessions) > 0).map((r) => r.repo);
    return out;
  });
}

// The two windows the block compares, as day-row slices. `current` ends today
// inclusive; `previous` is the seven days before it.
export function windowsOf(rows, { now, windowDays = WINDOW_DAYS } = {}) {
  const from = dayKey(now - (windowDays - 1) * DAY_MS);
  const prevFrom = dayKey(now - (2 * windowDays - 1) * DAY_MS);
  return {
    current: rows.filter((r) => r.day >= from),
    previous: rows.filter((r) => r.day >= prevFrom && r.day < from),
    from,
    to: dayKey(now),
    prevFrom,
    prevTo: dayKey(now - windowDays * DAY_MS),
  };
}

// --- merged pull requests ----------------------------------------------------------

// Every PR merged inside the window, from the two sources that reach different depths
// and DEDUPED on its number, since a PR merged in the last day or two is in both.
//
// The live listing carries the merge date and the issue a PR closes but no lead times;
// the fold carries the lead times the reader needs and reaches further back. So a PR
// seen live is joined to the issue in the same read where one is there — which is what
// makes `issue → merged` answerable for the days the fold has not folded yet.
export function mergedPrsIn(reads, dayRows, { repoOf = (r) => r.repo } = {}) {
  const seen = new Map();
  const from = dayRows[0]?.day ?? null;
  const to = dayRows[dayRows.length - 1]?.day ?? null;

  for (const read of reads) {
    const issues = new Map((read.items ?? []).map((i) => [i.number, i]));
    for (const pr of read.prs ?? []) {
      const merged = pr.merged_at ?? null;
      if (!merged) continue;
      const day = merged.slice(0, 10);
      if (from && (day < from || day > to)) continue;
      const issue = pr.closesIssue ? issues.get(pr.closesIssue) : null;
      seen.set(`${repoOf(read)}#${pr.number}`, {
        repo: repoOf(read),
        number: pr.number,
        day,
        source: 'live',
        leadHours: hoursBetweenIso(pr.created_at, merged),
        issueLeadHours: issue ? hoursBetweenIso(issue.created_at, merged) : null,
        sessionToMergeHours: null,
      });
    }
  }

  for (const row of dayRows) {
    for (const [number, lead] of row.prs) {
      const key = `${row.day}#${number}`;
      // The fold's row is the fuller record — it carries the session lead time nothing
      // live can answer — so it wins wherever both sources have the same PR. Members
      // are not distinguishable in a fold row's key, so the day stands in for the repo;
      // a collision would need two members to merge the same PR number on one day, and
      // it costs one row of a sample rather than a figure.
      const live = [...seen.values()].find((p) => String(p.number) === String(number) && p.day === row.day);
      if (live) { Object.assign(live, { ...lead, source: 'fold' }); continue; }
      seen.set(key, { repo: null, number, day: row.day, source: 'fold', ...lead });
    }
  }
  return [...seen.values()];
}

const hoursBetweenIso = (from, to) => {
  const a = ms(from);
  const b = ms(to);
  if (a === null || b === null || !Number.isFinite(a) || !Number.isFinite(b) || b < a) return null;
  return Math.round(((b - a) / 3600e3) * 10) / 10;
};

// --- items nobody has moved --------------------------------------------------------

// Open work items untouched for three days, split by WHO clears them. The split is the
// point: a person clears a park, and the janitor's leash clears the rest, so only the
// first half is a claim on the reader's morning.
export function stuckItems(reads, now, { days = STUCK_DAYS } = {}) {
  const cutoff = now - days * DAY_MS;
  const forYou = [];
  const onMachine = [];
  for (const read of reads) {
    for (const item of read.items ?? []) {
      if (item.state !== 'open' || !isQueueItem(item)) continue;
      const touched = ms(item.updated_at) ?? ms(item.created_at);
      if (touched === null || touched > cutoff) continue;
      (isParked(item) ? forYou : onMachine).push({ repo: read.repo, number: item.number, title: item.title });
    }
  }
  return { forYou, onMachine, total: forYou.length + onMachine.length };
}

// --- work items closed with nobody in the loop -------------------------------------

// The queue's own half of the autonomy figure: items that closed inside the window
// having never been parked. `outcomeOf` decides what closed, `isParked` what still
// wants a person — an item CLOSED while parked is one a person had to touch.
export function closedItems(reads, from, to) {
  let completed = 0;
  let unattended = 0;
  for (const read of reads) {
    for (const item of read.items ?? []) {
      if (item.state !== 'closed' || !isQueueItem(item)) continue;
      const day = (item.closed_at ?? '').slice(0, 10);
      if (!day || day < from || day > to) continue;
      const outcome = outcomeOf(item);
      if (outcome !== 'done' && outcome !== 'delivered') continue;
      completed += 1;
      if (!isParked(item)) unattended += 1;
    }
  }
  return { completed, unattended };
}

// --- the block ---------------------------------------------------------------------

// A figure, in the one shape the ledger renders: a value that may be null, the delta
// against the previous window, and whether that delta's own *bad when* rule fired.
//
// `bad` is passed in per figure rather than derived, because it is a JUDGEMENT stated
// in the page's spec — merged down while sessions are flat, stuck items rising — and
// the module that computes a number is not the one that decides it is worrying.
export function figure(value, previous, { unit, sub = null, spark = null, bad = false, gap = null } = {}) {
  return {
    value,
    previous: finite(previous),
    delta: value === null || finite(previous) === null ? null : value - previous,
    unit,
    sub,
    spark,
    bad: Boolean(bad) && value !== null,
    // What to say INSTEAD of the number when there is none. A gap is a sentence, never
    // a dash on its own: *not recorded* is information, an em dash is a puzzle.
    gap: value === null ? (gap ?? 'not recorded') : null,
  };
}

// The 14-day session series, split into the two windows the identity draws in two
// weights, with today marked as its own state: it is not folded yet, and a dashed
// outline says so where a zero would say the repo stopped.
export function pulseOf(rows, w) {
  const today = w.to;
  const days = rows.map((r) => ({
    day: r.day,
    sessions: r.sessions,
    members: r.movedBy,
    series: r.day === today ? 'today' : (r.day >= w.from ? 'current' : 'previous'),
  }));
  const known = days.map((d) => d.sessions).filter((n) => n !== null);
  const peak = known.length ? Math.max(...known) : null;
  const quiet = days.filter((d) => d.sessions === 0).map((d) => d.day);
  return { days, peak, quiet };
}

// --- the sentences a figure carries -------------------------------------------------

export const fmtHours = (h) => {
  if (finite(h) === null) return 'not recorded';
  if (h < 1) return `${Math.round(h * 60)}m`;
  if (h < 48) return `${Math.round(h * 10) / 10}h`;
  return `${Math.round((h / 24) * 10) / 10} d`;
};

// The dollar figure's own assumption, inline where the identity asks for it: whose
// rates, how concentrated the spend is, and how much of it nothing could price.
export function pricingNote(priced) {
  if (!priced.recorded) return 'no fold in the window carries a per-model split';
  if (!priced.ratesSet) return `no ${RATES_KEY} table configured · ${fmtTokens(priced.tokens)} unpriced`;
  const parts = [];
  if (priced.top) parts.push(`${Math.round(priced.top.share * 100)}% ${shortModel(priced.top.model)}`);
  parts.push(priced.unpricedTokens
    ? `${fmtTokens(priced.unpricedTokens)} unpriced (${priced.unpricedModels.map(shortModel).join(', ')})`
    : '0 unpriced');
  return parts.join(' · ');
}

// A model id is a long word in a small step; the family is what a reader compares.
const shortModel = (id) => String(id ?? '').replace(/^claude-/, '').replace(/-\d{8}$/, '');

export function fmtTokens(n) {
  if (finite(n) === null) return 'not recorded';
  if (n >= 1e9) return `${Math.round((n / 1e9) * 10) / 10}B`;
  if (n >= 1e6) return `${Math.round((n / 1e6) * 10) / 10}M`;
  if (n >= 1e3) return `${Math.round((n / 1e3) * 10) / 10}k`;
  return String(n);
}

export function fmtAge(msVal) {
  if (finite(msVal) === null) return 'never';
  if (msVal < 60e3) return '<1m';
  if (msVal < 3600e3) return `${Math.round(msVal / 60e3)}m`;
  if (msVal < 86400e3) return `${Math.floor(msVal / 3600e3)}h ${Math.round((msVal % 3600e3) / 60e3)}m`;
  return `${Math.floor(msVal / 86400e3)}d`;
}
