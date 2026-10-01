// The R2 half of a pack release: the Cloudflare API setup, an S3 client signed with SigV4, the
// upload of every object the `vendored` branch holds, and the read-back through the CDN.
//
// Sources this follows (read 2026-10-01):
// - Credentials: developers.cloudflare.com/r2/api/tokens/ ("Get S3 API credentials from an API
//   token"): the Access Key ID is the token's id, the Secret Access Key the SHA-256 of its value;
//   the id comes from GET /user/tokens/verify (api/resources/user/subresources/tokens/methods/verify),
//   since #1 minted a user token.
// - The S3 endpoint https://<account>.r2.cloudflarestorage.com, region `auto`, and PutObject
//   honouring If-None-Match: developers.cloudflare.com/r2/api/s3/api/.
// - Setup: GET and POST /accounts/{id}/r2/buckets[/{name}], GET /zones?name=, and GET and POST
//   /accounts/{id}/r2/buckets/{name}/domains/custom[/{domain}] (api/resources/r2/...): an existing
//   bucket or domain is read first, so a repeat run creates nothing.
// - SigV4: the AWS S3 API reference's header-based examples; sigv4.test-vectors.json carries them.
//
// Imports only node: modules, ../sign and ./index.mjs: it runs beside the Cloudflare token and
// must never load pack code or tools/vendor. No request logs a header.
import { createHash, createHmac } from 'node:crypto';
import { DOMAINS, verifyMessage } from '../sign/sign.mjs';
import { readIndex } from './index.mjs';

export const BUCKET = 'claudinite-packs';
export const DOMAIN = 'packs.claudinite.com';
const ZONE = 'claudinite.com';
const API = 'https://api.cloudflare.com/client/v4';
const ARCHIVE_META = { contentType: 'application/gzip', cacheControl: 'public, max-age=31536000, immutable' };
const INDEX_META = { contentType: 'application/json', cacheControl: 'public, max-age=300' };

export class R2Error extends Error {
  constructor(message, { race = false } = {}) {
    super(message);
    this.race = race;
  }
}

const sha256 = (b) => createHash('sha256').update(b).digest('hex');
const hmac = (key, data) => createHmac('sha256', key).update(data).digest();

export function deriveCredentials({ id, value }) {
  return { accessKeyId: id, secretAccessKey: sha256(value) };
}

const encodeSegment = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

// AWS Signature Version 4 for one request. `headers` are the ones sent besides host and the two
// x-amz ones this adds; every one is signed. Returns the headers to send, host excluded.
export function signV4({ method, host, path, query = '', headers, payloadHash, credentials, region, service, amzDate }) {
  const all = { ...Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), String(v).trim()])), host, 'x-amz-content-sha256': payloadHash, 'x-amz-date': amzDate };
  const names = Object.keys(all).sort();
  const signedHeaders = names.join(';');
  const canonicalRequest = [
    method,
    path.split('/').map(encodeSegment).join('/'),
    query,
    ...names.map((n) => `${n}:${all[n]}`),
    '',
    signedHeaders,
    payloadHash,
  ].join('\n');
  const day = amzDate.slice(0, 8);
  const scope = `${day}/${region}/${service}/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256(canonicalRequest)].join('\n');
  let key = hmac(`AWS4${credentials.secretAccessKey}`, day);
  for (const part of [region, service, 'aws4_request']) key = hmac(key, part);
  const signature = createHmac('sha256', key).update(stringToSign).digest('hex');
  const { host: _host, ...send } = all;
  send.authorization = `AWS4-HMAC-SHA256 Credential=${credentials.accessKeyId}/${scope},SignedHeaders=${signedHeaders},Signature=${signature}`;
  return { canonicalRequest, stringToSign, signature, headers: send };
}

const amzDateOf = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

async function failure(what, res) {
  let body = '';
  try { body = (await res.text()).slice(0, 2000); } catch { /* no body */ }
  return `${what}: ${res.status} ${res.statusText} ${body}`.trim();
}

// get(key) -> Buffer | null on 404; put(key, body, meta) where a 412 is a race, never retried.
export function s3Bucket({ accountId, bucket, credentials, fetch = globalThis.fetch, clock = () => new Date() }) {
  const host = `${accountId}.r2.cloudflarestorage.com`;
  const request = (method, key, { body, headers = {} } = {}) => {
    const path = `/${bucket}/${key}`;
    const { headers: send } = signV4({
      method, host, path, headers, payloadHash: sha256(body ?? Buffer.alloc(0)), credentials, region: 'auto', service: 's3', amzDate: amzDateOf(clock()),
    });
    return fetch(`https://${host}${path.split('/').map(encodeSegment).join('/')}`, { method, headers: send, body });
  };
  return {
    async get(key) {
      const res = await request('GET', key);
      if (res.status === 404) return null;
      if (!res.ok) throw new R2Error(await failure(`GET ${key}`, res));
      return Buffer.from(await res.arrayBuffer());
    },
    async put(key, body, { contentType, cacheControl, ifNoneMatch }) {
      const headers = { 'content-type': contentType, 'cache-control': cacheControl, ...(ifNoneMatch ? { 'if-none-match': ifNoneMatch } : {}) };
      const res = await request('PUT', key, { body, headers });
      if (res.status === 412) throw new R2Error(await failure(`PUT ${key}`, res), { race: true });
      if (!res.ok) throw new R2Error(await failure(`PUT ${key}`, res));
    },
  };
}

// Every object the branch says R2 must hold, per pack: each version's archive, then index.json and
// index.sig.json. read(path) returns a branch file's bytes.
export function branchObjects(read, ids) {
  const objects = [];
  for (const id of ids) {
    const indexBytes = read(`${id}/index.json`);
    const ix = readIndex(indexBytes);
    for (const e of ix.versions) objects.push({ id, kind: 'archive', key: `packs/${id}/${e.version}.tar.gz`, version: e.version, body: read(`${id}/${e.version}.tar.gz`) });
    objects.push({ id, kind: 'index', key: `packs/${id}/index.json`, serial: ix.serial, body: indexBytes });
    objects.push({ id, kind: 'sig', key: `packs/${id}/index.sig.json`, serial: ix.serial, body: read(`${id}/index.sig.json`) });
  }
  return objects;
}

// Compares every object with the bucket. An archive is written once: present with other bytes
// fails the whole plan before anything is written. The index pair is rewritten when it differs,
// index.json first.
export async function planUpload(objects, bucket) {
  const actions = [];
  const conflicts = [];
  let indexPut = new Set();
  for (const o of objects) {
    const current = await bucket.get(o.key);
    const same = current !== null && Buffer.compare(current, o.body) === 0;
    if (o.kind === 'archive' && current !== null && !same) {
      conflicts.push(`${o.key} is on R2 with sha256 ${sha256(current)}; the branch has sha256 ${sha256(o.body)}`);
    }
    const put = o.kind === 'sig' ? !same || indexPut.has(o.id) : current === null || (o.kind === 'index' && !same);
    if (o.kind === 'index' && put) indexPut.add(o.id);
    actions.push({ ...o, put });
  }
  if (conflicts.length) throw new R2Error(`refusing to overwrite a published archive:\n${conflicts.join('\n')}`);
  return actions;
}

export async function applyUpload(actions, bucket, log) {
  for (const a of actions.filter((x) => x.put)) {
    try {
      await bucket.put(a.key, a.body, a.kind === 'archive' ? { ...ARCHIVE_META, ifNoneMatch: '*' } : { ...INDEX_META });
    } catch (e) {
      if (!e.race) throw e;
      throw new R2Error(`${a.key} was created by another writer while this run uploaded (a race; the concurrency group should prevent it); not retried as an overwrite: ${e.message}`, { race: true });
    }
    log(`PUT ${a.key}`);
  }
}

// Reads every object back through the CDN, the index pair with ?s=<serial> so the 300-second
// cache cannot answer with the previous serial, and verifies each index's signature.
export async function verifyCdn(objects, { fetch = globalThis.fetch, base = `https://${DOMAIN}`, roots, now = new Date(), log }) {
  const problems = [];
  const byPack = new Map();
  for (const o of objects) {
    const url = `${base}/${o.key}${o.serial !== undefined ? `?s=${o.serial}` : ''}`;
    const res = await fetch(url);
    if (!res.ok) { problems.push(await failure(`CDN ${o.key}`, res)); continue; }
    const got = Buffer.from(await res.arrayBuffer());
    if (Buffer.compare(got, o.body) !== 0) problems.push(`CDN ${o.key} differs from the branch: sha256 ${sha256(got)}, branch ${sha256(o.body)}`);
    if (!byPack.has(o.id)) byPack.set(o.id, {});
    byPack.get(o.id)[o.kind] = got;
  }
  for (const [id, got] of byPack) {
    if (!got.index || !got.sig) continue;
    try {
      verifyMessage(JSON.parse(got.sig.toString('utf8')), got.index, roots, 'packs', DOMAINS.packIndex, now);
    } catch (e) {
      problems.push(`CDN packs/${id}/index.json: ${e.message}`);
    }
  }
  if (problems.length) throw new R2Error(`the CDN does not serve the branch:\n${problems.join('\n')}`);
  for (const id of byPack.keys()) log(`verify-cdn ${id} ok`);
}

async function cloudflare(fetch, token, method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return res;
}

async function expectOk(what, res) {
  if (!res.ok) throw new R2Error(await failure(what, res));
  return (await res.json()).result;
}

// Idempotent: reads the bucket and the custom domain and creates only what is absent. Returns the
// token's id, which the S3 credentials need.
export async function setup({ accountId, token, bucket = BUCKET, domain = DOMAIN, zone = ZONE, fetch = globalThis.fetch, log }) {
  const cf = (method, path, body) => cloudflare(fetch, token, method, path, body);
  const verified = await expectOk('GET /user/tokens/verify', await cf('GET', '/user/tokens/verify'));
  if (!verified?.id) throw new R2Error('GET /user/tokens/verify returned no token id');

  const b = await cf('GET', `/accounts/${accountId}/r2/buckets/${bucket}`);
  if (b.status === 404) {
    await expectOk(`POST /accounts/…/r2/buckets ${bucket}`, await cf('POST', `/accounts/${accountId}/r2/buckets`, { name: bucket }));
    log(`created bucket ${bucket}`);
  } else {
    await expectOk(`GET bucket ${bucket}`, b);
    log(`bucket ${bucket} exists`);
  }

  const zones = await expectOk(`GET /zones?name=${zone}`, await cf('GET', `/zones?name=${encodeURIComponent(zone)}`));
  const zoneId = zones?.find((z) => z.name === zone)?.id;
  if (!zoneId) throw new R2Error(`the token sees no zone named ${zone}`);

  const d = await cf('GET', `/accounts/${accountId}/r2/buckets/${bucket}/domains/custom/${domain}`);
  if (d.status === 404) {
    await expectOk(`POST custom domain ${domain}`, await cf('POST', `/accounts/${accountId}/r2/buckets/${bucket}/domains/custom`, { domain, zoneId, enabled: true }));
    log(`attached ${domain} to ${bucket}`);
  } else {
    const current = await expectOk(`GET custom domain ${domain}`, d);
    if (current?.enabled !== true) throw new R2Error(`custom domain ${domain} is attached to ${bucket} but not enabled; enable it in the R2 bucket settings`);
    log(`${domain} serves ${bucket}`);
  }
  return { tokenId: verified.id };
}

// The reason a real upload cannot start, or null when both Cloudflare variables are set.
export function missingCredentials(env) {
  return env.CLOUDFLARE_API_TOKEN && env.CLOUDFLARE_ACCOUNT_ID ? null : 'uploading to R2 needs CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID in the environment';
}

const describe = (o) => (o.kind === 'archive' ? `${o.key} (${o.body.length} bytes, sha256 ${sha256(o.body)})` : o.key);

// The whole upload: target is a bucket name or `dry-run`. Returns, per pack, the keys it PUT and
// the keys it skipped.
export async function runUpload({ objects, target, env, fetch = globalThis.fetch, roots, now, log }) {
  const ids = [...new Set(objects.map((o) => o.id))];
  if (target === 'dry-run') {
    for (const o of objects) log(`would PUT ${describe(o)}`);
    return ids.map((id) => ({ id, put: [], skipped: [] }));
  }
  const missing = missingCredentials(env);
  if (missing) throw new R2Error(missing);
  const token = env.CLOUDFLARE_API_TOKEN;
  const accountId = env.CLOUDFLARE_ACCOUNT_ID;
  const { tokenId } = await setup({ accountId, token, bucket: target, fetch, log });
  const bucket = s3Bucket({ accountId, bucket: target, credentials: deriveCredentials({ id: tokenId, value: token }), fetch });
  const actions = await planUpload(objects, bucket);
  await applyUpload(actions, bucket, log);
  await verifyCdn(objects, { fetch, roots, now, log });
  return ids.map((id) => ({
    id,
    put: actions.filter((a) => a.id === id && a.put).map((a) => a.key),
    skipped: actions.filter((a) => a.id === id && !a.put).map((a) => a.key),
  }));
}
