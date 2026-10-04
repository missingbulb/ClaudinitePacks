import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { readRoots } from '../sign/sign.mjs';
import { verifyCatalog } from './catalog.mjs';
import { packFields, readIndex, verifyIndex } from './index.mjs';
import {
  build, commitAll, editVendored, git, packJson, publish, put, REPO_ROOT, run, scratch, sha256, show, testChain, vendoredLog, world,
} from './test-fixture.mjs';

test('first run publishes every pack: unpacked set, archive, signed index, one commit each', () => {
  const w = world();
  const chain = testChain(scratch());
  const b = build(w);
  assert.equal(b.status, 0, b.out);
  const p = publish(w, b.archives, chain);
  assert.equal(p.status, 0, p.out);
  assert.match(p.out, /^Release acme-pack 1\.60101\.1$/m);
  assert.match(p.out, /^Release acme-pack-two 1\.60101\.1$/m);
  assert.doesNotMatch(p.out, /development key/);
  assert.deepEqual(vendoredLog(w).sort(), ['Release acme-pack 1.60101.1', 'Release acme-pack-two 1.60101.1']);
  assert.equal(git(w.remote, 'log', '-1', '--format=%an <%ae>', 'vendored'), 'github-actions[bot] <41898282+github-actions[bot]@users.noreply.github.com>');

  const clone = join(scratch(), 'vendored');
  git(w.root, 'clone', '-q', '--branch', 'vendored', w.remote, clone);
  assert.ok(readFileSync(join(clone, 'README.md'), 'utf8').includes('release-packs.yml'));
  const srcHead = git(w.src, 'rev-parse', 'HEAD');
  for (const id of ['acme-pack', 'acme-pack-two']) {
    const archive = readFileSync(join(clone, id, '1.60101.1.tar.gz'));
    const bytes = readFileSync(join(clone, id, 'index.json'));
    const ix = readIndex(bytes);
    assert.equal(ix.serial, 1);
    assert.equal(ix.versions.length, 1);
    assert.deepEqual({ ...ix.versions[0], publishedAt: 'x' }, {
      version: '1.60101.1', sha256: sha256(archive), size: archive.length, minEngineVersion: '1.60101.1',
      requires: id === 'acme-pack' ? ['acme-pack-two'] : [], channel: 'canary', revoked: false, publishedAt: 'x', sourceCommit: srcHead,
    });
    assert.match(ix.versions[0].publishedAt, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
    const sig = JSON.parse(readFileSync(join(clone, id, 'index.sig.json'), 'utf8'));
    assert.deepEqual(sig.certificate, chain.certificate);
    assert.equal(verifyIndex(bytes, sig, readRoots(chain.roots), new Date()).keyId, chain.keyId);
    const untar = scratch();
    execFileSync('tar', ['-xzf', join(clone, id, '1.60101.1.tar.gz'), '-C', untar]);
    const diff = spawnSync('git', ['diff', '--no-index', '--stat', untar, join(clone, id, '1.60101.1')], { encoding: 'utf8' });
    assert.equal(diff.status, 0, diff.stdout);
  }
  assert.ok(readFileSync(join(clone, 'acme-pack/1.60101.1/skills/acme-skill/SKILL.md')), 'a file the pack .gitignore names still lands');
  const catalog = readFileSync(join(clone, 'catalog.json'));
  assert.equal(verifyCatalog(catalog, JSON.parse(readFileSync(join(clone, 'catalog.sig.json'), 'utf8')), readRoots(chain.roots), new Date()).keyId, chain.keyId);
  assert.deepEqual(JSON.parse(catalog.toString('utf8')).packs.map((e) => `${e.id} ${e.version} ${e.channel}`), ['acme-pack 1.60101.1 canary', 'acme-pack-two 1.60101.1 canary'],
    'the catalog rides each release commit, so the branch never holds an index it does not cover');
  assert.equal(JSON.parse(catalog.toString('utf8')).serial, 2);

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
  put(w.src, 'packs/acme-pack/pack.json', packJson('1.60101.10', { requires: ['acme-pack-two'] }));
  put(w.src, 'packs/acme-pack/RULES.md', '# acme rules, revised\n');
  commitAll(w.src, 'bump');
  const p = publish(w, build(w).archives, chain);
  assert.equal(p.status, 0, p.out);
  assert.equal(vendoredLog(w).length, 3);
  assert.equal(vendoredLog(w)[0], 'Release acme-pack 1.60101.10');
  const ix = readIndex(show(w, 'acme-pack/index.json'));
  assert.equal(ix.serial, 2);
  assert.deepEqual(ix.versions.map((e) => e.version), ['1.60101.1', '1.60101.10']);
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
  regzip(b.archives, 'acme-pack', '1.60101.1');
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
  assert.match(p.out, /acme-pack 1\.60101\.1 .*differing: RULES\.md/);
  assert.match(p.out, /extra: skills\/acme-skill\/EXTRA\.md/);
  assert.doesNotMatch(p.out, /[0-9a-f]{64}/, 'the message names paths, not gzip hashes');
  assert.equal(git(w.remote, 'rev-parse', 'vendored'), tip);
});

test('a pack.json without minEngineVersion fails the build naming the pack', () => {
  const w = world();
  put(w.src, 'packs/acme-pack-two/pack.json', JSON.stringify({ version: '1.60101.1' }) + '\n');
  commitAll(w.src, 'drop floor');
  const b = build(w);
  assert.notEqual(b.status, 0);
  assert.match(b.out, /acme-pack-two: pack\.json has no string minEngineVersion/);
  assert.equal(spawnSync('git', ['rev-parse', '--verify', '-q', 'vendored'], { cwd: w.remote }).status, 1);
});

test('without CN_PACKS_KEY and CN_PACKS_CERT it refuses and writes nothing', () => {
  const w = world();
  const p = publish(w, build(w).archives, { roots: testChain(scratch()).roots });
  assert.notEqual(p.status, 0);
  assert.match(p.out, /CN_PACKS_KEY and CN_PACKS_CERT/);
  assert.equal(spawnSync('git', ['rev-parse', '--verify', '-q', 'vendored'], { cwd: w.remote }).status, 1);
});

test('publish re-signs, under --roots, what verifies only against --previous-roots, leaving its bytes alone; without the flag it refuses', () => {
  const w = world();
  const old = testChain(scratch());
  const b = build(w);
  assert.equal(publish(w, b.archives, old).status, 0);
  const before = Object.fromEntries(['acme-pack/index.json', 'acme-pack-two/index.json', 'catalog.json'].map((f) => [f, show(w, f)]));
  const fresh = testChain(scratch());
  const refused = publish(w, b.archives, fresh);
  assert.notEqual(refused.status, 0);
  assert.match(refused.out, /acme-pack\/index\.json .*does not verify against --roots or --previous-roots/);
  assert.equal(vendoredLog(w).length, 2);
  const p = publish(w, b.archives, fresh, ['--previous-roots', old.roots]);
  assert.equal(p.status, 0, p.out);
  assert.match(p.out, /^re-signed acme-pack, acme-pack-two and the catalog under the given roots$/m);
  assert.equal(vendoredLog(w)[0], 'Re-sign 2 indexes and the catalog under the current roots');
  const roots = readRoots(fresh.roots);
  for (const id of ['acme-pack', 'acme-pack-two']) {
    assert.deepEqual(show(w, `${id}/index.json`), before[`${id}/index.json`]);
    assert.equal(verifyIndex(show(w, `${id}/index.json`), JSON.parse(show(w, `${id}/index.sig.json`)), roots, new Date()).keyId, fresh.keyId);
  }
  assert.deepEqual(show(w, 'catalog.json'), before['catalog.json']);
  assert.equal(verifyCatalog(show(w, 'catalog.json'), JSON.parse(show(w, 'catalog.sig.json')), roots, new Date()).keyId, fresh.keyId);
  const again = publish(w, b.archives, fresh);
  assert.equal(again.status, 0, again.out);
  assert.match(again.out, /^nothing to publish$/m);
  assert.doesNotMatch(again.out, /re-signed/);
  assert.equal(vendoredLog(w).length, 3);
});

test('publish re-signs what a certificate of the same roots signed before it expired', () => {
  const w = world();
  const old = testChain(scratch(), 'packs', { from: -120 * 86400e3, to: -30 * 86400e3 });
  const b = build(w);
  assert.equal(publish(w, b.archives, old, ['--now', new Date(Date.now() - 60 * 86400e3).toISOString()]).status, 0);
  const rotated = testChain(scratch(), 'packs', { root: old.rootKey });
  const p = publish(w, b.archives, rotated);
  assert.equal(p.status, 0, p.out);
  assert.match(p.out, /^re-signed acme-pack, acme-pack-two and the catalog under the given roots$/m);
  verifyIndex(show(w, 'acme-pack/index.json'), JSON.parse(show(w, 'acme-pack/index.sig.json')), readRoots(rotated.roots), new Date());
});

test('publish refuses, writing nothing, an index whose bytes no longer match its signature', () => {
  const w = world();
  const chain = testChain(scratch());
  const b = build(w);
  assert.equal(publish(w, b.archives, chain).status, 0);
  editVendored(w, (tree) => {
    const file = join(tree, 'acme-pack/index.json');
    const ix = JSON.parse(readFileSync(file, 'utf8'));
    ix.versions[0].sha256 = 'f'.repeat(64);
    writeFileSync(file, JSON.stringify(ix, null, 2) + '\n');
  }, 'tamper');
  for (const extra of [[], ['--previous-roots', chain.roots]]) {
    const p = publish(w, b.archives, chain, extra);
    assert.notEqual(p.status, 0, p.out);
    assert.match(p.out, /acme-pack\/index\.json .*does not verify/);
    assert.equal(vendoredLog(w)[0], 'tamper');
    assert.equal(vendoredLog(w).length, 3);
  }
  put(w.src, 'packs/acme-pack/pack.json', packJson('1.60101.2', { requires: ['acme-pack-two'] }));
  commitAll(w.src, 'bump');
  const carried = publish(w, build(w).archives, chain);
  assert.notEqual(carried.status, 0, carried.out);
  assert.match(carried.out, /acme-pack\/index\.json .*does not verify/);
  assert.equal(vendoredLog(w)[0], 'tamper');
});

test('publish refuses, writing nothing, an index whose signature is gone', () => {
  const w = world();
  const chain = testChain(scratch());
  const b = build(w);
  assert.equal(publish(w, b.archives, chain).status, 0);
  editVendored(w, (tree) => rmSync(join(tree, 'acme-pack-two/index.sig.json')), 'unsign');
  const p = publish(w, b.archives, chain);
  assert.notEqual(p.status, 0, p.out);
  assert.match(p.out, /acme-pack-two\/index\.json has no signature/);
  assert.equal(vendoredLog(w)[0], 'unsign');
  assert.equal(vendoredLog(w).length, 3);
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

test('publish no longer lists R2 objects; upload --r2 dry-run lists every object on the branch and reads no Cloudflare variable', () => {
  const w = world();
  const chain = testChain(scratch());
  const b = build(w);
  const p = publish(w, b.archives, chain);
  assert.equal(p.status, 0, p.out);
  assert.doesNotMatch(p.out, /would PUT/);

  const summary = join(scratch(), 'summary.md');
  const u = run(['upload', '--r2', 'dry-run', '--repo', w.src, '--remote', w.remote, '--roots', chain.roots, '--summary', summary],
    { CLOUDFLARE_API_TOKEN: 'acme', CLOUDFLARE_ACCOUNT_ID: 'acme' });
  assert.equal(u.status, 0, u.out);
  const sums = readFileSync(join(b.archives, 'SHA256SUMS'), 'utf8');
  for (const id of ['acme-pack', 'acme-pack-two']) {
    const hex = sums.match(new RegExp(`^([0-9a-f]{64})  ${id}-1\\.60101\\.1\\.tar\\.gz$`, 'm'))[1];
    const size = readFileSync(join(b.archives, `${id}-1.60101.1.tar.gz`)).length;
    assert.ok(u.out.includes(`would PUT packs/${id}/1.60101.1.tar.gz (${size} bytes, sha256 ${hex})\n`), u.out);
    assert.ok(u.out.includes(`would PUT packs/${id}/index.json\n`));
    assert.ok(u.out.includes(`would PUT packs/${id}/index.sig.json\n`));
  }
  assert.ok(u.out.includes('would PUT packs/catalog.json\n'), u.out);
  assert.ok(u.out.includes('would PUT packs/catalog.sig.json\n'));
  assert.equal(u.out.match(/^would PUT /gm).length, 8);
  assert.match(readFileSync(summary, 'utf8'), /8 object\(s\) would be PUT/);
});

test('upload to a bucket without CLOUDFLARE_API_TOKEN or CLOUDFLARE_ACCOUNT_ID fails with an error annotation', () => {
  const w = world();
  const chain = testChain(scratch());
  assert.equal(publish(w, build(w).archives, chain).status, 0);
  for (const env of [{}, { CLOUDFLARE_API_TOKEN: 'acme' }, { CLOUDFLARE_ACCOUNT_ID: 'acme' }]) {
    const u = run(['upload', '--r2', 'claudinite-packs', '--repo', w.src, '--remote', w.remote, '--roots', chain.roots], env);
    assert.equal(u.status, 1, u.out);
    assert.match(u.out, /^::error::.*CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID/m);
  }
});

test('upload with nothing on vendored says so and succeeds', () => {
  const w = world();
  const u = run(['upload', '--r2', 'dry-run', '--repo', w.src, '--remote', w.remote, '--roots', testChain(scratch()).roots]);
  assert.equal(u.status, 0, u.out);
  assert.match(u.out, /nothing on vendored to upload/);
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
  const file = join(b.archives, 'acme-pack-1.60101.1.tar.gz');
  const bytes = readFileSync(file);
  bytes[bytes.length - 1] ^= 1;
  writeFileSync(file, bytes);
  const p = publish(w, b.archives, chain);
  assert.notEqual(p.status, 0);
  assert.match(p.out, /acme-pack-1\.60101\.1\.tar\.gz does not match SHA256SUMS/);
  assert.equal(spawnSync('git', ['rev-parse', '--verify', '-q', 'vendored'], { cwd: w.remote }).status, 1);
});

test('plan lists every pack and whether its version is already on vendored', () => {
  const w = world();
  const chain = testChain(scratch());
  const before = run(['plan', '--packs', join(w.src, 'packs'), '--repo', w.src, '--remote', w.remote]);
  assert.equal(before.status, 0, before.out);
  assert.equal(before.stdout, 'publish acme-pack 1.60101.1\npublish acme-pack-two 1.60101.1\n');
  assert.equal(publish(w, build(w).archives, chain).status, 0);
  put(w.src, 'packs/acme-pack-two/pack.json', packJson('1.60101.2'));
  commitAll(w.src, 'bump two');
  const after = run(['plan', '--packs', join(w.src, 'packs'), '--repo', w.src, '--remote', w.remote]);
  assert.equal(after.stdout, 'published acme-pack 1.60101.1\npublish acme-pack-two 1.60101.2\n');
});

const planContent = (w) => run(['plan', '--content', '--packs', join(w.src, 'packs'), '--repo', w.src, '--remote', w.remote]);

test('plan --content after a publish says every pack is unchanged and exits 0', () => {
  const w = world();
  assert.equal(publish(w, build(w).archives, testChain(scratch())).status, 0);
  const p = planContent(w);
  assert.equal(p.status, 0, p.out);
  assert.equal(p.stdout, 'published acme-pack 1.60101.1 unchanged\npublished acme-pack-two 1.60101.1 unchanged\n');
});

test('plan --content against a remote with no vendored branch says it compared nothing, rather than passing silently', () => {
  const w = world();
  const p = planContent(w);
  assert.equal(p.status, 0, p.out);
  assert.match(p.stdout, /^::notice::.*no `vendored` branch.*nothing was compared/m);
  assert.match(p.stdout, /^publish acme-pack 1\.60101\.1$/m);
});

test('plan --content fails a shipped file changed without a bump, naming the pack and every differing, missing or extra path', () => {
  const w = world();
  assert.equal(publish(w, build(w).archives, testChain(scratch())).status, 0);
  put(w.src, 'packs/acme-pack/RULES.md', '# changed without a bump\n');
  put(w.src, 'packs/acme-pack/skills/acme-skill/EXTRA.md', 'new\n');
  git(w.src, 'rm', '-q', 'packs/acme-pack-two/RULES.md');
  commitAll(w.src, 'edit');
  const p = planContent(w);
  assert.equal(p.status, 1, p.out);
  assert.match(p.stdout, /^published acme-pack 1\.60101\.1 CHANGED: differing: RULES\.md; extra: skills\/acme-skill\/EXTRA\.md$/m);
  assert.match(p.stdout, /^published acme-pack-two 1\.60101\.1 CHANGED: missing: RULES\.md$/m);
});

test('plan --content ignores a change to a file the vendored set drops, so a test-only change needs no bump', () => {
  const w = world();
  assert.equal(publish(w, build(w).archives, testChain(scratch())).status, 0);
  put(w.src, 'packs/acme-pack/test/acme.test.mjs', 'changed\n');
  put(w.src, 'packs/acme-pack/test/x.mjs', 'new\n');
  commitAll(w.src, 'tests only');
  const p = planContent(w);
  assert.equal(p.status, 0, p.out);
  assert.match(p.stdout, /^published acme-pack 1\.60101\.1 unchanged$/m);
});

test('plan --content: a bumped version or a pack absent from vendored is to publish, exit 0', () => {
  const w = world();
  assert.equal(publish(w, build(w).archives, testChain(scratch())).status, 0);
  put(w.src, 'packs/acme-pack/pack.json', packJson('1.60101.2', { requires: ['acme-pack-two'] }));
  put(w.src, 'packs/acme-pack/RULES.md', '# revised\n');
  put(w.src, 'packs/acme-pack-three/pack.json', packJson('1.60101.1'));
  commitAll(w.src, 'bump and add');
  const p = planContent(w);
  assert.equal(p.status, 0, p.out);
  assert.equal(p.stdout, 'publish acme-pack 1.60101.2\npublish acme-pack-three 1.60101.1\npublished acme-pack-two 1.60101.1 unchanged\n');
});

test('plan fails a version to publish whose minEngineVersion publish would refuse, and passes once it names <major>.<day>.<n>', () => {
  const w = world();
  put(w.src, 'packs/acme-pack-two/pack.json', packJson('1.60101.1', { minEngineVersion: '60928.1' }));
  commitAll(w.src, 'two-part floor');
  assert.equal(publish(w, build(w).archives, testChain(scratch())).status, 1);
  const before = planContent(w);
  assert.equal(before.status, 1, before.out);
  assert.match(before.stdout, /^::error::acme-pack-two 1\.60101\.1: minEngineVersion "60928\.1" is not <major>\.<day>\.<n>/m);
  put(w.src, 'packs/acme-pack-two/pack.json', packJson('1.60101.1'));
  commitAll(w.src, 'a cn floor');
  assert.equal(publish(w, build(w).archives, testChain(scratch())).status, 0);
  const after = planContent(w);
  assert.equal(after.status, 0, after.out);
});

test('plan fails a version to publish whose fingerprint the catalog reader refuses, and publish never moves the branch', () => {
  const w = world();
  put(w.src, 'packs/acme-pack-two/pack.json', packJson('1.60101.1', { relevanceDetector: { about: 'x', paths: { source: 'a', flags: 'g' }, extra: 1 } }));
  commitAll(w.src, 'a sticky fingerprint');
  const before = planContent(w);
  assert.equal(before.status, 1, before.out);
  assert.match(before.stdout, /^::error::acme-pack-two 1\.60101\.1: relevanceDetector declares "extra", which is not one of about, paths, text, search$/m);
  assert.match(before.stdout, /^::error::acme-pack-two 1\.60101\.1: a relevanceDetector pattern carries the g or y flag, which makes \.test stateful$/m);
  const refused = publish(w, build(w).archives, testChain(scratch()));
  assert.equal(refused.status, 1, refused.out);
  assert.match(refused.out, /^release\.mjs: acme-pack-two 1\.60101\.1: relevanceDetector declares "extra"/m);
  put(w.src, 'packs/acme-pack-two/pack.json', packJson('1.60101.1', { relevanceDetector: { about: 'x', paths: { source: 'a' } } }));
  commitAll(w.src, 'a fingerprint the reader takes');
  assert.equal(publish(w, build(w).archives, testChain(scratch())).status, 0);
  const after = planContent(w);
  assert.equal(after.status, 0, after.out);
});

// Every version on main is on vendored once the release runs (plan refuses a changed pack without a
// bump, publish refuses a reused version), so each pack's pack.json here is the newest version of
// it on the branch: each is a <major>.<day>.<n> version and names its floor as a version publish
// takes, never a Node engine, which cn's Select skips, nor the retired <day>.<n>.0 form cn no
// longer reads.
test('the newest version of every pack on the branch is <major>.<day>.<n> and names a <major>.<day>.<n> minEngineVersion', () => {
  const refused = [];
  for (const id of git(REPO_ROOT, 'ls-tree', '--name-only', 'HEAD', 'packs/').trim().split('\n')) {
    const file = join(REPO_ROOT, id, 'pack.json');
    let manifest;
    try { manifest = JSON.parse(readFileSync(file, 'utf8')); } catch { continue; }
    try { packFields(id.replace('packs/', ''), manifest, { isNew: true }); } catch (e) { refused.push(e.message); }
  }
  assert.deepEqual(refused, []);
});
