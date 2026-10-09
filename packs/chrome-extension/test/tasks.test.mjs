import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const TASK_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../../packs/chrome-extension/tasks/store-release');

test('store-release: the worker it names exists', () => {
  assert.ok(existsSync(join(TASK_DIR, 'worker.mjs')), 'the preprocessing worker must exist');
});

// The runner's parameters bag carries no GitHub client, so the worker reads
// GitHub through its own, defaulted from the Action's token.
test('store-release: dispatches the daily leg from the runner bag alone', async () => {
  const { worker } = await import(join(TASK_DIR, 'worker.mjs'));
  const calls = [];
  const saved = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return { status: 204, json: async () => { throw new Error('no body'); } };
  };
  try {
    await worker({ repo: 'acme/acme-ext', defaultBranch: 'main', log: () => {} });
  } finally {
    globalThis.fetch = saved;
  }
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/repos\/acme\/acme-ext\/actions\/workflows\/chrome-extension-release\.yml\/dispatches$/);
  assert.equal(calls[0].init.method, 'POST');
  assert.deepEqual(JSON.parse(calls[0].init.body), { ref: 'main', inputs: { mode: 'daily' } });
});
