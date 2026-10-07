// Assemble the publishable site from the pack.
//
// Run by the `publish-pages` task, which pushes what this produces to `gh-pages` for
// the seeded workflow to deploy; and by hand, from the member's root, to see what a
// run would publish:
//   node .claudinite/shared/packs/claudinite-single-repo-dashboard/tooling/build-site.mjs [--out _site]
//
// Reads its deployment settings through `deployment-config.mjs`, which is also what the
// deploy-oauth-exchange task reads, so the button and the endpoint it calls cannot be
// configured against different apps. That module owns which store each key lives in.
// Every key is optional.
//
// THE PAGE IMPORTS NOTHING OUTSIDE THIS PACK, so the site is the pack's own `src/` and
// its icon, and nothing else is staged: no engine, no sibling pack.
//
// INERT RATHER THAN FAILING in one case alone: the pack is here without its page — not
// vendored whole yet — and the build exits clean having produced nothing.

import { cp, mkdir, writeFile, rm, rename, access } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkConfig } from '../src/read/config.mjs';
import { deploymentConfig } from './deployment-config.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

// The page is published where a mount holds it, `packs/claudinite-single-repo-dashboard/`, with the
// site root a redirect, so a deployment's URL is the same whichever build produced it.
const HOME = 'packs/claudinite-single-repo-dashboard';
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

const { cfg, legacy, memberFault } = await deploymentConfig(repoRoot);
if (memberFault) {
  process.stderr.write(`claudinite-single-repo-dashboard: ${memberFault}\n`);
  process.exit(1);
}
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
// A declaration carrying a key nothing reads is refused, and checkConfig alone says
// which, so the build and the page cannot drift apart.
try {
  checkConfig(cfg);
} catch (e) {
  process.stderr.write(`claudinite-single-repo-dashboard: ${e.message}\n`);
  process.exit(1);
}
const config = {
  clientId: cfg.clientId ?? null,
  exchangeUrl: cfg.exchangeUrl ?? null,
  redirectUri: cfg.redirectUri ?? null,
  // There is exactly one repo to show, and unless the declaration names another it is
  // this one.
  defaultRepo: cfg.defaultRepo ?? repoSlug,
  // The rate table travels through as it stands, like every other declared key. It is
  // ordinary config rather than a secret — a published price list — and UNSET is a
  // valid deployment: the page then reads every dollar figure as unpriced and names
  // the key, which is a stated gap rather than a wrong number.
  rates: (cfg.rates && typeof cfg.rates === 'object') ? cfg.rates : null,
};
await writeFile(join(OUT, HOME, 'dashboard.config.json'), `${JSON.stringify(config, null, 2)}\n`);

// Say what the site actually built. Sign-in quietly not being configured is exactly the
// thing nobody notices until they wonder why the page will not let them in.
const signIn = config.clientId && config.exchangeUrl
  ? 'configured'
  : `NOT configured — NOBODY CAN READ THE SITE${config.clientId ? ' (exchangeUrl missing)' : ''}${config.exchangeUrl ? ' (clientId missing)' : ''}`;
process.stdout.write(
  `Built ${OUT}\n`
  + `  covers: ${config.defaultRepo ?? 'the repo the URL names'}\n`
  + `  sign-in: ${signIn}\n`,
);
