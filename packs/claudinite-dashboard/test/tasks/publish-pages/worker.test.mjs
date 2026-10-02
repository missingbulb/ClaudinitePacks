import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { installSdk, gitIn, memberRepo } from '../../../../../tools/test/sdk-stand-in.mjs';
import { cnTasks, contractOf, needsCn } from '../../../../../tools/test/cn-tasks.mjs';
import declarationJson from '../../../tasks/publish-pages/task.json' with { type: 'json' };
import updateJson from '../../../../claudinite-lifecycle/tasks/update/task.json' with { type: 'json' };
import {
  WORK_PREFIX, STATUS_READY, STATUS_RUNNING_EXECUTOR,
} from '../../../src/read/queue-vocabulary.mjs';

// The worker's engine half answered for real where it can be: `git` runs in the
// member checkout, and the dispatch is scripted per test.
let dispatchAnswer = () => ({ ok: true });
let answerGit = null;
const sdk = installSdk({ answers: {
  git: (args) => answerGit(args),
  'github.dispatchWorkflow': (args) => dispatchAnswer(args),
} });
const { publish, pushSite, NeedsHuman, WORKFLOW_FILE, PAGES_BRANCH, STAMP_FILE } = await import('../../../tasks/publish-pages/worker.mjs');

const REPO = 'o/r';

test('publish-pages yields to the update it publishes', needsCn, () => {
  const decl = contractOf(declarationJson).normalized;
  // Driven through the engine's real pick order: while the update's standing item
  // is live this cycle, the Pages item is not picked; the moment it is gone, it is.
  const update = contractOf(updateJson).normalized;
  const byId = { 'claudinite-dashboard/publish-pages': decl, 'claudinite-lifecycle/update': update }; // @real-entity the update task whose real declaration this yields to
  const taskAfter = Object.fromEntries(Object.entries(byId).map(([id, d]) => [id, d.schedule_after ?? []]));
  const scheduled = Object.fromEntries(Object.entries(byId).map(([id, d]) => [id, d.trigger === 'schedule']));
  const item = (number, key, status) => ({
    number, title: `${WORK_PREFIX} ${key}`, body: `packs/${key.replace('/', '/tasks/')}/task.md\n`,
    state: 'open', labels: [status], created_at: '2026-08-14T01:00:00Z', updated_at: '2026-08-14T01:00:00Z',
  });
  const pages = item(1, 'claudinite-dashboard/publish-pages', STATUS_READY);
  const converging = item(2, 'claudinite-lifecycle/update', STATUS_RUNNING_EXECUTOR); // @real-entity the update task whose real declaration this yields to
  const { picks } = cnTasks('queue', { picks: [
    { open: [pages, converging], draws: [], taskAfter, scheduled },
    { open: [pages], draws: [], taskAfter, scheduled },
  ] });
  assert.deepEqual(picks[0], [], 'the Pages item waits for the update');
  assert.deepEqual(picks[1], [1], 'and is picked once it has gone');
});

// A member checkout cloned from a bare origin standing in for GitHub: what the worker
// pushes is read back from the origin.
async function member(t) {
  const dir = await mkdtemp(join(tmpdir(), 'cd-pages-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const repo = memberRepo(dir, { a: 'a' });
  sdk.params.root = repo.root;
  return repo;
}
const git = (dir, args) => execFileSync('git', ['--git-dir', dir, ...args], { encoding: 'utf8' }).trim();
const gitAnswer = (root) => { answerGit = gitIn(root); };
const siteBuild = async (out) => {
  await writeFile(join(out, 'index.html'), '<!doctype html>');
  await writeFile(join(out, '.nojekyll'), '');
  return { built: true, output: '' };
};
const noSiteBuild = async () => ({ built: false, output: 'No dashboard in the mount' });

// The reads GitHub answers without an engine action: the run the dispatch created, and
// the Pages setting.
function fakeGh({ conclusion = 'success', pages = 403 } = {}) {
  const calls = [];
  const gh = async (path, opts = {}) => {
    calls.push(`${opts.method ?? 'GET'} ${path.replace(/\?.*/, '')}`);
    if (path.includes('/runs?')) return { status: 200, json: { workflow_runs: [{ id: 7, html_url: 'https://x/runs/7' }] } };
    if (path.endsWith('/runs/7')) return { status: 200, json: { id: 7, html_url: 'https://x/runs/7', status: 'completed', conclusion } };
    if (path.endsWith('/pages')) return { status: pages, json: null };
    throw new Error(`unexpected ${path}`);
  };
  gh.calls = calls;
  return gh;
}

const dispatches = () => sdk.calls.filter((c) => c.method === 'github.dispatchWorkflow').map((c) => c.args);

const run = async (t, { gh, build = siteBuild }) => {
  const { origin, root } = await member(t);
  gitAnswer(root);
  sdk.calls.length = 0;
  const result = await publish({ repoRoot: root, repo: REPO, ref: 'main', gh, build, followMs: 500, log: () => {} });
  return { result, bare: origin, root };
};

test('a build is pushed as one commit, the workflow dispatched, and its run followed to success', async (t) => {
  const gh = fakeGh();
  const { result, bare, root } = await run(t, { gh });
  assert.deepEqual(result, { published: true, run: 'https://x/runs/7' });
  assert.equal(git(bare, ['rev-list', '--count', PAGES_BRANCH]), '1', 'no history — the branch is the last build');
  assert.deepEqual(git(bare, ['ls-tree', '--name-only', PAGES_BRANCH]).split('\n').sort(), ['.nojekyll', STAMP_FILE, 'index.html']);
  const stamp = JSON.parse(git(bare, ['show', `${PAGES_BRANCH}:${STAMP_FILE}`]));
  assert.equal(stamp.source, execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), 'the stamp names the sources it was built from');
  assert.deepEqual(dispatches(), [{ workflow: WORKFLOW_FILE, ref: 'main' }]);
  assert.deepEqual(gh.calls, [
    `GET /repos/${REPO}/actions/workflows/${WORKFLOW_FILE}/runs`,
    `GET /repos/${REPO}/actions/runs/7`,
  ]);
});

test('a re-run is a re-push, never a conflict', async (t) => {
  const { origin: bare, root } = await member(t);
  gitAnswer(root);
  for (const n of [1, 2]) {
    const out = await mkdtemp(join(tmpdir(), 'cd-pages-build-'));
    t.after(() => rm(out, { recursive: true, force: true }));
    await writeFile(join(out, 'index.html'), `build ${n}`);
    await pushSite(root, out, { message: `build ${n}` });
  }
  assert.equal(execFileSync('git', ['-C', root, 'status', '--porcelain'], { encoding: 'utf8' }), '', 'the checkout is untouched');
  assert.equal(git(bare, ['rev-list', '--count', PAGES_BRANCH]), '1');
  assert.equal(git(bare, ['show', `${PAGES_BRANCH}:index.html`]), 'build 2');
});

test('a mount without the page publishes nothing and starts no run', async (t) => {
  const gh = fakeGh();
  const { result, bare } = await run(t, { gh, build: noSiteBuild });
  assert.deepEqual(result, { published: false, reason: 'no-site' });
  assert.deepEqual(gh.calls, []);
  assert.deepEqual(dispatches(), []);
  assert.throws(() => git(bare, ['rev-parse', PAGES_BRANCH]), 'nothing was pushed');
});

// The one non-code failure a Pages deploy has, routed to the person who can fix it.
test('a failed deploy with Pages disabled parks as an action naming the setting', async (t) => {
  await assert.rejects(run(t, { gh: fakeGh({ conclusion: 'failure', pages: 404 }) }),
    (e) => e instanceof NeedsHuman && e.kind === 'action' && /GitHub Actions/.test(e.message) && /settings\/pages/.test(e.message));
});

// An unreadable setting is not a disabled one: the executor's token cannot read Pages.
test('a failed deploy with the setting unreadable is a failure, with the run to read', async (t) => {
  await assert.rejects(run(t, { gh: fakeGh({ conclusion: 'failure', pages: 403 }) }),
    (e) => !(e instanceof NeedsHuman) && /https:\/\/x\/runs\/7/.test(e.message));
});

test('a workflow that never landed parks as an action, after the push', async (t) => {
  const gh = fakeGh();
  dispatchAnswer = () => { throw new Error('404: Not Found'); };
  t.after(() => { dispatchAnswer = () => ({ ok: true }); });
  const { origin, root } = await member(t);
  gitAnswer(root);
  await assert.rejects(publish({ repoRoot: root, repo: REPO, ref: 'main', gh, build: siteBuild, log: () => {} }),
    (e) => e instanceof NeedsHuman && e.kind === 'action' && e.message.includes(WORKFLOW_FILE));
  assert.equal(git(origin, ['rev-list', '--count', PAGES_BRANCH]), '1', 'the build was pushed first');
  assert.deepEqual(gh.calls, []);
});
