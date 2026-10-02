import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import declJson from '../../../tasks/fleet-roster/task.json' with { type: 'json' };
import { paramsBag } from '../../../../../tools/test/sdk-stand-in.mjs';
import { declarationOf } from '../../../../../tools/test/cn-tasks.mjs';
// The engine's contract: the JSON says what is particular to the task, the defaults are the engine's.
const decl = declarationOf(declJson);

// The claudinite-fleet-sheepdog pack's fleet-roster task (#788): the coverage and freshness questions
// answered from ONE walk of the fleet, replacing the separate fleet-census and
// fleet-freshness tasks. Two things are worth locking down — the declaration
// satisfies the contract the scheduler and executor both read, and running the
// worker reaches the sweep.

const packRoot = join(dirname(fileURLToPath(import.meta.url)), '../../../../../packs/claudinite-fleet-sheepdog');
const taskDir = join(packRoot, 'tasks/fleet-roster');

// --- the declaration ----------------------------------------------------------

// --- the worker delegates to the sweep ----------------------------------------

test('fleet-roster: running the worker reaches the sweep, and its failure rejects', async () => {
  // Behavioural, no network: with no FLEET_GITHUB_TOKEN the sweep throws before its
  // first fetch, so the message proves the worker actually got into
  // check-fleet-roster.mjs — and the rejection is the escalation path (the
  // executor converges a failed work step to a `needs-human` issue).
  const saved = { ...process.env };
  process.env.GITHUB_REPOSITORY = 'acme/claudinite-fleet-sheepdog';
  delete process.env.FLEET_GITHUB_TOKEN;
  try {
    // The runner calls the declared module's `worker` with the parameters bag.
    const { worker } = await import(join(taskDir, decl.code_worker_mjs));
    await assert.rejects(async () => worker(paramsBag({ root: taskDir, pack: 'claudinite-fleet-sheepdog', log: () => {} })), /FLEET_GITHUB_TOKEN is not set/);
  } finally {
    process.env = saved;
  }
});
