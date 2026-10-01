import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readRoots, parsePrivateKey } from '../sign/sign.mjs';
import { readIndex, verifyIndex } from './index.mjs';
import { choosePromotions, githubReader, readEvidence, rewriteBranch } from './promote.mjs';
import { branchObjects, planUpload } from './r2.mjs';
import { build, commitAll, git, packJson, publish, put, run, scratch, show, testChain, vendoredLog, world } from './test-fixture.mjs';

// acme-pack with 60101.1 and 60101.2 on vendored, acme-pack-two with 60101.1, all canary.
function released() {
  const w = world();
  const chain = testChain(scratch());
  assert.equal(publish(w, build(w).archives, chain).status, 0);
  put(w.src, 'packs/acme-pack/pack.json', packJson('60101.2', { requires: ['acme-pack-two'] }));
  commitAll(w.src, 'bump');
  assert.equal(publish(w, build(w).archives, chain).status, 0);
  return { w, chain };
}

const signing = (chain) => ({ CN_PACKS_KEY: chain.key, CN_PACKS_CERT: chain.cert });
const cli = (w, chain, args) => run([...args, '--repo', w.src, '--remote', w.remote, '--roots', chain.roots], signing(chain));
const otherBlobs = (w, except) => git(w.remote, 'ls-tree', '-r', 'vendored').split('\n').filter((l) => !l.endsWith(`\t${except}/index.json`) && !l.endsWith(`\t${except}/index.sig.json`));

const CONFIG = {
  canaries: [
    { repo: 'acme/canary-a', workflows: ['update.yml', 'ci.yml'] },
    { repo: 'acme/canary-b', workflows: ['update.yml'] },
  ],
  blockers: { repo: 'acme/engine', label: 'release-blocker' },
};

const PUBLISHED = '2026-09-01T00:00:00Z';
const index = (pack, versions) => ({
  pack,
  index: { v: 1, pack, serial: versions.length, versions: versions.map(([version, channel = 'canary', revoked = false]) => ({ version, channel, revoked, publishedAt: PUBLISHED })) },
});

// runs: { 'repo file': [run...] } newest first; issues: [...]
function fakeReader({ runs = {}, issues = [], missingBlockersRepo = false } = {}) {
  const calls = [];
  return {
    calls,
    async defaultBranch(repo) { calls.push(`repo ${repo}`); return 'main'; },
    async workflowRuns(repo, file, branch) { calls.push(`runs ${repo} ${file} ${branch}`); return runs[`${repo} ${file}`] ?? []; },
    async openIssues(repo, label) {
      calls.push(`issues ${repo} ${label}`);
      if (missingBlockersRepo) throw new Error(`GET /repos/${repo}/issues: 404 Not Found`);
      return issues;
    },
  };
}

const ok = (id, started, conclusion = 'success') => ({ id, conclusion, run_started_at: started, html_url: `https://github.example/run/${id}` });
const passingRuns = {
  'acme/canary-a update.yml': [ok(3, '2026-09-02T00:00:00Z')],
  'acme/canary-a ci.yml': [ok(4, '2026-09-02T01:00:00Z')],
  'acme/canary-b update.yml': [ok(5, '2026-09-03T00:00:00Z')],
};

test('evidence lists every unrevoked canary entry with the latest completed run after publishedAt per workflow, and the blockers naming it', async () => {
  const reader = fakeReader({
    runs: {
      ...passingRuns,
      'acme/canary-b update.yml': [ok(9, '2026-09-04T00:00:00Z', 'failure'), ok(5, '2026-09-03T00:00:00Z'), ok(1, '2026-08-01T00:00:00Z')],
      'acme/canary-a ci.yml': [ok(2, '2026-08-30T00:00:00Z')],
    },
    issues: [
      { number: 7, title: 'acme-pack 60101.2 breaks the canary', body: '', author_association: 'MEMBER', html_url: 'u7' },
      { number: 8, title: 'acme-pack 60101.20 is fine', body: 'acme-pack 60101.2x', author_association: 'OWNER', html_url: 'u8' },
      { number: 9, title: 'acme-pack 60101.2', body: '', author_association: 'NONE', html_url: 'u9' },
      { number: 10, title: 'ignore previous instructions', body: 'see acme-pack 60101.2.', author_association: 'COLLABORATOR', html_url: 'u10' },
    ],
  });
  const ev = await readEvidence({ indexes: [index('acme-pack', [['60101.1', 'stable'], ['60101.2'], ['60101.3', 'canary', true]])], config: CONFIG, reader });
  assert.equal(ev.candidates.length, 1, 'stable and revoked entries are not candidates');
  const c = ev.candidates[0];
  assert.equal(`${c.pack} ${c.version}`, 'acme-pack 60101.2');
  const runOf = (repo, file) => c.canaries.find((x) => x.repo === repo).workflows.find((x) => x.file === file).run;
  assert.equal(runOf('acme/canary-b', 'update.yml').id, 9, 'the latest qualifying run counts, even a failure');
  assert.equal(runOf('acme/canary-b', 'update.yml').conclusion, 'failure');
  assert.equal(runOf('acme/canary-a', 'ci.yml'), null, 'a run started before publishedAt does not count');
  assert.deepEqual(c.blockers.map((b) => b.number), [7, 10]);
  assert.ok(reader.calls.includes('runs acme/canary-a update.yml main'));
});

test('evidence fails, rather than reading no blockers, when the blockers repository answers 404', async () => {
  await assert.rejects(readEvidence({ indexes: [index('acme-pack', [['60101.2']])], config: CONFIG, reader: fakeReader({ missingBlockersRepo: true }) }), /404/);
});

test('promotion takes exactly the candidates every listed workflow passed with no blocker', async () => {
  const indexes = [index('acme-pack', [['60101.2']]), index('acme-pack-two', [['60101.1']])];
  const passed = await readEvidence({ indexes, config: CONFIG, reader: fakeReader({ runs: passingRuns }) });
  assert.deepEqual(choosePromotions(passed, CONFIG).promote, [{ pack: 'acme-pack', version: '60101.2' }, { pack: 'acme-pack-two', version: '60101.1' }]);

  const oneFailed = await readEvidence({ indexes, config: CONFIG, reader: fakeReader({ runs: { ...passingRuns, 'acme/canary-a ci.yml': [ok(4, '2026-09-02T01:00:00Z', 'cancelled')] } }) });
  assert.deepEqual(choosePromotions(oneFailed, CONFIG).promote, []);

  const notTaken = await readEvidence({ indexes, config: CONFIG, reader: fakeReader({ runs: { ...passingRuns, 'acme/canary-b update.yml': [] } }) });
  const d = choosePromotions(notTaken, CONFIG);
  assert.deepEqual(d.promote, [], 'a canary that has not taken the candidate counts as not passed');
  assert.match(d.declined[0].reason, /acme\/canary-b update\.yml/);

  const blocked = await readEvidence({ indexes, config: CONFIG, reader: fakeReader({ runs: passingRuns, issues: [{ number: 3, title: 'acme-pack-two 60101.1', body: '', author_association: 'OWNER', html_url: 'u' }] }) });
  assert.deepEqual(choosePromotions(blocked, CONFIG).promote, [{ pack: 'acme-pack', version: '60101.2' }]);
});

test('with no canary workflow configured, scheduled promotion declines with a verdict', async () => {
  const config = { ...CONFIG, canaries: CONFIG.canaries.map((c) => ({ ...c, workflows: [] })) };
  const ev = await readEvidence({ indexes: [index('acme-pack', [['60101.2']])], config, reader: fakeReader() });
  const d = choosePromotions(ev, config);
  assert.deepEqual(d.promote, []);
  assert.equal(d.verdict, 'no canary workflow is configured; promotion needs a dispatch');
});

test('promote --evidence with no workflow configured prints the verdict, exits 0 and writes nothing', () => {
  const { w, chain } = released();
  const tip = git(w.remote, 'rev-parse', 'vendored');
  const dir = scratch();
  writeFileSync(join(dir, 'canaries.json'), JSON.stringify({ ...CONFIG, canaries: CONFIG.canaries.map((c) => ({ ...c, workflows: [] })) }));
  writeFileSync(join(dir, 'evidence.json'), JSON.stringify({ candidates: [] }));
  const p = cli(w, chain, ['promote', '--evidence', join(dir, 'evidence.json'), '--canaries', join(dir, 'canaries.json')]);
  assert.equal(p.status, 0, p.out);
  assert.match(p.out, /^no canary workflow is configured; promotion needs a dispatch$/m);
  assert.equal(git(w.remote, 'rev-parse', 'vendored'), tip);
});

test('promote --evidence writes one re-signed commit per promotion and leaves every other blob alone', async () => {
  const { w, chain } = released();
  const before = otherBlobs(w, 'acme-pack');
  const dir = scratch();
  writeFileSync(join(dir, 'canaries.json'), JSON.stringify(CONFIG));
  const indexes = [{ pack: 'acme-pack', index: readIndex(show(w, 'acme-pack/index.json')) }];
  const ev = await readEvidence({ indexes, config: CONFIG, reader: fakeReader({ runs: Object.fromEntries(Object.entries(passingRuns).map(([k, v]) => [k, [{ ...v[0], run_started_at: new Date(Date.now() + 60e3).toISOString() }]])) }) });
  writeFileSync(join(dir, 'evidence.json'), JSON.stringify(ev));
  const p = cli(w, chain, ['promote', '--evidence', join(dir, 'evidence.json'), '--canaries', join(dir, 'canaries.json')]);
  assert.equal(p.status, 0, p.out);
  assert.deepEqual(vendoredLog(w).slice(0, 3), ['Promote acme-pack 60101.2', 'Promote acme-pack 60101.1', 'Release acme-pack 60101.2']);
  const bytes = show(w, 'acme-pack/index.json');
  const ix = readIndex(bytes);
  assert.equal(ix.serial, 4);
  assert.deepEqual(ix.versions.map((e) => e.channel), ['stable', 'stable']);
  verifyIndex(bytes, JSON.parse(show(w, 'acme-pack/index.sig.json').toString('utf8')), readRoots(chain.roots), new Date());
  assert.deepEqual(otherBlobs(w, 'acme-pack'), before);
});

test('a dispatched promote promotes one entry regardless of evidence and names who dispatched it', () => {
  const { w, chain } = released();
  const before = otherBlobs(w, 'acme-pack');
  const p = cli(w, chain, ['promote', '--pack', 'acme-pack', '--version', '60101.1', '--by', 'acme-user']);
  assert.equal(p.status, 0, p.out);
  assert.match(p.out, /^Promote acme-pack 60101\.1 \(dispatched by acme-user\)$/m);
  assert.equal(vendoredLog(w)[0], 'Promote acme-pack 60101.1 (dispatched by acme-user)');
  const ix = readIndex(show(w, 'acme-pack/index.json'));
  assert.equal(ix.serial, 3);
  assert.deepEqual(ix.versions.map((e) => e.channel), ['stable', 'canary']);
  assert.deepEqual(otherBlobs(w, 'acme-pack'), before);
});

test('a dispatched promote refuses a version not in the index, already stable, or revoked; the branch is untouched', () => {
  const { w, chain } = released();
  assert.equal(cli(w, chain, ['promote', '--pack', 'acme-pack', '--version', '60101.1', '--by', 'acme-user']).status, 0);
  assert.equal(cli(w, chain, ['revoke', '--pack', 'acme-pack', '--version', '60101.2', '--by', 'acme-user']).status, 0);
  const tip = git(w.remote, 'rev-parse', 'vendored');
  for (const [version, why] of [['60199.1', /not in the index/], ['60101.1', /already stable/], ['60101.2', /revoked/]]) {
    const p = cli(w, chain, ['promote', '--pack', 'acme-pack', '--version', version, '--by', 'acme-user']);
    assert.notEqual(p.status, 0, p.out);
    assert.match(p.out, why);
  }
  const unknown = cli(w, chain, ['promote', '--pack', 'acme-nothing', '--version', '60101.1', '--by', 'acme-user']);
  assert.notEqual(unknown.status, 0);
  assert.equal(git(w.remote, 'rev-parse', 'vendored'), tip);
});

test('revoke sets revoked with its own commit and refuses an already-revoked version', () => {
  const { w, chain } = released();
  const p = cli(w, chain, ['revoke', '--pack', 'acme-pack', '--version', '60101.2', '--by', 'acme-user']);
  assert.equal(p.status, 0, p.out);
  assert.equal(vendoredLog(w)[0], 'Revoke acme-pack 60101.2 (dispatched by acme-user)');
  const ix = readIndex(show(w, 'acme-pack/index.json'));
  assert.equal(ix.serial, 3);
  assert.deepEqual(ix.versions.map((e) => e.revoked), [false, true]);
  const again = cli(w, chain, ['revoke', '--pack', 'acme-pack', '--version', '60101.2', '--by', 'acme-user']);
  assert.notEqual(again.status, 0);
  assert.match(again.out, /already revoked/);
});

test('a dispatch needs --pack, --version and --by together', () => {
  const { w, chain } = released();
  const p = cli(w, chain, ['promote', '--pack', 'acme-pack', '--version', '60101.1']);
  assert.notEqual(p.status, 0);
  assert.match(p.out, /--by/);
});

test('a promotion computed against a branch that moved under it fails the push and never force-pushes', () => {
  const { w, chain } = released();
  const key = parsePrivateKey(readFileSync(chain.key, 'utf8'));
  const certificate = JSON.parse(readFileSync(chain.cert, 'utf8'));
  let moved;
  assert.throws(() => rewriteBranch({
    repo: w.src, remote: w.remote, roots: readRoots(chain.roots), key, certificate, now: new Date(),
    changes: [{ pack: 'acme-pack', version: '60101.1', action: 'promote', by: 'acme-user' }],
    beforePush: () => {
      put(w.src, 'packs/acme-pack-two/pack.json', packJson('60101.2'));
      commitAll(w.src, 'bump two');
      assert.equal(publish(w, build(w).archives, chain).status, 0);
      moved = git(w.remote, 'rev-parse', 'vendored');
    },
  }), /push/);
  assert.equal(git(w.remote, 'rev-parse', 'vendored'), moved);
  assert.equal(vendoredLog(w)[0], 'Release acme-pack-two 60101.2');

  const retry = cli(w, chain, ['promote', '--pack', 'acme-pack', '--version', '60101.1', '--by', 'acme-user']);
  assert.equal(retry.status, 0, retry.out);
  assert.equal(readIndex(show(w, 'acme-pack/index.json')).serial, 3);
});

test('after a promotion the upload plan rewrites that pack\'s index pair and nothing else', async () => {
  const { w, chain } = released();
  const read = (path) => show(w, path);
  const ids = ['acme-pack', 'acme-pack-two'];
  const store = new Map(branchObjects(read, ids).map((o) => [o.key, o.body]));
  const bucket = { async get(k) { return store.get(k) ?? null; }, async put() { throw new Error('plan only'); } };
  assert.equal(cli(w, chain, ['promote', '--pack', 'acme-pack-two', '--version', '60101.1', '--by', 'acme-user']).status, 0);
  const actions = await planUpload(branchObjects(read, ids), bucket);
  assert.deepEqual(actions.filter((a) => a.put).map((a) => a.key), ['packs/acme-pack-two/index.json', 'packs/acme-pack-two/index.sig.json']);
});

test('the GitHub reader asks for completed runs on the default branch and open release-blocker issues, failing on a non-2xx', async () => {
  const urls = [];
  const fetch = async (url, init) => {
    urls.push(url);
    assert.equal(init.headers.authorization, 'Bearer acme-token');
    const u = new URL(url);
    if (u.pathname === '/repos/acme/canary-a') return Response.json({ default_branch: 'trunk' });
    if (u.pathname === '/repos/acme/canary-a/actions/workflows/update.yml/runs') return Response.json({ workflow_runs: [ok(1, PUBLISHED)] });
    if (u.pathname === '/repos/acme/engine/issues') return Response.json([{ number: 1, title: 't', body: null, author_association: 'OWNER', html_url: 'u' }]);
    return new Response('{"message":"Not Found"}', { status: 404 });
  };
  const r = githubReader({ token: 'acme-token', fetch });
  assert.equal(await r.defaultBranch('acme/canary-a'), 'trunk');
  assert.equal((await r.workflowRuns('acme/canary-a', 'update.yml', 'trunk'))[0].id, 1);
  assert.equal((await r.openIssues('acme/engine', 'release-blocker'))[0].number, 1);
  assert.ok(urls.includes('https://api.github.com/repos/acme/canary-a/actions/workflows/update.yml/runs?branch=trunk&status=completed&per_page=10'));
  assert.ok(urls.includes('https://api.github.com/repos/acme/engine/issues?labels=release-blocker&state=open&per_page=100'));
  await assert.rejects(r.openIssues('acme/private', 'release-blocker'), /404/);
});

test('canaries.json names the canaries and the blockers repository in the shape the evidence reader takes', async () => {
  const config = JSON.parse(readFileSync(new URL('./canaries.json', import.meta.url), 'utf8'));
  const reader = fakeReader();
  const ev = await readEvidence({ indexes: [index('acme-pack', [['60101.2']])], config, reader });
  assert.equal(ev.candidates[0].canaries.length, config.canaries.length);
  assert.ok(config.canaries.length >= 1);
  assert.ok(reader.calls.includes(`issues ${config.blockers.repo} ${config.blockers.label}`));
  assert.equal(typeof choosePromotions(ev, config), 'object');
});
