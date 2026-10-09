import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { lastingFindings, REVIEW_PATH, LEGACY_REVIEW_PATH } from '../../tasks/usage-triage/preconditions.mjs';

const removeTree = (dir) => rmSync(dir, { recursive: true, force: true });

const withReview = (findings, body, at = REVIEW_PATH) => {
  const root = mkdtempSync(join(tmpdir(), 'usage-triage-'));
  try {
    mkdirSync(join(root, '.claudinite', 'usage'), { recursive: true });
    mkdirSync(join(root, '.claudinite', 'local'), { recursive: true });
    writeFileSync(join(root, at), JSON.stringify({ findings }));
    return body(root);
  } finally { removeTree(root); }
};

const finding = (over) => ({ rule: 'r', subject: 's', cause: 'known', lasting: true, ...over });

test('the gate admits a lasting finding a diff can argue from, and nothing else', () => {
  const mixed = [finding(), finding({ subject: 'p', cause: 'probable' }), finding({ subject: 'b', cause: 'unknown' }),
    finding({ subject: 'c', lasting: false })];
  assert.deepEqual(withReview(mixed, lastingFindings).map((f) => f.subject), ['s', 'p'],
    'an unknown cause is evidence, and a young finding is weather');
  assert.deepEqual(withReview([], lastingFindings), []);
  assert.deepEqual(lastingFindings('/nonexistent-root'), [], 'a repo with no review yet has nothing to triage');
});

// A review not yet moved off its old path is still read: the move happens on the
// review's next delivery, and a gate that went blind until then would drop two
// weeks of standing findings on the floor.
test('the gate reads a review still at its old path', () => {
  withReview([finding()], (root) => assert.equal(lastingFindings(root).length, 1), LEGACY_REVIEW_PATH);
});
