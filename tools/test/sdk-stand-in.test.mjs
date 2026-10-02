// The worker-test harness every pack's SDK worker test stands on: the stand-in
// resolves `@claudinite/sdk` to the engine's module and answers its calls, and the
// cn-tasks helpers degrade to a skip where no cn is built.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gitIn, installSdk, memberRepo, METHODS, paramsBag } from './sdk-stand-in.mjs';
import { CN, declarationOf, needsCn } from './cn-tasks.mjs';

test('a worker importing @claudinite/sdk reaches the answers installed for it', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'acme-stand-in-'));
  try {
    const repo = memberRepo(dir, { 'a.txt': 'one\n' });
    const sdk = installSdk({
      params: { root: repo.root, automerge: 'nothing' },
      answers: { git: gitIn(repo.root), 'github.openPr': ({ head }) => ({ number: 7, head }) },
    });
    const { git, github, commitMessage, params } = await import('@claudinite/sdk');
    assert.equal(params().root, repo.root);
    assert.equal((await git('rev-parse', 'HEAD')).stdout.trim(), repo.rev('main'));
    assert.equal((await git('cat-file', '-e', 'main:missing')).code !== 0, true, 'a non-zero exit is an answer');
    assert.deepEqual(await github.openPr({ head: 'b' }), { number: 7, head: 'b' });
    await assert.rejects(github.createComment({ body: 'x' }), /not granted/);
    assert.equal(commitMessage('Subject'),
      'Subject\n\nClaudinite-Task: acme-pack/acme-task\nClaudinite-Automerge-Policy: nothing');
    assert.deepEqual(sdk.calls.map((c) => c.method),
      ['git', 'git', 'github.openPr', 'github.createComment']);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('memberRepo lands another writer\'s commits on origin', () => {
  const dir = mkdtempSync(join(tmpdir(), 'acme-stand-in-'));
  try {
    const repo = memberRepo(dir, { 'a.txt': 'one\n' });
    const sha = repo.land({ 'a.txt': 'two\n' }, 'bump');
    assert.equal(repo.rev('main'), sha);
    assert.equal(repo.show('main', 'a.txt'), 'two\n');
    assert.equal(repo.show('main', 'nope'), null);
    assert.equal(repo.message('main').trim(), 'bump');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('the params bag carries every runner field, absent ones null', () => {
  const bag = paramsBag({ root: '/r' });
  for (const key of ['root', 'repo', 'defaultBranch', 'pack', 'task', 'item', 'context', 'target', 'automerge', 'stepSummary', 'secrets']) {
    assert.ok(key in bag, key);
  }
  assert.equal(bag.target.branch, null);
  bag.log('a line');
  assert.deepEqual(bag.lines, ['a line']);
  assert.ok(METHODS.includes('github.dispatchWorkflow'));
});

test('without a cn the decision-core helpers skip rather than guess', { skip: CN ? 'a cn is built here' : false }, () => {
  assert.ok(needsCn.skip);
  assert.throws(() => declarationOf({ id: 'acme-task' }), /CLAUDINITE_CN/);
});
