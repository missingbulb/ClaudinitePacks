// A pack task's code never opens an issue: what it finds goes in the file or pull request it
// delivers, and an issue per finding is a pile of noise in every member's tracker.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const root = new URL('../../', import.meta.url);

export const opensIssue = (text) =>
  /\/issues[`'"]\s*,\s*\{[^}]*method\s*:\s*['"]POST['"]/.test(text)
  || /\bgh\s+issue\s+create\b/.test(text)
  || /issues\.create\s*\(/.test(text);

test('the scan recognises an issue being opened', () => {
  assert.equal(opensIssue("await api(`/repos/${repo}/issues`, { method: 'POST', body: { title } })"), true);
  assert.equal(opensIssue('gh issue create --title t'), true);
  assert.equal(opensIssue("await api(`/repos/${repo}/issues/${n}/comments`, { method: 'POST', body })"), false);
  assert.equal(opensIssue("await api(`/repos/${repo}/issues?state=open`)"), false);
});

test('no pack task opens an issue', () => {
  const files = execFileSync('git', ['ls-files', 'packs/*/tasks/**'], { cwd: root, encoding: 'utf8' })
    .split('\n').filter((f) => /\.(m?js|sh|ya?ml)$/.test(f) && !/(^|\/)test\/|\.test\.mjs$/.test(f));
  assert.ok(files.length > 20, `only ${files.length} task files found - the scan's scope is wrong`);
  assert.deepEqual(files.filter((f) => opensIssue(readFileSync(new URL(f, root), 'utf8'))), []);
});
