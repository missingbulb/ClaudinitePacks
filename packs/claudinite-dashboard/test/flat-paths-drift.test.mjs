import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FLAT_TASKS_PATH, FLAT_DASHBOARD_PATH, LEGACY_FLAT_DIR } from '../src/read/flat.mjs';
import { USAGE_PATH, LEGACY_USAGE_PATH, TASKS_USAGE_PATH, LEGACY_TASKS_USAGE_PATH } from '../src/read/usage.mjs';
import { valuesPath, legacyValuesPath } from '../src/read/contributions.mjs';
import { spawnSync } from 'node:child_process';
import { MEMBER_PATH, LEGACY_MEMBER_PATH } from '../src/read/member.mjs';
import { CN, needsCn } from '../../../tools/test/cn-tasks.mjs';
import * as tasksFormat from '../../claudinite-tasks/tasks/usage-fold/tasks-usage-format.mjs';
import * as review from '../../claudinite-growth/tasks/usage-review/report.mjs';
import { installSdk } from '../../../tools/test/sdk-stand-in.mjs';

installSdk();
const fold = await import('../../claudinite-tasks/tasks/usage-fold/worker.mjs');

// The page reads files other packs write, and cannot import them: it runs in the
// viewer's browser against other repos. So each path is spelled on both sides, and this
// holds the page's spelling to the writer's, the old paths included, since a page that
// looked for a moved file at neither path would show a member with history as empty.
const posix = (p) => p.split(/[\\/]/).join('/');

// The three flat files are `cn`'s to write, so their paths are asked of the binary.
test('the page reads each flat file at the path cn writes it', needsCn, () => {
  const r = spawnSync(CN, ['tasks', 'flat', '--paths', '--json'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const paths = JSON.parse(r.stdout);
  assert.equal(FLAT_TASKS_PATH, posix(paths.tasks));
  assert.equal(FLAT_DASHBOARD_PATH, posix(paths.dashboards));
  assert.equal(MEMBER_PATH, posix(paths.member));
});

// cn names only today's paths; the old directory is the one it wrote before them.
test('the old member path is the member file under the old flat directory', () => {
  assert.equal(LEGACY_MEMBER_PATH, MEMBER_PATH.replace('.claudinite/cache/', LEGACY_FLAT_DIR));
});

test('the page reads each pack-written file at the path its writer writes it', () => {
  assert.equal(USAGE_PATH, fold.USAGE_PATH);
  assert.equal(LEGACY_USAGE_PATH, fold.LEGACY_USAGE_PATH);
  assert.equal(TASKS_USAGE_PATH, tasksFormat.TASKS_USAGE_PATH);
  assert.equal(LEGACY_TASKS_USAGE_PATH, tasksFormat.LEGACY_TASKS_USAGE_PATH);
  assert.equal(valuesPath('claudinite-growth'), review.DASHBOARD_PATH); // @real-entity the one pack whose writer publishes dashboard values today
  assert.equal(legacyValuesPath('claudinite-growth'), review.LEGACY_PATHS[review.DASHBOARD_PATH]); // @real-entity as above
});
