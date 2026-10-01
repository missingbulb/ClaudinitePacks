// The `vendored` branch as the release programs read and write it: fetched into a private ref,
// checked out into a scratch tree with its own index, written one commit at a time by the Actions
// bot, self-checked and pushed without force, so a branch that moved under a run rejects the push
// and the next run re-derives. Used by publish, upload, promote and revoke.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { IndexError, readIndex, verifyIndex } from './index.mjs';

export const BRANCH = 'vendored';
const FETCHED = 'refs/release/vendored';
const BOT = { name: 'github-actions[bot]', email: '41898282+github-actions[bot]@users.noreply.github.com' };

export class ReleaseError extends Error {}

export function git(cwd, args, env = {}) {
  try {
    return execFileSync('git', args, { cwd, env: { ...process.env, ...env }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1 << 28 });
  } catch (e) {
    throw new ReleaseError(`git ${args.join(' ')} failed: ${(e.stderr || e.message).trim()}`);
  }
}

// Fetches the remote's vendored branch into FETCHED; returns its commit, or null when absent.
export function fetchVendored(repo, remote) {
  const listed = git(repo, ['ls-remote', '--heads', remote, `refs/heads/${BRANCH}`]).trim();
  if (!listed) {
    try { git(repo, ['update-ref', '-d', FETCHED]); } catch { /* nothing fetched before */ }
    return null;
  }
  git(repo, ['fetch', '-q', '--no-tags', remote, `+refs/heads/${BRANCH}:${FETCHED}`]);
  return git(repo, ['rev-parse', FETCHED]).trim();
}

const gitDirOf = (repo) => git(repo, ['rev-parse', '--absolute-git-dir']).trim();

export function showFile(repo, commit, path) {
  try {
    return execFileSync('git', [`--git-dir=${gitDirOf(repo)}`, 'show', `${commit}:${path}`], { maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    throw new ReleaseError(`${path} is not on ${BRANCH} at ${commit.slice(0, 12)}: ${String(e.stderr || e.message).trim()}`);
  }
}

// The packs on the branch: every top-level directory holding an index.json.
export function packIds(repo, commit) {
  if (!commit) return [];
  return git(repo, ['ls-tree', '-r', '--name-only', commit]).split('\n').filter((p) => /^[^/]+\/index\.json$/.test(p))
    .map((p) => p.split('/')[0]).sort();
}

// The fetched branch checked out into a scratch tree. writeBranchCommit stages paths (relative to
// the tree) and commits them on top of the last commit; push sends the result without force.
export function openBranch(repo, remote) {
  const gitDir = gitDirOf(repo);
  const scratch = mkdtempSync(join(tmpdir(), 'release-packs-'));
  const tree = join(scratch, 'tree');
  mkdirSync(tree);
  const indexEnv = { GIT_INDEX_FILE: join(scratch, 'index') };
  const g = (args, env = {}) => git(tree, [`--git-dir=${gitDir}`, '--work-tree=.', ...args], { ...indexEnv, ...env });
  const base = fetchVendored(repo, remote);
  let tip = base;
  if (base) {
    g(['read-tree', base]);
    g(['checkout-index', '-a']);
  }
  return {
    tree,
    scratch,
    base,
    get tip() { return tip; },
    writeBranchCommit(paths, message) {
      g(['add', '-f', '-A', '--', ...paths]);
      const treeId = g(['write-tree']).trim();
      const identity = { GIT_AUTHOR_NAME: BOT.name, GIT_AUTHOR_EMAIL: BOT.email, GIT_COMMITTER_NAME: BOT.name, GIT_COMMITTER_EMAIL: BOT.email };
      tip = g(['commit-tree', treeId, ...(tip ? ['-p', tip] : []), '-m', message], identity).trim();
      return tip;
    },
    show(path) { return showFile(repo, tip, path); },
    // Verifies each pack's index at the tip against roots and its expected serial; throws before
    // anything is pushed.
    selfCheck(expected, roots, now) {
      for (const { id, serial } of expected) {
        try {
          const bytes = Buffer.from(this.show(`${id}/index.json`));
          verifyIndex(bytes, JSON.parse(this.show(`${id}/index.sig.json`).toString('utf8')), roots, now);
          if (readIndex(bytes).serial !== serial) throw new IndexError(`serial is not ${serial}`);
        } catch (e) {
          throw new ReleaseError(`self-check failed for ${id}/index.json: ${e.message}; refusing to push`);
        }
      }
    },
    push() {
      git(repo, ['push', '-q', remote, `${tip}:refs/heads/${BRANCH}`]);
      git(repo, ['update-ref', FETCHED, tip]);
    },
    close() { rmSync(scratch, { recursive: true, force: true }); },
  };
}
