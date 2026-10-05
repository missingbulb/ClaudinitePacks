// A member's `cn selftest` fails when a mounted skill links to a file its mount lacks, and the
// engine updater skips every candidate whose self-test fails. A mount holds only pack
// directories, minus what vendoring drops, so a skill's relative link must land there.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { posix } from 'node:path';

const root = new URL('../../', import.meta.url);
const tracked = (pattern) => execFileSync('git', ['ls-files', pattern], { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean);
const link = /\]\(([^)\s]+)\)/g;
const dropped = new Set(['test', 'docs', 'provenance']);

test('every relative link in a skill lands on a vendored file of some pack', () => {
  const skills = tracked('packs/*/skills/*/SKILL.md');
  assert.ok(skills.length > 0, 'no skills found under packs/*/skills/*/SKILL.md');
  const bad = [];
  for (const file of skills) {
    for (const [, raw] of readFileSync(new URL(file, root), 'utf8').matchAll(link)) {
      const target = raw.split('#')[0];
      if (target === '' || target.includes(':') || target.startsWith('/')) continue;
      const path = posix.normalize(posix.join(posix.dirname(file), target));
      const [top, pack, sub] = path.split('/');
      const inPack = top === 'packs' && pack && sub && !dropped.has(sub);
      if (!inPack || !existsSync(new URL(path, root))) bad.push(`${file}: ${raw}`);
    }
  }
  assert.deepEqual(bad, []);
});
