// packs/directory.GENERATED.md, the catalog of every pack a repository can adopt from this shelf,
// rendered from packs/*/pack.json and the newest stable version the published catalog names.
//
//   node tools/directory/render.mjs [--check] [--packs <dir>] [--out <file>]
//                                   [--catalog <file> | --remote <name|url>]
//
// Writes the doc, or with --check exits 1 when the doc differs from a fresh render. The Stable
// column comes from `catalog.json` on the remote's `vendored` branch (`--remote`, default origin),
// or from a file (`--catalog`); a shelf with no `vendored` branch renders every pack unpromoted.
// A `hidden` pack is left out: the directory is what the shelf offers.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { fetchVendored, showFile } from '../release/branch.mjs';
import { CATALOG } from '../release/catalog.mjs';

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const DOC = 'packs/directory.GENERATED.md';

export class DirectoryError extends Error {}

// A manifest string as one table cell: on the row's one line, opening no new column.
const cell = (s) => String(s).replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();

function activation(pack) {
  const parts = [];
  if (pack.seededByDefault) parts.push('seeded at adoption');
  if (pack.relevanceDetector) parts.push(`fingerprinted: ${cell(pack.relevanceDetector.about)}`);
  return parts.length ? parts.join('; ') : 'declared by hand (opt-in)';
}

// Every pack directory's manifest under `packs`, with its id.
export function readShelf(packs) {
  return readdirSync(packs, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(packs, d.name, 'pack.json')))
    .map((d) => ({ id: d.name, ...JSON.parse(readFileSync(join(packs, d.name, 'pack.json'), 'utf8')) }));
}

// { id: version } for every pack the catalog carries a stable version of.
export function stableVersions(catalog) {
  const out = {};
  for (const p of catalog?.packs ?? []) if (p.channel === 'stable') out[p.id] = p.version;
  return out;
}

export function render(packs, stable = {}) {
  const rows = packs.filter((p) => !p.hidden).sort((a, b) => a.id.localeCompare(b.id)).map((p) => [
    `\`${p.id}\``, cell(p.version ?? '—'), stable[p.id] ? cell(stable[p.id]) : '—',
    cell(p.ruleRoutingGuidance?.belongs ?? ''), cell(p.ruleRoutingGuidance?.excludes ?? ''), activation(p),
    p.requires?.length ? p.requires.map((r) => `\`${r}\``).join(', ') : '—',
  ].join(' | ')).map((r) => `| ${r} |`);
  return `# Claudinite packs — the full directory

Every pack a repository can adopt from this shelf, whether or not it declares it yet. A pack
activates only where the repository declares it; adding one is the \`adopt-pack\` skill's job. A
fingerprint only *suspects* a pack is wanted — declaring it is always the project's call.
**Version** is the pack's version on \`main\`, which the release publishes on the \`canary\`
channel; **Stable** is the newest version promoted to \`stable\`, the one a repository on the
default channel receives.

GENERATED — do not hand-edit. Rendered from the pack manifests and the published catalog by
\`tools/directory/render.mjs\`; \`render.mjs --check\` fails when this file differs from a fresh
render.

| Pack | Version | Stable | What it covers | Not this pack | Activation | Requires |
|---|---|---|---|---|---|---|
${rows.join('\n')}
`;
}

function readCatalog(opts) {
  if (opts.catalog) return JSON.parse(readFileSync(opts.catalog, 'utf8'));
  const tip = fetchVendored(REPO_ROOT, opts.remote);
  if (tip === null) return null;
  try {
    return JSON.parse(showFile(REPO_ROOT, tip, CATALOG).toString('utf8'));
  } catch (e) {
    throw new DirectoryError(e.message);
  }
}

function main(argv) {
  const opts = { check: false, packs: join(REPO_ROOT, 'packs'), out: join(REPO_ROOT, DOC), catalog: null, remote: 'origin' };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--check') opts.check = true;
    else if (['--packs', '--out', '--catalog', '--remote'].includes(argv[i]) && argv[i + 1] !== undefined) opts[argv[i].slice(2)] = argv[++i];
    else throw new DirectoryError(`unknown argument ${argv[i]}; usage: render.mjs [--check] [--packs <dir>] [--out <file>] [--catalog <file> | --remote <name|url>]`);
  }
  const packs = readShelf(opts.packs);
  if (!packs.length) throw new DirectoryError(`no pack.json under ${opts.packs}: the directory would be empty`);
  const doc = render(packs, stableVersions(readCatalog(opts)));
  const offered = packs.filter((p) => !p.hidden).length;
  if (opts.check) {
    let current = null;
    try { current = readFileSync(opts.out, 'utf8'); } catch { /* absent reads as stale */ }
    if (current !== doc) {
      console.log(`the pack directory is stale: ${opts.out} differs from a fresh render; run node tools/directory/render.mjs`);
      return 1;
    }
    console.log(`pack directory current: ${offered} packs offered`);
    return 0;
  }
  writeFileSync(opts.out, doc);
  console.log(`wrote ${opts.out}: ${offered} packs offered`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (e) {
    if (!(e instanceof DirectoryError)) throw e;
    console.error(`render.mjs: ${e.message}`);
    process.exitCode = 1;
  }
}
