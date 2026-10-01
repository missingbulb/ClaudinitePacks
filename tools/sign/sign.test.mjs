import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DOMAINS, keyId, decodeB64, parsePrivateKey, parsePublicKey, verifyCertificate, signMessage, verifyMessage,
} from './sign.mjs';

const V = JSON.parse(readFileSync(new URL('./testdata/vectors.json', import.meta.url), 'utf8'));
const rootKey = (name) => [decodeB64(V.roots[name].publicKey)];

test('keyId matches the key id vector', () => {
  assert.equal(keyId(decodeB64(V.keyIdVector.publicKey)), V.keyIdVector.keyId);
});

test('the copied domains match the ones sign.mjs uses', () => {
  assert.equal(DOMAINS.certificate, V.domains.certificate);
  assert.equal(DOMAINS.manifest, V.domains.manifest);
  assert.equal(DOMAINS.packIndex, V.domains.packIndex);
});

for (const c of V.certificateCases) {
  test(`certificate case: ${c.name}`, () => {
    const verify = () => verifyCertificate(c.certificate, rootKey(c.root), c.use, new Date(c.now));
    if (c.valid) assert.equal(verify().use, c.use);
    else assert.throws(verify);
  });
}

for (const c of V.messageCases) {
  test(`message case: ${c.name}`, () => {
    const verify = () => verifyMessage(c.signed, decodeB64(c.message), rootKey(c.root), 'manifest', V.domains.manifest, new Date(c.now));
    if (c.valid) assert.equal(verify().use, 'manifest');
    else assert.throws(verify);
  });
}

for (const c of V.packIndexCases) {
  test(`pack index case: ${c.name}`, () => {
    const verify = () => verifyMessage(c.signed, decodeB64(c.index), rootKey(c.root), 'packs', DOMAINS.packIndex, new Date(c.now));
    if (c.valid) assert.equal(verify().use, 'packs');
    else assert.throws(verify);
  });
}

test('re-signing the valid manifest yields the vector signature byte for byte', () => {
  const c = V.messageCases.find((m) => m.name === 'valid signed manifest');
  const key = parsePrivateKey(V.subjects.manifest.seed);
  assert.equal(signMessage(V.domains.manifest, key, decodeB64(c.message)), c.signed.signature);
});

test('a certificate body decodes with its keys in the issuing order', () => {
  const body = JSON.parse(decodeB64(V.certificates.packs.payload).toString('utf8'));
  assert.deepEqual(Object.keys(body), ['v', 'keyId', 'publicKey', 'use', 'issuer', 'notBefore', 'notAfter']);
});

test('key files: vector seeds and public keys parse, a trailing newline is tolerated', () => {
  for (const s of Object.values(V.subjects)) {
    const key = parsePrivateKey(`${s.seed}\n`);
    assert.equal(key.publicKey.toString('base64url'), s.publicKey);
    assert.equal(keyId(parsePublicKey(`${s.publicKey}\n`)), s.keyId);
  }
});

test('key files: padded, wrong-length and non-base64url files are refused', () => {
  const seed = V.subjects.packs.seed;
  const pub = V.subjects.packs.publicKey;
  for (const bad of [`${seed}=`, seed.slice(0, -2), `${seed.slice(0, -1)}+`, '']) assert.throws(() => parsePrivateKey(bad), /private key/);
  for (const bad of [`${pub}=`, pub.slice(0, -2), `${pub.slice(0, -1)}/`, '']) assert.throws(() => parsePublicKey(bad), /public key/);
});

test('the pack-index domain is pinned and separated from the manifest domain', () => {
  assert.equal(DOMAINS.packIndex, 'claudinite-packindex-v1\n');
  const key = parsePrivateKey(V.subjects.packs.seed);
  const message = Buffer.from('{"v":1}\n');
  const signed = { certificate: V.certificates.packs, signature: signMessage(DOMAINS.packIndex, key, message) };
  const now = new Date('2026-01-31T00:00:00Z');
  assert.equal(verifyMessage(signed, message, rootKey('root'), 'packs', DOMAINS.packIndex, now).use, 'packs');
  assert.throws(() => verifyMessage(signed, message, rootKey('root'), 'packs', DOMAINS.manifest, now), /signature does not verify/);
});
