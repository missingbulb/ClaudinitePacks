import { test } from 'node:test';
import assert from 'node:assert/strict';
import task from '../../../tasks/publish-pages/task.json' with { type: 'json' };
import { verdictOf, needsCn } from '../../../../../tools/test/cn-tasks.mjs';

// The cadence term reads the task's own run history at a chosen instant: an empty
// history holds, and the window's changed paths decide.
const AT = '2026-09-05T16:00:00Z';
const verdictFor = (touchedPaths) => verdictOf(task.preconditions,
  { runs: { list: [] }, commits: { touchedPaths }, sharedMount: { changedPacks: [] } }, { now: AT });

test('publish-pages: a commit to a cn member\'s settings file fires it, in any of its formats', needsCn, () => {
  for (const file of ['.claudinite/settings.yaml', '.claudinite/settings.toml', '.claudinite/settings.json']) {
    assert.equal(verdictFor([file]).run, true, file);
  }
});

test('publish-pages: a Node member\'s settings file fires it too', needsCn, () => {
  assert.equal(verdictFor(['.claudinite-settings.json']).run, true);
});

test('publish-pages: a commit touching neither settings file does not', needsCn, () => {
  assert.equal(verdictFor(['src/app.mjs', '.claudinite/cache/member.GENERATED.json']).run, false);
});
