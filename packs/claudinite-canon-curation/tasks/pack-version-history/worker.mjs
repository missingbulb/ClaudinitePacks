// The pack-version-history entry point: regenerate every pack's `VERSIONS.md` from
// the base branch's history — which pull requests landed between one version and the
// next — and deliver the records that changed on a pull request that lands itself.
//
// The rows are `../../pack-versions.mjs`'s to derive; this file is the I/O shell:
// fetch the base tip with its history, plan, and commit the changed files on the
// executor's target branch, opening the task's pull request there unless the executor
// named one to amend; the executor lands it under the task's automerge policy. A
// recompute that changes no record opens nothing.

import { git as engineGit } from '@claudinite/sdk';
import { planHistory } from '../../pack-versions.mjs';
import { fetchBase, makeGit } from '../pack-version-bump/worker.mjs';
import { deliver } from './deliver.mjs';

export const TASK_ID = 'claudinite-canon-curation/pack-version-history';

// The run's own logger, under the task's name and its item. Module-level because the
// helpers below log too; `worker` takes the one the runner built.
let log = console.log;

export async function worker({ root, defaultBranch, target, log: runLog }) {
  log = runLog;
  const base = defaultBranch ?? 'main';

  const git = makeGit(root);
  const tip = await fetchBase(git, engineGit, base);
  const files = planHistory(git, tip);
  const changed = Object.keys(files);
  if (!changed.length) {
    log(`${base} at ${tip.slice(0, 10)}: every record already carries a row per version — nothing to deliver`);
    return;
  }
  for (const path of changed) log(`${path}: regenerated`);

  const pr = await deliver({
    root, base, target,
    files,
    subject: 'Claudinite: pack version history',
    title: 'Claudinite: pack version history',
    body: [
      'Regenerated each pack\'s `VERSIONS.md` from the base branch\'s history: a row per version',
      'naming the pull requests that landed between the previous version and it. Rows already',
      'present stand as written; only the versions with no row gain one.',
      '',
      `Records touched: ${changed.map((p) => `\`${p}\``).join(', ')}.`,
    ].join('\n'),
  });
  log(`${changed.length} record(s) — ${pr.reused ? 'updated' : 'opened'} PR ${pr.number !== null ? `#${pr.number}` : `on ${pr.branch}`}`);
}
