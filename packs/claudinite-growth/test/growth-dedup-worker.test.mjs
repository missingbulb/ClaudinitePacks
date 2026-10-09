import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { gitIn, installSdk } from '../../../tools/test/sdk-stand-in.mjs';

installSdk({ answers: { packs: () => [{ id: 'acme-pack', version: '1.0', kind: 'canon' }, { id: 'mine', version: null, kind: 'local' }] } });
const {
  MAX_ADDED_LINES_PER_FILE,
  MAX_BRIEF_BYTES,
  canonPackOf,
  addedLines,
  addedCheckIds,
  summarizeCanonWindow,
  renderBrief,
  handoffDetail,
  filesOfDiff,
  worker,
} = await import('../tasks/growth-dedup/worker.mjs');

// The growth-dedup code_work: what the mounted canon ADDED in the window, which is
// the only thing that can newly cover a local item. Pure functions over the
// commit records the API returns, so the whole detection tests with no live
// GitHub; main() is the thin I/O shell around them.

// --- which files belong to a canon pack --------------------------------------

test('canonPackOf: both mount roots, and never a local pack', () => {
  // Two-root form: a member mounts the canon at `.claudinite/shared/packs/`, and
  // the canon home runs the same code from its repo root, where the shared packs
  // ARE `packs/`. A mount-only match is blind in exactly the repo whose canon
  // moves every day.
  assert.equal(canonPackOf('.claudinite/shared/packs/acme-pack/RULES.md'), 'acme-pack');
  assert.equal(canonPackOf('packs/acme-pack/RULES.md'), 'acme-pack');
  // A LOCAL pack is what this task prunes — never the yardstick it prunes against.
  assert.equal(canonPackOf('.claudinite/local/packs/mine/RULES.md'), null);
  assert.equal(canonPackOf('.claudinite/local/packs/mine/RULES.md'), null);
  assert.equal(canonPackOf('src/app.js'), null);
  assert.equal(canonPackOf('packs/acme-pack'), null); // a pack directory is not a file in it
});

// --- reading a patch ----------------------------------------------------------

const PATCH = [
  '@@ -3,6 +3,8 @@',
  ' context line',
  '-a rule the canon dropped',
  '+a rule the canon added',
  '+another added rule',
  ' more context',
].join('\n');

test('addedLines: the + lines only, without the marker, and never the +++ header', () => {
  assert.deepEqual(addedLines(PATCH), ['a rule the canon added', 'another added rule']);
  assert.deepEqual(addedLines('+++ b/packs/x/RULES.md\n+real line'), ['real line']);
  assert.deepEqual(addedLines(undefined), []);
});

test('addedCheckIds: a declared-checks.json patch yields the ids it ADDED', () => {
  // The half a prose-only read misses entirely: a canon check enforces a rule on
  // every session and CI pass, which is stronger coverage than a stated line.
  // The key is `id` — the spelling declared-checks.json actually uses. Read off
  // packs/acme-pack/declared-checks.json rather than guessed: keyed on anything else
  // this returns nothing on every real patch while every fixture stays green.
  const patch = [
    '@@ -10,6 +10,12 @@',
    '+    "id": "pack-entry-await",',
    '+    "on_fail": "block",',
    '+    "id": "acme-check-b",',
    '-    "id": "retired-thing",',
  ].join('\n');
  assert.deepEqual(addedCheckIds(patch), ['pack-entry-await', 'acme-check-b']);
});

test('addedCheckIds: the key is the one the real canon file uses', () => {
  // Drift guard against the shape this parse is stated over. A rename in the
  // declared-checks vocabulary must fail here rather than silently retire the
  // new-check half of every dedup brief.
  const real = readFileSync(new URL('../../../packs/basics/declared-checks.json', import.meta.url), 'utf8'); // @real-entity the real canon file whose key spelling this pins
  const declared = JSON.parse(real).map((c) => c.id);
  const parsed = addedCheckIds(real.split('\n').map((l) => `+${l}`).join('\n'));
  assert.ok(declared.length >= 3, `the fixture pack declares only ${declared.length} checks — pick a richer one`);
  // Every id the file declares, and only those: keyed on the wrong word this is
  // empty on every real patch, and fixtures alone would never say so.
  assert.deepEqual(parsed.sort(), declared.sort());
});

// --- the window summary -------------------------------------------------------

const commit = (sha, files) => ({ sha, message: `commit ${sha}`, files });

test('summarizeCanonWindow: declared canon packs only, files merged across commits', () => {
  const commits = [
    commit('a', [
      { filename: '.claudinite/shared/packs/acme-pack/RULES.md', patch: PATCH },
      { filename: '.claudinite/shared/packs/acme-pack-e/RULES.md', patch: PATCH },
      { filename: 'src/app.js', patch: PATCH },
    ]),
    commit('b', [
      { filename: '.claudinite/shared/packs/acme-pack/RULES.md', patch: '@@\n+a third added rule' },
      { filename: '.claudinite/shared/packs/acme-pack/declared-checks.json', patch: '@@\n+  { "id": "new-check", "on_fail": "advise" }' },
    ]),
  ];
  const summary = summarizeCanonWindow(commits, ['acme-pack', 'acme-pack-b']);

  assert.deepEqual(Object.keys(summary.packs), ['acme-pack']); // acme-pack-e undeclared, src/ not canon
  const files = summary.packs['acme-pack'].files;
  assert.deepEqual(Object.keys(files).sort(), [
    '.claudinite/shared/packs/acme-pack/RULES.md',
    '.claudinite/shared/packs/acme-pack/declared-checks.json',
  ].sort());
  // The same file moving twice contributes both commits' additions, in order.
  assert.deepEqual(files['.claudinite/shared/packs/acme-pack/RULES.md'].added, [
    'a rule the canon added', 'another added rule', 'a third added rule',
  ]);
  assert.deepEqual(summary.packs['acme-pack'].newCheckIds, ['new-check']);
  assert.equal(summary.addedLineCount, 4);
  assert.equal(summary.fileCount, 2);
});

test('summarizeCanonWindow: a file the API gave no patch for is reported, not dropped', () => {
  // GitHub omits `patch` on a very large diff. Silently dropping the file would
  // tell the run the canon did not move there — the one lie this brief must not
  // tell.
  const summary = summarizeCanonWindow(
    [commit('a', [{ filename: 'packs/acme-pack/RULES.md' }])],
    ['acme-pack'],
  );
  assert.equal(summary.packs['acme-pack'].files['packs/acme-pack/RULES.md'].patchUnavailable, true);
  assert.match(renderBrief(summary, { sinceIso: '2026-08-09T00:00:00Z' }), /read the file whole/);
});

test('summarizeCanonWindow: an empty window summarizes to nothing, not to a crash', () => {
  const summary = summarizeCanonWindow([], ['acme-pack']);
  assert.deepEqual(summary.packs, {});
  assert.equal(summary.addedLineCount, 0);
  assert.match(renderBrief(summary, { sinceIso: '2026-08-09T00:00:00Z' }), /No declared canon pack moved/);
});

// --- the brief ----------------------------------------------------------------

test('renderBrief: the added lines and new check ids, under the window it covers', () => {
  const summary = summarizeCanonWindow([
    commit('a', [
      { filename: 'packs/acme-pack/RULES.md', patch: PATCH },
      { filename: 'packs/acme-pack/declared-checks.json', patch: '@@\n+  { "id": "new-check", "on_fail": "advise" }' },
    ]),
  ], ['acme-pack']);
  const brief = renderBrief(summary, { sinceIso: '2026-08-09T00:00:00Z' });

  assert.match(brief, /2026-08-09/);
  assert.match(brief, /packs\/acme-pack\/RULES\.md/);
  assert.match(brief, /a rule the canon added/);
  assert.match(brief, /new-check/);
  // A line the canon REMOVED can never justify a prune, so it is not offered as
  // coverage — the brief carries additions only.
  assert.doesNotMatch(brief, /a rule the canon dropped/);
});

test('renderBrief: a heavy file is truncated with the remainder COUNTED, never silently', () => {
  const many = ['@@', ...Array.from({ length: MAX_ADDED_LINES_PER_FILE + 7 }, (_, i) => `+line ${i}`)].join('\n');
  const summary = summarizeCanonWindow([commit('a', [{ filename: 'packs/acme-pack/RULES.md', patch: many }])], ['acme-pack']);
  const brief = renderBrief(summary, { sinceIso: '2026-08-09T00:00:00Z' });

  assert.match(brief, /line 0/);
  assert.doesNotMatch(brief, /line 46/); // past the cap
  assert.match(brief, /7 more added line/); // the drop is stated, so the brief is not read as complete
});

test('renderBrief: a heavy window fits the issue body, names every file, and counts what it dropped', () => {
  // The canon home's own last week: 138 changed files and 12k added lines
  // rendered a 350KB body against GitHub's 64KB issue limit — the write would
  // have 422'd and the run failed on its first step. Every changed file is still
  // NAMED (that list is cheap and is the run's map); the additions are what the
  // budget rations, and the rationing is stated.
  const files = Array.from({ length: 200 }, (_, i) => ({
    filename: `packs/acme-pack/rules-${i}.md`,
    patch: ['@@', ...Array.from({ length: 30 }, (_, j) => `+pack acme-pack rule ${i}.${j} — a long enough line to make the budget bite`)].join('\n'),
  }));
  const summary = summarizeCanonWindow([commit('a', files)], ['acme-pack']);
  const brief = renderBrief(summary, { sinceIso: '2026-08-09T00:00:00Z' });

  assert.ok(brief.length <= MAX_BRIEF_BYTES, `brief is ${brief.length} bytes, over the ${MAX_BRIEF_BYTES} budget`);
  assert.match(brief, /rules-0\.md/);
  assert.match(brief, /rules-199\.md/); // the last file is still on the map
  assert.match(brief, /additions for \d+ further file/); // and the omission is counted, not silent
});

test('renderBrief: even an absurd window renders a body an issue can hold', () => {
  // The map tier is unbudgeted so the run always knows where to look; the last
  // guard is a stated cut, because a 422 on the issue write fails the run at its
  // very first step.
  const files = Array.from({ length: 4000 }, (_, i) => ({
    filename: `packs/acme-pack/a-fairly-long-rule-file-name-number-${i}.md`,
    patch: '@@\n+one added line',
  }));
  const brief = renderBrief(summarizeCanonWindow([commit('a', files)], ['acme-pack']), { sinceIso: '2026-08-09T00:00:00Z' });
  assert.ok(brief.length <= MAX_BRIEF_BYTES + 200, `brief is ${brief.length} bytes`);
  assert.match(brief, /Truncated at/);
});

// --- the hand-off -------------------------------------------------------------

test('handoffDetail: names what the window held, including when it held nothing', () => {
  // The agent runs either way — the precondition already decided the run happens,
  // and an empty canon window still leaves fresh LOCAL items to re-check. So this
  // describes the window; it never re-decides the run.
  const full = summarizeCanonWindow([commit('a', [
    { filename: 'packs/acme-pack/RULES.md', patch: PATCH },
    { filename: 'packs/acme-pack/declared-checks.json', patch: '@@\n+  { "id": "new-check", "on_fail": "advise" }' },
  ])], ['acme-pack']);
  assert.match(handoffDetail(full), /acme-pack/);
  assert.match(handoffDetail(full), /1 new check/);
  assert.match(handoffDetail(summarizeCanonWindow([], ['acme-pack'])), /no canon pack moved/i);
});

// --- the I/O shell -----------------------------------------------------------

test('filesOfDiff: one record per file, the post-image path, no patch for a binary', () => {
  const diff = [
    'diff --git a/packs/acme-pack/RULES.md b/packs/acme-pack/RULES.md',
    'index 1..2 100644', '--- a/packs/acme-pack/RULES.md', '+++ b/packs/acme-pack/RULES.md', '@@ -1 +1,2 @@', ' old', '+new',
    'diff --git a/packs/acme-pack/icon.png b/packs/acme-pack/icon.png',
    'index 3..4 100644', 'Binary files a/packs/acme-pack/icon.png and b/packs/acme-pack/icon.png differ', '',
  ].join('\n');
  const files = filesOfDiff(diff);
  assert.deepEqual(files.map((f) => f.filename), ['packs/acme-pack/RULES.md', 'packs/acme-pack/icon.png']);
  assert.deepEqual(addedLines(files[0].patch), ['new']);
  assert.equal(files[1].patch, undefined);
});

test('the worker reads the window from a shallow checkout through the SDK and posts the brief on its item', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'growth-dedup-'));
  const quiet = { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] };
  const origin = `${dir}/origin`;
  const at = (daysAgo) => new Date(Date.now() - daysAgo * 86400000).toISOString();
  const land = (daysAgo, path, content) => {
    mkdirSync(dirname(`${origin}/${path}`), { recursive: true });
    writeFileSync(`${origin}/${path}`, content);
    execFileSync('git', ['-C', origin, 'add', '-A'], quiet);
    const env = { ...process.env, GIT_AUTHOR_DATE: at(daysAgo), GIT_COMMITTER_DATE: at(daysAgo) };
    execFileSync('git', ['-C', origin, '-c', 'user.name=acme', '-c', 'user.email=a@x', '-c', 'commit.gpgsign=false', 'commit', '-q', '-m', path], { ...quiet, env });
  };
  execFileSync('git', ['init', '-q', '-b', 'main', origin], quiet);
  const rules = '.claudinite/shared/packs/acme-pack/RULES.md';
  land(30, rules, '- **An old canon rule** - before the window.\n');
  land(2, rules, '- **An old canon rule** - before the window.\n- **A new canon rule** - said once.\n');
  land(1, '.claudinite/shared/packs/undeclared/RULES.md', '- **Not a yardstick** - undeclared.\n');
  const root = `${dir}/member`;
  execFileSync('git', ['clone', '-q', '--depth', '1', `file://${origin}`, root], quiet);

  const posted = [];
  const sdk = installSdk({
    params: { root, defaultBranch: 'main', item: { number: 9 } },
    answers: {
      git: gitIn(root),
      packs: () => [{ id: 'acme-pack', version: '1.0', kind: 'canon' }],
      'github.createComment': (args) => { posted.push(args); return { id: 1 }; },
    },
  });
  const verdict = await worker(sdk.params);
  assert.equal(posted.length, 1);
  assert.equal(posted[0].issue, 9);
  assert.match(posted[0].body, /A new canon rule/);
  assert.doesNotMatch(posted[0].body, /undeclared|Not a yardstick/);
  assert.doesNotMatch(posted[0].body, /^An old canon rule/m, 'a line from before the window is not an addition');
  assert.match(verdict.requestAgent.reason.detail, /1 added line\(s\) across 1 file\(s\) in acme-pack,/);
});

test('a shallow checkout whose window holds no commit posts the brief that says so', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'growth-dedup-'));
  const quiet = { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] };
  const origin = `${dir}/origin`;
  execFileSync('git', ['init', '-q', '-b', 'main', origin], quiet);
  for (const days of [40, 30]) {
    writeFileSync(`${origin}/f`, String(days));
    execFileSync('git', ['-C', origin, 'add', '-A'], quiet);
    const when = new Date(Date.now() - days * 86400000).toISOString();
    execFileSync('git', ['-C', origin, '-c', 'user.name=acme', '-c', 'user.email=a@x', '-c', 'commit.gpgsign=false', 'commit', '-q', '-m', `c${days}`],
      { ...quiet, env: { ...process.env, GIT_AUTHOR_DATE: when, GIT_COMMITTER_DATE: when } });
  }
  const root = `${dir}/member`;
  execFileSync('git', ['clone', '-q', '--depth', '1', `file://${origin}`, root], quiet);
  const posted = [];
  const sdk = installSdk({
    params: { root, defaultBranch: 'main', item: { number: 9 } },
    answers: { git: gitIn(root), packs: () => [{ id: 'acme-pack', version: '1.0', kind: 'canon' }], 'github.createComment': (args) => { posted.push(args); return { id: 1 }; } },
  });
  const verdict = await worker(sdk.params);
  assert.match(posted[0].body, /No declared canon pack moved/);
  assert.match(verdict.requestAgent.reason.detail, /no canon pack moved/);
});
