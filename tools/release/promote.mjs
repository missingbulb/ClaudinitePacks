// Promotion and revocation of published pack versions: the canary evidence read from GitHub, the
// rule that turns it into promotions, and the rewrite of `<id>/index.json` on the `vendored`
// branch, one commit per changed entry, re-signed and self-checked before a push without force.
// A promotion changes only the index, never the vendored set. release.mjs carries the commands;
// docs/release.md describes the evidence rule and the dispatch path.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { BRANCH, openBranch, ReleaseError } from './branch.mjs';
import { assertSerialAdvances, readIndex, serialize, setChannel, setRevoked, signIndex } from './index.mjs';

export const NO_WORKFLOW_VERDICT = 'no canary workflow is configured; promotion needs a dispatch';
const TRUSTED_AUTHORS = new Set(['OWNER', 'MEMBER', 'COLLABORATOR']);
const API = 'https://api.github.com';

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Whether text names `<id> <version>` as a whole token: "acme 1.2" matches "acme 1.2." but not
// "acme 1.20" or "acme 1.2x". The text is matched, never interpreted.
export function namesVersion(text, pack, version) {
  return new RegExp(`(?<![\\w.-])${escape(pack)} ${escape(version)}(?![\\w-]|\\.\\d)`).test(text ?? '');
}

// GitHub's REST API with the job's token; every non-2xx fails, so an unreadable blockers
// repository is an error rather than "no blockers".
export function githubReader({ token, fetch = globalThis.fetch }) {
  const get = async (path) => {
    const res = await fetch(`${API}${path}`, {
      headers: { accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    });
    if (!res.ok) throw new ReleaseError(`GET ${path}: ${res.status} ${res.statusText} ${(await res.text()).slice(0, 500)}`.trim());
    return res.json();
  };
  return {
    async defaultBranch(repo) { return (await get(`/repos/${repo}`)).default_branch; },
    async workflowRuns(repo, file, branch) {
      return (await get(`/repos/${repo}/actions/workflows/${encodeURIComponent(file)}/runs?branch=${encodeURIComponent(branch)}&status=completed&per_page=10`)).workflow_runs;
    },
    async openIssues(repo, label) {
      return (await get(`/repos/${repo}/issues?labels=${encodeURIComponent(label)}&state=open&per_page=100`)).filter((i) => !i.pull_request);
    },
  };
}

// indexes: [{pack, index}]. Per candidate (canary, not revoked): per canary and listed workflow
// the latest completed run on the default branch started after publishedAt, and the open
// blocker issues by a trusted author naming it.
export async function readEvidence({ indexes, config, reader }) {
  const issues = (await reader.openIssues(config.blockers.repo, config.blockers.label)).filter((i) => TRUSTED_AUTHORS.has(i.author_association));
  const runs = new Map();
  for (const c of config.canaries) {
    if (!c.workflows.length) continue;
    const branch = await reader.defaultBranch(c.repo);
    for (const file of c.workflows) runs.set(`${c.repo} ${file}`, await reader.workflowRuns(c.repo, file, branch));
  }
  const candidates = [];
  for (const { pack, index } of indexes) {
    for (const e of index.versions.filter((x) => x.channel === 'canary' && x.revoked === false)) {
      const after = Date.parse(e.publishedAt);
      candidates.push({
        pack,
        version: e.version,
        publishedAt: e.publishedAt,
        canaries: config.canaries.map((c) => ({
          repo: c.repo,
          workflows: c.workflows.map((file) => {
            const run = (runs.get(`${c.repo} ${file}`) ?? []).filter((r) => Date.parse(r.run_started_at) > after)
              .sort((a, b) => Date.parse(b.run_started_at) - Date.parse(a.run_started_at))[0];
            return { file, run: run ? { id: run.id, conclusion: run.conclusion, runStartedAt: run.run_started_at, url: run.html_url } : null };
          }),
        })),
        blockers: issues.filter((i) => namesVersion(i.title, pack, e.version) || namesVersion(i.body, pack, e.version))
          .map((i) => ({ number: i.number, title: i.title, url: i.html_url })),
      });
    }
  }
  return { readAt: new Date().toISOString(), blockersRepo: config.blockers.repo, candidates };
}

// The candidates every listed workflow of every listed canary passed with no blocker; with no
// workflow listed anywhere, none, and a verdict saying so.
export function choosePromotions(evidence, config) {
  if (!config.canaries.some((c) => c.workflows.length)) return { verdict: NO_WORKFLOW_VERDICT, promote: [], declined: [] };
  const promote = [];
  const declined = [];
  for (const cand of evidence.candidates) {
    const reasons = [];
    for (const c of config.canaries) {
      for (const file of c.workflows) {
        const run = cand.canaries.find((x) => x.repo === c.repo)?.workflows.find((x) => x.file === file)?.run;
        if (!run) reasons.push(`${c.repo} ${file}: no completed run since ${cand.publishedAt}`);
        else if (run.conclusion !== 'success') reasons.push(`${c.repo} ${file}: ${run.conclusion}`);
      }
    }
    for (const b of cand.blockers) reasons.push(`blocked by ${config.blockers.repo}#${b.number}`);
    if (reasons.length) declined.push({ pack: cand.pack, version: cand.version, reason: reasons.join('; ') });
    else promote.push({ pack: cand.pack, version: cand.version });
  }
  return { promote, declined };
}

const VERB = { promote: 'Promote', revoke: 'Revoke' };

// Why this change cannot apply to the entry, or null.
function refusal(change, entry) {
  if (!entry) return `${change.pack} ${change.version} is not in the index`;
  if (change.action === 'promote' && entry.revoked) return `${change.pack} ${change.version} is revoked`;
  if (change.action === 'promote' && entry.channel === 'stable') return `${change.pack} ${change.version} is already stable`;
  if (change.action === 'revoke' && entry.revoked) return `${change.pack} ${change.version} is already revoked`;
  return null;
}

// Applies changes [{pack, version, action, by?}] as one commit each and pushes once. A refused
// change fails the run before anything is pushed, unless skipStale, where it is reported and
// skipped (evidence read before the branch moved). beforePush exists for tests.
export function rewriteBranch({ repo, remote, roots, key, certificate, changes, now, skipStale = false, beforePush, log = () => {} }) {
  const branch = openBranch(repo, remote);
  try {
    const written = [];
    for (const change of changes) {
      const file = join(branch.tree, change.pack, 'index.json');
      if (!existsSync(file)) throw new ReleaseError(`${change.pack} is not on ${BRANCH}`);
      const previous = readIndex(readFileSync(file));
      const why = refusal(change, previous.versions.find((e) => e.version === change.version));
      if (why) {
        if (!skipStale) throw new ReleaseError(`refusing to ${change.action}: ${why}`);
        log(`skipped: ${why}`);
        continue;
      }
      const next = change.action === 'promote' ? setChannel(previous, change.version, 'stable') : setRevoked(previous, change.version, true);
      assertSerialAdvances(previous, next);
      const bytes = serialize(next);
      writeFileSync(file, bytes);
      writeFileSync(join(branch.tree, change.pack, 'index.sig.json'), JSON.stringify(signIndex(bytes, key, certificate), null, 2) + '\n');
      const message = `${VERB[change.action]} ${change.pack} ${change.version}${change.by ? ` (dispatched by ${change.by})` : ''}`;
      branch.writeBranchCommit([change.pack], message);
      written.push({ ...change, id: change.pack, serial: next.serial, message });
      log(message);
    }
    if (!written.length) return written;
    const last = new Map(written.map((w) => [w.id, w.serial]));
    branch.selfCheck([...last].map(([id, serial]) => ({ id, serial })), roots, now);
    beforePush?.();
    branch.push();
    log(`pushed ${written.length} commit(s) to ${BRANCH}`);
    return written;
  } finally {
    branch.close();
  }
}
