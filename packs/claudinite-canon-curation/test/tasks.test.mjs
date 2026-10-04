import { test } from 'node:test';
import assert from 'node:assert/strict';
import promoteJson from '../tasks/growth-promote/task.json' with { type: 'json' };
import historyJson from '../tasks/pack-version-history/task.json' with { type: 'json' };
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { installSdk, gitIn, memberRepo } from '../../../tools/test/sdk-stand-in.mjs';
import { mergePolicy, verdictWithTerms, needsCn } from '../../../tools/test/cn-tasks.mjs';

const [promote, history] = [promoteJson, historyJson];

installSdk({ params: { pack: 'claudinite-canon-curation', task: 'pack-version-history' } }); // @real-entity the pack under test
const { planHistory, worker: historyWorker } = await import('../tasks/pack-version-history/worker.mjs');

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

// --- pack-version-history ---------------------------------------------------
// The record of what each version shipped is derived from git by cn.

// A shelf with one pack whose history is `commits`, each [subject, { path: content }].
function shelf(commits) {
  const root = mkdtempSync(join(tmpdir(), 'acme-history-'));
  const git = (...args) => execFileSync('git', ['-C', root, ...args], {
    encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_DATE: '2026-07-01T12:00:00Z', GIT_COMMITTER_DATE: '2026-07-01T12:00:00Z' },
  });
  git('init', '-q', '-b', 'main');
  git('config', 'user.name', 'acme'); git('config', 'user.email', 'acme@example.com');
  for (const [subject, files] of commits) {
    for (const [path, content] of Object.entries(files)) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), content);
    }
    git('add', '-A'); git('commit', '-q', '-m', subject);
  }
  return root;
}

test('pack-version-history: writes the missing rows newest first and leaves a standing row and header alone', needsCn, () => {
  const record = 'packs/acme-pack/provenance/VERSIONS.md';
  const root = shelf([
    ['acme-pack: born (#1)', { 'packs/acme-pack/pack.json': '{ "version": "61001.1" }\n', 'packs/acme-pack/RULES.md': 'a\n' }],
    ['acme-pack: a rule (#2)', { 'packs/acme-pack/pack.json': '{ "version": "61001.2" }\n', 'packs/acme-pack/RULES.md': 'b\n' }],
    ['acme-pack: written by hand', { [record]: '# Ours\n\n| Version | Date | What changed |\n|---|---|---|\n| 61001.1 | 2026-07-01 | by hand |\n' }],
    ['acme-pack: another (#3)', { 'packs/acme-pack/pack.json': '{ "version": "61001.10" }\n', 'packs/acme-pack/RULES.md': 'c\n' }],
  ]);
  try {
    const files = planHistory(root, 'HEAD');
    assert.deepEqual(Object.keys(files), [record]);
    assert.equal(files[record], [
      '# Ours', '', '| Version | Date | What changed |', '|---|---|---|',
      '| 61001.10 | 2026-07-01 | acme-pack: another (#3) |',
      '| 61001.2 | 2026-07-01 | acme-pack: a rule (#2) |',
      '| 61001.1 | 2026-07-01 | by hand |', '',
    ].join('\n'));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('pack-version-history: a <major>.<day>.<n> row sorts above every two-part row', needsCn, () => {
  const record = 'packs/acme-pack/provenance/VERSIONS.md';
  const root = shelf([
    ['acme-pack: born (#1)', { 'packs/acme-pack/pack.json': '{ "version": "61002.3" }\n', 'packs/acme-pack/RULES.md': 'a\n' }],
    ['acme-pack: the new form (#2)', { 'packs/acme-pack/pack.json': '{ "version": "1.61004.1" }\n', 'packs/acme-pack/RULES.md': 'b\n' }],
    ['acme-pack: another (#3)', { 'packs/acme-pack/pack.json': '{ "version": "1.61004.2" }\n', 'packs/acme-pack/RULES.md': 'c\n' }],
  ]);
  try {
    const rows = planHistory(root, 'HEAD')[record].split('\n').filter((l) => /^\| \d/.test(l)).map((l) => l.split(' | ')[0].slice(2));
    assert.deepEqual(rows, ['1.61004.2', '1.61004.1', '61002.3']);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('pack-version-history: a pack with no record gains one under the default header, and a complete one changes nothing', needsCn, () => {
  const root = shelf([['acme-pack: born (#1)', { 'packs/acme-pack/pack.json': '{ "version": "61001.1" }\n' }]]);
  try {
    const files = planHistory(root, 'HEAD');
    const text = files['packs/acme-pack/provenance/VERSIONS.md'];
    assert.match(text, /^# Version history\n/);
    assert.match(text, /\n\| 61001\.1 \| 2026-07-01 \| acme-pack: born \(#1\) \|\n$/);
    mkdirSync(join(root, 'packs/acme-pack/provenance'));
    writeFileSync(join(root, 'packs/acme-pack/provenance/VERSIONS.md'), text);
    execFileSync('git', ['-C', root, 'add', '-A']);
    execFileSync('git', ['-C', root, '-c', 'user.name=a', '-c', 'user.email=a@example.com', 'commit', '-q', '-m', 'record']);
    assert.deepEqual(planHistory(root, 'HEAD'), {});
  } finally { rmSync(root, { recursive: true, force: true }); }
});

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

test('pack-version-history: the worker delivers the regenerated records on its branch and opens the pull request', needsCn, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'acme-history-worker-'));
  try {
    const repo = memberRepo(dir, { 'packs/acme-pack/pack.json': '{ "version": "61001.1" }\n' });
    repo.land({ 'packs/acme-pack/pack.json': '{ "version": "61001.2" }\n', 'packs/acme-pack/RULES.md': 'b\n' }, 'acme-pack: a rule (#2)');
    const sdk = installSdk({
      params: { root: repo.root, pack: 'claudinite-canon-curation', task: 'pack-version-history', target: { branch: 'claudinite/history' } }, // @real-entity the pack under test
      answers: { git: gitIn(repo.root), 'github.openPr': () => ({ number: 7 }) },
    });
    await historyWorker(sdk.params);
    const text = repo.show('claudinite/history', 'packs/acme-pack/provenance/VERSIONS.md');
    assert.match(text, /\n\| 61001\.2 \| \d{4}-\d{2}-\d{2} \| acme-pack: a rule \(#2\) \|\n\| 61001\.1 \| /);
    assert.deepEqual(sdk.calls.filter((c) => c.method === 'github.openPr').map((c) => c.args.head), ['claudinite/history']);
    assert.match(sdk.params.lines.at(-1), /1 record\(s\) - opened PR #7/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
