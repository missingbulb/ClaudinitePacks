// This pack's tasks' auto-merge policies against its declared merge rules — each
// task's real diff shape proven mergeable, and anything outside that shape proven
// parked. adopt-requested-packs' shape is an adoption (declaration edit,
// whole-mount re-vendor including the policy files packs carry, regenerated rules
// index).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { mergePolicy, needsCn } from '../../../tools/test/cn-tasks.mjs';
import adopt from '../tasks/adopt-requested-packs/task.json' with { type: 'json' };

// The declaration names its own policy, so the JSON's is the one the engine judges by.
const packDir = dirname(dirname(fileURLToPath(import.meta.url)));
const policy = needsCn.skip ? null : mergePolicy([{ id: 'claudinite-lifecycle', dir: packDir }]);
const verdict = (entries) => policy.verdict(adopt.automerge, entries);

test('the pack\'s merge-rules.json compiles cleanly', needsCn, () => {
  assert.deepEqual(policy.errors, []);
});

test('an adoption-shaped diff lands: declaration, re-vendored mount (its policy files included), rules index', needsCn, () => {
  const v = verdict([
    { file: '.claudinite-settings.json', before: '{"packs":["acme-pack"]}\n', after: '{"packs":["acme-pack","acme-pack-j"]}\n' },
    { file: '.claudinite/shared/packs/acme-pack-j/pack.mjs', before: null, after: 'export default {};\n' },
    // The vendored tree carries canon-authored policy files — the exact case
    // coversMountPolicySources exists for.
    { file: '.claudinite/shared/packs/acme-pack/tasks/acme-task-b/task.json', before: null, after: '{}\n' },
    { file: '.claudinite/shared/packs/acme-pack-f/merge-rules.json', before: '[]\n', after: '[{"name":"x"}]\n' },
    { file: '.claudinite/flat/claudinite-rules.GENERATED.md', before: 'old\n', after: 'new\n' },
    { file: '.claudinite/flat/tasks.GENERATED.json', before: null, after: '{}\n' },
  ]);
  assert.equal(v.mergeable, true, v.why);
});

test('what an adoption does not write parks: repo source, workflows, repo-owned policy files', needsCn, () => {
  assert.equal(verdict([
    { file: 'src/app.mjs', before: 'a\n', after: 'b\n' },
  ]).mergeable, false);
  assert.equal(verdict([
    { file: '.github/workflows/claudinite-scheduler.yml', before: null, after: 'name: x\n' },
  ]).mergeable, false, 'a scaffolded workflow is reviewed — fail-safe, and rare');
  assert.equal(verdict([
    { file: 'packs/p/tasks/t/task.json', before: 'a\n', after: 'b\n' },
  ]).mergeable, false, 'a repo-owned task declaration is never coverable');
});
