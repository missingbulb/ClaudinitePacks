import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { git, scratch, sourceRepo, runImport, runVerify } from './test-fixture.mjs';

let built;
// One real import of the synthetic source, shared read-only; each mutation works on a clone.
function imported() {
  if (built) return built;
  const work = scratch();
  const r = runImport([sourceRepo().commits.c7, work]);
  assert.equal(r.status, 0, r.stderr);
  built = { src: join(work, 'src'), out: join(work, 'out') };
  return built;
}

function mutant() {
  const dir = join(scratch(), 'mutant');
  git(scratch(), 'clone', '-q', '--no-local', imported().out, dir);
  return dir;
}

function verify(importRepo, ...extra) {
  return runVerify(['--source', imported().src, '--commit', sourceRepo().commits.c7, '--import', importRepo, ...extra]);
}

test('a complete import passes and names the file whose engine-side ancestor was dropped', () => {
  const r = verify(imported().out);
  assert.equal(r.status, 0, r.stdout);
  assert.match(r.stdout, /packs\/b\/w\.mjs.*engine\//);
  assert.doesNotMatch(r.stdout, /packs\/b\/y\.md.*not carried/);
});

test('a dropped pack directory fails', () => {
  const dir = mutant();
  git(dir, 'rm', '-rq', 'packs/a');
  git(dir, 'commit', '-qm', 'drop a');
  const r = verify(dir);
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stdout, /missing pack: a\b/);
});

test('an extra pack directory fails', () => {
  const dir = mutant();
  mkdirSync(join(dir, 'packs', 'acme-pack'));
  writeFileSync(join(dir, 'packs', 'acme-pack', 'pack.json'), '{}\n');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-qm', 'extra');
  const r = verify(dir);
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stdout, /extra pack: acme-pack/);
});

test('a dropped file fails, naming it', () => {
  const dir = mutant();
  git(dir, 'rm', '-q', 'packs/b/y.md');
  git(dir, 'commit', '-qm', 'drop y');
  const r = verify(dir);
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stdout, /missing file: packs\/b\/y\.md/);
});

test('a changed byte fails, naming the file', () => {
  const dir = mutant();
  writeFileSync(join(dir, 'packs', 'a', 'x.md'), readFileSync(join(dir, 'packs', 'a', 'x.md'), 'utf8') + ' ');
  git(dir, 'commit', '-qam', 'touch x');
  const r = verify(dir);
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stdout, /content differs: packs\/a\/x\.md/);
});

test('a dropped commit fails even when the tip tree is unchanged', () => {
  const dir = mutant();
  // Re-chain the history over the same trees, leaving out "Extend x".
  const shas = git(dir, 'rev-list', '--reverse', 'import').split('\n');
  let parent = null;
  for (const sha of shas) {
    if (git(dir, 'log', '-1', '--format=%s', sha) === 'Extend x') continue;
    const info = git(dir, 'log', '-1', '--format=%an%n%ae%n%ad%n%cn%n%ce%n%cd', '--date=raw', sha).split('\n');
    const msg = git(dir, 'log', '-1', '--format=%B', sha);
    const args = ['commit-tree', `${sha}^{tree}`, '-m', msg, ...(parent ? ['-p', parent] : [])];
    parent = execFileSync('git', args, {
      cwd: dir, encoding: 'utf8',
      env: { ...process.env, GIT_AUTHOR_NAME: info[0], GIT_AUTHOR_EMAIL: info[1], GIT_AUTHOR_DATE: info[2],
        GIT_COMMITTER_NAME: info[3], GIT_COMMITTER_EMAIL: info[4], GIT_COMMITTER_DATE: info[5] },
    }).trim();
  }
  git(dir, 'reset', '-q', '--hard', parent);
  const r = verify(dir);
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stdout, /missing commit: .*Extend x/);
});

test('a merge commit Claudinite never had fails', () => {
  const dir = mutant();
  const merge = git(dir, 'commit-tree', 'HEAD^{tree}', '-p', 'HEAD', '-p', 'HEAD~2', '-m', 'Invented merge');
  git(dir, 'reset', '-q', '--hard', merge);
  const r = verify(dir);
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stdout, /merge not in source: .*Invented merge/);
});

test('a dropped kept-ancestor rename fails, naming the file that lost history', () => {
  const dir = mutant();
  writeFileSync(join(dir, '..', 'only-packs.txt'), 'packs/\n');
  git(dir, 'remote', 'remove', 'origin');
  execFileSync('git', ['filter-repo', '--force', '--quiet', '--preserve-commit-hashes', '--paths-from-file', join(dir, '..', 'only-packs.txt')], { cwd: dir, stdio: 'ignore' });
  const r = verify(dir);
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stdout, /history lost: packs\/b\/y\.md/);
});

function landed(withImport) {
  const dir = join(scratch(), 'main');
  git(scratch(), 'init', '-q', '-b', 'main', dir);
  mkdirSync(join(dir, 'tools'));
  writeFileSync(join(dir, 'tools', 'acme.mjs'), 'export {};\n');
  writeFileSync(join(dir, 'README.md'), 'acme\n');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-qm', 'tooling');
  if (withImport) {
    git(dir, 'fetch', '-q', imported().out, 'import:import');
    git(dir, 'merge', '-q', '--allow-unrelated-histories', '--no-ff', '-m', 'Merge import', 'import');
  }
  return dir;
}

test('a branch that merged the import beside its own tooling passes with --landed, and only with it', () => {
  const dir = landed(true);
  const ok = verify(dir, '--ref', 'main', '--landed');
  assert.equal(ok.status, 0, ok.stdout);
  const strict = verify(dir, '--ref', 'main');
  assert.equal(strict.status, 1, strict.stdout);
  assert.match(strict.stdout, /outside packs\/: README\.md/);
});

// Why verify-import.yml no longer runs --landed on the branch: after the freeze any edit to a
// pack file is a byte difference from the recorded commit, so the first porting PR would go red.
test('--landed fails a branch that merged the import and then edited one pack file', () => {
  const dir = landed(true);
  writeFileSync(join(dir, 'packs', 'a', 'x.md'), readFileSync(join(dir, 'packs', 'a', 'x.md'), 'utf8') + 'ported\n');
  git(dir, 'commit', '-qam', 'port x');
  const r = verify(dir, '--ref', 'main', '--landed');
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stdout, /content differs: packs\/a\/x\.md/);
});

test('--landed still fails a branch whose packs/ did not come from the import history', () => {
  const dir = landed(false);
  execFileSync('git', ['--work-tree', dir, 'checkout', `${sourceRepo().commits.c7}`, '--', 'packs'], { cwd: imported().src });
  git(dir, 'add', '-A');
  git(dir, 'commit', '-qm', 'copy packs by hand');
  const r = verify(dir, '--ref', 'main', '--landed');
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stdout, /missing commit/);
});

test('--write-doc records the verified commit and the not-carried list, idempotently', () => {
  const doc = join(scratch(), 'import.md');
  writeFileSync(doc, '# Import\n\nhand-written intro\n\n<!-- BEGIN GENERATED: verify -->\nold\n<!-- END GENERATED: verify -->\n\nhand-written outro\n');
  const first = verify(imported().out, '--write-doc', doc);
  assert.equal(first.status, 0, first.stdout);
  const text = readFileSync(doc, 'utf8');
  assert.match(text, new RegExp(`Source commit: \`${sourceRepo().commits.c7}\``));
  assert.match(text, /packs\/b\/w\.mjs/);
  assert.match(text, /hand-written intro[\s\S]*hand-written outro/);
  assert.doesNotMatch(text, /\nold\n/);
  verify(imported().out, '--write-doc', doc);
  assert.equal(readFileSync(doc, 'utf8'), text);
});

test('--write-doc leaves the doc alone when verification fails', () => {
  const dir = mutant();
  git(dir, 'rm', '-q', 'packs/b/y.md');
  git(dir, 'commit', '-qm', 'drop y');
  const doc = join(scratch(), 'import.md');
  const before = '<!-- BEGIN GENERATED: verify -->\nold\n<!-- END GENERATED: verify -->\n';
  writeFileSync(doc, before);
  assert.equal(verify(dir, '--write-doc', doc).status, 1);
  assert.equal(readFileSync(doc, 'utf8'), before);
});

test('--landed fails a branch holding a file under a kept ancestor path', () => {
  const dir = landed(true);
  mkdirSync(join(dir, 'skills'));
  writeFileSync(join(dir, 'skills', 'acme.md'), 'stray\n');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-qm', 'stray skill');
  const r = verify(dir, '--ref', 'main', '--landed');
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stdout, /kept ancestor path present at the tip: skills\/acme\.md/);
});
