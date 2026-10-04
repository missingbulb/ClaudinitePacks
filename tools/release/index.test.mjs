import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { decodeB64, parsePrivateKey } from '../sign/sign.mjs';
import {
  INDEX_KEYS, ENTRY_KEYS, newIndex, addVersion, setChannel, setRevoked, serialize, readIndex,
  signIndex, verifyIndex, assertSerialAdvances, compareVersions, packFields,
} from './index.mjs';

const V = JSON.parse(readFileSync(new URL('../sign/testdata/vectors.json', import.meta.url), 'utf8'));
const ROOTS = [decodeB64(V.roots.root.publicKey)];
const NOW = new Date('2026-01-31T00:00:00Z');
const PACKS_KEY = parsePrivateKey(V.subjects.packs.seed);

const release = (version, extra = {}) => ({
  packJson: { version, minEngineVersion: '1.60101.1', requires: ['acme-dep'], ...extra },
  sha256: 'a'.repeat(64),
  size: 123,
  publishedAt: '2026-01-02T03:04:05Z',
  sourceCommit: 'b'.repeat(40),
});

const three = () => {
  let ix = newIndex('acme-pack');
  for (const v of ['1.60101.1', '1.60101.2', '1.60102.1']) ix = addVersion(ix, release(v));
  return ix;
};

test('newIndex is empty at serial 0; the first addVersion writes serial 1 with a full canary entry', () => {
  const ix = newIndex('acme-pack');
  assert.deepEqual(ix, { v: 1, pack: 'acme-pack', serial: 0, versions: [] });
  const one = addVersion(ix, release('1.60101.1'));
  assert.equal(one.serial, 1);
  assert.deepEqual(one.versions, [{
    version: '1.60101.1',
    sha256: 'a'.repeat(64),
    size: 123,
    minEngineVersion: '1.60101.1',
    requires: ['acme-dep'],
    channel: 'canary',
    revoked: false,
    publishedAt: '2026-01-02T03:04:05Z',
    sourceCommit: 'b'.repeat(40),
  }]);
  assert.deepEqual(ix.versions, [], 'addVersion does not mutate its input');
});

test('addVersion keeps ascending numeric order when a lower version arrives later', () => {
  let ix = addVersion(newIndex('acme-pack'), release('1.60102.1'));
  ix = addVersion(ix, release('1.60101.2'));
  ix = addVersion(ix, release('1.60101.10'));
  assert.deepEqual(ix.versions.map((e) => e.version), ['1.60101.2', '1.60101.10', '1.60102.1']);
  assert.equal(ix.serial, 3);
});

test('compareVersions compares numeric segments, never as floats', () => {
  assert.ok(compareVersions('60928.1', '60928.2') < 0);
  assert.ok(compareVersions('60928.2', '60930.1') < 0);
  assert.ok(compareVersions('60820.10', '60820.1') > 0);
  assert.equal(compareVersions('60101.1', '60101.1'), 0);
});

// The published indexes still hold two-part versions such as 61002.3; one must never outrank a
// <major>.<day>.<n> version when the newest is picked.
test('compareVersions sorts every old-format version below every <major>.<day>.<n> one', () => {
  for (const [a, b] of [['61002.3', '1.61004.1'], ['99999.99', '0.60101.1'], ['61002.3.0', '1.60101.1'], ['0.0.0', '0.60101.1'], ['1.61004.0', '1.60101.1'], ['1.61300.1', '1.60101.1']]) {
    assert.ok(compareVersions(a, b) < 0, `${a} < ${b}`);
    assert.ok(compareVersions(b, a) > 0, `${b} > ${a}`);
  }
  assert.ok(compareVersions('1.61004.2', '1.61004.10') < 0, 'n compares as a number');
  assert.ok(compareVersions('1.61004.9', '1.61005.1') < 0, 'day before n');
  assert.ok(compareVersions('1.61231.9', '2.60101.1') < 0, 'major before day');
  assert.ok(compareVersions('1.0', '1.1') < 0, 'old versions keep their numeric order');
  assert.equal(compareVersions('1.61004.1', '1.61004.1'), 0);
  const sorted = ['1.61004.1', '61002.3', '1.61003.2', '61001.10', '61001.9'].sort(compareVersions);
  assert.deepEqual(sorted, ['61001.9', '61001.10', '61002.3', '1.61003.2', '1.61004.1']);
});

test('addVersion refuses a duplicate version', () => {
  assert.throws(() => addVersion(three(), release('1.60101.2')), /acme-pack 1\.60101\.2 is already published/);
});

test('addVersion refuses a pack.json without a string version or minEngineVersion', () => {
  assert.throws(() => addVersion(newIndex('acme-pack'), release(undefined)), /acme-pack: pack\.json has no string version/);
  assert.throws(() => addVersion(newIndex('acme-pack'), release(60101.1)), /acme-pack: pack\.json has no string version/);
  assert.throws(() => addVersion(newIndex('acme-pack'), release('1.60101.1', { minEngineVersion: undefined })), /acme-pack: pack\.json has no string minEngineVersion/);
});

test('a new version must name its engine as <major>.<day>.<n>; a published entry is left as it is', () => {
  for (const bad of ['60101.1', '60101', '1.60101.1.0', 'v1.60101.1', '1.60101.x', '60101.1.0', '1.60101.0', '1.60100.1', '01.60101.1']) {
    assert.throws(() => addVersion(newIndex('acme-pack'), release('1.60101.1', { minEngineVersion: bad })),
      new RegExp(`acme-pack 1\\.60101\\.1: minEngineVersion "${bad.replace(/\./g, '\\.')}" is not <major>\\.<day>\\.<n>`));
  }
  for (const good of ['1.60101.1', '0.0.0', '12.111231.40']) {
    assert.equal(packFields('acme-pack', { version: '1.60101.1', minEngineVersion: good }, { isNew: true }).minEngineVersion, good);
  }
  assert.equal(packFields('acme-pack', { version: '60101.1', minEngineVersion: '60101.1' }).minEngineVersion, '60101.1');
  const published = { ...three(), versions: three().versions.map((e) => ({ ...e, minEngineVersion: '60101.1' })) };
  const promoted = setRevoked(setChannel(published, '1.60101.2', 'stable'), '1.60101.1', true);
  assert.deepEqual(promoted.versions.map((e) => e.minEngineVersion), ['60101.1', '60101.1', '60101.1']);
  assert.equal(addVersion(published, release('1.60103.1')).versions.at(-1).minEngineVersion, '1.60101.1');
});

test('a new version must be <major>.<day>.<n> itself; a published entry is left as it is', () => {
  for (const bad of ['61004.1', '61004', '0.0.0', '1.61004.1.0', '1.61004.0', '1.61000.1', '01.61004.1']) {
    assert.throws(() => addVersion(newIndex('acme-pack'), release(bad)),
      new RegExp(`acme-pack: pack\\.json version "${bad.replace(/\./g, '\\.')}" is not <major>\\.<day>\\.<n>`));
  }
  for (const good of ['1.61004.1', '0.60101.1', '12.111231.40']) {
    assert.equal(packFields('acme-pack', { version: good, minEngineVersion: '1.60101.1' }, { isNew: true }).version, good);
  }
  assert.equal(packFields('acme-pack', { version: '61002.3', minEngineVersion: '60101.1' }).version, '61002.3');
  const published = { v: 1, pack: 'acme-pack', serial: 1, versions: [{ ...three().versions[0], version: '61002.3' }] };
  assert.equal(readIndex(serialize(published)).versions[0].version, '61002.3');
  const next = addVersion(published, release('1.61004.1'));
  assert.deepEqual(next.versions.map((e) => e.version), ['61002.3', '1.61004.1']);
  assert.equal(setChannel(next, '61002.3', 'stable').versions[0].channel, 'stable');
});

test('addVersion turns absent requires into []', () => {
  const ix = addVersion(newIndex('acme-pack'), release('1.60101.1', { requires: undefined }));
  assert.deepEqual(ix.versions[0].requires, []);
});

test('setChannel and setRevoked bump the serial by one and change nothing else', () => {
  const before = three();
  const promoted = setChannel(before, '1.60101.2', 'stable');
  assert.equal(promoted.serial, before.serial + 1);
  assert.equal(promoted.versions[1].channel, 'stable');
  assert.deepEqual({ ...promoted.versions[1], channel: 'canary' }, before.versions[1]);
  assert.deepEqual([promoted.versions[0], promoted.versions[2]], [before.versions[0], before.versions[2]]);

  const revoked = setRevoked(promoted, '1.60102.1', true);
  assert.equal(revoked.serial, promoted.serial + 1);
  assert.equal(revoked.versions[2].revoked, true);
  assert.deepEqual({ ...revoked.versions[2], revoked: false }, promoted.versions[2]);
  assert.deepEqual(revoked.versions.slice(0, 2), promoted.versions.slice(0, 2));
});

test('setChannel refuses a channel other than canary or stable, and an unknown version', () => {
  assert.throws(() => setChannel(three(), '1.60101.1', 'beta'), /channel/);
  assert.throws(() => setChannel(three(), '1.60199.1', 'stable'), /1\.60199\.1/);
  assert.throws(() => setRevoked(three(), '1.60101.1', 'yes'), /boolean/);
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
  assertSerialAdvances(ix, setChannel(ix, '1.60101.1', 'stable'));
  assert.throws(() => assertSerialAdvances(ix, ix), /serial 3 is not greater than 3/);
  assert.throws(() => assertSerialAdvances(setChannel(ix, '1.60101.1', 'stable'), ix), /serial 3 is not greater than 4/);
});

test('readIndex parses what serialize wrote and refuses another format version', () => {
  const ix = three();
  assert.deepEqual(readIndex(serialize(ix)), ix);
  assert.throws(() => readIndex(Buffer.from(JSON.stringify({ ...ix, v: 2 }))), /index format v2/);
});

test('a rewrite keeps unknown top-level and entry fields: known keys first in format order, unknown after in their order', () => {
  const ix = JSON.parse(serialize(three()).toString('utf8'));
  const withUnknown = { x: { nested: true }, ...ix, z: 1, versions: ix.versions.map((e, i) => (i === 1 ? { y: 'kept', ...e, w: [2] } : e)) };
  const out = JSON.parse(serialize(setChannel(readIndex(Buffer.from(JSON.stringify(withUnknown))), '1.60101.2', 'stable')).toString('utf8'));
  assert.deepEqual(Object.keys(out), [...INDEX_KEYS, 'x', 'z']);
  assert.deepEqual(out.x, { nested: true });
  assert.deepEqual(Object.keys(out.versions[1]), [...ENTRY_KEYS, 'y', 'w']);
  assert.equal(out.versions[1].y, 'kept');
  assert.equal(out.versions[1].channel, 'stable');
  assert.deepEqual(Object.keys(out.versions[0]), ENTRY_KEYS);
});
