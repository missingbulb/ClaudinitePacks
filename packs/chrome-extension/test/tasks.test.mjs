import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const TASK_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../../packs/chrome-extension/tasks/store-release');

test('store-release: the worker it names exists', () => {
  assert.ok(existsSync(join(TASK_DIR, 'worker.mjs')), 'the preprocessing worker must exist');
});
