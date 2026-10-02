import { test } from 'node:test';
import assert from 'node:assert/strict';
import promoteJson from '../tasks/growth-promote/task.json' with { type: 'json' };
import historyJson from '../tasks/pack-version-history/task.json' with { type: 'json' };
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mergePolicy, verdictWithTerms, needsCn } from '../../../tools/test/cn-tasks.mjs';

const [promote, history] = [promoteJson, historyJson];

const PACK_DIR = dirname(dirname(fileURLToPath(import.meta.url)));

// growth-promote's own precondition term reads which members changed their local
// packs. Each verdict composes that term with the engine's built-in ones over a
// fabricated `fleet` signal, so what is asserted is the term's own decision.

// The cadence term reads the task's own run history at a chosen instant: an empty
// history holds, and the signal under test decides.
const AT = '2026-09-05T16:00:00Z';
const NO_RUNS = { runs: { list: [] } };
const promoteVerdict = (signals) => verdictWithTerms(join(PACK_DIR, 'tasks/growth-promote'), promote.preconditions, { ...NO_RUNS, ...signals }, { now: AT });

const member = (over = {}) => ({
  repo: 'acme/app', defaultBranch: 'main',
  activePacks: ['claudinite-growth'], packConfigs: {}, // @real-entity the pack the precondition under test reads membership of
  localPacksChanged: true, stamp: null, schedulesItself: false,
  ...over,
});

// --- growth-promote ----------------------------------------------------------

test('growth-promote: fires on participating members whose local packs changed', needsCn, async () => {
  const v = await promoteVerdict({ fleet: { members: [
    member({ repo: 'acme/a' }),
    member({ repo: 'acme/b', localPacksChanged: false }), // changed nothing → excluded
    member({ repo: 'acme/c' }),
  ] } });
  assert.equal(v.run, true);
  assert.match(v.context.join(' '), /acme\/a/);
  assert.match(v.context.join(' '), /acme\/c/);
  assert.doesNotMatch(v.context.join(' '), /acme\/b/); // the unchanged member isn't a target
});

test('growth-promote: skips a member that opted out of promotion', needsCn, async () => {
  const v = await promoteVerdict({ fleet: { members: [
    member({ repo: 'acme/opt', packConfigs: { 'claudinite-growth': { promote: false } } }), // @real-entity the pack the precondition under test reads membership of
  ] } });
  assert.equal(v.run, false);
});

// Membership is the whole participation test now: every member carries local packs
// (seeded at adoption), so a repo not declaring the growth pack is the only skip.
test('growth-promote: skips a member not declaring the growth pack', needsCn, async () => {
  assert.equal((await promoteVerdict({ fleet: { members: [member({ activePacks: ['acme-pack'] })] } })).run, false);
});

test('growth-promote: an unproven fleet state ERRORS — it never reads as "nothing to promote"', needsCn, async () => {
  // The fail direction: a decline here is permanent,
  // silent staleness — a missing credential and a converged fleet would look
  // identical forever, and nothing in the repo goes red over it. An error parks the
  // item where the re-queue lever retries it.
  assert.match((await promoteVerdict({ fleet: null })).error, /FLEET_GITHUB_TOKEN/);
  assert.match((await promoteVerdict({ fleet: { error: 'wrong token' } })).error, /wrong token/);
  // An enumeration that SUCCEEDED and found nobody is a real answer, so it declines.
  assert.equal((await promoteVerdict({ fleet: { members: [] } })).run, false);
});

// --- pack-version-bump / pack-version-history (the shelf's version numbers) --
// A pull request never bumps a pack; the number is cut on the base branch after the
// merge, and the record of what each number shipped is derived from git.

test('pack-version-history: lands itself under a policy that covers only the version records', needsCn, () => {
  // The policy names the pack's own declared class, and that class covers exactly a
  // shelf pack's provenance/VERSIONS.md — a manifest, a rule or an entry in the same diff parks the run.
  const policy = mergePolicy([{ id: 'claudinite-canon-curation', dir: PACK_DIR }]);
  assert.deepEqual(policy.errors, []);
  const verdict = (files) => policy.verdict(history.automerge, files.map((file) => ({ file, before: 'a\n', after: 'b\n' })));
  assert.equal(verdict(['packs/acme-pack/provenance/VERSIONS.md', 'packs/acme-pack-l/provenance/VERSIONS.md']).mergeable, true);
  assert.equal(verdict(['packs/acme-pack/provenance/VERSIONS.md', 'packs/acme-pack/pack.mjs']).mergeable, false);
  assert.equal(verdict(['.claudinite/local/packs/x/provenance/VERSIONS.md']).mergeable, false);
});
