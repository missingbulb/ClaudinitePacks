import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { decodeB64, parsePrivateKey } from '../sign/sign.mjs';
import {
  INDEX_KEYS, ENTRY_KEYS, newIndex, addVersion, setChannel, setRevoked, serialize, readIndex,
  signIndex, verifyIndex, assertSerialAdvances, compareVersions,
} from './index.mjs';

const V = JSON.parse(readFileSync(new URL('../sign/testdata/vectors.json', import.meta.url), 'utf8'));
const ROOTS = [decodeB64(V.roots.root.publicKey)];
const NOW = new Date('2026-01-31T00:00:00Z');
const PACKS_KEY = parsePrivateKey(V.subjects.packs.seed);

const release = (version, extra = {}) => ({
  packJson: { version, minEngineVersion: '60101.1', requires: ['acme-dep'], ...extra },
  sha256: 'a'.repeat(64),
  size: 123,
  publishedAt: '2026-01-02T03:04:05Z',
  sourceCommit: 'b'.repeat(40),
});

const three = () => {
  let ix = newIndex('acme-pack');
  for (const v of ['60101.1', '60101.2', '60102.1']) ix = addVersion(ix, release(v));
  return ix;
};

test('newIndex is empty at serial 0; the first addVersion writes serial 1 with a full canary entry', () => {
  const ix = newIndex('acme-pack');
  assert.deepEqual(ix, { v: 1, pack: 'acme-pack', serial: 0, versions: [] });
  const one = addVersion(ix, release('60101.1'));
  assert.equal(one.serial, 1);
  assert.deepEqual(one.versions, [{
    version: '60101.1',
    sha256: 'a'.repeat(64),
    size: 123,
    minEngineVersion: '60101.1',
    requires: ['acme-dep'],
    channel: 'canary',
    revoked: false,
    publishedAt: '2026-01-02T03:04:05Z',
    sourceCommit: 'b'.repeat(40),
  }]);
  assert.deepEqual(ix.versions, [], 'addVersion does not mutate its input');
});

test('addVersion keeps ascending numeric order when a lower version arrives later', () => {
  let ix = addVersion(newIndex('acme-pack'), release('60102.1'));
  ix = addVersion(ix, release('60101.2'));
  ix = addVersion(ix, release('60101.10'));
  assert.deepEqual(ix.versions.map((e) => e.version), ['60101.2', '60101.10', '60102.1']);
  assert.equal(ix.serial, 3);
});

test('compareVersions compares numeric segments, never as floats', () => {
  assert.ok(compareVersions('60928.1', '60928.2') < 0);
  assert.ok(compareVersions('60928.2', '60930.1') < 0);
  assert.ok(compareVersions('60820.10', '60820.1') > 0);
  assert.equal(compareVersions('60101.1', '60101.1'), 0);
});

test('addVersion refuses a duplicate version', () => {
  assert.throws(() => addVersion(three(), release('60101.2')), /acme-pack 60101\.2 is already published/);
});

test('addVersion refuses a pack.json without a string version or minEngineVersion', () => {
  assert.throws(() => addVersion(newIndex('acme-pack'), release(undefined)), /acme-pack: pack\.json has no string version/);
  assert.throws(() => addVersion(newIndex('acme-pack'), release(60101.1)), /acme-pack: pack\.json has no string version/);
  assert.throws(() => addVersion(newIndex('acme-pack'), release('60101.1', { minEngineVersion: undefined })), /acme-pack: pack\.json has no string minEngineVersion/);
});

test('addVersion turns absent requires into []', () => {
  const ix = addVersion(newIndex('acme-pack'), release('60101.1', { requires: undefined }));
  assert.deepEqual(ix.versions[0].requires, []);
});

test('setChannel and setRevoked bump the serial by one and change nothing else', () => {
  const before = three();
  const promoted = setChannel(before, '60101.2', 'stable');
  assert.equal(promoted.serial, before.serial + 1);
  assert.equal(promoted.versions[1].channel, 'stable');
  assert.deepEqual({ ...promoted.versions[1], channel: 'canary' }, before.versions[1]);
  assert.deepEqual([promoted.versions[0], promoted.versions[2]], [before.versions[0], before.versions[2]]);

  const revoked = setRevoked(promoted, '60102.1', true);
  assert.equal(revoked.serial, promoted.serial + 1);
  assert.equal(revoked.versions[2].revoked, true);
  assert.deepEqual({ ...revoked.versions[2], revoked: false }, promoted.versions[2]);
  assert.deepEqual(revoked.versions.slice(0, 2), promoted.versions.slice(0, 2));
});

test('setChannel refuses a channel other than canary or stable, and an unknown version', () => {
  assert.throws(() => setChannel(three(), '60101.1', 'beta'), /channel/);
  assert.throws(() => setChannel(three(), '60199.1', 'stable'), /60199\.1/);
  assert.throws(() => setRevoked(three(), '60101.1', 'yes'), /boolean/);
});

test('serialize is stable, ends in a newline and writes keys in the format order', () => {
  const a = serialize(three());
  const shuffled = JSON.parse(a.toString('utf8'), (k, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).reverse()) : v));
  const b = serialize(shuffled);
  assert.ok(Buffer.isBuffer(a));
  assert.deepEqual(a, b);
  assert.ok(a.toString('utf8').endsWith('}\n'));
  const parsed = JSON.parse(a.toString('utf8'));
  assert.deepEqual(Object.keys(parsed), INDEX_KEYS);
  assert.deepEqual(Object.keys(parsed.versions[0]), ENTRY_KEYS);
  assert.deepEqual(INDEX_KEYS, ['v', 'pack', 'serial', 'versions']);
  assert.deepEqual(ENTRY_KEYS, ['version', 'sha256', 'size', 'minEngineVersion', 'requires', 'channel', 'revoked', 'publishedAt', 'sourceCommit']);
});

test('signIndex then verifyIndex round-trips; a flipped byte in the index or the signature fails', () => {
  const bytes = serialize(three());
  const sig = signIndex(bytes, PACKS_KEY, V.certificates.packs);
  assert.deepEqual(Object.keys(sig), ['certificate', 'signature']);
  assert.equal(verifyIndex(bytes, sig, ROOTS, NOW).use, 'packs');

  const flipped = Buffer.from(bytes);
  flipped[10] ^= 1;
  assert.throws(() => verifyIndex(flipped, sig, ROOTS, NOW), /signature does not verify/);

  const raw = decodeB64(sig.signature);
  raw[0] ^= 1;
  assert.throws(() => verifyIndex(bytes, { ...sig, signature: raw.toString('base64url') }, ROOTS, NOW), /signature does not verify/);
});

test('an index signed under a manifest-use certificate fails with a use error', () => {
  const bytes = serialize(three());
  const sig = signIndex(bytes, parsePrivateKey(V.subjects.manifest.seed), V.certificates.manifest);
  assert.throws(() => verifyIndex(bytes, sig, ROOTS, NOW), /use "manifest", want "packs"/);
});

test('assertSerialAdvances refuses an equal or older serial and accepts the first index', () => {
  const ix = three();
  assertSerialAdvances(null, ix);
  assertSerialAdvances(ix, setChannel(ix, '60101.1', 'stable'));
  assert.throws(() => assertSerialAdvances(ix, ix), /serial 3 is not greater than 3/);
  assert.throws(() => assertSerialAdvances(setChannel(ix, '60101.1', 'stable'), ix), /serial 3 is not greater than 4/);
});

test('readIndex parses what serialize wrote and refuses another format version', () => {
  const ix = three();
  assert.deepEqual(readIndex(serialize(ix)), ix);
  assert.throws(() => readIndex(Buffer.from(JSON.stringify({ ...ix, v: 2 }))), /index format v2/);
});
