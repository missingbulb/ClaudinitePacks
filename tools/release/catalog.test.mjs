import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parsePrivateKey, readRoots } from '../sign/sign.mjs';
import { CATALOG, CATALOG_SIG, renderCatalog, signCatalog, verifyCatalog, writeCatalog } from './catalog.mjs';
import { put, scratch, testChain } from './test-fixture.mjs';

const entry = (version, channel, extra = {}) => ({
  version, sha256: '0'.repeat(64), size: 1, minEngineVersion: '61001.1.0', requires: [], channel, revoked: false,
  publishedAt: '2026-10-01T00:00:00Z', sourceCommit: '0'.repeat(40), ...extra,
});

// A vendored tree: acme-pack with a revoked newest canary, a stable and an older canary;
// acme-pack-two with one canary and no fingerprint.
function tree() {
  const t = scratch();
  put(t, 'acme-pack/index.json', JSON.stringify({ v: 1, pack: 'acme-pack', serial: 6, versions: [
    entry('61001.1', 'stable'), entry('61001.2', 'canary'), entry('61001.3', 'canary', { revoked: true }), entry('61001.4', 'canary', { requires: ['acme-pack-two'] }),
  ] }));
  const manifest = (version, extra) => JSON.stringify({ version, minEngineVersion: '61001.1.0', ruleRoutingGuidance: { belongs: 'acme widgets', excludes: 'x' }, ...extra });
  const detector = { about: 'an acme.json', paths: '^acme\\.json$', text: { source: '"acme"\\s*:', flags: 'i' }, search: ['acme'] };
  const questions = [{ id: 'goals', prompt: 'What for?', distill: 'one line' }];
  for (const v of ['61001.1', '61001.2', '61001.3']) put(t, `acme-pack/${v}/pack.json`, manifest(v, { relevanceDetector: detector }));
  put(t, 'acme-pack/61001.4/pack.json', manifest('61001.4', { relevanceDetector: { ...detector, text: ['acme', { source: 'b', flags: '' }] }, questions }));
  put(t, 'acme-pack-two/index.json', JSON.stringify({ v: 1, pack: 'acme-pack-two', serial: 1, versions: [entry('61001.1', 'canary')] }));
  put(t, 'acme-pack-two/61001.1/pack.json', JSON.stringify({ version: '61001.1', minEngineVersion: '61001.1.0' }));
  return t;
}

test('the catalog offers each pack\'s newest stable and canary version that is not revoked, its serial the indexes\' sum', () => {
  const c = JSON.parse(renderCatalog(tree()).toString('utf8'));
  assert.deepEqual(Object.keys(c), ['v', 'serial', 'packs']);
  assert.equal(c.v, 1);
  assert.equal(c.serial, 7);
  assert.deepEqual(c.packs.map((p) => `${p.id} ${p.version} ${p.channel}`), ['acme-pack 61001.1 stable', 'acme-pack 61001.4 canary', 'acme-pack-two 61001.1 canary']);
  const [stable, canary, two] = c.packs;
  assert.deepEqual(Object.keys(canary), ['id', 'version', 'channel', 'minEngineVersion', 'requires', 'relevanceDetector', 'belongs', 'questions']);
  assert.deepEqual(canary.requires, ['acme-pack-two']);
  assert.equal(canary.belongs, 'acme widgets');
  assert.deepEqual(canary.questions, [{ id: 'goals', prompt: 'What for?' }]);
  assert.equal(stable.questions, undefined, 'no questions, no key');
  assert.equal(two.relevanceDetector, null);
  assert.equal(two.belongs, undefined);
});

test('every fingerprint pattern is written as {source, flags}, and text as a list', () => {
  const [stable, canary] = JSON.parse(renderCatalog(tree()).toString('utf8')).packs;
  assert.deepEqual(stable.relevanceDetector, { about: 'an acme.json', paths: { source: '^acme\\.json$', flags: '' }, text: [{ source: '"acme"\\s*:', flags: 'i' }], search: ['acme'] });
  assert.deepEqual(canary.relevanceDetector.text, [{ source: 'acme', flags: '' }, { source: 'b', flags: '' }]);
});

test('a branch with no index has no catalog', () => {
  assert.equal(renderCatalog(scratch()), null);
});

test('the catalog is signed for use packs under its own domain, and written beside the indexes', () => {
  const chain = testChain(scratch());
  const key = parsePrivateKey(readFileSync(chain.key, 'utf8'));
  const t = tree();
  assert.equal(writeCatalog(t, key, chain.certificate), 7);
  const bytes = readFileSync(join(t, CATALOG));
  const signed = JSON.parse(readFileSync(join(t, CATALOG_SIG), 'utf8'));
  assert.equal(verifyCatalog(bytes, signed, readRoots(chain.roots), new Date()).keyId, chain.keyId);
  assert.throws(() => verifyCatalog(Buffer.concat([bytes, Buffer.from(' ')]), signed, readRoots(chain.roots), new Date()), /signature does not verify/);
  assert.deepEqual(signCatalog(bytes, key, chain.certificate).certificate, chain.certificate);
});
