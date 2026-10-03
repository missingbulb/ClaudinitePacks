import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const git = (cwd, ...args) => execFileSync('git', ['-c', 'commit.gpgsign=false', ...args], { cwd, encoding: 'utf8' });
const removeTree = (dir) => rmSync(dir, { recursive: true, force: true });
import { packDeclaredAt, adoptionWindow } from '../../tasks/usage-review/read-live.mjs';

// A throwaway repo whose settings file gains a pack at a known commit.
function repoDeclaring(packs) {
  const root = mkdtempSync(join(tmpdir(), 'declared-'));
  git(root, 'init', '-q');
  git(root, 'config', 'user.email', 't@example.com');
  git(root, 'config', 'user.name', 'T');
  const settings = (list) => writeFileSync(join(root, '.claudinite-settings.json'),
    JSON.stringify({ packs: list }, null, 2));
  settings([]);
  git(root, 'add', '-A'); git(root, 'commit', '-qm', 'first');
  for (const p of packs) {
    settings(packs.slice(0, packs.indexOf(p) + 1));
    git(root, 'add', '-A'); git(root, 'commit', '-qm', `declare ${p}`);
  }
  return root;
}

test('a declaration inside the checkout is dated from the commit that made it', () => {
  const root = repoDeclaring(['basics']);
  try {
    const at = packDeclaredAt(root, 'basics');
    assert.ok(at, 'the commit that added the pack is reachable, so its date is the answer');
    assert.match(at, /^\d{4}-\d{2}-\d{2}T/);
  } finally { removeTree(root); }
});

test('a declaration older than the checkout is unknowable, never the clone\'s own horizon', () => {
  // The failure this guards: `git log --reverse -S` on a shallow clone answers
  // with the earliest commit IT can see, which is a real commit and not null. The
  // adoption window then starts at the clone's depth, so the same review over the
  // same record finds different things on two checkouts of one repository.
  const root = repoDeclaring(['basics']);
  const shallow = mkdtempSync(join(tmpdir(), 'shallow-'));
  try {
    git(shallow, 'clone', '-q', '--depth', '1', `file://${root}`, 'copy');
    const copy = join(shallow, 'copy');
    assert.equal(git(copy, 'rev-parse', '--is-shallow-repository').trim(), 'true',
      'the fixture must actually be shallow or it proves nothing');
    assert.equal(packDeclaredAt(copy, 'basics'), null,
      'the pack was already declared at the earliest commit we can see, so when it was declared is not knowable here');
  } finally {
    removeTree(root);
    removeTree(shallow);
  }
});

test('an unknowable declaration date leaves the adoption window unjudgeable', () => {
  assert.equal(adoptionWindow(null, '2026-09-22T00:00:00Z'), null,
    'which is what keeps an adoption-time skill out of the findings rather than in them');
});
