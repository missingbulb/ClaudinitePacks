import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isSubstantiveCommit, HOUSEKEEPING } from '../src/derive/substantive-commit.mjs';

// THE DRIFT GUARD for `src/derive/substantive-commit.mjs`, the dashboard's own copy of
// the engine's substantive-commit test (`IsSubstantiveCommit`, tasks/signals). The split
// is forced — the page classifies commits in a browser, and cn answers this one over no
// command — so the vectors below carry the engine's own answers, read off it: a commit
// the page calls project work while the member's own precondition calls machinery marks
// a member sleepy on the very commits its scheduler counts as movement.

const commit = (message, login = 'someone') => ({ author: { login }, commit: { message } });
const COMMITS = [
  commit('Add the thing'), commit('Add the thing', 'dependabot[bot]'), commit('chore [skip ci]'),
  commit('Baseline the repo'), commit('  baselining\n'), commit('claudinite-maintenance: converge'),
  commit('[claudinite-work] acme-pack/x'), commit('seed default-on packs'),
  commit('Regenerate\n\nClaudinite-Task: acme-pack/acme-task\n'), commit('Claudinite-Task:acme-pack/x'),
  commit('Claudinite-Task: '), { message: 'flat shape', author: 'me' }, {}, null,
];
const FILES = [null, [], ['.claudinite/local/x.md'], ['.claudinite/a', 'src/b'], ['src/b']];

// One row per commit, one digit per file list: 1 where the engine calls it project
// work. The last three are shapes the API never sends, which the page reads as a
// commit by nobody in particular.
const ENGINE = ['11011', '00000', '00000', '00000', '00000', '00000', '00000', '00000', '00000', '00000', '00000', '11011', '11011', '11011'];

test('the dashboard classifies every commit exactly as the engine does', () => {
  const diffs = [];
  COMMITS.forEach((c, i) => FILES.forEach((files, j) => {
    const page = isSubstantiveCommit(c, files) ? '1' : '0';
    if (page !== ENGINE[i][j]) diffs.push(`${JSON.stringify(c)} / ${JSON.stringify(files)}: page ${page} engine ${ENGINE[i][j]}`);
  }));
  assert.deepEqual(diffs, []);
  assert.ok(HOUSEKEEPING instanceof RegExp);
});
