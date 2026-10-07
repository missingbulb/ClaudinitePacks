import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readRoster, parseRoster, verdictFor, ROSTER_PATH } from '../src/read/roster.mjs';

const TEXT = JSON.stringify({
  version: 1, generated: '2026-10-02T06:00:00Z', owner: 'o',
  members: [
    { repo: 'o/Alpha', defaultBranch: 'main', scope: 'covered', shape: 'cn', covered: true, dormant: false, freshness: { state: 'fresh', detail: '' } },
    { repo: 'o/home', defaultBranch: 'main', scope: 'home', shape: 'cn', covered: true, dormant: false },
    'not a verdict', { repo: 7 },
  ],
}, null, 2);

test('the roster parses to its stamp, its owner and a verdict per repo', () => {
  const r = parseRoster(TEXT);
  assert.equal(r.generated, '2026-10-02T06:00:00Z');
  assert.equal(r.owner, 'o');
  assert.equal(r.byRepo.size, 2, 'a row with no repo name is not a verdict');
  assert.equal(verdictFor(r, 'O/ALPHA').freshness.state, 'fresh');
  assert.equal(verdictFor(r, 'o/missing'), null);
  assert.equal(verdictFor(null, 'o/alpha'), null);
});

const gh = (text, { fail = false } = {}) => {
  const asked = [];
  return {
    asked,
    getRepo: async (repo) => { if (fail) throw new Error('403'); asked.push(`repo ${repo}`); return { default_branch: 'trunk' }; },
    getHeadSha: async (repo, branch) => { asked.push(`head ${repo}@${branch}`); return 'sha1'; },
    getTextAtSha: async (repo, sha, path) => { asked.push(`text ${repo}@${sha}:${path}`); return text; },
  };
};

// Read like every content read: at the deployment's head sha, so a warm load costs
// nothing on it.
test('the roster is read from the deployment repo at its head sha', async () => {
  const g = gh(TEXT);
  const r = await readRoster({ repo: 'o/manager', token: 't', gh: g });
  assert.equal(r.owner, 'o');
  assert.deepEqual(g.asked, ['repo o/manager', 'head o/manager@trunk', `text o/manager@sha1:${ROSTER_PATH}`]);
});

// Every absence is "this deployment runs no fleet-roster", never a broken page.
test('no deployment repo, no file, an unreadable repo or a broken file all read as no roster', async () => {
  assert.equal(await readRoster({ repo: null, token: 't', gh: gh(TEXT) }), null);
  assert.equal(await readRoster({ repo: 'o/m', token: 't', gh: gh(null) }), null);
  assert.equal(await readRoster({ repo: 'o/m', token: 't', gh: gh(TEXT, { fail: true }) }), null);
  assert.equal(await readRoster({ repo: 'o/m', token: 't', gh: gh('{"members":"x"}') }), null);
});
