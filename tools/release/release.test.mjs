import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash, generateKeyPairSync, sign as edSign } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { DOMAINS, keyId, readRoots } from '../sign/sign.mjs';
import { readIndex, verifyIndex } from './index.mjs';

const RELEASE = new URL('./release.mjs', import.meta.url).pathname;
const REPO_ROOT = new URL('../../', import.meta.url).pathname;
const DEV_ROOTS = join(REPO_ROOT, 'keys/dev/roots');
// The development certificate's notBefore plus one day: an instant inside its window that does
// not move with the clock, so the dev-key case stays green past the certificate's expiry.
function devCertInstant() {
  const cert = JSON.parse(readFileSync(join(REPO_ROOT, 'keys/dev/packs.cert.json'), 'utf8'));
  const body = JSON.parse(Buffer.from(cert.payload, 'base64url').toString('utf8'));
  return new Date(Date.parse(body.notBefore) + 86400e3).toISOString();
}
const scratch = () => mkdtempSync(join(tmpdir(), 'acme-release-'));

const GIT_ENV = {
  GIT_AUTHOR_NAME: 'Acme Author', GIT_AUTHOR_EMAIL: 'author@acme.example',
  GIT_COMMITTER_NAME: 'Acme Committer', GIT_COMMITTER_EMAIL: 'committer@acme.example',
};
const git = (cwd, ...args) => execFileSync('git', args, { cwd, env: { ...process.env, ...GIT_ENV }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

function put(root, path, content) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
}

function packJson(version, extra = {}) {
  return JSON.stringify({ version, minEngineVersion: '60101.1', ...extra }, null, 2) + '\n';
}

// A source repo with two synthetic packs, and a bare remote with no `vendored` branch.
function world() {
  const root = scratch();
  const src = join(root, 'src');
  mkdirSync(src);
  git(src, 'init', '-q', '-b', 'main');
  put(src, 'packs/acme-pack/pack.json', packJson('60101.1', { requires: ['acme-pack-two'] }));
  put(src, 'packs/acme-pack/RULES.md', '# acme rules\n');
  put(src, 'packs/acme-pack/skills/acme-skill/SKILL.md', 'skill\n');
  put(src, 'packs/acme-pack/skills/acme-skill/.gitignore', '*.md\n');
  put(src, 'packs/acme-pack/test/acme.test.mjs', 'dropped\n');
  put(src, 'packs/acme-pack-two/pack.json', packJson('60101.1'));
  put(src, 'packs/acme-pack-two/RULES.md', '# two\n');
  put(src, 'packs/README.md', 'not a pack\n');
  git(src, 'add', '-A');
  git(src, 'commit', '-q', '-m', 'packs');
  const remote = join(root, 'remote.git');
  git(root, 'init', '-q', '--bare', remote);
  return { root, src, remote };
}

function commitAll(src, message) {
  git(src, 'add', '-A');
  git(src, 'commit', '-q', '-m', message);
}

// A test root and a packs key it certifies, valid around now.
function testChain(dir, use = 'packs') {
  const raw = (k, type) => k.export({ format: 'der', type }).subarray(-32);
  const root = generateKeyPairSync('ed25519');
  const subject = generateKeyPairSync('ed25519');
  const rootPub = raw(root.publicKey, 'spki');
  const subjectPub = raw(subject.publicKey, 'spki');
  const now = Date.now();
  const iso = (ms) => new Date(Math.floor(ms / 1000) * 1000).toISOString().replace('.000Z', 'Z');
  const body = Buffer.from(JSON.stringify({
    v: 1, keyId: keyId(subjectPub), publicKey: subjectPub.toString('base64url'), use,
    issuer: keyId(rootPub), notBefore: iso(now - 86400e3), notAfter: iso(now + 30 * 86400e3),
  }));
  const cert = { payload: body.toString('base64url'), signature: edSign(null, Buffer.concat([Buffer.from(DOMAINS.certificate), body]), root.privateKey).toString('base64url') };
  mkdirSync(join(dir, 'roots'), { recursive: true });
  writeFileSync(join(dir, 'roots/test-root.pub'), `${rootPub.toString('base64url')}\n`);
  writeFileSync(join(dir, 'packs.key'), `${raw(subject.privateKey, 'pkcs8').toString('base64url')}\n`);
  writeFileSync(join(dir, 'packs.cert.json'), JSON.stringify(cert, null, 2) + '\n');
  return { roots: join(dir, 'roots'), key: join(dir, 'packs.key'), cert: join(dir, 'packs.cert.json'), certificate: cert, keyId: keyId(subjectPub) };
}

function run(args, env = {}) {
  const clean = { ...process.env };
  delete clean.CN_PACKS_KEY;
  delete clean.CN_PACKS_CERT;
  for (const k of Object.keys(clean)) if (k.startsWith('CLOUDFLARE') || k.startsWith('R2_')) delete clean[k];
  const r = spawnSync(process.execPath, [RELEASE, ...args], { env: { ...clean, ...GIT_ENV, ...env }, encoding: 'utf8' });
  return { status: r.status, out: r.stdout + r.stderr, stdout: r.stdout };
}

function build(w) {
  const archives = join(scratch(), 'archives');
  return { ...run(['build', '--packs', join(w.src, 'packs'), '--out', archives]), archives };
}

function publish(w, archives, chain, extra = []) {
  return run(['publish', '--archives', archives, '--repo', w.src, '--remote', w.remote, '--roots', chain.roots, ...extra],
    chain.key ? { CN_PACKS_KEY: chain.key, CN_PACKS_CERT: chain.cert } : {});
}

const vendoredLog = (w) => git(w.remote, 'log', '--format=%s', 'vendored').split('\n');
const show = (w, path) => execFileSync('git', ['show', `vendored:${path}`], { cwd: w.remote });
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

test('first run publishes every pack: unpacked set, archive, signed index, one commit each', () => {
  const w = world();
  const chain = testChain(scratch());
  const b = build(w);
  assert.equal(b.status, 0, b.out);
  const p = publish(w, b.archives, chain);
  assert.equal(p.status, 0, p.out);
  assert.match(p.out, /^Release acme-pack 60101\.1$/m);
  assert.match(p.out, /^Release acme-pack-two 60101\.1$/m);
  assert.doesNotMatch(p.out, /development key/);
  assert.deepEqual(vendoredLog(w).sort(), ['Release acme-pack 60101.1', 'Release acme-pack-two 60101.1']);
  assert.equal(git(w.remote, 'log', '-1', '--format=%an <%ae>', 'vendored'), 'github-actions[bot] <41898282+github-actions[bot]@users.noreply.github.com>');

  const clone = join(scratch(), 'vendored');
  git(w.root, 'clone', '-q', '--branch', 'vendored', w.remote, clone);
  assert.ok(readFileSync(join(clone, 'README.md'), 'utf8').includes('release-packs.yml'));
  const srcHead = git(w.src, 'rev-parse', 'HEAD');
  for (const id of ['acme-pack', 'acme-pack-two']) {
    const archive = readFileSync(join(clone, id, '60101.1.tar.gz'));
    const bytes = readFileSync(join(clone, id, 'index.json'));
    const ix = readIndex(bytes);
    assert.equal(ix.serial, 1);
    assert.equal(ix.versions.length, 1);
    assert.deepEqual({ ...ix.versions[0], publishedAt: 'x' }, {
      version: '60101.1', sha256: sha256(archive), size: archive.length, minEngineVersion: '60101.1',
      requires: id === 'acme-pack' ? ['acme-pack-two'] : [], channel: 'canary', revoked: false, publishedAt: 'x', sourceCommit: srcHead,
    });
    assert.match(ix.versions[0].publishedAt, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
    const sig = JSON.parse(readFileSync(join(clone, id, 'index.sig.json'), 'utf8'));
    assert.deepEqual(sig.certificate, chain.certificate);
    assert.equal(verifyIndex(bytes, sig, readRoots(chain.roots), new Date()).keyId, chain.keyId);
    const untar = scratch();
    execFileSync('tar', ['-xzf', join(clone, id, '60101.1.tar.gz'), '-C', untar]);
    const diff = spawnSync('git', ['diff', '--no-index', '--stat', untar, join(clone, id, '60101.1')], { encoding: 'utf8' });
    assert.equal(diff.status, 0, diff.stdout);
  }
  assert.ok(readFileSync(join(clone, 'acme-pack/60101.1/skills/acme-skill/SKILL.md')), 'a file the pack .gitignore names still lands');

  const again = publish(w, b.archives, chain);
  assert.equal(again.status, 0, again.out);
  assert.match(again.out, /^nothing to publish$/m);
  assert.equal(vendoredLog(w).length, 2);
});

test('a version bump publishes exactly one commit; the other index keeps its bytes', () => {
  const w = world();
  const chain = testChain(scratch());
  assert.equal(publish(w, build(w).archives, chain).status, 0);
  const otherIndex = show(w, 'acme-pack-two/index.json');
  put(w.src, 'packs/acme-pack/pack.json', packJson('60101.10', { requires: ['acme-pack-two'] }));
  put(w.src, 'packs/acme-pack/RULES.md', '# acme rules, revised\n');
  commitAll(w.src, 'bump');
  const p = publish(w, build(w).archives, chain);
  assert.equal(p.status, 0, p.out);
  assert.equal(vendoredLog(w).length, 3);
  assert.equal(vendoredLog(w)[0], 'Release acme-pack 60101.10');
  const ix = readIndex(show(w, 'acme-pack/index.json'));
  assert.equal(ix.serial, 2);
  assert.deepEqual(ix.versions.map((e) => e.version), ['60101.1', '60101.10']);
  assert.deepEqual(show(w, 'acme-pack-two/index.json'), otherIndex);
});

// Rewrites one archive with a different gzip level, keeping packs.json and SHA256SUMS consistent:
// the tar inside is unchanged, the gzip bytes are not.
function regzip(archives, id, version) {
  const name = `${id}-${version}.tar.gz`;
  const file = join(archives, name);
  const before = readFileSync(file);
  const after = gzipSync(gunzipSync(before), { level: 1 });
  assert.notDeepEqual(after, before);
  writeFileSync(file, after);
  const manifest = JSON.parse(readFileSync(join(archives, 'packs.json'), 'utf8'));
  const p = manifest.packs.find((x) => x.archive === name);
  p.sha256 = sha256(after);
  p.size = after.length;
  writeFileSync(join(archives, 'packs.json'), JSON.stringify(manifest, null, 2) + '\n');
  const sums = readFileSync(join(archives, 'SHA256SUMS'), 'utf8').split('\n').filter(Boolean)
    .map((l) => (l.endsWith(`  ${name}`) ? `${p.sha256}  ${name}` : l.endsWith('  packs.json') ? `${sha256(readFileSync(join(archives, 'packs.json')))}  packs.json` : l));
  writeFileSync(join(archives, 'SHA256SUMS'), sums.join('\n') + '\n');
}

test('the same version re-gzipped differently is nothing to publish: the unpacked tree is compared', () => {
  const w = world();
  const chain = testChain(scratch());
  assert.equal(publish(w, build(w).archives, chain).status, 0);
  const tip = git(w.remote, 'rev-parse', 'vendored');
  const b = build(w);
  regzip(b.archives, 'acme-pack', '60101.1');
  const p = publish(w, b.archives, chain);
  assert.equal(p.status, 0, p.out);
  assert.match(p.out, /^nothing to publish$/m);
  assert.equal(git(w.remote, 'rev-parse', 'vendored'), tip);
});

test('the same version with different content fails naming pack, version and the differing path, branch untouched', () => {
  const w = world();
  const chain = testChain(scratch());
  assert.equal(publish(w, build(w).archives, chain).status, 0);
  const tip = git(w.remote, 'rev-parse', 'vendored');
  put(w.src, 'packs/acme-pack/RULES.md', '# changed without a bump\n');
  put(w.src, 'packs/acme-pack/skills/acme-skill/EXTRA.md', 'new\n');
  commitAll(w.src, 'edit');
  const p = publish(w, build(w).archives, chain);
  assert.notEqual(p.status, 0);
  assert.match(p.out, /acme-pack 60101\.1 .*differing: RULES\.md/);
  assert.match(p.out, /extra: skills\/acme-skill\/EXTRA\.md/);
  assert.doesNotMatch(p.out, /[0-9a-f]{64}/, 'the message names paths, not gzip hashes');
  assert.equal(git(w.remote, 'rev-parse', 'vendored'), tip);
});

test('a pack.json without minEngineVersion fails the build naming the pack', () => {
  const w = world();
  put(w.src, 'packs/acme-pack-two/pack.json', JSON.stringify({ version: '60101.1' }) + '\n');
  commitAll(w.src, 'drop floor');
  const b = build(w);
  assert.notEqual(b.status, 0);
  assert.match(b.out, /acme-pack-two: pack\.json has no string minEngineVersion/);
  assert.equal(spawnSync('git', ['rev-parse', '--verify', '-q', 'vendored'], { cwd: w.remote }).status, 1);
});

test('without CN_PACKS_KEY and CN_PACKS_CERT it signs with the development key and says so', () => {
  const w = world();
  const p = publish(w, build(w).archives, { roots: DEV_ROOTS }, ['--now', devCertInstant()]);
  assert.equal(p.status, 0, p.out);
  assert.match(p.out, /^signing with the development key keys\/dev\/packs\.key \(trusted by no member\)$/m);
  const devCert = JSON.parse(readFileSync(join(REPO_ROOT, 'keys/dev/packs.cert.json'), 'utf8'));
  assert.deepEqual(JSON.parse(show(w, 'acme-pack/index.sig.json')).certificate, devCert);
});

test('--now moves only the self-check instant; publishedAt stays the real clock', () => {
  const chain = testChain(scratch());
  const late = new Date(Date.now() + 60 * 86400e3).toISOString();
  const w = world();
  const expired = publish(w, build(w).archives, chain, ['--now', late]);
  assert.notEqual(expired.status, 0);
  assert.match(expired.out, /self-check failed .*certificate has expired/);
  assert.equal(spawnSync('git', ['rev-parse', '--verify', '-q', 'vendored'], { cwd: w.remote }).status, 1);

  const w2 = world();
  const early = new Date(Date.now() + 86400e3).toISOString();
  const p = publish(w2, build(w2).archives, chain, ['--now', early]);
  assert.equal(p.status, 0, p.out);
  const publishedAt = Date.parse(readIndex(show(w2, 'acme-pack/index.json')).versions[0].publishedAt);
  assert.ok(Math.abs(publishedAt - Date.now()) < 60e3, `publishedAt ${publishedAt} is not the real clock`);
});

test('only one of CN_PACKS_KEY and CN_PACKS_CERT set fails before anything is pushed', () => {
  const w = world();
  const chain = testChain(scratch());
  const archives = build(w).archives;
  for (const env of [{ CN_PACKS_KEY: chain.key }, { CN_PACKS_CERT: chain.cert }]) {
    const p = run(['publish', '--archives', archives, '--repo', w.src, '--remote', w.remote, '--roots', chain.roots], env);
    assert.notEqual(p.status, 0);
    assert.match(p.out, /CN_PACKS_KEY and CN_PACKS_CERT/);
  }
  assert.equal(spawnSync('git', ['rev-parse', '--verify', '-q', 'vendored'], { cwd: w.remote }).status, 1);
});

test('--key and --cert name the signing key in place of the environment', () => {
  const w = world();
  const chain = testChain(scratch());
  const p = run(['publish', '--archives', build(w).archives, '--repo', w.src, '--remote', w.remote, '--roots', chain.roots, '--key', chain.key, '--cert', chain.cert]);
  assert.equal(p.status, 0, p.out);
  assert.deepEqual(JSON.parse(show(w, 'acme-pack/index.sig.json')).certificate, chain.certificate);
});

test('the R2 upload is a dry run listing every object, reading no Cloudflare variable', () => {
  const w = world();
  const chain = testChain(scratch());
  const b = build(w);
  const p = run(['publish', '--archives', b.archives, '--repo', w.src, '--remote', w.remote, '--roots', chain.roots],
    { CN_PACKS_KEY: chain.key, CN_PACKS_CERT: chain.cert, CLOUDFLARE_API_TOKEN: 'acme', R2_BUCKET: 'acme' });
  assert.equal(p.status, 0, p.out);
  const sums = readFileSync(join(b.archives, 'SHA256SUMS'), 'utf8');
  for (const id of ['acme-pack', 'acme-pack-two']) {
    const hex = sums.match(new RegExp(`^([0-9a-f]{64})  ${id}-60101\\.1\\.tar\\.gz$`, 'm'))[1];
    const size = readFileSync(join(b.archives, `${id}-60101.1.tar.gz`)).length;
    assert.ok(p.out.includes(`would PUT packs/${id}/60101.1.tar.gz (${size} bytes, sha256 ${hex})\n`), p.out);
    assert.ok(p.out.includes(`would PUT packs/${id}/index.json\n`));
    assert.ok(p.out.includes(`would PUT packs/${id}/index.sig.json\n`));
  }
  assert.equal(p.out.match(/^would PUT /gm).length, 6);
  assert.doesNotMatch(readFileSync(RELEASE, 'utf8'), /CLOUDFLARE|R2_/);
});

test('the self-check refuses to push an index that does not verify against the given roots', () => {
  const w = world();
  const chain = testChain(scratch());
  const stranger = testChain(scratch());
  const p = run(['publish', '--archives', build(w).archives, '--repo', w.src, '--remote', w.remote, '--roots', stranger.roots],
    { CN_PACKS_KEY: chain.key, CN_PACKS_CERT: chain.cert });
  assert.notEqual(p.status, 0);
  assert.match(p.out, /self-check/);
  assert.match(p.out, /not signed by a trusted root/);
  assert.equal(spawnSync('git', ['rev-parse', '--verify', '-q', 'vendored'], { cwd: w.remote }).status, 1);
});

test('publish checks the archives against SHA256SUMS before anything else', () => {
  const w = world();
  const chain = testChain(scratch());
  const b = build(w);
  const file = join(b.archives, 'acme-pack-60101.1.tar.gz');
  const bytes = readFileSync(file);
  bytes[bytes.length - 1] ^= 1;
  writeFileSync(file, bytes);
  const p = publish(w, b.archives, chain);
  assert.notEqual(p.status, 0);
  assert.match(p.out, /acme-pack-60101\.1\.tar\.gz does not match SHA256SUMS/);
  assert.equal(spawnSync('git', ['rev-parse', '--verify', '-q', 'vendored'], { cwd: w.remote }).status, 1);
});

test('plan lists every pack and whether its version is already on vendored', () => {
  const w = world();
  const chain = testChain(scratch());
  const before = run(['plan', '--packs', join(w.src, 'packs'), '--repo', w.src, '--remote', w.remote]);
  assert.equal(before.status, 0, before.out);
  assert.equal(before.stdout, 'publish acme-pack 60101.1\npublish acme-pack-two 60101.1\n');
  assert.equal(publish(w, build(w).archives, chain).status, 0);
  put(w.src, 'packs/acme-pack-two/pack.json', packJson('60101.2'));
  commitAll(w.src, 'bump two');
  const after = run(['plan', '--packs', join(w.src, 'packs'), '--repo', w.src, '--remote', w.remote]);
  assert.equal(after.stdout, 'published acme-pack 60101.1\npublish acme-pack-two 60101.2\n');
});
