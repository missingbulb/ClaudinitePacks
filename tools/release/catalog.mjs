// The shelf's catalog: `catalog.json` at the root of the `vendored` branch, the exact bytes its
// detached signature `catalog.sig.json` covers. It is derived, never edited: for every pack on the
// branch, its newest stable and its newest canary version that is not revoked, with the manifest
// fields the fleet reads and the per-pack index does not carry (the fingerprint, what the pack is
// for, its adoption questions). Publish, promote and revoke rewrite it in the same commit as the
// index they change; its serial is the sum of the indexes'. docs/release.md describes the format.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DOMAINS, signMessage, verifyMessage } from '../sign/sign.mjs';
import { compareVersions, readIndex } from './index.mjs';

export const CATALOG = 'catalog.json';
export const CATALOG_SIG = 'catalog.sig.json';
const CHANNELS = ['stable', 'canary'];

const DETECTOR_KEYS = ['about', 'paths', 'text', 'search'];
const MAX_SEARCH_TERMS = 6;

// A manifest pattern, a string or {source, flags}, in the catalog's one form.
const pattern = (p) => (typeof p === 'string' ? { source: p, flags: '' } : { source: String(p?.source ?? ''), flags: String(p?.flags ?? '') });

const isPattern = (p) => typeof p === 'string'
  || (p !== null && typeof p === 'object' && !Array.isArray(p) && typeof p.source === 'string' && (p.flags === undefined || typeof p.flags === 'string'));

// A manifest's relevanceDetector judged as the engine's catalog reader judges it: each problem
// as the sentence `cn fleet decide detector` prints, none for a well-formed detector or none at
// all. A string pattern is accepted, since the catalog writes it as {source, flags}.
export function validateDetector(d) {
  if (d === undefined || d === null) return [];
  if (typeof d !== 'object' || Array.isArray(d)) return ['relevanceDetector is an object or null'];
  const errs = [];
  for (const k of Object.keys(d)) {
    if (!DETECTOR_KEYS.includes(k)) errs.push(`relevanceDetector declares ${JSON.stringify(k)}, which is not one of ${DETECTOR_KEYS.join(', ')}`);
  }
  if (typeof d.about !== 'string' || !d.about.trim()) errs.push('relevanceDetector.about names what is found, in words');
  const all = [];
  if (isPattern(d.paths)) all.push(d.paths);
  else errs.push('relevanceDetector.paths is a RegExp over tracked paths');
  const text = d.text === undefined || d.text === null ? [] : Array.isArray(d.text) ? d.text : [d.text];
  if (text.every(isPattern)) all.push(...text);
  else {
    all.push(...text.filter(isPattern));
    errs.push('relevanceDetector.text is a RegExp or a list of them');
  }
  if (all.some((p) => typeof p === 'object' && /[gy]/.test(p.flags ?? ''))) errs.push('a relevanceDetector pattern carries the g or y flag, which makes .test stateful');
  const isList = Array.isArray(d.search);
  if (text.length && !(isList && d.search.length && d.search.every((s) => typeof s === 'string' && s.trim()))) {
    errs.push('relevanceDetector.search lists the code-search terms that find every file relevanceDetector.text matches');
  }
  if (isList && d.search.length > MAX_SEARCH_TERMS) errs.push(`relevanceDetector.search names ${d.search.length} terms; one code search joins at most six`);
  return errs;
}

export class CatalogError extends Error {}

function detector(d) {
  if (!d || typeof d !== 'object') return null;
  const out = { about: d.about, paths: pattern(d.paths) };
  if (d.text !== undefined && d.text !== null) out.text = (Array.isArray(d.text) ? d.text : [d.text]).map(pattern);
  if (d.search !== undefined) out.search = d.search;
  return out;
}

function entry(tree, id, e) {
  const manifest = JSON.parse(readFileSync(join(tree, id, e.version, 'pack.json'), 'utf8'));
  const problems = validateDetector(manifest.relevanceDetector);
  if (problems.length) throw new CatalogError(`${id} ${e.version}: ${problems.join('; ')}`);
  const out = {
    id, version: e.version, channel: e.channel, minEngineVersion: e.minEngineVersion, requires: e.requires ?? [],
    relevanceDetector: detector(manifest.relevanceDetector),
  };
  const belongs = manifest.ruleRoutingGuidance?.belongs;
  if (typeof belongs === 'string' && belongs) out.belongs = belongs;
  if (Array.isArray(manifest.questions) && manifest.questions.length) out.questions = manifest.questions.map((q) => ({ id: q.id, prompt: q.prompt }));
  return out;
}

// The catalog's bytes for the vendored tree at `tree`, or null when it holds no pack index. A
// fingerprint the engine's reader would refuse throws, naming the pack and version.
export function renderCatalog(tree) {
  const ids = readdirSync(tree, { withFileTypes: true }).filter((d) => d.isDirectory() && existsSync(join(tree, d.name, 'index.json')))
    .map((d) => d.name).sort();
  if (!ids.length) return null;
  const catalog = { v: 1, serial: 0, packs: [] };
  for (const id of ids) {
    const ix = readIndex(readFileSync(join(tree, id, 'index.json')));
    catalog.serial += ix.serial;
    for (const channel of CHANNELS) {
      const newest = ix.versions.filter((e) => e.channel === channel && !e.revoked).sort((a, b) => compareVersions(b.version, a.version))[0];
      if (newest) catalog.packs.push(entry(tree, id, newest));
    }
  }
  return Buffer.from(JSON.stringify(catalog, null, 2) + '\n');
}

export function signCatalog(bytes, key, certificate) {
  return { certificate, signature: signMessage(DOMAINS.packCatalog, key, bytes) };
}

export function verifyCatalog(bytes, signed, roots, now) {
  return verifyMessage(signed, bytes, roots, 'packs', DOMAINS.packCatalog, now);
}

// Writes the catalog and its signature into the vendored tree; returns its serial, or null when
// the tree holds no pack.
export function writeCatalog(tree, key, certificate) {
  const bytes = renderCatalog(tree);
  if (!bytes) return null;
  writeFileSync(join(tree, CATALOG), bytes);
  writeFileSync(join(tree, CATALOG_SIG), JSON.stringify(signCatalog(bytes, key, certificate), null, 2) + '\n');
  return JSON.parse(bytes.toString('utf8')).serial;
}
