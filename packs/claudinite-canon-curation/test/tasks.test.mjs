import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { installSdk, gitIn, memberRepo } from '../../../tools/test/sdk-stand-in.mjs';
import { needsCn } from '../../../tools/test/cn-tasks.mjs';

installSdk({ params: { pack: 'claudinite-canon-curation', task: 'pack-version-history' } }); // @real-entity the pack under test
const { planHistory, worker: historyWorker } = await import('../tasks/pack-version-history/worker.mjs');

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
