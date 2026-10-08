import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { installSdk, gitIn, memberRepo } from '../../../tools/test/sdk-stand-in.mjs';

installSdk({ params: { pack: 'claudinite-canon-curation', task: 'pack-version-history' } }); // @real-entity the pack under test
const { planHistory, worker: historyWorker } = await import('../tasks/pack-version-history/worker.mjs');
const { readHistory, isShipping } = await import('../tasks/pack-version-history/history.mjs');

// --- pack-version-history ---------------------------------------------------
// The record of what each version shipped is derived from git by the task's own walk.

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

test('pack-version-history: a shipping path is what the vendored set carries', () => {
  for (const [p, want] of Object.entries({
    'packs/acme/RULES.md': true, 'packs/acme/skills/a/SKILL.md': true, 'packs/acme/checks/acme.go': true,
    'packs/acme/checks/acme_test.go': false, 'packs/acme/checks/sub/acme_test.go': true,
    'packs/acme/test/x.mjs': false, 'packs/acme/docs/why.md': false, 'packs/acme/provenance/VERSIONS.md': false,
    'packs/acme/skills/a/test/fixture.txt': true, 'packs/directory.GENERATED.md': false,
    '.claudinite/local/packs/acme/RULES.md': false,
  })) assert.equal(isShipping(p), want, p);
});

test('pack-version-history: the walk drops what the vendored set drops, and a bump-only commit ships nothing', () => {
  const root = shelf([
    ['born (#1)', { 'packs/acme-pack/pack.json': '{"version": "1.2.3"}', 'packs/acme-pack/RULES.md': '# a\n' }],
    ['tests and docs (#2)', { 'packs/acme-pack/test/x.mjs': 't\n', 'packs/acme-pack/docs/d.md': 'd\n', 'packs/acme-pack/checks/a_test.go': 'package a\n' }],
    ['a rule (#3)', { 'packs/acme-pack/RULES.md': '# b\n' }],
    ['bump\n\nClaudinite-Task: claudinite-canon-curation/pack-version-bump', { 'packs/acme-pack/pack.json': '{"version": "1.2.4"}' }],
    ['docs again (#5)', { 'packs/acme-pack/docs/d.md': 'd2\n' }],
  ]);
  try {
    let [p] = readHistory(root, 'HEAD');
    assert.equal(p.version, '1.2.4');
    assert.equal(p.lastBump.version, '1.2.4');
    assert.deepEqual(p.shippingSince, []);
    assert.deepEqual(p.versions.map((v) => [v.version, v.commits.map((c) => [c.subject, c.pr])]),
      [['1.2.3', [['born (#1)', 1]]], ['1.2.4', [['a rule (#3)', 3]]]]);
    assert.deepEqual(p.missing, ['1.2.3', '1.2.4']);
    assert.equal(p.record, 'packs/acme-pack/provenance/VERSIONS.md');
    writeFileSync(join(root, 'packs/acme-pack/RULES.md'), '# c\n');
    execFileSync('git', ['-C', root, '-c', 'user.name=a', '-c', 'user.email=a@example.com', 'commit', '-qam', 'another rule']);
    [p] = readHistory(root, 'HEAD', ['acme-pack']);
    assert.deepEqual(p.shippingSince, ['packs/acme-pack/RULES.md']);
    assert.throws(() => readHistory(root, 'HEAD', ['nope']), /no manifest for pack "nope"/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('pack-version-history: the walk refuses a shallow clone', () => {
  const root = shelf([
    ['born', { 'packs/acme-pack/pack.json': '{"version": "61001.1"}' }],
    ['next', { 'packs/acme-pack/pack.json': '{"version": "61001.2"}' }],
  ]);
  const clone = mkdtempSync(join(tmpdir(), 'acme-history-clone-'));
  try {
    execFileSync('git', ['clone', '-q', '--depth=1', `file://${root}`, join(clone, 'c')]);
    assert.throws(() => readHistory(join(clone, 'c'), 'HEAD'), /shallow/);
  } finally { rmSync(root, { recursive: true, force: true }); rmSync(clone, { recursive: true, force: true }); }
});

test('pack-version-history: writes the missing rows newest first and leaves a standing row and header alone', () => {
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

test('pack-version-history: a <major>.<day>.<n> row sorts above every two-part row', () => {
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

test('pack-version-history: a pack with no record gains one under the default header, and a complete one changes nothing', () => {
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

test('pack-version-history: the worker delivers the regenerated records on its branch and opens the pull request', async () => {
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
