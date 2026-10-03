import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  loadConfig, DEFAULTS, isFleetConfig, ignored, inFleet, resolveRoster, resolveMode, RETIRED_KEYS,
} from '../src/read/config.mjs';
import { isOAuthConfigured } from '../src/read/auth.mjs';

// Absent config is a valid deployment (a member repo, served locally), so every miss
// has to be a default rather than an error — a throw here would be a blank page.
test('a missing or broken config file yields the defaults', async () => {
  globalThis.fetch = async () => ({ ok: false, status: 404, json: async () => ({}) });
  assert.deepEqual(await loadConfig('./nope.json'), DEFAULTS);

  globalThis.fetch = async () => { throw new Error('offline'); };
  assert.deepEqual(await loadConfig('./nope.json'), DEFAULTS);

  globalThis.fetch = async () => ({ ok: true, json: async () => { throw new Error('not json'); } });
  assert.deepEqual(await loadConfig('./bad.json'), DEFAULTS);
});

test('a config file is merged over the defaults', async () => {
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ clientId: 'Iv1.x', defaultRepo: 'o/a' }) });
  const c = await loadConfig();
  assert.equal(c.clientId, 'Iv1.x');
  assert.equal(c.defaultRepo, 'o/a');
  assert.equal(c.exchangeUrl, null, 'unset keys keep their default');
});

// Sign-in needs BOTH halves: a client id with nowhere to exchange the code would
// render a button that always fails.
test('OAuth counts as configured only with both a client id and an exchange url', () => {
  assert.equal(isOAuthConfigured({ clientId: 'a', exchangeUrl: 'https://x' }), true);
  assert.equal(isOAuthConfigured({ clientId: 'a' }), false);
  assert.equal(isOAuthConfigured({ exchangeUrl: 'https://x' }), false);
  assert.equal(isOAuthConfigured(null), false);
});

// --- the roster ------------------------------------------------------------------

// A fleet deployment names an OWNER and the page enumerates as the viewer, so what the
// fleet contains is decided at read time by what this person can see. These are the
// rules that decision follows.

test('the deployment STATES which page it is — the roster source no longer implies it', () => {
  assert.equal(isFleetConfig({ mode: 'fleet', owner: 'missingbulb' }), true);
  assert.equal(isFleetConfig({ mode: 'repo' }), false);
  // The shapes that used to MEAN fleet no longer do on their own. This is the whole
  // point of the key: a fleet deployment whose roster source went missing must not
  // quietly re-read as a repo page, and it cannot, because the mode is not derived
  // from the roster at all.
  assert.equal(isFleetConfig({ owner: 'missingbulb' }), false);
  assert.equal(isFleetConfig({}), false);
  assert.equal(isFleetConfig(null), false);
});

// --- the mode, which has no default ----------------------------------------------

// The build refuses to publish a site whose declaration did not say which dashboard it
// is. Silence used to mean "repo", which is exactly the default the owner ruled out:
// a fleet deployment that lost its roster source published as a one-repo page and
// looked intentional. `resolveMode` is where that judgment lives, so the page and the
// build agree by construction rather than by two matching expressions.

test('a declaration that states no mode is refused, not defaulted', () => {
  assert.throws(() => resolveMode({}), /no default/);
  assert.throws(() => resolveMode({ owner: 'missingbulb' }), /no default/);
  assert.throws(() => resolveMode(null), /no default/);
});

test('a mode outside the vocabulary names the two that exist', () => {
  assert.throws(() => resolveMode({ mode: 'single' }), /"repo".*"fleet"|"fleet".*"repo"/s);
  assert.throws(() => resolveMode({ mode: 'FLEET' }), /single|unknown|not a mode|"repo"/i);
});

test('a stated mode that contradicts the config is refused in BOTH directions', () => {
  // The two halves of the same guard. Either alone leaves a way to publish the wrong
  // page: without the first, `mode: fleet` with no roster silently covers one repo;
  // without the second, `mode: repo` beside an owner silently ignores the owner.
  assert.throws(() => resolveMode({ mode: 'fleet' }), /names no roster source/);
  assert.throws(() => resolveMode({ mode: 'repo', owner: 'missingbulb' }), /roster source/);
});

test('the agreeing shapes pass', () => {
  assert.equal(resolveMode({ mode: 'fleet', owner: 'missingbulb' }), 'fleet');
  assert.equal(resolveMode({ mode: 'repo' }), 'repo');
});

// Keys nothing reads any more fail the build loudly rather than publishing a page that
// quietly ignores them: a fixed member list, a roster artifact, a canon to price
// against. Each is refused whatever the mode, and the sentence names the record.
test('a retired key is refused by name, in either mode, citing row 111', () => {
  const values = { repos: ['o/a', 'o/b'], rosterFile: 'usage-fleet.GENERATED.json', rosterUrl: './r.json', canonRepo: 'o/canon' };
  assert.deepEqual(Object.keys(RETIRED_KEYS).sort(), Object.keys(values).sort());
  for (const [key, value] of Object.entries(values)) {
    for (const base of [{ mode: 'fleet', owner: 'missingbulb' }, { mode: 'repo' }]) {
      assert.throws(() => resolveMode({ ...base, [key]: value }), (e) => e.message.includes(`"${key}"`) && /row 111/.test(e.message), `${key} in ${base.mode}`);
    }
  }
  // A key present but null is the default an older generator wrote, not a choice.
  assert.equal(resolveMode({ mode: 'repo', canonRepo: null }), 'repo');
});

// The roster stopped subtracting anyone, but the predicate stays exported for a
// member's local pack that imports it — answering the same question it always did.
test('inFleet still answers whether the fleet\'s figures would count a repo', () => {
  const repo = (full_name, over = {}) => ({ full_name, archived: false, fork: false, ...over });
  assert.equal(inFleet(repo('o/a')), true);
  assert.equal(inFleet(repo('o/a', { archived: true })), false);
  assert.equal(inFleet(repo('o/a', { fork: true })), false);
  assert.equal(inFleet(repo('o/a'), ['a']), false);
});

test('the exclude list is matched on either spelling of a name', () => {
  assert.equal(ignored('o/a', ['o/a']), true);
  assert.equal(ignored('o/a', ['a']), true);
  assert.equal(ignored('o/a', ['b']), false);
  assert.equal(ignored('o/a'), false);
});

test('resolveRoster enumerates the owner, sorted, and says how far it got', async () => {
    const gh = {
    listOwnerRepos: async () => ({
      repos: [
        { full_name: 'o/zeta', archived: false, fork: false },
        { full_name: 'o/alpha', archived: false, fork: false },
        { full_name: 'o/old', archived: true, fork: false },
        { full_name: 'o/skip', archived: false, fork: false },
      ],
      complete: true,
    }),
  };
  const out = await resolveRoster({ owner: 'o', exclude: ['o/skip'] }, 't', gh);
  // Every repo the viewer can see is on the page — an ignored one and an archived one
  // included, greyed rather than absent (owner, 2026-09-13). Only a fork is left out.
  assert.deepEqual(out.repos, ['o/alpha', 'o/old', 'o/skip', 'o/zeta']);
  assert.deepEqual(out.ignored, ['o/skip']);
  assert.equal(out.source, 'owner');
  assert.equal(out.complete, true);
});

test('a fork is not a member — it is someone else\'s project', async () => {
  const gh = {
    listOwnerRepos: async () => ({
      repos: [{ full_name: 'o/mine', fork: false }, { full_name: 'o/theirs', fork: true }],
      complete: true,
    }),
  };
  assert.deepEqual((await resolveRoster({ owner: 'o' }, 't', gh)).repos, ['o/mine']);
});

test('a failed enumeration is not an empty fleet', async () => {
  const gh = { listOwnerRepos: async () => { throw new Error('403'); } };
  const failed = await resolveRoster({ owner: 'o' }, 't', gh);
  assert.deepEqual(failed.repos, []);
  // `complete: false` plus the error is what makes the page say the list could not be
  // read rather than render a fleet that happens to have nobody in it.
  assert.equal(failed.complete, false);
  assert.ok(failed.error);
});
