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
    // The object's ETag, or null when it is absent. Asking for the identity encoding keeps the
    // ETag strong: fetch otherwise accepts gzip and br, Cloudflare then compresses a compressible
    // type such as application/json and answers W/"<md5>", which no longer equals the MD5.
    async head(key) {
      const res = await request('HEAD', key, { headers: { 'accept-encoding': 'identity' } });
      if (res.status === 404) return null;
      if (!res.ok) throw new R2Error(await failure(`HEAD ${key}`, res));
      return { etag: res.headers.get('etag') };
    },
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
// index.json first. Each action records how it was compared: `etag` when R2's ETag is the quoted
// MD5 hex of the branch bytes (a single PUT's ETag), so nothing is downloaded; `get` when the ETag
// says nothing (a multipart upload, other bytes, a bucket without head) and the bytes are fetched;
// `absent` when the object is not there.
export async function planUpload(objects, bucket) {
  const actions = [];
  const conflicts = [];
  let indexPut = new Set();
  for (const o of objects) {
    const meta = bucket.head ? await bucket.head(o.key) : undefined;
    let compared = 'absent';
    let current = null;
    if (meta && meta.etag === `"${createHash('md5').update(o.body).digest('hex')}"`) {
      compared = 'etag';
      current = o.body;
    } else if (meta !== null) {
      current = await bucket.get(o.key);
      if (current !== null) compared = 'get';
    }
    const same = current !== null && Buffer.compare(current, o.body) === 0;
    if (o.kind === 'archive' && current !== null && !same) {
      conflicts.push(`${o.key} is on R2 with sha256 ${sha256(current)}; the branch has sha256 ${sha256(o.body)}`);
    }
    const put = o.kind === 'sig' ? !same || indexPut.has(o.id) : current === null || (o.kind === 'index' && !same);
    if (o.kind === 'index' && put) indexPut.add(o.id);
    actions.push({ ...o, put, compared });
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

// How long verify-cdn keeps retrying a domain this run attached, and its backoff.
export const PROVISIONING_WINDOW_MS = 5 * 60e3;
const FIRST_WAIT_MS = 5e3;
const LONGEST_WAIT_MS = 60e3;

// Reads every object back through the CDN, the index pair with ?s=<serial> so no cache rule can
// answer with the previous serial, and verifies each index's signature, under the domain its
// object names (the catalog's) or the pack index's. With retry (the run that
// attached the custom domain, which answers 403 or 404 until Cloudflare has provisioned it, and
// whose name may not resolve yet, so fetch rejects), a 403, a 404 or a rejected fetch is retried
// with doubling waits until retry.windowMs has passed since the first read; without it, every
// failure is final at once.
export async function verifyCdn(objects, { fetch = globalThis.fetch, base = `https://${DOMAIN}`, roots, now = new Date(), log, retry }) {
  const problems = [];
  const byPack = new Map();
  const started = retry?.clock();
  let wait = FIRST_WAIT_MS;
  const read = async (o, url) => {
    for (;;) {
      let res;
      let thrown;
      try {
        res = await fetch(url);
      } catch (e) {
        if (!retry) throw e;
        thrown = [e.message, e.cause?.message].filter(Boolean).join(': ');
      }
      if (res && (res.ok || !retry || (res.status !== 403 && res.status !== 404))) return res;
      if (retry.clock() - started + wait > retry.windowMs) {
        const what = res ? await failure(`CDN ${o.key}`, res) : `CDN ${o.key}: ${thrown}`;
        return { gaveUp: `${what} (still failing ${Math.round((retry.clock() - started) / 1000)}s after this run attached the domain; that is a statement about the clock, not about the objects)` };
      }
      log(`verify-cdn ${o.key}: ${res ? res.status : thrown}, retrying in ${wait / 1000}s while the custom domain attached this run provisions`);
      await retry.sleep(wait);
      wait = Math.min(wait * 2, LONGEST_WAIT_MS);
    }
  };
  for (const o of objects) {
    const url = `${base}/${o.key}${o.serial !== undefined ? `?s=${o.serial}` : ''}`;
    const res = await read(o, url);
    if (res.gaveUp) { problems.push(res.gaveUp); continue; }
    if (!res.ok) { problems.push(await failure(`CDN ${o.key}`, res)); continue; }
    const got = Buffer.from(await res.arrayBuffer());
    if (Buffer.compare(got, o.body) !== 0) problems.push(`CDN ${o.key} differs from the branch: sha256 ${sha256(got)}, branch ${sha256(o.body)}`);
    if (!byPack.has(o.id)) byPack.set(o.id, {});
    byPack.get(o.id)[o.kind] = got;
    if (o.kind === 'index') Object.assign(byPack.get(o.id), { domain: o.domain, key: o.key });
  }
  for (const [id, got] of byPack) {
    if (!got.index || !got.sig) continue;
    try {
      verifyMessage(JSON.parse(got.sig.toString('utf8')), got.index, roots, 'packs', got.domain ?? DOMAINS.packIndex, now);
    } catch (e) {
      problems.push(`CDN ${got.key ?? `packs/${id}/index.json`}: ${e.message}`);
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
// token's id, which the S3 credentials need, and whether this call attached the domain.
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
  const createdDomain = d.status === 404;
  if (createdDomain) {
    await expectOk(`POST custom domain ${domain}`, await cf('POST', `/accounts/${accountId}/r2/buckets/${bucket}/domains/custom`, { domain, zoneId, enabled: true }));
    log(`attached ${domain} to ${bucket}`);
  } else {
    const current = await expectOk(`GET custom domain ${domain}`, d);
    if (current?.enabled !== true) throw new R2Error(`custom domain ${domain} is attached to ${bucket} but not enabled; enable it in the R2 bucket settings`);
    log(`${domain} serves ${bucket}`);
  }
  return { tokenId: verified.id, createdDomain };
}

// The reason a real upload cannot start, or null when both Cloudflare variables are set.
export function missingCredentials(env) {
  return env.CLOUDFLARE_API_TOKEN && env.CLOUDFLARE_ACCOUNT_ID ? null : 'uploading to R2 needs CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID in the environment';
}

const describe = (o) => (o.kind === 'archive' ? `${o.key} (${o.body.length} bytes, sha256 ${sha256(o.body)})` : o.key);

// The whole upload: target is a bucket name or `dry-run`. Returns, per pack, the keys it PUT, the
// keys it skipped and how many objects its ETag alone showed equal.
export async function runUpload({
  objects, target, env, fetch = globalThis.fetch, roots, now, log,
  clock = () => Date.now(), sleep = (ms) => new Promise((r) => { setTimeout(r, ms); }),
}) {
  const ids = [...new Set(objects.map((o) => o.id))];
  if (target === 'dry-run') {
    for (const o of objects) log(`would PUT ${describe(o)}`);
    return ids.map((id) => ({ id, put: [], skipped: [] }));
  }
  const missing = missingCredentials(env);
  if (missing) throw new R2Error(missing);
  const token = env.CLOUDFLARE_API_TOKEN;
  const accountId = env.CLOUDFLARE_ACCOUNT_ID;
  const { tokenId, createdDomain } = await setup({ accountId, token, bucket: target, fetch, log });
  const bucket = s3Bucket({ accountId, bucket: target, credentials: deriveCredentials({ id: tokenId, value: token }), fetch });
  const actions = await planUpload(objects, bucket);
  const by = (how) => actions.filter((a) => a.compared === how).length;
  log(`compared ${by('etag')} object(s) by ETag, ${by('get')} by GET; ${by('absent')} absent`);
  await applyUpload(actions, bucket, log);
  await verifyCdn(objects, { fetch, roots, now, log, ...(createdDomain ? { retry: { windowMs: PROVISIONING_WINDOW_MS, clock, sleep } } : {}) });
  return ids.map((id) => ({
    id,
    put: actions.filter((a) => a.id === id && a.put).map((a) => a.key),
    skipped: actions.filter((a) => a.id === id && !a.put).map((a) => a.key),
    byEtag: actions.filter((a) => a.id === id && a.compared === 'etag').length,
  }));
}
