// The publish-pages work step - the module the runner calls `worker` on
// (cwd = this task dir, bounded by code_work_timeout).
//
// Four steps, each of which has to succeed before the next is worth starting:
//
//   1. BUILD. `build-site.mjs` assembles the site into a scratch directory. A
//      declaration the build refuses (no `mode`, a contradicting roster) fails here,
//      in the executor's log. A mount that does not yet carry the page is the build's
//      own "nothing to publish", and the run ends there as an empty outcome.
//   2. PUSH. The built tree becomes one root commit force-pushed to `gh-pages`, which
//      is how it reaches the deploy's runner: the workflow checks that branch out and
//      uploads it as the Pages artifact. No history — the branch holds the last build
//      and nothing else. The commit is written into the checkout's object store and
//      pushed through the engine's `git`, which carries the job's credential.
//   3. DISPATCH the seeded workflow on the default branch, through the engine's
//      `dispatchWorkflow` action, which this pack is granted.
//   4. FOLLOW the run to a terminal state. A dispatch answers 204 whether or not the
//      deploy will work, and a Pages deploy fails for exactly one non-code reason —
//      Pages not enabled with source "GitHub Actions", a repository setting no Action
//      can flip. That failure parks as an action for a person; any other parks as a
//      failure with the run's URL, where the trace is.
//
// Reading the run and the Pages setting has no engine action, so those two reads go
// through the job's own token (`github-api.mjs`).

import { execFileSync, spawn } from 'node:child_process';
import { rmSync } from 'node:fs';
import { access, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { git as engineGit, github } from '@claudinite/sdk';
import { makeGh } from './github-api.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

// The site assembler, in the pack above this task, and the workflow adoption seeded.
// One canonical spelling of each; nothing else here names them.
export const BUILD_SCRIPT = resolve(HERE, '../../tooling/build-site.mjs');
export const WORKFLOW_FILE = 'claudinite-dashboard-pages.yml';

// The branch that carries the built tree to the deploy's runner — the one the seeded
// workflow checks out, so not configurable: a member that changed it here would move
// the build out from under the workflow it cannot converge.
export const PAGES_BRANCH = 'gh-pages';

// A record of what the branch holds, at the site root beside `.nojekyll`.
export const STAMP_FILE = 'deployed.json';

// A park the operator can act on, in the executor's own vocabulary: the last marker
// printed decides the lane. `action` means something outside the code must change
// before this can run; `decision` means the run stopped and the next step is a choice.
export class NeedsHuman extends Error {
  // `triage` is the name the runner's entry point reads to route the park; `kind` is
  // kept because the tests and the callers here already ask for it by that name.
  constructor(kind, message) { super(message); this.kind = kind; this.triage = kind; }
}

// The run's own logger, under the task's name and its item. Module-level because the
// helpers below log too; `worker` takes the one the runner built.
let defaultLog = console.log;

const exists = async (p) => { try { await access(p); return true; } catch { return false; } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- 1. build --------------------------------------------------------------------

// Run the assembler exactly as an operator would, into `out`. Resolves `{ built,
// output }`: `built` false is the script's own clean "no dashboard in the mount"
// exit, not a failure.
export async function buildInto(out, { repoRoot, log = defaultLog, run = spawnBuild }) {
  const { code, output } = await run([BUILD_SCRIPT, '--root', repoRoot, '--out', out]);
  for (const line of output.trim().split('\n').filter(Boolean)) log(`build: ${line}`);
  if (code !== 0) throw new Error(`build-site.mjs exited ${code}`);
  return { built: await exists(join(out, 'index.html')), output };
}

function spawnBuild(args) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(process.execPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', (d) => { output += d; });
    child.stderr.on('data', (d) => { output += d; });
    child.on('error', reject);
    child.on('close', (code) => resolveRun({ code, output }));
  });
}

// --- 2. push ---------------------------------------------------------------------

const git = (cwd, args, opts = {}) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts });

const AUTHOR = {
  GIT_AUTHOR_NAME: 'claudinite[bot]', GIT_AUTHOR_EMAIL: 'claudinite@users.noreply.github.com',
  GIT_COMMITTER_NAME: 'claudinite[bot]', GIT_COMMITTER_EMAIL: 'claudinite@users.noreply.github.com',
};

// The built tree `out` as one parentless commit in the checkout's object store, through
// a scratch index so the checkout's own index and work tree are untouched.
export function commitTree(root, out, message) {
  const gitDir = git(root, ['rev-parse', '--absolute-git-dir']).trim();
  const index = `${out}.index`;
  const env = { ...process.env, ...AUTHOR, GIT_DIR: gitDir, GIT_INDEX_FILE: index, GIT_WORK_TREE: out };
  const inOut = (args) => execFileSync('git', args, { cwd: out, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    inOut(['add', '--all', '--force', '.']);
    const tree = inOut(['write-tree']).trim();
    return inOut(['commit-tree', tree, '-m', message]).trim();
  } finally {
    rmSync(index, { force: true });
  }
}

// The built tree as one root commit on the Pages branch. Force, always: the branch
// holds the last build and nothing else, so there is no history to keep and no
// reconcile to do — and a re-run of the same sources is a re-push, not a conflict.
export async function pushSite(root, out, { branch = PAGES_BRANCH, message }) {
  const sha = commitTree(root, out, message);
  const pushed = await engineGit('push', '--quiet', '--force', 'origin', `${sha}:refs/heads/${branch}`);
  if (pushed.code !== 0) throw new Error(`push to ${branch} failed: ${pushed.stderr.trim()}`);
  return sha;
}

// Fire the seeded workflow. A workflow GitHub does not know answers 404, which is the
// seed never having landed rather than a fault in the run.
export async function dispatch(ref) {
  try {
    await github.dispatchWorkflow({ workflow: WORKFLOW_FILE, ref });
  } catch (e) {
    if (/\b404\b/.test(String(e.message))) {
      throw new NeedsHuman('action', `${WORKFLOW_FILE} is not on ${ref} — the pack's seeded workflow never landed in .github/workflows/, or was removed`);
    }
    throw new Error(`dispatching ${WORKFLOW_FILE} on ${ref} failed: ${e.message}`);
  }
}

// --- 3 + 4. dispatch and follow ----------------------------------------------------

// The run this dispatch created: the newest `workflow_dispatch` run of the file
// created at or after `since`. The dispatch endpoint returns no run id, so the run
// is found by its event and its time, and a queued runner can delay its appearance
// by a few seconds — hence the retries.
export async function findRun(gh, repo, since, { attempts = 12, wait = 5000 } = {}) {
  const created = encodeURIComponent(`>=${since.toISOString()}`);
  for (let i = 0; i < attempts; i += 1) {
    const { status, json } = await gh(`/repos/${repo}/actions/workflows/${WORKFLOW_FILE}/runs?event=workflow_dispatch&created=${created}&per_page=5`);
    if (status !== 200) throw new Error(`listing runs of ${WORKFLOW_FILE} answered ${status}`);
    const run = (json?.workflow_runs ?? [])[0];
    if (run) return run;
    await sleep(wait);
  }
  return null;
}

export async function followRun(gh, repo, runId, { deadline, wait = 10000 } = {}) {
  for (;;) {
    const { status, json } = await gh(`/repos/${repo}/actions/runs/${runId}`);
    if (status !== 200) throw new Error(`reading run ${runId} answered ${status}`);
    if (json.status === 'completed') return json;
    if (Date.now() >= deadline) return json;
    await sleep(wait);
  }
}

// Whether Pages is enabled on the repo. `null` when this token cannot tell — the
// executor's token holds no `pages` permission, and an unreadable setting must not be
// reported as a disabled one.
export async function pagesEnabled(gh, repo) {
  const { status } = await gh(`/repos/${repo}/pages`);
  if (status === 200) return true;
  if (status === 404) return false;
  return null;
}

// The publish itself, every edge injectable: `worker` below is the bag's thin end of
// it, and a test drives this one with a fake remote and a fake `gh`.
export async function publish({
  repoRoot,
  repo,
  ref = 'main',
  gh = makeGh(),
  build = buildInto,
  log = defaultLog,
  // The work item this publish belongs to, named in the commit so the pages branch
  // says which run built it. Absent for a hand-run, which is why it is not required.
  item = null,
  // Well inside `code_work_timeout`, so a run still going when this gives up is
  // reported rather than killed mid-sentence.
  followMs = 8 * 60 * 1000,
} = {}) {
  if (!repoRoot || !repo) throw new Error('the repository root and the repository are both required');

  const out = await mkdtemp(join(tmpdir(), 'claudinite-dashboard-'));
  try {
    const { built } = await build(out, { repoRoot, log });
    if (!built) {
      log('nothing to publish — the mount does not yet carry the dashboard, so nothing was pushed');
      return { published: false, reason: 'no-site' };
    }

    const source = git(repoRoot, ['rev-parse', 'HEAD']).trim();
    await writeFile(join(out, STAMP_FILE), `${JSON.stringify({ source, builtAt: new Date().toISOString() }, null, 2)}\n`);
    const sha = await pushSite(repoRoot, out, {
      message: `Claudinite dashboard built from ${source.slice(0, 12)}${item ? ` (#${item})` : ''}\n\nClaudinite-Task: claudinite-dashboard/publish-pages`,
    });
    log(`pushed ${sha.slice(0, 12)} to ${PAGES_BRANCH}`);
  } finally {
    await rm(out, { recursive: true, force: true });
  }

  const since = new Date(Date.now() - 1000);
  await dispatch(ref);
  log(`dispatched ${WORKFLOW_FILE} on ${ref}`);

  const run = await findRun(gh, repo, since);
  if (!run) throw new Error(`dispatched ${WORKFLOW_FILE} but no run of it appeared within a minute`);
  log(`following run ${run.id} — ${run.html_url}`);

  const done = await followRun(gh, repo, run.id, { deadline: Date.now() + followMs });
  if (done.status !== 'completed') {
    throw new NeedsHuman('decision', `run ${done.html_url} was still ${done.status} after ${Math.round(followMs / 60000)} minutes — check it, then re-queue or abandon`);
  }
  if (done.conclusion === 'success') {
    log(`published — ${done.html_url}`);
    return { published: true, run: done.html_url };
  }
  if (done.conclusion === 'cancelled') {
    // The workflow cancels a superseded deploy itself; the newer run is the one to read.
    throw new NeedsHuman('decision', `run ${done.html_url} was cancelled — a newer deploy superseded it, or someone stopped it; re-queue to republish`);
  }
  if (await pagesEnabled(gh, repo) === false) {
    throw new NeedsHuman('action', `run ${done.html_url} failed and GitHub Pages is not enabled on ${repo} — enable it with source "GitHub Actions" under /settings/pages, then re-queue`);
  }
  throw new Error(`run ${done.html_url} concluded ${done.conclusion}`);
}

export async function worker({ root, repo, defaultBranch, item, log: runLog }) {
  defaultLog = runLog;
  await publish({ repoRoot: root, repo, ref: defaultBranch ?? 'main', item: item?.number ?? null });
}
