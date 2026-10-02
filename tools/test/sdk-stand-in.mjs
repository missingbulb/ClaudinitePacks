// The engine end of @claudinite/sdk, for a pack's worker test. A worker imports
// `@claudinite/sdk`, which only cn's task runner resolves; `installSdk` registers the
// same resolution for this process and puts a pipe on the global the SDK reads, so the
// worker runs against the SDK's real code with only the engine's answers faked.
//
// `claudinite-sdk.mjs` beside this file is the engine's SDK module, copied verbatim from
// ClaudiniteEngine 35db690 (tasks/runner/js/sdk/index.mjs) — refresh it with the engine;
// CLAUDINITE_SDK names another copy to test against instead (an engine checkout's
// tasks/runner/js/sdk/index.mjs).
//
//   const sdk = installSdk({ params: { root, defaultBranch: 'main', target: { branch } },
//     answers: { git: gitIn(root), 'github.openPr': () => ({ number: 7 }) } });
//   const { worker } = await import('../tasks/acme-task/worker.mjs');
//   await worker(sdk.params);
//   sdk.calls  // [{ method, args }], in order
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { register } from 'node:module';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

const PIPE = Symbol.for('claudinite.sdk.pipe');
const SDK_URL = process.env.CLAUDINITE_SDK
  ? pathToFileURL(process.env.CLAUDINITE_SDK).href
  : new URL('./claudinite-sdk.mjs', import.meta.url).href;

const HOOK = `export async function resolve(specifier, context, next) {
  if (specifier === '@claudinite/sdk') return { url: ${JSON.stringify(SDK_URL)}, shortCircuit: true, format: 'module' };
  return next(specifier, context);
}`;

let registered = false;

// Every call the engine answers, as cn's executor announces them.
export const METHODS = Object.freeze(['git', 'config', 'packs',
  ...['openPr', 'createComment', 'readFile', 'listIssues', 'dispatchWorkflow', 'findOrCreateTracker', 'writeTracker']
    .map((a) => `github.${a}`)]);

// The bag the runner builds from the executor's environment, absent values null.
export function paramsBag(over = {}) {
  const lines = [];
  return {
    root: null, repo: 'acme/member', defaultBranch: 'main', pack: 'acme-pack', task: 'acme-task',
    item: { number: null }, context: [], target: { mode: null, branch: null, pr: null },
    automerge: null, stepSummary: null, secrets: {},
    lines,
    log: (s) => { lines.push(s); },
    ...over,
  };
}

// Install the pipe. `answers` maps a method to a function of its arguments; a call
// with no answer fails the way the engine refuses an ungranted action.
export function installSdk({ params = {}, answers = {}, methods = METHODS } = {}) {
  if (!registered) {
    register(`data:text/javascript,${encodeURIComponent(HOOK)}`);
    registered = true;
  }
  const calls = [];
  const bag = paramsBag(params);
  globalThis[PIPE] = Object.freeze({
    engine: 'stand-in',
    methods: [...methods],
    params: bag,
    call: async (method, args) => {
      calls.push({ method, args });
      if (!methods.includes(method)) throw new Error(`the engine does not answer ${method}`);
      const answer = answers[method];
      if (!answer) throw new Error(`github.${method.replace(/^github\./, '')} is not granted to the pack ${bag.pack}`);
      return answer(args);
    },
  });
  return { calls, params: bag };
}

// The `git` answer cn gives: the command in `root`, a non-zero exit an answer rather
// than a throw.
export const gitIn = (root) => ({ args }) => {
  try {
    const stdout = execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { code: 0, stdout, stderr: '' };
  } catch (e) {
    if (typeof e.status !== 'number') throw e;
    return { code: e.status, stdout: String(e.stdout ?? ''), stderr: String(e.stderr ?? '') };
  }
};

const quiet = { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] };
const IDENTITY = ['-c', 'user.name=acme', '-c', 'user.email=acme@example.com', '-c', 'commit.gpgsign=false'];

// A member checkout `root` cloned from a bare `origin`, its main holding `files`
// ({ path: content }). `land(files, message)` commits onto origin's main from a
// second clone, as another writer would; `show(ref, path)` reads origin.
export function memberRepo(dir, files) {
  const origin = `${dir}/origin.git`;
  const root = `${dir}/member`;
  const other = `${dir}/other`;
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', origin], quiet);
  execFileSync('git', ['clone', '-q', origin, other], quiet);
  let first = true;
  const land = (changes, message) => {
    if (!first) execFileSync('git', ['-C', other, 'pull', '-q', '--ff-only', 'origin', 'main'], quiet);
    first = false;
    for (const [path, content] of Object.entries(changes)) {
      mkdirSync(dirname(`${other}/${path}`), { recursive: true });
      writeFileSync(`${other}/${path}`, content);
    }
    execFileSync('git', ['-C', other, 'add', '-A'], quiet);
    execFileSync('git', ['-C', other, ...IDENTITY, 'commit', '-q', '-m', message], quiet);
    execFileSync('git', ['-C', other, 'push', '-q', 'origin', 'HEAD:main'], quiet);
    return execFileSync('git', ['-C', other, 'rev-parse', 'HEAD'], quiet).trim();
  };
  execFileSync('git', ['-C', other, 'checkout', '-q', '-b', 'main'], quiet);
  land(files, 'adopt');
  execFileSync('git', ['clone', '-q', origin, root], quiet);
  const show = (ref, path) => {
    try { return execFileSync('git', ['--git-dir', origin, 'show', `${ref}:${path}`], quiet); } catch { return null; }
  };
  const rev = (ref) => execFileSync('git', ['--git-dir', origin, 'rev-parse', ref], quiet).trim();
  const message = (ref) => execFileSync('git', ['--git-dir', origin, 'log', '-1', '--format=%B', ref], quiet);
  return { origin, root, land, show, rev, message };
}
