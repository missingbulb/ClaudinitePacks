import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { keyId, parsePrivateKey, parsePublicKey, readRoots, verifyCertificate, decodeB64 } from './sign.mjs';

const DEV = new URL('../../keys/dev/', import.meta.url);
const read = (rel) => readFileSync(new URL(rel, DEV), 'utf8');

test('the development packs certificate verifies against keys/dev/roots for use packs today', () => {
  const body = verifyCertificate(JSON.parse(read('packs.cert.json')), readRoots(new URL('roots/', DEV).pathname), 'packs', new Date());
  assert.equal(body.use, 'packs');
});

test('the certified public key is keys/dev/packs.pub, and packs.key is its private half', () => {
  const body = JSON.parse(decodeB64(JSON.parse(read('packs.cert.json')).payload).toString('utf8'));
  const pub = parsePublicKey(read('packs.pub'));
  assert.equal(body.publicKey, pub.toString('base64url'));
  assert.equal(body.keyId, keyId(pub));
  assert.deepEqual(parsePrivateKey(read('packs.key')).publicKey, pub);
});

test('the development roots are the Engine dev root and standby', () => {
  assert.equal(keyId(parsePublicKey(read('roots/root.pub'))), '4e445e16c1bb8d61');
  assert.equal(keyId(parsePublicKey(read('roots/standby.pub'))), '0d8e65ad8093ff2e');
});

test('sign.mjs reaches no key file: it imports only node: modules and names no keys/ path', () => {
  const src = readFileSync(new URL('./sign.mjs', import.meta.url), 'utf8');
  const imports = [...src.matchAll(/^\s*import\b[^'"]*['"]([^'"]+)['"]/gm)].map((m) => m[1]);
  assert.ok(imports.length > 0);
  assert.deepEqual(imports.filter((s) => !s.startsWith('node:')), []);
  assert.doesNotMatch(src, /keys\//);
});
