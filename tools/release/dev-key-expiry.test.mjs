import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(new URL('./dev-key-expiry.mjs', import.meta.url));
const CERT = new URL('../../keys/dev/packs.cert.json', import.meta.url);
const notAfter = () => JSON.parse(Buffer.from(JSON.parse(readFileSync(CERT, 'utf8')).payload, 'base64url').toString('utf8')).notAfter;
const DAY = 86400e3;

const run = (now) => {
  const r = spawnSync(process.execPath, [SCRIPT, '--now', new Date(now).toISOString()], { encoding: 'utf8' });
  return { status: r.status, out: r.stdout + r.stderr };
};

test('more than 14 days before notAfter it exits 0 and prints the date', () => {
  const r = run(Date.parse(notAfter()) - 14 * DAY - 1000);
  assert.equal(r.status, 0, r.out);
  assert.ok(r.out.includes(notAfter()), r.out);
});

test('exactly 14 days before notAfter, and after it, it exits 1 naming the date and the renewal', () => {
  for (const now of [Date.parse(notAfter()) - 14 * DAY, Date.parse(notAfter()) + 1000]) {
    const r = run(now);
    assert.equal(r.status, 1, r.out);
    assert.ok(r.out.includes(notAfter()), r.out);
    assert.match(r.out, /::error::.*keys\/dev\/README\.md/);
  }
});

test('an unparseable --now fails without a verdict', () => {
  const r = spawnSync(process.execPath, [SCRIPT, '--now', 'soon'], { encoding: 'utf8' });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /--now/);
});
