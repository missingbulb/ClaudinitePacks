// The pack index: `<id>/index.json` on the `vendored` branch, the exact bytes its detached
// signature `<id>/index.sig.json` covers. Every operation returns a new index with the serial
// bumped by one; nothing else re-serializes an index. docs/release.md describes the format.
import { DOMAINS, signMessage, verifyMessage } from '../sign/sign.mjs';

export const INDEX_KEYS = ['v', 'pack', 'serial', 'versions'];
export const ENTRY_KEYS = ['version', 'sha256', 'size', 'minEngineVersion', 'requires', 'channel', 'revoked', 'publishedAt', 'sourceCommit'];
const CHANNELS = ['canary', 'stable'];
const VERSION = /^\d+(\.\d+)*$/;

export class IndexError extends Error {}

export function compareVersions(a, b) {
  const x = a.split('.').map(BigInt);
  const y = b.split('.').map(BigInt);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if (i >= x.length) return -1;
    if (i >= y.length) return 1;
    if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
  }
  return 0;
}

export function newIndex(pack) {
  return { v: 1, pack, serial: 0, versions: [] };
}

const bumped = (index, versions) => ({ ...index, serial: index.serial + 1, versions });

// packJson is `packs/<id>/pack.json` as data; the archive fields come from the build.
export function addVersion(index, { packJson, sha256, size, publishedAt, sourceCommit }) {
  const id = index.pack;
  for (const field of ['version', 'minEngineVersion']) {
    if (typeof packJson?.[field] !== 'string' || !packJson[field]) throw new IndexError(`${id}: pack.json has no string ${field}`);
  }
  const { version, minEngineVersion } = packJson;
  if (!VERSION.test(version)) throw new IndexError(`${id}: pack.json version "${version}" is not dot-separated numbers`);
  const requires = packJson.requires ?? [];
  if (!Array.isArray(requires) || requires.some((r) => typeof r !== 'string')) throw new IndexError(`${id}: pack.json requires is not a list of pack ids`);
  if (index.versions.some((e) => e.version === version)) throw new IndexError(`${id} ${version} is already published`);
  const entry = { version, sha256, size, minEngineVersion, requires: [...requires], channel: 'canary', revoked: false, publishedAt, sourceCommit };
  return bumped(index, [...index.versions, entry].sort((a, b) => compareVersions(a.version, b.version)));
}

function rewriteEntry(index, version, change) {
  if (!index.versions.some((e) => e.version === version)) throw new IndexError(`${index.pack} ${version} is not in the index`);
  return bumped(index, index.versions.map((e) => (e.version === version ? { ...e, ...change } : e)));
}

export function setChannel(index, version, channel) {
  if (!CHANNELS.includes(channel)) throw new IndexError(`channel "${channel}" is neither canary nor stable`);
  return rewriteEntry(index, version, { channel });
}

export function setRevoked(index, version, revoked) {
  if (typeof revoked !== 'boolean') throw new IndexError('revoked is a boolean');
  return rewriteEntry(index, version, { revoked });
}

const ordered = (obj, keys) => Object.fromEntries(keys.map((k) => [k, obj[k]]));

export function serialize(index) {
  const out = ordered(index, INDEX_KEYS);
  out.versions = index.versions.map((e) => ordered(e, ENTRY_KEYS));
  return Buffer.from(JSON.stringify(out, null, 2) + '\n');
}

export function readIndex(bytes) {
  const ix = JSON.parse(Buffer.from(bytes).toString('utf8'));
  if (ix?.v !== 1) throw new IndexError(`index format v${ix?.v} is not supported`);
  if (typeof ix.pack !== 'string' || !Number.isInteger(ix.serial) || !Array.isArray(ix.versions)) throw new IndexError('index is missing pack, serial or versions');
  return ix;
}

export function assertSerialAdvances(previous, next) {
  if (!Number.isInteger(next.serial) || next.serial < 1) throw new IndexError(`serial ${next.serial} is not a positive integer`);
  if (previous && next.serial <= previous.serial) {
    throw new IndexError(`${next.pack}: serial ${next.serial} is not greater than ${previous.serial} already published`);
  }
}

// The content of index.sig.json, in the Engine's manifest.sig.json shape.
export function signIndex(bytes, key, certificate) {
  return { certificate, signature: signMessage(DOMAINS.packIndex, key, bytes) };
}

export function verifyIndex(bytes, signed, roots, now) {
  return verifyMessage(signed, bytes, roots, 'packs', DOMAINS.packIndex, now);
}
