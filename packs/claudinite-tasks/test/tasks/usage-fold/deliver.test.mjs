import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { installSdk, gitIn, memberRepo } from '../../../../../tools/test/sdk-stand-in.mjs';

// The fold's delivery against a real member checkout and a bare origin: the engine's
// `git` answered in the checkout, its `openPr` recorded.
let answerGit = null;
const sdk = installSdk({
  params: { pack: 'claudinite-tasks', task: 'usage-fold', automerge: 'anything' }, // @real-entity the trailers name this task
  answers: { git: (args) => answerGit(args), 'github.openPr': (args) => ({ number: 41, headRef: args.head }) },
});
const { deliver, readRollingAt, baseTip } = await import('../../../tasks/usage-fold/deliver.mjs');

function member(t, files) {
  const dir = mkdtempSync(join(tmpdir(), 'acme-fold-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const repo = memberRepo(dir, files);
  answerGit = gitIn(repo.root);
  sdk.calls.length = 0;
  return repo;
}

test('the folded files land on the target branch, on top of the remote base, and a pull request opens', async (t) => {
  const repo = member(t, { 'README.md': 'hi\n' });
  const tip = repo.land({ 'x.txt': 'landed after the clone\n' }, 'another writer');
  const out = await deliver({
    root: repo.root, base: 'main', target: { branch: 'claudinite/usage-fold', pr: null },
    files: { '.claudinite/usage/a.json': '{"a":1}\n' }, subject: 'Claudinite: fold usage', title: 'Claudinite: usage fold', body: 'b',
  });
  assert.deepEqual(out, { branch: 'claudinite/usage-fold', number: 41, reused: false });
  assert.equal(repo.rev('claudinite/usage-fold~1'), tip, 'built on the remote tip, not the stale checkout');
  assert.equal(String(repo.show('claudinite/usage-fold', '.claudinite/usage/a.json')), '{"a":1}\n');
  assert.match(repo.message('claudinite/usage-fold'), /Claudinite-Task: claudinite-tasks\/usage-fold\nClaudinite-Automerge-Policy: anything/); // @real-entity the trailers name this task
  assert.deepEqual(sdk.calls.filter((c) => c.method === 'github.openPr').map((c) => c.args),
    [{ title: 'Claudinite: usage fold', body: 'b', head: 'claudinite/usage-fold', base: 'main' }]);
});

test('an executor-named pull request is amended, and nothing new opens', async (t) => {
  const repo = member(t, { 'README.md': 'hi\n' });
  const out = await deliver({
    root: repo.root, base: 'main', target: { branch: 'b', pr: 9 },
    files: { 'a.json': '1\n' }, subject: 's', title: 't', body: 'b',
  });
  assert.deepEqual(out, { branch: 'b', number: 9, reused: true });
  assert.equal(sdk.calls.filter((c) => c.method === 'github.openPr').length, 0);
});

test('a rolling file moves with its bytes intact before the fold writes on top of it', async (t) => {
  const repo = member(t, { 'old/u.json': 'history\n' });
  const base = await baseTip(repo.root, 'main');
  const rolling = readRollingAt(repo.root, base, 'new/u.json', 'old/u.json');
  assert.deepEqual(rolling, { text: 'history\n', moves: { 'old/u.json': 'new/u.json' } });
  await deliver({
    root: repo.root, base: 'main', target: { branch: 'b', pr: null },
    files: { 'new/u.json': 'history\nmore\n' }, moves: rolling.moves, subject: 's', title: 't', body: 'b',
  });
  assert.equal(String(repo.show('b~1', 'new/u.json')), 'history\n', 'the move commit carries the old bytes unchanged');
  assert.equal(repo.show('b~1', 'old/u.json'), null);
  assert.equal(String(repo.show('b', 'new/u.json')), 'history\nmore\n');
});

test('no target branch is refused before anything is written', async (t) => {
  const repo = member(t, { 'README.md': 'hi\n' });
  await assert.rejects(deliver({ root: repo.root, base: 'main', target: { branch: null }, files: {}, subject: 's' }), /no branch to deliver on/);
  assert.equal(sdk.calls.length, 0);
});
