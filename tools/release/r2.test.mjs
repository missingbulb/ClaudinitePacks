import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { decodeB64, parsePrivateKey } from '../sign/sign.mjs';
import { addVersion, newIndex, serialize, signIndex } from './index.mjs';
import {
  applyUpload, branchObjects, deriveCredentials, planUpload, R2Error, runUpload, s3Bucket, setup, signV4, verifyCdn,
} from './r2.mjs';

const VECTORS = JSON.parse(readFileSync(new URL('./sigv4.test-vectors.json', import.meta.url), 'utf8'));
const SIGN = JSON.parse(readFileSync(new URL('../sign/testdata/vectors.json', import.meta.url), 'utf8'));
const ROOTS = [decodeB64(SIGN.roots.root.publicKey)];
const NOW = new Date('2026-01-31T00:00:00Z');
const PACKS_KEY = parsePrivateKey(SIGN.subjects.packs.seed);
const sha256 = (b) => createHash('sha256').update(b).digest('hex');

for (const c of VECTORS.cases) {
  test(`SigV4 reproduces AWS's ${c.name} example: canonical request, string to sign, signature`, () => {
    const s = signV4({
      method: c.method, host: c.host, path: c.path, headers: c.headers, payloadHash: c.payloadHash,
      credentials: VECTORS.credentials, region: VECTORS.region, service: VECTORS.service, amzDate: VECTORS.amzDate,
    });
    if (c.body) assert.equal(sha256(c.body), c.payloadHash);
    assert.equal(s.canonicalRequest, c.canonicalRequest);
    assert.equal(s.stringToSign, c.stringToSign);
    assert.equal(s.signature, c.signature);
    const signed = c.canonicalRequest.split('\n').at(-2);
    assert.equal(s.headers.authorization, `AWS4-HMAC-SHA256 Credential=${VECTORS.credentials.accessKeyId}/20130524/us-east-1/s3/aws4_request,SignedHeaders=${signed},Signature=${c.signature}`);
  });
}

test('an UNSIGNED-PAYLOAD request carries that literal in the header and the canonical request', () => {
  const s = signV4({
    method: 'PUT', host: 'acme.r2.cloudflarestorage.com', path: '/claudinite-packs/packs/acme-pack/index.json', headers: {},
    payloadHash: 'UNSIGNED-PAYLOAD', credentials: VECTORS.credentials, region: 'auto', service: 's3', amzDate: VECTORS.amzDate,
  });
  assert.equal(s.headers['x-amz-content-sha256'], 'UNSIGNED-PAYLOAD');
  assert.equal(s.canonicalRequest.split('\n').at(-1), 'UNSIGNED-PAYLOAD');
  assert.match(s.headers.authorization, /Credential=AKIAIOSFODNN7EXAMPLE\/20130524\/auto\/s3\/aws4_request,/);
});

test('S3 API credentials derive from the Cloudflare token: id as the key id, SHA-256 of the value as the secret', () => {
  assert.deepEqual(deriveCredentials({ id: 'ed17574386854bf78a67040be0a770b0', value: 'acme-token' }), {
    accessKeyId: 'ed17574386854bf78a67040be0a770b0',
    secretAccessKey: sha256('acme-token'),
  });
});

test('the S3 bucket client PUTs to <account>.r2.cloudflarestorage.com/<bucket>/<key>, region auto, the body hash signed', async () => {
  const seen = [];
  const fetch = async (url, init) => { seen.push({ url, init }); return new Response(null, { status: 200 }); };
  const bucket = s3Bucket({ accountId: 'acme0123', bucket: 'claudinite-packs', credentials: VECTORS.credentials, fetch, clock: () => new Date('2013-05-24T00:00:00Z') });
  const body = Buffer.from('acme');
  await bucket.put('packs/acme-pack/60101.1.tar.gz', body, { contentType: 'application/gzip', cacheControl: 'public, max-age=31536000, immutable', ifNoneMatch: '*' });
  assert.equal(seen.length, 1);
  assert.equal(seen[0].url, 'https://acme0123.r2.cloudflarestorage.com/claudinite-packs/packs/acme-pack/60101.1.tar.gz');
  const h = seen[0].init.headers;
  assert.equal(seen[0].init.method, 'PUT');
  assert.equal(h['x-amz-content-sha256'], sha256(body));
  assert.equal(h['if-none-match'], '*');
  assert.equal(h['content-type'], 'application/gzip');
  assert.match(h.authorization, /^AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE\/20130524\/auto\/s3\/aws4_request,SignedHeaders=cache-control;content-type;host;if-none-match;x-amz-content-sha256;x-amz-date,Signature=[0-9a-f]{64}$/);
});

test('a failed S3 request reports status and body and never the Authorization header', async () => {
  const fetch = async () => new Response('<Error>AccessDenied</Error>', { status: 403 });
  const bucket = s3Bucket({ accountId: 'acme0123', bucket: 'claudinite-packs', credentials: VECTORS.credentials, fetch });
  await assert.rejects(bucket.get('packs/acme-pack/index.json'), (e) => {
    assert.match(e.message, /403/);
    assert.match(e.message, /AccessDenied/);
    assert.doesNotMatch(e.message, /AWS4-HMAC|Signature=|wJalr/);
    return true;
  });
});

// A synthetic vendored branch: acme-pack with the given versions, a signed index, as path -> bytes.
function branch(versions, { key = PACKS_KEY, cert = SIGN.certificates.packs } = {}) {
  const files = new Map();
  let ix = newIndex('acme-pack');
  for (const v of versions) {
    const archive = Buffer.from(`archive ${v}`);
    files.set(`acme-pack/${v}.tar.gz`, archive);
    ix = addVersion(ix, { packJson: { version: v, minEngineVersion: '60101.1' }, sha256: sha256(archive), size: archive.length, publishedAt: '2026-01-02T03:04:05Z', sourceCommit: 'b'.repeat(40) });
  }
  const bytes = serialize(ix);
  files.set('acme-pack/index.json', bytes);
  files.set('acme-pack/index.sig.json', Buffer.from(JSON.stringify(signIndex(bytes, key, cert), null, 2) + '\n'));
  return branchObjects((p) => files.get(p), ['acme-pack']);
}

function fakeBucket(initial = {}) {
  const objects = new Map(Object.entries(initial).map(([k, v]) => [k, { body: Buffer.from(v), meta: {} }]));
  const puts = [];
  return {
    objects, puts,
    async get(key) { return objects.get(key)?.body ?? null; },
    async put(key, body, meta) {
      if (meta.ifNoneMatch === '*' && objects.has(key)) throw new R2Error(`PUT ${key}: 412 Precondition Failed: another writer created it`, { race: true });
      puts.push({ key, meta });
      objects.set(key, { body: Buffer.from(body), meta });
    },
  };
}

const keys = (actions) => actions.filter((a) => a.put).map((a) => a.key);

test('an absent archive is PUT once with the immutable headers, then the index pair in order', async () => {
  const objects = branch(['60101.1']);
  const bucket = fakeBucket();
  const actions = await planUpload(objects, bucket);
  await applyUpload(actions, bucket, () => {});
  assert.deepEqual(bucket.puts.map((p) => p.key), ['packs/acme-pack/60101.1.tar.gz', 'packs/acme-pack/index.json', 'packs/acme-pack/index.sig.json']);
  assert.deepEqual(bucket.puts[0].meta, { contentType: 'application/gzip', cacheControl: 'public, max-age=31536000, immutable', ifNoneMatch: '*' });
  assert.deepEqual(bucket.puts[1].meta, { contentType: 'application/json', cacheControl: 'public, max-age=300' });
  assert.deepEqual(bucket.puts[2].meta, { contentType: 'application/json', cacheControl: 'public, max-age=300' });

  const again = await planUpload(objects, bucket);
  assert.deepEqual(keys(again), [], 'a second run puts nothing');
  assert.equal(again.length, 3);
});

test('a present archive with different bytes fails naming the key and both hashes, and nothing is written', async () => {
  const objects = branch(['60101.1', '60101.2']);
  const bucket = fakeBucket({ 'packs/acme-pack/60101.2.tar.gz': 'something else' });
  await assert.rejects(planUpload(objects, bucket), (e) => {
    assert.match(e.message, /packs\/acme-pack\/60101\.2\.tar\.gz/);
    assert.ok(e.message.includes(sha256('something else')));
    assert.ok(e.message.includes(sha256('archive 60101.2')));
    return true;
  });
  assert.deepEqual(bucket.puts, []);
});

test('an index differing from the branch is rewritten, index.json before index.sig.json; archives already there are skipped', async () => {
  const old = branch(['60101.1']);
  const bucket = fakeBucket();
  await applyUpload(await planUpload(old, bucket), bucket, () => {});
  bucket.puts.length = 0;
  const next = branch(['60101.1', '60101.2']);
  await applyUpload(await planUpload(next, bucket), bucket, () => {});
  assert.deepEqual(bucket.puts.map((p) => p.key), ['packs/acme-pack/60101.2.tar.gz', 'packs/acme-pack/index.json', 'packs/acme-pack/index.sig.json']);
});

test('scope comes from the branch: three versions on it and one in the bucket plan two archive PUTs and the index pair', async () => {
  const objects = branch(['60101.1', '60101.2', '60102.1']);
  const bucket = fakeBucket({ 'packs/acme-pack/60101.1.tar.gz': 'archive 60101.1' });
  const actions = await planUpload(objects, bucket);
  assert.deepEqual(keys(actions), ['packs/acme-pack/60101.2.tar.gz', 'packs/acme-pack/60102.1.tar.gz', 'packs/acme-pack/index.json', 'packs/acme-pack/index.sig.json']);
});

test('head() HEADs the object and returns its ETag, or null when R2 answers 404', async () => {
  const seen = [];
  const fetch = async (url, init) => {
    seen.push(init.method);
    return url.endsWith('/index.json') ? new Response(null, { status: 404 }) : new Response(null, { status: 200, headers: { etag: '"acme-etag"' } });
  };
  const bucket = s3Bucket({ accountId: 'acme0123', bucket: 'claudinite-packs', credentials: VECTORS.credentials, fetch });
  assert.deepEqual(await bucket.head('packs/acme-pack/60101.1.tar.gz'), { etag: '"acme-etag"' });
  assert.equal(await bucket.head('packs/acme-pack/index.json'), null);
  assert.deepEqual(seen, ['HEAD', 'HEAD']);
});

// fakeBucket plus head(), answering the single-PUT ETag (the quoted MD5 hex) unless etags overrides
// it, and counting GETs.
function etagBucket(initial = {}, etags = {}) {
  const b = fakeBucket(initial);
  b.gets = 0;
  const get = b.get.bind(b);
  b.get = async (key) => { b.gets++; return get(key); };
  b.head = async (key) => {
    const o = b.objects.get(key);
    return o ? { etag: etags[key] ?? `"${createHash('md5').update(o.body).digest('hex')}"` } : null;
  };
  return b;
}

test('an object whose ETag is the quoted MD5 of the branch bytes is skipped without a GET', async () => {
  const objects = branch(['60101.1']);
  const bucket = etagBucket();
  await applyUpload(await planUpload(objects, bucket), bucket, () => {});
  bucket.gets = 0;
  const again = await planUpload(objects, bucket);
  assert.deepEqual(keys(again), []);
  assert.equal(bucket.gets, 0);
  assert.deepEqual(again.map((a) => a.compared), ['etag', 'etag', 'etag']);
});

test('an ETag that is not the MD5 (a multipart upload, or other bytes) falls back to GET and compares bytes as before', async () => {
  const objects = branch(['60101.1', '60101.2']);
  const multipart = etagBucket({ 'packs/acme-pack/60101.1.tar.gz': 'archive 60101.1' }, { 'packs/acme-pack/60101.1.tar.gz': '"0123abcd-2"' });
  const actions = await planUpload(objects, multipart);
  assert.equal(multipart.gets, 1);
  assert.deepEqual(actions.map((a) => [a.key, a.compared, a.put]), [
    ['packs/acme-pack/60101.1.tar.gz', 'get', false],
    ['packs/acme-pack/60101.2.tar.gz', 'absent', true],
    ['packs/acme-pack/index.json', 'absent', true],
    ['packs/acme-pack/index.sig.json', 'absent', true],
  ]);
  const differing = etagBucket({ 'packs/acme-pack/60101.2.tar.gz': 'something else' });
  await assert.rejects(planUpload(objects, differing), /refusing to overwrite a published archive:\npacks\/acme-pack\/60101\.2\.tar\.gz/);
  assert.equal(differing.gets, 1);
});

test('a PUT answered 412 is reported as a race and never retried as an overwrite', async () => {
  const objects = branch(['60101.1']);
  let calls = 0;
  const bucket = {
    async get() { return null; },
    async put(key, body, meta) { calls++; assert.equal(meta.ifNoneMatch, '*'); throw new R2Error(`PUT ${key}: 412 Precondition Failed`, { race: true }); },
  };
  await assert.rejects(applyUpload(await planUpload(objects, bucket), bucket, () => {}), /race/);
  assert.equal(calls, 1);
});

test('the real S3 client turns a 412 into a race error', async () => {
  const fetch = async () => new Response('<Error><Code>PreconditionFailed</Code></Error>', { status: 412 });
  const bucket = s3Bucket({ accountId: 'acme0123', bucket: 'claudinite-packs', credentials: VECTORS.credentials, fetch });
  await assert.rejects(bucket.put('packs/acme-pack/60101.1.tar.gz', Buffer.from('x'), { contentType: 'application/gzip', cacheControl: 'x', ifNoneMatch: '*' }), (e) => e.race === true);
});

function fakeCdn(objects, override = {}) {
  const urls = [];
  const byUrl = new Map();
  for (const o of objects) {
    const url = `https://packs.claudinite.com/${o.key}${o.serial !== undefined ? `?s=${o.serial}` : ''}`;
    byUrl.set(url, override[o.key] ?? o.body);
  }
  return {
    urls,
    fetch: async (url) => {
      urls.push(url);
      return byUrl.has(url) ? new Response(byUrl.get(url), { status: 200 }) : new Response('not found', { status: 404 });
    },
  };
}

test('verify-cdn reads every archive and the index pair with ?s=<serial>, compares bytes and verifies the signature', async () => {
  const objects = branch(['60101.1', '60101.2']);
  const cdn = fakeCdn(objects);
  const lines = [];
  await verifyCdn(objects, { fetch: cdn.fetch, roots: ROOTS, now: NOW, log: (l) => lines.push(l) });
  assert.deepEqual(cdn.urls.sort(), [
    'https://packs.claudinite.com/packs/acme-pack/60101.1.tar.gz',
    'https://packs.claudinite.com/packs/acme-pack/60101.2.tar.gz',
    'https://packs.claudinite.com/packs/acme-pack/index.json?s=2',
    'https://packs.claudinite.com/packs/acme-pack/index.sig.json?s=2',
  ]);
  assert.deepEqual(lines, ['verify-cdn acme-pack ok']);
});

test('verify-cdn names the object whose CDN bytes differ, and fails a signature that does not verify', async () => {
  const objects = branch(['60101.1']);
  const stale = fakeCdn(objects, { 'packs/acme-pack/index.json': 'stale' });
  await assert.rejects(verifyCdn(objects, { fetch: stale.fetch, roots: ROOTS, now: NOW, log: () => {} }), /packs\/acme-pack\/index\.json/);
  const missing = fakeCdn(objects.filter((o) => !o.key.endsWith('.tar.gz')));
  await assert.rejects(verifyCdn(objects, { fetch: missing.fetch, roots: ROOTS, now: NOW, log: () => {} }), /packs\/acme-pack\/60101\.1\.tar\.gz.*404/);
  const manifestSigned = branch(['60101.1'], { key: parsePrivateKey(SIGN.subjects.manifest.seed), cert: SIGN.certificates.manifest });
  await assert.rejects(verifyCdn(manifestSigned, { fetch: fakeCdn(manifestSigned).fetch, roots: ROOTS, now: NOW, log: () => {} }), /acme-pack\/index\.json.*use "manifest"/);
});

// A Cloudflare API double: state says what already exists; every call is recorded.
function fakeCloudflare({ bucket = false, domain = false, enabled = true, zone = true, fail } = {}) {
  const calls = [];
  const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  const fetch = async (url, init = {}) => {
    const u = new URL(url);
    const method = init.method ?? 'GET';
    calls.push(`${method} ${u.pathname}${u.search}`);
    assert.equal(init.headers.authorization, 'Bearer acme-token');
    if (fail && `${method} ${u.pathname}`.includes(fail)) return json(500, { success: false, errors: [{ code: 1, message: 'acme failure' }] });
    const p = u.pathname.replace('/client/v4', '');
    if (p === '/user/tokens/verify') return json(200, { success: true, result: { id: 'acme-token-id', status: 'active' } });
    if (p === '/accounts/acme0123/r2/buckets/claudinite-packs' && method === 'GET') return bucket ? json(200, { success: true, result: { name: 'claudinite-packs' } }) : json(404, { success: false, errors: [{ code: 10006, message: 'The specified bucket does not exist.' }] });
    if (p === '/accounts/acme0123/r2/buckets' && method === 'POST') { assert.deepEqual(JSON.parse(init.body), { name: 'claudinite-packs' }); return json(200, { success: true, result: {} }); }
    if (p === '/zones' && u.searchParams.get('name') === 'claudinite.com') return json(200, { success: true, result: zone ? [{ id: 'acme-zone', name: 'claudinite.com' }] : [] });
    if (p === '/accounts/acme0123/r2/buckets/claudinite-packs/domains/custom/packs.claudinite.com' && method === 'GET') return domain ? json(200, { success: true, result: { domain: 'packs.claudinite.com', enabled } }) : json(404, { success: false, errors: [{ code: 10076, message: 'not found' }] });
    if (p === '/accounts/acme0123/r2/buckets/claudinite-packs/domains/custom' && method === 'POST') { assert.deepEqual(JSON.parse(init.body), { domain: 'packs.claudinite.com', zoneId: 'acme-zone', enabled: true }); return json(200, { success: true, result: {} }); }
    return json(418, { unexpected: `${method} ${p}` });
  };
  return { calls, fetch };
}

test('setup creates the bucket and the custom domain when absent and returns the token id', async () => {
  const cf = fakeCloudflare();
  const r = await setup({ accountId: 'acme0123', token: 'acme-token', fetch: cf.fetch, log: () => {} });
  assert.equal(r.tokenId, 'acme-token-id');
  assert.equal(r.createdDomain, true);
  assert.deepEqual(cf.calls, [
    'GET /client/v4/user/tokens/verify',
    'GET /client/v4/accounts/acme0123/r2/buckets/claudinite-packs',
    'POST /client/v4/accounts/acme0123/r2/buckets',
    'GET /client/v4/zones?name=claudinite.com',
    'GET /client/v4/accounts/acme0123/r2/buckets/claudinite-packs/domains/custom/packs.claudinite.com',
    'POST /client/v4/accounts/acme0123/r2/buckets/claudinite-packs/domains/custom',
  ]);
});

test('setup is idempotent: with bucket and domain present it creates nothing', async () => {
  const cf = fakeCloudflare({ bucket: true, domain: true });
  const r = await setup({ accountId: 'acme0123', token: 'acme-token', fetch: cf.fetch, log: () => {} });
  assert.deepEqual(cf.calls.filter((c) => c.startsWith('POST')), []);
  assert.equal(r.createdDomain, false);
});

test('setup fails with the response body on an unexpected status, a disabled domain or a missing zone', async () => {
  await assert.rejects(setup({ accountId: 'acme0123', token: 'acme-token', fetch: fakeCloudflare({ fail: '/r2/buckets' }).fetch, log: () => {} }), /500.*acme failure/);
  await assert.rejects(setup({ accountId: 'acme0123', token: 'acme-token', fetch: fakeCloudflare({ bucket: true, domain: true, enabled: false }).fetch, log: () => {} }), /packs\.claudinite\.com.*not enabled/);
  await assert.rejects(setup({ accountId: 'acme0123', token: 'acme-token', fetch: fakeCloudflare({ bucket: true, zone: false }).fetch, log: () => {} }), /claudinite\.com/);
});

test('a real upload without CLOUDFLARE_API_TOKEN or CLOUDFLARE_ACCOUNT_ID fails before any request', async () => {
  const objects = branch(['60101.1']);
  for (const env of [{}, { CLOUDFLARE_API_TOKEN: 'acme-token' }, { CLOUDFLARE_ACCOUNT_ID: 'acme0123' }]) {
    let requests = 0;
    await assert.rejects(runUpload({ objects, target: 'claudinite-packs', env, fetch: async () => { requests++; }, roots: ROOTS, now: NOW, log: () => {} }), /CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID/);
    assert.equal(requests, 0);
  }
});

test('the dry run lists every object as would PUT and makes no request', async () => {
  const objects = branch(['60101.1', '60101.2']);
  const lines = [];
  const report = await runUpload({ objects, target: 'dry-run', env: {}, fetch: async () => { throw new Error('no request in a dry run'); }, roots: ROOTS, now: NOW, log: (l) => lines.push(l) });
  const a1 = Buffer.from('archive 60101.1');
  assert.deepEqual(lines, [
    `would PUT packs/acme-pack/60101.1.tar.gz (${a1.length} bytes, sha256 ${sha256(a1)})`,
    `would PUT packs/acme-pack/60101.2.tar.gz (${a1.length} bytes, sha256 ${sha256('archive 60101.2')})`,
    'would PUT packs/acme-pack/index.json',
    'would PUT packs/acme-pack/index.sig.json',
  ]);
  assert.deepEqual(report, [{ id: 'acme-pack', put: [], skipped: [] }]);
});

// Cloudflare's API, the S3 endpoint and the CDN as one fetch over one in-memory store.
function fakeWorld({ domain = true, cdnFailures = 0 } = {}) {
  const cf = fakeCloudflare({ bucket: true, domain });
  const store = new Map();
  let refused = 0;
  const fetch = async (url, init = {}) => {
    const u = new URL(url);
    if (u.host === 'api.cloudflare.com') return cf.fetch(url, init);
    if (u.host === 'acme0123.r2.cloudflarestorage.com') {
      assert.match(init.headers.authorization, /Credential=acme-token-id\//);
      const key = decodeURIComponent(u.pathname.replace('/claudinite-packs/', ''));
      if (init.method === 'PUT') {
        if (init.headers['if-none-match'] === '*' && store.has(key)) return new Response('', { status: 412 });
        store.set(key, Buffer.from(init.body));
        return new Response('', { status: 200 });
      }
      if (init.method === 'HEAD') {
        if (!store.has(key)) return new Response(null, { status: 404 });
        return new Response(null, { status: 200, headers: { etag: `"${createHash('md5').update(store.get(key)).digest('hex')}"` } });
      }
      return store.has(key) ? new Response(store.get(key)) : new Response('', { status: 404 });
    }
    if (u.host === 'packs.claudinite.com') {
      if (refused < cdnFailures) { refused++; return new Response('CNAME Cross-User Banned', { status: 403 }); }
      const key = u.pathname.slice(1);
      return store.has(key) ? new Response(store.get(key)) : new Response('', { status: 404 });
    }
    throw new Error(`unexpected ${url}`);
  };
  return { fetch, store };
}

test('a real upload sets up, writes what the bucket lacks, reads it back through the CDN, and a rerun writes nothing', async () => {
  const objects = branch(['60101.1', '60101.2']);
  const world = fakeWorld();
  const env = { CLOUDFLARE_API_TOKEN: 'acme-token', CLOUDFLARE_ACCOUNT_ID: 'acme0123' };
  const lines = [];
  const first = await runUpload({ objects, target: 'claudinite-packs', env, fetch: world.fetch, roots: ROOTS, now: NOW, log: (l) => lines.push(l) });
  assert.deepEqual(first, [{ id: 'acme-pack', put: ['packs/acme-pack/60101.1.tar.gz', 'packs/acme-pack/60101.2.tar.gz', 'packs/acme-pack/index.json', 'packs/acme-pack/index.sig.json'], skipped: [], byEtag: 0 }]);
  assert.ok(lines.includes('verify-cdn acme-pack ok'));
  assert.ok(lines.includes('compared 0 object(s) by ETag, 0 by GET; 4 absent'), lines.join('\n'));
  const again = [];
  const second = await runUpload({ objects, target: 'claudinite-packs', env, fetch: world.fetch, roots: ROOTS, now: NOW, log: (l) => again.push(l) });
  assert.deepEqual(second[0].put, []);
  assert.equal(second[0].skipped.length, 4);
  assert.equal(second[0].byEtag, 4);
  assert.ok(again.includes('compared 4 object(s) by ETag, 0 by GET; 0 absent'), again.join('\n'));
});

test('verify-cdn, after a run created the domain, retries a fetch that throws (NXDOMAIN while DNS propagates)', async () => {
  const objects = branch(['60101.1']);
  const cdn = fakeCdn(objects);
  let thrown = 0;
  const fetch = async (url) => {
    if (thrown < 3) { thrown++; throw new TypeError('fetch failed', { cause: new Error('getaddrinfo ENOTFOUND packs.claudinite.com') }); }
    return cdn.fetch(url);
  };
  const time = fakeTime();
  const lines = [];
  await verifyCdn(objects, { fetch, roots: ROOTS, now: NOW, log: (l) => lines.push(l), retry: { windowMs: 300e3, clock: time.clock, sleep: time.sleep } });
  assert.equal(time.waits.length, 3);
  assert.ok(lines.includes('verify-cdn acme-pack ok'), lines.join('\n'));
  assert.ok(lines.some((l) => /^verify-cdn .*ENOTFOUND.*retrying/.test(l)), lines.join('\n'));
});

test('verify-cdn gives up on a fetch that keeps throwing once the window has passed, naming the error', async () => {
  const objects = branch(['60101.1']);
  const time = fakeTime();
  const fetch = async () => { throw new TypeError('fetch failed', { cause: new Error('getaddrinfo ENOTFOUND packs.claudinite.com') }); };
  await assert.rejects(
    verifyCdn(objects, { fetch, roots: ROOTS, now: NOW, log: () => {}, retry: { windowMs: 300e3, clock: time.clock, sleep: time.sleep } }),
    /60101\.1\.tar\.gz.*ENOTFOUND.*statement about the clock/,
  );
  assert.ok(time.clock() <= 300e3, `waited ${time.clock()} ms`);
});

test('without the retry, a fetch that throws fails at once', async () => {
  const objects = branch(['60101.1']);
  const fetch = async () => { throw new TypeError('fetch failed'); };
  await assert.rejects(verifyCdn(objects, { fetch, roots: ROOTS, now: NOW, log: () => {} }), /fetch failed/);
});

// An injected clock that sleep() advances, recording every wait.
function fakeTime() {
  let t = 0;
  const waits = [];
  return { waits, clock: () => t, sleep: async (ms) => { waits.push(ms); t += ms; } };
}

// A CDN that answers 403 to the first `failures` requests, then serves the objects.
function provisioningCdn(objects, failures) {
  const cdn = fakeCdn(objects);
  let refused = 0;
  return { ...cdn, fetch: async (url) => (refused++ < failures ? new Response('CNAME Cross-User Banned', { status: 403 }) : cdn.fetch(url)) };
}

test('verify-cdn, after a run created the domain, retries a 403 or 404 with backoff until the CDN answers', async () => {
  const objects = branch(['60101.1']);
  const time = fakeTime();
  const lines = [];
  await verifyCdn(objects, { fetch: provisioningCdn(objects, 4).fetch, roots: ROOTS, now: NOW, log: (l) => lines.push(l), retry: { windowMs: 300e3, clock: time.clock, sleep: time.sleep } });
  assert.deepEqual(lines.filter((l) => l.startsWith('verify-cdn acme-pack')), ['verify-cdn acme-pack ok']);
  assert.equal(time.waits.length, 4);
  for (let i = 1; i < time.waits.length; i++) assert.ok(time.waits[i] >= time.waits[i - 1], `backoff never shrinks: ${time.waits}`);
  assert.ok(lines.some((l) => /^verify-cdn .*403.*retrying/.test(l)), lines.join('\n'));
});

test('verify-cdn gives up once the retry window has passed, naming the last answer', async () => {
  const objects = branch(['60101.1']);
  const time = fakeTime();
  await assert.rejects(
    verifyCdn(objects, { fetch: provisioningCdn(objects, Infinity).fetch, roots: ROOTS, now: NOW, log: () => {}, retry: { windowMs: 300e3, clock: time.clock, sleep: time.sleep } }),
    /60101\.1\.tar\.gz: 403.*CNAME Cross-User Banned/,
  );
  assert.ok(time.clock() <= 300e3, `waited ${time.clock()} ms`);
  assert.ok(time.clock() >= 240e3, `gave up early, after ${time.clock()} ms`);
});

test('without the retry, a 403 from the CDN fails at once', async () => {
  const objects = branch(['60101.1']);
  const cdn = provisioningCdn(objects, 1);
  await assert.rejects(verifyCdn(objects, { fetch: cdn.fetch, roots: ROOTS, now: NOW, log: () => {} }), /403/);
});

test('the upload retries verify-cdn only in the run whose setup attached the domain', async () => {
  const objects = branch(['60101.1']);
  const env = { CLOUDFLARE_API_TOKEN: 'acme-token', CLOUDFLARE_ACCOUNT_ID: 'acme0123' };
  const created = fakeTime();
  await runUpload({ objects, target: 'claudinite-packs', env, fetch: fakeWorld({ domain: false, cdnFailures: 3 }).fetch, roots: ROOTS, now: NOW, log: () => {}, clock: created.clock, sleep: created.sleep });
  assert.equal(created.waits.length, 3);
  const present = fakeTime();
  await assert.rejects(
    runUpload({ objects, target: 'claudinite-packs', env, fetch: fakeWorld({ domain: true, cdnFailures: 3 }).fetch, roots: ROOTS, now: NOW, log: () => {}, clock: present.clock, sleep: present.sleep }),
    /403/,
  );
  assert.deepEqual(present.waits, []);
});

test('r2.mjs, which runs beside the Cloudflare token, imports only node: modules, ../sign/sign.mjs and ./index.mjs', () => {
  const src = readFileSync(new URL('./r2.mjs', import.meta.url), 'utf8');
  const imports = [...src.matchAll(/^\s*import\b[^'"]*['"]([^'"]+)['"]/gm), ...src.matchAll(/\bimport\(\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);
  assert.ok(imports.length >= 3);
  assert.deepEqual(imports.filter((s) => !s.startsWith('node:') && s !== '../sign/sign.mjs' && s !== './index.mjs'), []);
});
