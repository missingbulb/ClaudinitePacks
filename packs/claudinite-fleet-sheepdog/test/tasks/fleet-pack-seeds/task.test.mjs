import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import declJson from '../../../tasks/fleet-pack-seeds/task.json' with { type: 'json' };
import rosterJson from '../../../tasks/fleet-roster/task.json' with { type: 'json' };
import { paramsBag } from '../../../../../tools/test/sdk-stand-in.mjs';
import { declarationOf } from '../../../../../tools/test/cn-tasks.mjs';
// The engine's contract: the JSON says what is particular to the task, the defaults are the engine's.
const decl = declarationOf(declJson);
const roster = declarationOf(rosterJson);

// The claudinite-fleet-sheepdog pack's fleet-pack-seeds task: the enforcer converging the pack
// declarations this fleet standardizes on. Same agentless shape as the other
// sweeps and locked down the same way — the declaration satisfies the contract the
// scheduler and executor both read, and running the worker reaches the sweep.

const packRoot = join(dirname(fileURLToPath(import.meta.url)), '../../../../../packs/claudinite-fleet-sheepdog');
const taskDir = join(packRoot, 'tasks/fleet-pack-seeds');

// --- the declaration ----------------------------------------------------------

test('fleet-pack-seeds: asks for the same fleet secret the roster sweep does — one grant, declared alike', () => {
  // The token is granted once for the whole pack (fleet-token.mjs), so two sweeps
  // declaring different secret names would be two things for a person to configure.
  assert.deepEqual(decl.code_work_required_secrets, roster.code_work_required_secrets);
});

// --- the worker delegates to the sweep ----------------------------------------

test('fleet-pack-seeds: running the worker reaches the sweep, and its failure rejects', async () => {
  // Behavioural, no network: with no FLEET_GITHUB_TOKEN the sweep throws before its
  // first fetch, so the message proves the worker actually got into
  // check-fleet-pack-seeds.mjs — and the rejection is the escalation path (the
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
