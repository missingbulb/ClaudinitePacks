// A tiny synthetic stand-in for the Claudinite repository, shaped like the real one where the
// import cares: packs under packs/, a pack-content ancestor (skills/) renamed into packs/, an
// engine-side ancestor (engine/) renamed into packs/, commits touching no kept path, a commit
// message citing another commit's hash, and a branch never merged into main.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, renameSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';

export const IMPORT_SH = new URL('./import.sh', import.meta.url).pathname;
export const VERIFY_MJS = new URL('./verify.mjs', import.meta.url).pathname;

let clock = 1780000000;
function env() {
  clock += 3600;
  const when = `${clock} +0000`;
  return {
    ...process.env,
    GIT_AUTHOR_NAME: 'Acme Author', GIT_AUTHOR_EMAIL: 'author@acme.example', GIT_AUTHOR_DATE: when,
    GIT_COMMITTER_NAME: 'Acme Committer', GIT_COMMITTER_EMAIL: 'committer@acme.example', GIT_COMMITTER_DATE: when,
  };
}

export function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, env: env(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

const body = (name) => Array.from({ length: 12 }, (_, i) => `${name} line ${i} with enough text to rename-detect`).join('\n') + '\n';

function put(dir, path, content) {
  mkdirSync(dirname(join(dir, path)), { recursive: true });
  writeFileSync(join(dir, path), content);
}

function commit(dir, message) {
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', message);
  return git(dir, 'rev-parse', 'HEAD');
}

export function scratch(prefix = 'acme-import-') {
  return mkdtempSync(join(tmpdir(), prefix));
}

let cached;
// Built once per process; callers clone it and never write to it.
export function sourceRepo() {
  if (cached) return cached;
  const root = scratch('acme-source-');
  const work = join(root, 'work');
  mkdirSync(work);
  git(work, 'init', '-q', '-b', 'main');
  const c = {};
  put(work, 'packs/a/pack.json', '{ "id": "a", "version": "1.0.0" }\n');
  put(work, 'packs/a/x.md', body('x'));
  put(work, 'engine/z.mjs', body('z'));
  c.c1 = commit(work, 'Add pack a and the engine');
  put(work, 'skills/b/y.md', body('y'));
  c.c2 = commit(work, 'Add skill y');
  put(work, 'engine/w.mjs', body('w'));
  put(work, 'README.md', 'root readme\n');
  c.c3 = commit(work, 'Add engine w');
  mkdirSync(join(work, 'packs/b'), { recursive: true });
  renameSync(join(work, 'skills/b/y.md'), join(work, 'packs/b/y.md'));
  renameSync(join(work, 'engine/w.mjs'), join(work, 'packs/b/w.mjs'));
  put(work, 'packs/b/pack.json', '{ "id": "b", "version": "2.0.0" }\n');
  c.c4 = commit(work, 'Move y and w into pack b (#4)');
  put(work, 'packs/a/x.md', body('x') + 'one more line\n');
  c.c5 = commit(work, 'Extend x');
  put(work, 'engine/z.mjs', body('z') + 'engine only\n');
  c.c6 = commit(work, 'Engine-only change');
  put(work, 'packs/b/y.md', body('y') + 'follow-up\n');
  c.c7 = commit(work, `Follow up on ${c.c5.slice(0, 10)} in y`);
  git(work, 'checkout', '-q', '-b', 'side');
  put(work, 'packs/a/x.md', 'side change\n');
  c.side = commit(work, 'Never merged');
  git(work, 'checkout', '-q', 'main');
  const url = join(root, 'source.git');
  git(root, 'clone', '-q', '--bare', work, url);
  rmSync(work, { recursive: true, force: true });
  cached = { url, commits: c };
  return cached;
}

export function runImport(args, extraEnv = {}) {
  try {
    const stdout = execFileSync('bash', [IMPORT_SH, ...args], {
      env: { ...process.env, IMPORT_SOURCE_URL: sourceRepo().url, ...extraEnv },
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { status: 0, stdout, stderr: '' };
  } catch (e) {
    return { status: e.status ?? 1, stdout: e.stdout ?? '', stderr: e.stderr ?? String(e) };
  }
}

export function tipOf(stdout) {
  const m = stdout.match(/^import tip: ([0-9a-f]{40})$/m);
  return m && m[1];
}

export function runVerify(args) {
  try {
    const stdout = execFileSync(process.execPath, [VERIFY_MJS, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { status: 0, stdout };
  } catch (e) {
    return { status: e.status ?? 1, stdout: (e.stdout ?? '') + (e.stderr ?? '') };
  }
}
