#!/usr/bin/env node
// testdata/vectors.json is a copy of ClaudiniteEngine's shared/sign/testdata/vectors.json at Engine
// commit 888a71f9a8379d35a60bf7dbbdd2b729077ae659; regenerate it there with
// `go test ./shared/sign -run TestVectorsFileIsCurrent -update` and copy the file here whole.
//
// The Engine's Ed25519 signing chain (shared/sign/sign.go), byte-compatible with it: key files,
// key ids, use-named certificates issued by a root, and detached signatures over
// domain || SHA-512(message). Issuing certificates is cn-keys' job and is not done here.
//
//   node tools/sign/sign.mjs keyid <key.pub>
//   node tools/sign/sign.mjs verify-cert --roots <dir> [--use packs] <cert.json>
//   node tools/sign/sign.mjs verify-index --roots <dir> <index.json> <index.sig.json>
//
// A roots directory holds `*.pub` key files. Imports nothing outside Node's standard library.
import { createHash, createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const DOMAINS = Object.freeze({
  certificate: 'claudinite-cert-v1\n',
  manifest: 'claudinite-manifest-v1\n',
  packIndex: 'claudinite-packindex-v1\n',
});

const MAX_VALIDITY_DAYS = { manifest: 365, packs: 90, license: 90, 'license-public': 90 };
const ABSOLUTE_MAX_VALIDITY_MS = 400 * 24 * 3600 * 1000;
const BODY_FIELDS = { v: 'number', keyId: 'string', publicKey: 'string', use: 'string', issuer: 'string', notBefore: 'string', notAfter: 'string' };
const PKCS8_ED25519_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');
const SPKI_ED25519_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');
const RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

export class SignError extends Error {}

// Unpadded base64url, refusing padding and any other alphabet.
export function decodeB64(s) {
  if (typeof s !== 'string' || !/^[A-Za-z0-9_-]*$/.test(s) || s.length % 4 === 1) throw new SignError('not unpadded base64url');
  return Buffer.from(s, 'base64url');
}

export const encodeB64 = (buf) => Buffer.from(buf).toString('base64url');

export function keyId(publicKey) {
  return createHash('sha256').update(publicKey).digest('hex').slice(0, 16);
}

const privateKeyObject = (seed) => createPrivateKey({ key: Buffer.concat([PKCS8_ED25519_PREFIX, seed]), format: 'der', type: 'pkcs8' });
const publicKeyObject = (raw) => createPublicKey({ key: Buffer.concat([SPKI_ED25519_PREFIX, raw]), format: 'der', type: 'spki' });

// A key file as cn-keys writes it: the base64url seed and a newline. Returns the seed and its public key.
export function parsePrivateKey(text) {
  let seed;
  try { seed = decodeB64(String(text).trim()); } catch { seed = null; }
  if (!seed || seed.length !== 32) throw new SignError('not an Ed25519 private key file');
  const spki = createPublicKey(privateKeyObject(seed)).export({ format: 'der', type: 'spki' });
  return { seed, publicKey: spki.subarray(SPKI_ED25519_PREFIX.length) };
}

export function parsePublicKey(text) {
  let raw;
  try { raw = decodeB64(String(text).trim()); } catch { raw = null; }
  if (!raw || raw.length !== 32) throw new SignError('not an Ed25519 public key file');
  return raw;
}

export function readRoots(dir) {
  const names = readdirSync(dir).filter((n) => n.endsWith('.pub')).sort();
  if (!names.length) throw new SignError(`${dir} holds no .pub root key`);
  return names.map((n) => {
    try { return parsePublicKey(readFileSync(join(dir, n), 'utf8')); } catch (e) { throw new SignError(`${join(dir, n)}: ${e.message}`); }
  });
}

// In the order Certificate.Verify checks; returns the decoded body.
export function verifyCertificate(cert, roots, use, now) {
  let body;
  try { body = decodeB64(cert?.payload); } catch (e) { throw new SignError(`certificate payload: ${e.message}`); }
  let sig;
  try { sig = decodeB64(cert?.signature); } catch { sig = null; }
  if (!sig || sig.length !== 64) throw new SignError('certificate signature is malformed');
  let b;
  try { b = JSON.parse(body.toString('utf8')); } catch (e) { throw new SignError(`certificate body: ${e.message}`); }
  if (!b || typeof b !== 'object' || Array.isArray(b)) throw new SignError('certificate body is not an object');
  for (const [k, v] of Object.entries(b)) {
    if (!(k in BODY_FIELDS)) throw new SignError(`certificate body: unknown field "${k}"`);
    if (typeof v !== BODY_FIELDS[k]) throw new SignError(`certificate body: ${k} is not a ${BODY_FIELDS[k]}`);
  }
  const signer = roots.find((r) => keyId(r) === b.issuer);
  if (!signer || !verify(null, Buffer.concat([Buffer.from(DOMAINS.certificate), body]), publicKeyObject(signer), sig)) {
    throw new SignError('certificate is not signed by a trusted root');
  }
  if (b.v !== 1) throw new SignError(`certificate version ${b.v} is not supported`);
  if (!(b.use in MAX_VALIDITY_DAYS) || b.use !== use) throw new SignError(`certificate use "${b.use}", want "${use}"`);
  if (keyId(subjectOf(b)) !== b.keyId) throw new SignError('certificate keyId does not match its public key');
  if (!RFC3339.test(b.notBefore ?? '') || !RFC3339.test(b.notAfter ?? '')) throw new SignError('certificate validity times are malformed');
  const nb = Date.parse(b.notBefore);
  const na = Date.parse(b.notAfter);
  if (!(na > nb) || na - nb > ABSOLUTE_MAX_VALIDITY_MS) throw new SignError('certificate validity exceeds 400 days');
  if (now.getTime() < nb) throw new SignError('certificate is not yet valid');
  if (now.getTime() > na) throw new SignError('certificate has expired');
  return b;
}

function subjectOf(body) {
  let p;
  try { p = decodeB64(body.publicKey ?? ''); } catch { p = null; }
  if (!p || p.length !== 32) throw new SignError('certificate public key is malformed');
  return p;
}

const messageDigest = (domain, message) => Buffer.concat([Buffer.from(domain), createHash('sha512').update(message).digest()]);

// The detached signature over domain || SHA-512(message), base64url.
export function signMessage(domain, key, message) {
  return encodeB64(sign(null, messageDigest(domain, message), privateKeyObject(key.seed)));
}

// Verifies signed = {certificate, signature}: the certificate for use against roots, then the
// signature by its subject over domain || SHA-512(message). Returns the certificate body.
export function verifyMessage(signed, message, roots, use, domain, now) {
  const b = verifyCertificate(signed?.certificate, roots, use, now);
  let sig;
  try { sig = decodeB64(signed.signature); } catch { sig = null; }
  if (!sig || sig.length !== 64 || !verify(null, messageDigest(domain, message), publicKeyObject(subjectOf(b)), sig)) {
    throw new SignError('signature does not verify');
  }
  return b;
}

function takeFlag(args, name) {
  const i = args.indexOf(name);
  if (i < 0) return undefined;
  const [, value] = args.splice(i, 2);
  if (value === undefined) throw new SignError(`${name} needs a value`);
  return value;
}

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

function main(argv) {
  const [cmd, ...args] = argv;
  if (cmd === 'keyid' && args.length === 1) {
    console.log(keyId(parsePublicKey(readFileSync(args[0], 'utf8'))));
    return 0;
  }
  if (cmd === 'verify-cert' || cmd === 'verify-index') {
    const rootsDir = takeFlag(args, '--roots');
    const use = takeFlag(args, '--use') ?? 'packs';
    if (!rootsDir) throw new SignError(`${cmd} needs --roots <dir>`);
    const roots = readRoots(rootsDir);
    if (cmd === 'verify-cert' && args.length === 1) {
      const b = verifyCertificate(readJson(args[0]), roots, use, new Date());
      console.log(`valid ${b.keyId} for ${b.use} until ${b.notAfter}, issuer ${b.issuer}`);
      return 0;
    }
    if (cmd === 'verify-index' && args.length === 2) {
      const b = verifyMessage(readJson(args[1]), readFileSync(args[0]), roots, 'packs', DOMAINS.packIndex, new Date());
      console.log(`valid ${args[0]} signed by ${b.keyId}`);
      return 0;
    }
  }
  console.error('usage: sign.mjs keyid <key.pub> | verify-cert --roots <dir> [--use packs] <cert.json> | verify-index --roots <dir> <index.json> <index.sig.json>');
  return 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (e) {
    if (!(e instanceof SignError) && !(e instanceof SyntaxError) && e.code !== 'ENOENT') throw e;
    console.error(`sign.mjs: ${e.message}`);
    process.exitCode = 1;
  }
}
