import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { git, scratch, sourceRepo, runImport, tipOf } from './test-fixture.mjs';

test('two runs from the same source commit give the same tip, holding only packs/', () => {
  const { commits } = sourceRepo();
  const a = runImport([commits.c7, scratch()]);
  const b = runImport([commits.c7, scratch()]);
  assert.equal(a.status, 0, a.stderr);
  assert.equal(b.status, 0, b.stderr);
  assert.ok(tipOf(a.stdout));
  assert.equal(tipOf(a.stdout), tipOf(b.stdout));
});

test('the tip tree is the source packs/ tree and nothing else', () => {
  const { url, commits } = sourceRepo();
  const work = scratch();
  const r = runImport([commits.c7, work]);
  assert.equal(r.status, 0, r.stderr);
  const out = join(work, 'out');
  assert.deepEqual(git(out, 'ls-tree', '--name-only', 'import').split('\n'), ['packs']);
  assert.equal(git(out, 'rev-parse', 'import:packs'), git(url, 'rev-parse', `${commits.c7}:packs`));
});

test('a later source commit extends the earlier import history rather than rewriting it', () => {
  const { commits } = sourceRepo();
  const early = scratch();
  const late = scratch();
  const e = runImport([commits.c5, early]);
  const l = runImport([commits.c7, late]);
  assert.equal(e.status, 0, e.stderr);
  assert.equal(l.status, 0, l.stderr);
  assert.notEqual(tipOf(e.stdout), tipOf(l.stdout));
  const lateOut = join(late, 'out');
  git(lateOut, 'fetch', '-q', join(early, 'out'), 'import:refs/early');
  git(lateOut, 'merge-base', '--is-ancestor', tipOf(e.stdout), tipOf(l.stdout));
});

test('commit messages, authors and dates are carried unchanged, cited hashes included', () => {
  const { url, commits } = sourceRepo();
  const work = scratch();
  const r = runImport([commits.c7, work]);
  assert.equal(r.status, 0, r.stderr);
  const fmt = '--format=%an|%ae|%ad|%cn|%ce|%cd|%B';
  assert.equal(git(join(work, 'out'), 'log', '-1', fmt, 'import'), git(url, 'log', '-1', fmt, commits.c7));
});

test('refuses a source commit not reachable from origin/main', () => {
  const { commits } = sourceRepo();
  const r = runImport([commits.side, scratch()]);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /origin\/main/);
});

function preparedSource() {
  const work = scratch();
  git(work, 'clone', '-q', '--no-local', sourceRepo().url, 'src');
  return work;
}

test('refuses a source working copy with local changes', () => {
  const work = preparedSource();
  writeFileSync(join(work, 'src', 'stray.txt'), 'x\n');
  const r = runImport([sourceRepo().commits.c7, work]);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /fresh clone/);
});

test('refuses a source working copy carrying local commits', () => {
  const work = preparedSource();
  const src = join(work, 'src');
  writeFileSync(join(src, 'packs', 'a', 'x.md'), 'local\n');
  git(src, 'commit', '-qam', 'local');
  const r = runImport([sourceRepo().commits.c7, work]);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /fresh clone/);
});

test('refuses a source cloned from somewhere else', () => {
  const work = preparedSource();
  git(join(work, 'src'), 'remote', 'set-url', 'origin', 'https://acme.example/other.git');
  const r = runImport([sourceRepo().commits.c7, work]);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /fresh clone/);
});

test('refuses a shallow source', () => {
  const work = scratch();
  git(work, 'clone', '-q', '--depth=2', `file://${sourceRepo().url}`, 'src');
  const r = runImport([sourceRepo().commits.c7, work], { IMPORT_SOURCE_URL: `file://${sourceRepo().url}` });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /silently truncates history/);
});

test('--push lands the tip on the target, and a later run updates it there', () => {
  const { commits } = sourceRepo();
  const target = join(scratch(), 'packs.git');
  git(scratch(), 'init', '-q', '--bare', target);
  const e = runImport([commits.c5, scratch(), '--push'], { IMPORT_PUSH_URL: target });
  assert.equal(e.status, 0, e.stderr);
  assert.equal(git(target, 'rev-parse', 'refs/heads/import'), tipOf(e.stdout));
  const l = runImport([commits.c7, scratch(), '--push'], { IMPORT_PUSH_URL: target });
  assert.equal(l.status, 0, l.stderr);
  assert.equal(git(target, 'rev-parse', 'refs/heads/import'), tipOf(l.stdout));
});
