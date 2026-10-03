import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, mkdtemp, mkdir, writeFile, cp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';


const run = promisify(execFile);

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const PACK_DIR = join(ROOT, 'packs/claudinite-dashboard');
const MEMBER_FILE = '.claudinite/flat/member.GENERATED.json';

// --- build-site, against a cn member ----------------------------------------------

// Stand up a member the way `cn` leaves one: its settings in a format this build never
// parses, and the member file `cn` writes from them, which is all the build reads. The
// pack sits OUTSIDE the member's tree, where `cn` keeps the packs it fetched, with no
// engine and no sibling pack beside it — so a build that still reached for either
// fails here. A pack's tests are dropped on the way, as the published archive drops
// them.
async function member(declaration, { memberFile = true } = {}) {
  const base = await mkdtemp(join(tmpdir(), 'cd-member-'));
  const dir = join(base, 'repo');
  const pack = join(base, 'packs', 'claudinite-dashboard');
  await mkdir(join(dir, '.claudinite/flat'), { recursive: true });
  await cp(PACK_DIR, pack, { recursive: true, filter: (src) => !src.startsWith(join(PACK_DIR, 'test')) });
  await writeFile(join(dir, '.claudinite/settings.yaml'), 'packs:\n  - claudinite-dashboard\n');
  if (memberFile) {
    await writeFile(join(dir, MEMBER_FILE), JSON.stringify({
      version: 1,
      settings: { path: '.claudinite/settings.yaml', format: 'yaml' },
      engine: { package: '@claudinite/cn', version: '61003.1', channel: 'stable' },
      packs: { channel: 'stable', declared: declaration.packs },
      dormant: false,
      held: {},
    }, null, 2));
  }
  return { base, dir, pack };
}

const build = ({ dir, pack }, env = {}) => run('node',
  [join(pack, 'tooling/build-site.mjs'), '--root', dir],
  { cwd: dir, env: { ...process.env, ...env } });

const cleanup = (t, m) => t.after(() => rm(m.base, { recursive: true, force: true }));
const readJson = async (p) => JSON.parse(await readFile(p, 'utf8'));
const CONFIG_AT = '_site/packs/claudinite-dashboard/dashboard.config.json';
const REPO = { packs: [{ id: 'claudinite-dashboard', config: { mode: 'repo' } }] };

// The defect this pack carried onto cn: the build looked for the engine beside the pack,
// found none on a cn member, and exited 0 with "nothing to publish" — so publish-pages
// published nothing and reported success.
test('a cn member builds this repo\'s own dashboard, with no engine anywhere', async (t) => {
  const m = await member(REPO);
  cleanup(t, m);

  const { stdout } = await build(m, { GITHUB_REPOSITORY: 'o/mine' });
  assert.doesNotMatch(stdout, /nothing to publish/i);
  assert.ok(existsSync(join(m.dir, '_site/index.html')), 'a site was built');
  const cfg = await readJson(join(m.dir, CONFIG_AT));
  assert.equal(cfg.mode, 'repo', 'the page is told which dashboard it is, never left to infer it');
  assert.equal(cfg.defaultRepo, 'o/mine');
  assert.equal(cfg.deploymentRepo, 'o/mine');
  assert.equal(cfg.clientId, null);
  for (const retired of ['rosterUrl', 'repos', 'canonRepo']) assert.equal(Object.hasOwn(cfg, retired), false, `${retired} is not published`);
});

test('the staged tree is the pack alone, with the root a redirect', async (t) => {
  const m = await member(REPO);
  cleanup(t, m);
  await build(m);

  for (const p of [
    '_site/index.html',
    '_site/packs/claudinite-dashboard/index.html',
    '_site/packs/claudinite-dashboard/src/derive/model.mjs',
    '_site/.nojekyll',
  ]) assert.ok(existsSync(join(m.dir, p)), `missing from the staged site: ${p}`);
  assert.deepEqual((await readdir(join(m.dir, '_site'))).sort(), ['.nojekyll', 'index.html', 'packs']);
  assert.deepEqual(await readdir(join(m.dir, '_site/packs')), ['claudinite-dashboard'], 'no engine, no sibling pack');

  // The page is stored under `src/` and served from the directory above it. A staged
  // tree that left it in place would serve a page whose every path is off by one
  // directory, which is the one way this relocation can fail silently.
  assert.ok(!existsSync(join(m.dir, '_site/packs/claudinite-dashboard/src/index.html')),
    'the page must be moved to the root it is served from, not copied');

  const root = await readFile(join(m.dir, '_site/index.html'), 'utf8');
  assert.match(root, /url=\.\/packs\/claudinite-dashboard\//);
});

// Every relative import the page makes must resolve inside the pack's own staged
// directory — the check that would have caught a flattening bug, or an import climbing
// out to an engine or a sibling pack, without a browser.
test('every relative import in the staged page resolves inside the pack', async (t) => {
  const m = await member(REPO);
  cleanup(t, m);
  await build(m);

  const pageDir = join(m.dir, '_site/packs/claudinite-dashboard');
  // Every staged module, at whatever depth `src/` puts it, and each specifier resolved
  // against ITS OWN directory — a page whose modules sit in layer folders is only
  // reachable if each file's own climb is right, which a page-root-relative check
  // cannot see.
  const { stdout } = await run('sh', ['-c',
    `find ${pageDir} -name '*.mjs' -exec grep -Ho "from '[^']*'" {} + | sort -u`]);
  const specs = stdout.split('\n')
    .map((l) => /^([^:]+):from '([^']*)'/.exec(l))
    .filter(Boolean)
    .map(([, file, spec]) => ({ file, spec }))
    .filter(({ spec }) => spec.startsWith('.'));
  assert.ok(specs.length > 0, 'found no relative imports — the grep is wrong, not the page');
  for (const { file, spec } of specs) {
    const to = resolve(dirname(file), spec);
    assert.ok(!relative(pageDir, to).startsWith('..'), `${relative(pageDir, file)} imports ${spec}, outside the pack`);
    assert.ok(existsSync(to), `${relative(pageDir, file)} imports ${spec}, which is not in the site`);
  }
});

test('local-only and explanatory files are not published', async (t) => {
  const m = await member(REPO);
  cleanup(t, m);
  await build(m);

  for (const f of ['tooling', 'tasks', 'docs', 'pack.json', 'README.md', 'stubs', 'worldRules']) {
    assert.ok(!existsSync(join(m.dir, '_site/packs/claudinite-dashboard', f)), `${f} must not be published`);
  }
});

test('a fleet names an owner, and the deployment repo is where its roster is read', async (t) => {
  const m = await member({ packs: [{ id: 'claudinite-dashboard', config: { mode: 'fleet', owner: 'o', exclude: ['o/skip'] } }] });
  cleanup(t, m);
  const { stdout } = await build(m, { GITHUB_REPOSITORY: 'o/manager' });

  const cfg = await readJson(join(m.dir, CONFIG_AT));
  assert.equal(cfg.mode, 'fleet');
  assert.equal(cfg.owner, 'o');
  assert.deepEqual(cfg.exclude, ['o/skip']);
  assert.equal(cfg.deploymentRepo, 'o/manager');
  assert.equal(cfg.defaultRepo, null, 'a fleet deployment lands on the overview, not inside one member');
  assert.match(stdout, /freshness: .*o\/manager/);
});

// A key nothing reads any more fails the build rather than publishing a page that
// quietly ignores it.
test('a retired roster or canon key fails the build naming row 111, and publishes nothing', async (t) => {
  for (const config of [
    { mode: 'fleet', owner: 'o', rosterFile: 'fleet.json' },
    { mode: 'fleet', owner: 'o', repos: ['o/a', 'o/b'] },
    { mode: 'repo', canonRepo: 'o/canon' },
  ]) {
    const m = await member({ packs: [{ id: 'claudinite-dashboard', config }] });
    cleanup(t, m);
    const res = await build(m).catch((e) => e);
    assert.ok(res instanceof Error, `${JSON.stringify(config)} must fail`);
    assert.match(String(res.stderr), /row 111/);
    assert.equal(existsSync(join(m.dir, CONFIG_AT)), false, 'and nothing is published');
  }
});

test('sign-in needs both halves, and the build says which is missing', async (t) => {
  const m = await member(REPO);
  cleanup(t, m);

  const { stdout } = await build(m, { CLAUDINITE_DASHBOARD_CLIENT_ID: 'Iv1.x' });
  assert.match(stdout, /sign-in: NOT configured/);
  assert.match(stdout, /exchangeUrl missing/);
});

// The pair travel as repository variables, so the build has to read them from its
// environment — the workflow passes them, and nothing in the settings file carries them.
test('the sign-in pair reach the published config from repository variables', async (t) => {
  const m = await member(REPO);
  cleanup(t, m);

  const { stdout } = await build(m, {
    CLAUDINITE_DASHBOARD_CLIENT_ID: 'Iv1.fromVar',
    CLAUDINITE_DASHBOARD_EXCHANGE_URL: 'https://w.example',
  });
  assert.match(stdout, /sign-in: configured/);
  const cfg = await readJson(join(m.dir, CONFIG_AT));
  assert.equal(cfg.clientId, 'Iv1.fromVar');
  assert.equal(cfg.exchangeUrl, 'https://w.example');
  assert.doesNotMatch(stdout, /NOTE: sign-in read from the declaration/);
});

// A deployment that configured the pair before the variables existed keeps its button —
// nothing converges a member's settings file — and is told once where they live now.
test('a declared pair still builds a signed-in site, and says it is on the old footing', async (t) => {
  const m = await member({ packs: [{ id: 'claudinite-dashboard', config: { mode: 'repo', clientId: 'Iv1.old', exchangeUrl: 'https://old.example' } }] });
  cleanup(t, m);

  const { stdout } = await build(m);
  assert.match(stdout, /sign-in: configured/);
  assert.match(stdout, /NOTE: sign-in read from the declaration for .*clientId.*exchangeUrl/);
  const cfg = await readJson(join(m.dir, CONFIG_AT));
  assert.equal(cfg.clientId, 'Iv1.old');
});

// The pack present without its page is the one inert case: exit clean, build nothing.
test('a pack without its page produces nothing and exits clean', async (t) => {
  const m = await member(REPO);
  cleanup(t, m);
  await rm(join(m.pack, 'src/index.html'));

  const { stdout } = await build(m);
  assert.match(stdout, /nothing to publish/i);
  assert.equal(existsSync(join(m.dir, '_site')), false);
});

// --- the mode, which the build refuses to guess ---------------------------------------

// The behaviour this replaces: a declaration that said nothing published as this repo's
// own page. That is fine when it is what the deployer meant and silently wrong when it
// is not — a fleet deployment whose roster source was dropped or misspelled published a
// one-repo dashboard that looked entirely intentional. So the build now refuses, and the
// deployment says which dashboard it is.
test('a declaration that states no mode publishes nothing and says why', async (t) => {
  const m = await member({ packs: ['claudinite-dashboard'] });
  cleanup(t, m);

  const res = await build(m, { GITHUB_REPOSITORY: 'o/x' }).catch((e) => e);
  assert.ok(res instanceof Error, 'the build must fail, not publish a guess');
  assert.match(String(res.stderr ?? res.message), /does not say which dashboard it is/);
  assert.equal(existsSync(join(m.dir, CONFIG_AT)), false, 'and nothing is published');
});

// The member file is the declaration this build reads. A member whose cn has not
// written it — or a Node member's settings file standing alone — states no mode here.
test('a repo with no member file is refused for the same reason, whatever settings file it keeps', async (t) => {
  const m = await member(REPO, { memberFile: false });
  cleanup(t, m);
  await writeFile(join(m.dir, '.claudinite-settings.json'), JSON.stringify(REPO));

  const res = await build(m, { GITHUB_REPOSITORY: 'o/x' }).catch((e) => e);
  assert.ok(res instanceof Error);
  assert.match(String(res.stderr ?? res.message), /does not say which dashboard it is/);
});

test('a mode that contradicts the config is refused too, in both directions', async (t) => {
  const fleetNoRoster = await member({ packs: [{ id: 'claudinite-dashboard', config: { mode: 'fleet' } }] });
  cleanup(t, fleetNoRoster);
  const a = await build(fleetNoRoster).catch((e) => e);
  assert.match(String(a.stderr ?? a.message), /names no roster source/);

  const repoWithOwner = await member({ packs: [{ id: 'claudinite-dashboard', config: { mode: 'repo', owner: 'o' } }] });
  cleanup(t, repoWithOwner);
  const b = await build(repoWithOwner).catch((e) => e);
  assert.match(String(b.stderr ?? b.message), /roster source/);
});

