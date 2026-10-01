// The release tests' shared fixture: a source repo with two synthetic packs, a bare remote, a
// throwaway signing chain, and the release program run as a subprocess.
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash, generateKeyPairSync, sign as edSign } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DOMAINS, keyId } from '../sign/sign.mjs';

export const RELEASE = fileURLToPath(new URL('./release.mjs', import.meta.url));
export const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const DEV_ROOTS = join(REPO_ROOT, 'keys/dev/roots');
// The development certificate's notBefore plus one day: an instant inside its window that does
// not move with the clock, so the dev-key case stays green past the certificate's expiry.
export function devCertInstant() {
  const cert = JSON.parse(readFileSync(join(REPO_ROOT, 'keys/dev/packs.cert.json'), 'utf8'));
  const body = JSON.parse(Buffer.from(cert.payload, 'base64url').toString('utf8'));
  return new Date(Date.parse(body.notBefore) + 86400e3).toISOString();
}
export const scratch = () => mkdtempSync(join(tmpdir(), 'acme-release-'));

export const GIT_ENV = {
  GIT_AUTHOR_NAME: 'Acme Author', GIT_AUTHOR_EMAIL: 'author@acme.example',
  GIT_COMMITTER_NAME: 'Acme Committer', GIT_COMMITTER_EMAIL: 'committer@acme.example',
};
export const git = (cwd, ...args) => execFileSync('git', args, { cwd, env: { ...process.env, ...GIT_ENV }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

export function put(root, path, content) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
}

export function packJson(version, extra = {}) {
  return JSON.stringify({ version, minEngineVersion: '60101.1', ...extra }, null, 2) + '\n';
}

// A source repo with two synthetic packs, and a bare remote with no `vendored` branch.
export function world() {
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

export function commitAll(src, message) {
  git(src, 'add', '-A');
  git(src, 'commit', '-q', '-m', message);
}

// A test root and a packs key it certifies, valid around now.
export function testChain(dir, use = 'packs') {
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

export function run(args, env = {}) {
  const clean = { ...process.env };
  delete clean.CN_PACKS_KEY;
  delete clean.CN_PACKS_CERT;
  for (const k of Object.keys(clean)) if (k.startsWith('CLOUDFLARE') || k.startsWith('R2_')) delete clean[k];
  const r = spawnSync(process.execPath, [RELEASE, ...args], { env: { ...clean, ...GIT_ENV, ...env }, encoding: 'utf8' });
  return { status: r.status, out: r.stdout + r.stderr, stdout: r.stdout };
}

export function build(w) {
  const archives = join(scratch(), 'archives');
  return { ...run(['build', '--packs', join(w.src, 'packs'), '--out', archives]), archives };
}

export function publish(w, archives, chain, extra = []) {
  return run(['publish', '--archives', archives, '--repo', w.src, '--remote', w.remote, '--roots', chain.roots, ...extra],
    chain.key ? { CN_PACKS_KEY: chain.key, CN_PACKS_CERT: chain.cert } : {});
}

export const vendoredLog = (w) => git(w.remote, 'log', '--format=%s', 'vendored').split('\n');
export const show = (w, path) => execFileSync('git', ['show', `vendored:${path}`], { cwd: w.remote });
export const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
