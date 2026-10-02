import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, appendFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseLines, bundleStreams, sliceAfter, maxTimestamp, scrub, buildRedactionValues,
  logFilename, parseLogFilename, findTranscript, capture,
} from '../capture-log.mjs';
import { removeTree } from '../../../engine/remove-tree.mjs';

const packDir = join(dirname(dirname(dirname(dirname(fileURLToPath(import.meta.url))))), 'packs/claudinite-growth');

// --- fixture transcript lines -----------------------------------------------

const ts = (m) => `2026-07-19T09:${String(m).padStart(2, '0')}:00.000Z`;
const userLine = (m, text) => JSON.stringify({ type: 'user', timestamp: ts(m), message: { content: text } });
const assistantLine = (m, text) => JSON.stringify({
  type: 'assistant', timestamp: ts(m), message: { content: [{ type: 'text', text }] },
});
// --- pure helpers ------------------------------------------------------------

test('parseLines keeps raw lines paired with parsed entries and skips junk', () => {
  const text = `${userLine(1, 'hi')}\nnot json\n${assistantLine(2, 'yo')}\n`;
  const lines = parseLines(text);
  assert.equal(lines.length, 2);
  assert.equal(lines[0].raw, userLine(1, 'hi'));
  assert.equal(lines[0].entry.type, 'user');
});

test('bundleStreams merges sidechain entries into timestamp order', () => {
  const main = parseLines(`${userLine(1, 'a')}\n${assistantLine(4, 'd')}`);
  const side = parseLines(`${assistantLine(2, 'b')}\n${assistantLine(3, 'c')}`);
  const bundled = bundleStreams([main, side]);
  assert.deepEqual(bundled.map((l) => l.entry.timestamp), [ts(1), ts(2), ts(3), ts(4)]);
});

test('bundleStreams keeps a timestampless entry with its predecessor', () => {
  const main = parseLines(`${userLine(1, 'a')}\n${JSON.stringify({ type: 'queue-operation' })}\n${userLine(5, 'b')}`);
  const side = parseLines(assistantLine(3, 'mid'));
  const bundled = bundleStreams([main, side]);
  assert.equal(bundled[1].entry.type, 'queue-operation'); // stays glued to ts(1), before ts(3)
});

test('sliceAfter is strict and drives delta capture (the twice-merged session)', () => {
  const first = bundleStreams([parseLines(`${userLine(1, 'task 1')}\n${assistantLine(2, 'done 1')}`)]);
  const lastCaptured = maxTimestamp(first);
  assert.equal(lastCaptured, ts(2));
  const wholeSession = bundleStreams([parseLines([
    userLine(1, 'task 1'), assistantLine(2, 'done 1'),
    userLine(3, 'task 2'), assistantLine(4, 'done 2'),
  ].join('\n'))]);
  const delta = sliceAfter(wholeSession, lastCaptured);
  assert.deepEqual(delta.map((l) => l.entry.timestamp), [ts(3), ts(4)]); // ts(2) itself excluded
  assert.deepEqual(sliceAfter(wholeSession, null).length, 4); // no prior capture → everything
});

test('buildRedactionValues enumerates env fail-safe: unknown vars in, structural and short ones out', () => {
  const values = buildRedactionValues({
    MY_DB_PASSWORD: 'hunter2hunter2',
    UNKNOWN_INJECTED: 'mystery-value-99',
    PATH: '/usr/local/bin:/usr/bin',
    NODE_ENV: 'production',
    LC_ALL: 'en_US.UTF-8',
    SHORT: 'abc',
  });
  const names = values.map((v) => v.name);
  assert.ok(names.includes('MY_DB_PASSWORD'));
  assert.ok(names.includes('UNKNOWN_INJECTED'), 'a var the allowlist never heard of must be redacted');
  assert.ok(!names.includes('PATH') && !names.includes('NODE_ENV') && !names.includes('LC_ALL'));
  assert.ok(!names.includes('SHORT'), 'sub-minimum-length values collide with prose');
});

test('buildRedactionValues carries the JSON-escaped form for values with special characters', () => {
  const values = buildRedactionValues({ TRICKY: 'pa"ss\\word-123' });
  const forms = values.filter((v) => v.name === 'TRICKY').map((v) => v.form);
  assert.ok(forms.includes('pa"ss\\word-123'));
  assert.ok(forms.includes('pa\\"ss\\\\word-123'), 'the form as it appears inside a raw JSONL line');
});

test('scrub replaces enumerated values wherever they appear, longest form first', () => {
  const values = buildRedactionValues({ A: 'abcdefgh1234', B: 'abcdefgh1234-XYZ99' });
  const out = scrub('key=abcdefgh1234-XYZ99 and bare abcdefgh1234', values);
  assert.equal(out, 'key=[REDACTED:env:B] and bare [REDACTED:env:A]');
  const line = JSON.stringify({ out: 'saw pa"ss\\word-123 here' });
  const scrubbed = scrub(line, buildRedactionValues({ TRICKY: 'pa"ss\\word-123' }));
  assert.doesNotMatch(scrubbed, /word-123/);
  assert.match(scrubbed, /\[REDACTED:env:TRICKY\]/);
});

test('scrub redacts credential shapes and leaves prose alone', () => {
  const gh = `token ghp_${'a1B2'.repeat(9)} end`;
  assert.match(scrub(gh), /\[REDACTED:github-token\]/);
  assert.doesNotMatch(scrub(gh), /ghp_a1B2/);
  assert.match(scrub(`key AKIAIOSFODNN7EXAMPLE x`), /\[REDACTED:aws-key-id\]/);
  assert.match(scrub(`slack xoxb-1234567890-abcdefghij`), /\[REDACTED:slack-token\]/);
  const clean = 'the ghp_ prefix and the word token appear in prose';
  assert.equal(scrub(clean), clean);
});

test('logFilename and parseLogFilename round-trip, keyed to an issue or to a PR', () => {
  const name = logFilename('2026-07-19T09:40:12.345Z', { issue: 123 }, 'abc-def');
  assert.equal(name, '2026-07-19T0940Z--issue-123--abc-def.jsonl');
  assert.deepEqual(parseLogFilename(name), { capturedAt: '2026-07-19T09:40:00Z', issue: 123, pr: null, sessionId: 'abc-def' });
  const merged = logFilename('2026-07-19T09:40:12.345Z', { pr: 1583 }, 'abc-def');
  assert.equal(merged, '2026-07-19T0940Z--pr-1583--abc-def.jsonl');
  // The unnamed side is null, not 0: a PR-keyed capture says nothing about an issue.
  assert.deepEqual(parseLogFilename(merged), { capturedAt: '2026-07-19T09:40:00Z', issue: null, pr: 1583, sessionId: 'abc-def' });
  assert.equal(parseLogFilename('README.md'), null);
});

// --- transcript discovery -----------------------------------------------------

test('findTranscript locates by session id even when the slug directory mismatches', () => {
  const projects = mkdtempSync(join(tmpdir(), 'claudinite-projects-'));
  try {
    // The transcript lives under some slug — NOT the one derived from the repo
    // root (mimicking a remote session whose launch cwd differs from git root).
    const wrongSlug = join(projects, '-some-other-launch-path');
    mkdirSync(wrongSlug);
    const transcript = join(wrongSlug, 'sess-xyz.jsonl');
    writeFileSync(transcript, userLine(1, 'hi') + '\n');

    const found = findTranscript({ root: '/home/user/EdFringeNow', sessionId: 'sess-xyz', projects });
    assert.equal(found, transcript, 'the session id names the file regardless of slug');

    // With no session id and no matching slug dir, it still finds the newest one.
    const anyFound = findTranscript({ root: '/home/user/EdFringeNow', sessionId: undefined, projects });
    assert.equal(anyFound, transcript);

    // A wrong session id and no slug match falls back to newest-anywhere, never throws.
    assert.equal(findTranscript({ root: '/nope', sessionId: 'not-here', projects }), transcript);
  } finally { removeTree(projects); }
});

test('findTranscript returns null when there is nothing to find', () => {
  const projects = mkdtempSync(join(tmpdir(), 'claudinite-projects-'));
  try {
    assert.equal(findTranscript({ root: '/x', sessionId: 'whatever', projects }), null);
    assert.equal(findTranscript({ root: '/x', sessionId: 'whatever', projects: join(projects, 'absent') }), null);
  } finally { removeTree(projects); }
});

// --- capture end-to-end against a local origin --------------------------------

const CAPTURE = join(packDir, 'capture-log.mjs');

function sh(cwd, cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', ...opts });
  assert.equal(r.status, 0, `${cmd} ${args.join(' ')} failed:\n${r.stdout}\n${r.stderr}`);
  return r.stdout;
}

function makeCaptureFixture() {
  const dir = mkdtempSync(join(tmpdir(), 'claudinite-capture-'));
  const origin = join(dir, 'origin.git');
  const work = join(dir, 'work');
  mkdirSync(origin); mkdirSync(work);
  sh(origin, 'git', ['init', '--bare', '--quiet']);
  sh(work, 'git', ['init', '--quiet']);
  sh(work, 'git', ['config', 'user.email', 't@t']);
  sh(work, 'git', ['config', 'user.name', 't']);
  sh(work, 'git', ['remote', 'add', 'origin', origin]);
  const transcript = join(dir, 'sess-1.jsonl');
  return { dir, origin, work, transcript };
}

function originFiles(origin, branch) {
  return sh(origin, 'git', ['ls-tree', '--name-only', branch]).trim().split('\n').filter(Boolean);
}

test('capture pushes an orphan branch, then a disjoint delta on a second merge', () => {
  const { dir, origin, work, transcript } = makeCaptureFixture();
  try {
    writeFileSync(transcript, [
      userLine(1, 'work on task one'),
      assistantLine(2, `pushing with token ghp_${'a1B2'.repeat(9)} now`),
      assistantLine(3, 'the env said my-injected-secret-42 at some point'),
    ].join('\n') + '\n');

    sh(work, 'node', [CAPTURE, '--issue', '7', '--transcript', transcript],
      { env: { ...process.env, HARNESS_INJECTED: 'my-injected-secret-42' } });

    let files = originFiles(origin, 'conversation-logs');
    const first = files.find((f) => f.endsWith('--sess-1.jsonl'));
    assert.ok(first && first.includes('--issue-7--'), `expected an issue-7 log, got: ${files}`);
    assert.ok(files.includes('README.md'), 'first capture seeds the branch README');
    // orphan root: exactly one commit, no parent
    assert.equal(sh(origin, 'git', ['rev-list', '--count', 'conversation-logs']).trim(), '1');
    assert.equal(sh(origin, 'git', ['log', '--format=%P', '-1', 'conversation-logs']).trim(), '');
    assert.match(sh(origin, 'git', ['log', '--format=%B', '-1', 'conversation-logs']), /\[skip ci\]/);
    const body1 = sh(origin, 'git', ['show', `conversation-logs:${first}`]);
    assert.match(body1, /\[REDACTED:github-token\]/);
    assert.doesNotMatch(body1, /ghp_a1B2/);
    assert.match(body1, /\[REDACTED:env:HARNESS_INJECTED\]/, 'an env-injected value is redacted by enumeration');
    assert.doesNotMatch(body1, /my-injected-secret-42/);
    assert.match(body1, /work on task one/);

    // the same session merges again: transcript grew, second capture, keyed to the
    // PR the merge landed — the delta chains across the two key spellings alike
    appendFileSync(transcript, [
      userLine(4, 'now task two'),
      assistantLine(5, 'task two done'),
    ].join('\n') + '\n');
    sh(work, 'node', [CAPTURE, '--pr', '9', '--transcript', transcript]);

    files = originFiles(origin, 'conversation-logs');
    const second = files.find((f) => f.includes('--pr-9--'));
    assert.ok(second, `expected a pr-9 delta log, got: ${files}`);
    const body2 = sh(origin, 'git', ['show', `conversation-logs:${second}`]);
    assert.match(body2, /now task two/);
    assert.doesNotMatch(body2, /work on task one/); // delta only — nothing double-captured
    assert.ok(files.includes(first), 'first capture still present');

    // third run with nothing new: clean no-op, no third file
    const out = sh(work, 'node', [CAPTURE, '--pr', '9', '--transcript', transcript]);
    assert.match(out, /nothing new/i);
    assert.equal(originFiles(origin, 'conversation-logs').filter((f) => f.endsWith('.jsonl')).length, 2);
  } finally { removeTree(dir); }
});

test('capture discovers the transcript by session id when no --transcript is given', () => {
  const { dir, origin, work } = makeCaptureFixture();
  try {
    // Lay the transcript under <config>/projects/<slug>/<session>.jsonl, with a
    // slug that does NOT match the work-repo path — the remote/web failure mode.
    const configDir = join(dir, 'config');
    const projectDir = join(configDir, 'projects', '-launched-somewhere-else');
    mkdirSync(projectDir, { recursive: true });
    writeFileSync(join(projectDir, 'sess-env.jsonl'),
      [userLine(1, 'discovered by session id'), assistantLine(2, 'ok')].join('\n') + '\n');

    sh(work, 'node', [CAPTURE, '--issue', '11'],
      { env: { ...process.env, CLAUDE_CONFIG_DIR: configDir, CLAUDE_CODE_SESSION_ID: 'sess-env' } });

    const files = originFiles(origin, 'conversation-logs');
    const log = files.find((f) => f.endsWith('--sess-env.jsonl'));
    assert.ok(log && log.includes('--issue-11--'), `expected an issue-11 log for sess-env, got: ${files}`);
    assert.match(sh(origin, 'git', ['show', `conversation-logs:${log}`]), /discovered by session id/);
  } finally { removeTree(dir); }
});

test('capture retries an unreachable origin, not only a lost push race', async () => {
  // The SessionEnd capture is a session's ONLY chance — nothing captures a
  // non-merging session later — so a proxy blip on the reads that open each
  // attempt must be as retryable as the push that closes it.
  const dir = mkdtempSync(join(tmpdir(), 'claudinite-capture-'));
  const origin = join(dir, 'origin.git');
  const work = join(dir, 'work');
  mkdirSync(work);
  try {
    sh(work, 'git', ['init', '--quiet']);
    sh(work, 'git', ['config', 'user.email', 't@t']);
    sh(work, 'git', ['config', 'user.name', 't']);
    sh(work, 'git', ['remote', 'add', 'origin', origin]); // unreachable: nothing there yet

    // Reachable again during the first backoff — the shape of a transient outage.
    // Heals inside the first backoff (200ms into a 400ms wait), so the retry is
    // what lands the capture — the real timings scaled down, not skipped.
    const heal = setTimeout(() => { mkdirSync(origin); sh(origin, 'git', ['init', '--bare', '--quiet']); }, 200);
    try {
      const result = await capture({
        root: work,
        branch: 'conversation-logs',
        sessionId: 'sess-blip',
        bundled: bundleStreams([parseLines(`${userLine(1, 'through a blip')}\n${assistantLine(2, 'ok')}`)]),
        issue: 0,
        now: '2026-08-13T21:07:00.000Z',
        retryBackoffMs: 400,
      });
      assert.equal(result.entries, 2);
    } finally { clearTimeout(heal); }

    const files = originFiles(origin, 'conversation-logs');
    assert.ok(files.some((f) => f.endsWith('--sess-blip.jsonl')), `expected the capture to land, got: ${files}`);
  } finally { removeTree(dir); }
});

test('capture reports the unreachable origin once its attempts are spent', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'claudinite-capture-'));
  const work = join(dir, 'work');
  mkdirSync(work);
  try {
    sh(work, 'git', ['init', '--quiet']);
    sh(work, 'git', ['remote', 'add', 'origin', join(dir, 'never-there.git')]);
    await assert.rejects(
      capture({
        root: work,
        branch: 'conversation-logs',
        sessionId: 'sess-dark',
        bundled: bundleStreams([parseLines(userLine(1, 'into the dark'))]),
        issue: 0,
        now: '2026-08-13T21:07:00.000Z',
        retryBackoffMs: 50,
      }),
      /after 3 attempts/,
    );
  } finally { removeTree(dir); }
});

test('capture fails fast unless exactly one well-formed key is given', () => {
  const { dir, work, transcript } = makeCaptureFixture();
  try {
    writeFileSync(transcript, userLine(1, 'hello') + '\n');
    const r = spawnSync('node', [CAPTURE, '--transcript', transcript], { cwd: work, encoding: 'utf8' });
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /--pr <n>.*--issue <n>/);
    for (const args of [
      ['--issue', 'none'],          // not a number
      ['--pr', '0'],                // a PR has no "none"; 0 is an issue's spelling only
      ['--pr', '5', '--issue', '7'], // one key, not two
    ]) {
      const bad = spawnSync('node', [CAPTURE, ...args, '--transcript', transcript], { cwd: work, encoding: 'utf8' });
      assert.notEqual(bad.status, 0, `expected ${args.join(' ')} to be refused`);
    }
  } finally { removeTree(dir); }
});

// --- the delta contract, pinned ----------------------------------------------
// The SessionEnd capture (session-end.mjs) is safe to fire after a merge capture
// ONLY because capture keys its delta on the session id across every prior file for
// that session. That is a property of capture, not of the hook, so it is pinned here
// — directly, in the two shapes the hook actually produces.

test('capture is idempotent: a repeat capture of an unchanged transcript writes nothing', () => {
  const { dir, origin, work, transcript } = makeCaptureFixture();
  try {
    writeFileSync(transcript, [userLine(1, 'the whole session'), assistantLine(2, 'done')].join('\n') + '\n');
    sh(work, 'node', [CAPTURE, '--issue', '5', '--transcript', transcript]);
    const after = originFiles(origin, 'conversation-logs');
    const commits = sh(origin, 'git', ['rev-list', '--count', 'conversation-logs']).trim();

    // three more capture events, two of them under a DIFFERENT issue — the delta is
    // keyed on the session, so none of them can double-write the same entries.
    for (const issue of ['5', '9', '0']) {
      const out = sh(work, 'node', [CAPTURE, '--issue', issue, '--transcript', transcript]);
      assert.match(out, /nothing new/i);
    }
    assert.deepEqual(originFiles(origin, 'conversation-logs'), after, 'no file was added');
    assert.equal(sh(origin, 'git', ['rev-list', '--count', 'conversation-logs']).trim(), commits, 'no commit was made');
  } finally { removeTree(dir); }
});

test('capture with --issue 0 files a no-issue capture holding exactly the post-merge tail', () => {
  const { dir, origin, work, transcript } = makeCaptureFixture();
  try {
    writeFileSync(transcript, [userLine(1, 'merge it'), assistantLine(2, 'merged')].join('\n') + '\n');
    sh(work, 'node', [CAPTURE, '--issue', '12', '--transcript', transcript]);
    // the session keeps going after its merge — the tail the merge capture cannot see
    appendFileSync(transcript, [userLine(3, 'one more thought'), assistantLine(4, 'noted')].join('\n') + '\n');
    sh(work, 'node', [CAPTURE, '--issue', '0', '--transcript', transcript]);

    const files = originFiles(origin, 'conversation-logs');
    const tail = files.find((f) => f.includes('--issue-0--'));
    assert.ok(tail, `expected an issue-0 tail capture, got: ${files}`);
    // The filename SHAPE is unchanged — that is the whole point: the retention prune
    // and the conversationLogs signal parse it exactly like any other capture.
    assert.deepEqual(parseLogFilename(tail)?.issue, 0);
    const body = sh(origin, 'git', ['show', `conversation-logs:${tail}`]);
    assert.match(body, /one more thought/);
    assert.doesNotMatch(body, /merge it/, 'the tail holds only what the merge capture had not seen');
  } finally { removeTree(dir); }
});

test('the session-end step captures under the issue its launcher named, or 0 when it named none', () => {
  // The unattended path end to end: the session names its work item, this step
  // passes it to capture, and the log lands filed under the task that ran. Nothing
  // else about the capture differs — same script, same filename shape, same delta.
  const STEP = join(packDir, 'session-end.mjs');
  const { dir, origin, work, transcript } = makeCaptureFixture();
  try {
    writeFileSync(transcript, [userLine(1, 'run the dispatch'), assistantLine(2, 'done')].join('\n') + '\n');
    sh(work, process.execPath, [STEP], {
      env: { ...process.env, CLAUDINITE_SESSION_ISSUE: '772', CLAUDINITE_TRANSCRIPT: transcript, CLAUDE_PROJECT_DIR: work },
    });
    assert.ok(originFiles(origin, 'conversation-logs').some((f) => f.includes('--issue-772--')),
      `expected a capture filed under the work item, got: ${originFiles(origin, 'conversation-logs')}`);

    // A hook firing carries no issue, and a junk value is ignored rather than passed on
    // to capture's argument validation.
    appendFileSync(transcript, [userLine(3, 'a later turn'), assistantLine(4, 'noted')].join('\n') + '\n');
    sh(work, process.execPath, [STEP], {
      env: { ...process.env, CLAUDINITE_SESSION_ISSUE: 'not-a-number', CLAUDINITE_TRANSCRIPT: transcript, CLAUDE_PROJECT_DIR: work },
    });
    assert.ok(originFiles(origin, 'conversation-logs').some((f) => f.includes('--issue-0--')));
  } finally { removeTree(dir); }
});
