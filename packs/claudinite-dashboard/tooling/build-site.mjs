// Assemble the publishable site from the pack.
//
// Run by the `publish-pages` task, which pushes what this produces to `gh-pages` for
// the seeded workflow to deploy; and by hand, from the member's root, to see what a
// run would publish:
//   node .claudinite/shared/packs/claudinite-dashboard/tooling/build-site.mjs [--out _site]
//
// Reads its deployment settings through `deployment-config.mjs`, which is also what the
// deploy-oauth-exchange task reads, so the button and the endpoint it calls cannot be
// configured against different apps. That module owns which store each key lives in.
// Every key but `mode` is optional.
//
// THE PAGE IMPORTS NOTHING OUTSIDE THIS PACK, so the site is the pack's own `src/` and
// its icon, and nothing else is staged: no engine, no sibling pack.
//
// INERT RATHER THAN FAILING in one case alone: the pack is here without its page — not
// vendored whole yet — and the build exits clean having produced nothing.

import { cp, mkdir, writeFile, rm, rename, access } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveMode } from '../src/read/config.mjs';
import { deploymentConfig } from './deployment-config.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

// The page is published where a mount holds it, `packs/claudinite-dashboard/`, with the
// site root a redirect, so a deployment's URL is the same whichever build produced it.
const HOME = 'packs/claudinite-dashboard';
// WHERE THE PAGE IS STORED, AND WHERE IT IS SERVED. An HTML `src=` resolves against the
// document's URL, so the page's script tag names `./src/app.mjs` — correct at the URL it
// is served from, which is the pack root, not the `src/` directory the file sits in. The
// staging step below moves it up so the two agree; serve.mjs does the same for local runs.
const PAGE_AT = 'src/index.html';

// What publishes: everything the browser loads is under `src/`, plus the icon the page
// names beside it. Decided by a directory the tree already names rather than by a list
// of files to leave out, so a file added to the pack root is unpublished until it is
// named here.
const PUBLISHED = ['src', 'favicon.svg'];

const exists = async (p) => { try { await access(p); return true; } catch { return false; } };

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
};

const repoRoot = resolve(arg('root', process.cwd()));
const OUT = resolve(repoRoot, arg('out', '_site'));

// This script ships in the pack's `tooling/`, so the page is the directory above it —
// no path guessing, and it stays right if the pack is ever renamed.
const pageSource = resolve(HERE, '..');

if (!await exists(join(pageSource, PAGE_AT))) {
  process.stdout.write(
    `No dashboard page at ${join(pageSource, PAGE_AT)} — nothing to publish. `
    + 'The pack is not vendored whole here; the next update that delivers it will make this build produce a site.\n',
  );
  process.exit(0);
}

// --- settings, from the member's own declaration ---------------------------------

const { cfg, legacy } = await deploymentConfig(repoRoot);
// A deployment still carrying the sign-in pair in its declaration builds correctly and
// is told, once, where the pair lives now. Silence here would leave it on the old
// footing indefinitely, since nothing converges a member's own settings file.
if (legacy.length) {
  process.stdout.write(`NOTE: sign-in read from the declaration for ${legacy.join(', ')} — repository variables take precedence.\n`);
}

// --- stage ------------------------------------------------------------------------

await rm(OUT, { recursive: true, force: true });
await mkdir(join(OUT, HOME), { recursive: true });

for (const f of PUBLISHED) await cp(join(pageSource, f), join(OUT, HOME, f), { recursive: true });

// The page up to the root it is served from, so its own `./src/app.mjs` resolves. A copy
// would leave a second, broken entry at `src/index.html` for anyone who found it.
await rename(join(OUT, HOME, PAGE_AT), join(OUT, HOME, 'index.html'));

await writeFile(join(OUT, 'index.html'), `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Claudinite tasks</title>
<link rel="icon" href="./${HOME}/favicon.svg" type="image/svg+xml">
<meta http-equiv="refresh" content="0; url=./${HOME}/">
<link rel="canonical" href="./${HOME}/">
</head>
<body><p>Continue to the <a href="./${HOME}/">task dashboard</a>.</p></body>
</html>
`);

// Pages runs uploaded artifacts through Jekyll unless told otherwise, and Jekyll drops
// files and directories beginning with an underscore.
await writeFile(join(OUT, '.nojekyll'), '');

// --- the config the page reads -------------------------------------------------------

const repoSlug = process.env.GITHUB_REPOSITORY ?? null;
// Which dashboard this is — STATED by the declaration, and refused when it is not, or
// when the declaration carries a key nothing reads any more. The judgment is
// resolveMode's alone so the build and the page cannot drift apart.
//
// A fleet's members are never resolved here: `owner` travels through and the page
// enumerates it IN THE BROWSER, as the viewer, so no repo list is stored anywhere and
// the fleet a person sees is exactly the fleet they can read.
let fleetMode;
try {
  fleetMode = resolveMode(cfg) === 'fleet';
} catch (e) {
  process.stderr.write(`claudinite-dashboard: ${e.message}\n`);
  process.exit(1);
}
const config = {
  mode: fleetMode ? 'fleet' : 'repo',
  clientId: cfg.clientId ?? null,
  exchangeUrl: cfg.exchangeUrl ?? null,
  redirectUri: cfg.redirectUri ?? null,
  // Whose repos a fleet deployment covers, enumerated in the browser as the viewer, and
  // which of them are not members. Both travel through as they stand: this build has no
  // credential to enumerate with, and would be the wrong place to try — a list resolved
  // here would be the same list for every viewer.
  owner: cfg.owner ?? null,
  exclude: Array.isArray(cfg.exclude) ? cfg.exclude : [],
  // In fleet mode the overview is the landing view, so nothing is preselected; in repo
  // mode there is exactly one repo to show and it is this one.
  defaultRepo: fleetMode ? null : (cfg.defaultRepo ?? repoSlug),
  // Where this site is published from: a fleet deployment reads its roster artifact and
  // its own cards there.
  deploymentRepo: repoSlug,
  // The rate table travels through as it stands, like every other declared key. It is
  // ordinary config rather than a secret — a published price list — and UNSET is a
  // valid deployment: the page then reads every dollar figure as unpriced and names
  // the key, which is a stated gap rather than a wrong number.
  rates: (cfg.rates && typeof cfg.rates === 'object') ? cfg.rates : null,
};
await writeFile(join(OUT, HOME, 'dashboard.config.json'), `${JSON.stringify(config, null, 2)}\n`);

// Say which mode the site actually built in. Sign-in quietly not being configured, or a
// fleet roster quietly not arriving, are exactly the things nobody notices until they
// wonder why the page will not let them in or is showing one repo.
const signIn = config.clientId && config.exchangeUrl
  ? 'configured'
  : `NOT configured — NOBODY CAN READ THE SITE${config.clientId ? ' (exchangeUrl missing)' : ''}${config.exchangeUrl ? ' (clientId missing)' : ''}`;
const covers = cfg.owner
  ? `every repo under ${cfg.owner} the viewer can read${config.exclude.length ? `, less ${config.exclude.length} excluded` : ''}`
  : `this repo${config.defaultRepo ? ` (${config.defaultRepo})` : ''}`;
process.stdout.write(
  `Built ${OUT}\n`
  + `  mode: ${fleetMode ? 'fleet-dashboard' : 'repo-dashboard'} (declared)\n`
  + `  covers: ${covers}\n`
  + (fleetMode ? `  freshness: the roster ${repoSlug ?? 'this repo'}'s fleet-roster task publishes, read by the page; none means unknown\n` : '')
  + `  sign-in: ${signIn}\n`,
);
