import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { keyId, parsePrivateKey, parsePublicKey, readRoots, verifyCertificate, decodeB64 } from './sign.mjs';

const DEV = new URL('../../keys/dev/', import.meta.url);
const read = (rel) => readFileSync(new URL(rel, DEV), 'utf8');

// The window comes from the certificate's own payload, so these cases do not go red when the
// development certificate expires; dev-key-expiry.yml is what reminds about the renewal.
const cert = () => JSON.parse(read('packs.cert.json'));
const window = () => JSON.parse(decodeB64(cert().payload).toString('utf8'));
const roots = () => readRoots(fileURLToPath(new URL('roots/', DEV)));

test('the development packs certificate verifies against keys/dev/roots for use packs a day after notBefore', () => {
  const body = verifyCertificate(cert(), roots(), 'packs', new Date(Date.parse(window().notBefore) + 86400e3));
  assert.equal(body.use, 'packs');
});

test('the development packs certificate is not valid a second after its notAfter', () => {
  assert.throws(() => verifyCertificate(cert(), roots(), 'packs', new Date(Date.parse(window().notAfter) + 1000)), /certificate has expired/);
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
