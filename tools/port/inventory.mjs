#!/usr/bin/env node
// The porting inventory: every file under packs/<id>/ in one class, with whether it imports
// Claudinite's engine by relative path, rendered as docs/porting-inventory.GENERATED.md, the
// worklist each phase-6 slice reads.
//
//   node tools/port/inventory.mjs [--check] [--packs <dir>] [--out <file>]
//
// Writes the doc, or with --check exits 1 when the doc differs from a fresh render. The coded-check
// class follows the frozen Claudinite's engine/pack_loader/pack-conventions.mjs: rule modules are
// the non-test *.mjs directly under worldRules/ or workRules/, and a skill's checks.mjs (with the
// sibling modules it imports) is gathered as that skill's checks. A file matching two classes
// fails the run rather than being counted twice.
import { lstatSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, posix } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const DOC = 'docs/porting-inventory.GENERATED.md';

export const CLASSES = ['content', 'declared', 'coded-check', 'task', 'src', 'test', 'workflow', 'other'];
const LISTED = ['coded-check', 'task', 'src', 'test', 'other'];

class InventoryError extends Error {}

const isTest = (rel) => rel.startsWith('test/') || rel.endsWith('.test.mjs');
const TASK_FILE = /^(?:queue\/)?tasks\/[^/]+\/(?:task\.json|task\.md|worker\.mjs|preconditions\.mjs)$/;
const isTaskFile = (rel) => TASK_FILE.test(rel);
const DECLARED_NAMES = new Set(['declared-checks.json', 'merge-rules.json', 'pack.json']);
const isCodedCheck = (rel, ctx) => rel.endsWith('.mjs') && !isTest(rel)
  && (/^(?:worldRules|workRules|checks|hooks)\/[^/]+\.mjs$/.test(rel) || ctx.skillChecks.has(rel));

// Each rule is judged on its own; the inventory fails a file more than one accepts.
export const RULES = [
  { class: 'test', match: (rel) => isTest(rel) },
  { class: 'content', match: (rel) => !isTest(rel) && !isTaskFile(rel) && (rel.startsWith('provenance/') || rel.endsWith('.md') || rel === 'badge.svg') },
  {
    class: 'declared',
    match: (rel) => !isTest(rel) && !isTaskFile(rel) && !rel.startsWith('provenance/') && rel.endsWith('.json')
      && (DECLARED_NAMES.has(posix.basename(rel)) || !rel.includes('/') || /^(?:queue\/)?tasks\//.test(rel)),
  },
  { class: 'coded-check', match: (rel, ctx) => isCodedCheck(rel, ctx) },
  { class: 'task', match: (rel) => !isTest(rel) && isTaskFile(rel) },
  { class: 'src', match: (rel, ctx) => rel.endsWith('.mjs') && !isTest(rel) && !isTaskFile(rel) && !isCodedCheck(rel, ctx) && !rel.startsWith('provenance/') },
  { class: 'workflow', match: (rel) => !isTest(rel) && /\.ya?ml$/.test(rel) && rel.split('/').some((d) => d === 'stubs' || d === '.github') },
];

// A static import or re-export, a bare import, or a dynamic import with no quote before it on its
// line, of a path climbing (../)+ into engine/. Import syntax inside a string literal does not count.
const ENGINE_IMPORTS = [
  /^[ \t]*(?:import|export)\b[^'";]*?\bfrom[ \t]*['"](?:\.\.\/)+engine\//m,
  /^[ \t]*import[ \t]*['"](?:\.\.\/)+engine\//m,
  /^[^'"`\n]*\bimport\([ \t]*['"](?:\.\.\/)+engine\//m,
];
export const importsEngine = (text) => ENGINE_IMPORTS.some((re) => re.test(text));

const byBytes = (a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b));

function walk(dir) {
  const out = [];
  const visit = (rel) => {
    for (const name of readdirSync(join(dir, rel))) {
      const path = rel ? `${rel}/${name}` : name;
      const st = lstatSync(join(dir, path));
      if (st.isDirectory()) visit(path);
      else if (st.isFile()) out.push(path);
      else throw new InventoryError(`${path} is neither a file nor a directory`);
    }
  };
  visit('');
  return out.sort(byBytes);
}

// skills/<x>/checks.mjs and every sibling module it imports, followed through those modules.
function skillCheckModules(packDir, files) {
  const found = new Set();
  const queue = files.filter((f) => /^skills\/[^/]+\/checks\.mjs$/.test(f));
  while (queue.length) {
    const rel = queue.shift();
    if (found.has(rel)) continue;
    found.add(rel);
    const dir = posix.dirname(rel);
    for (const m of readFileSync(join(packDir, rel), 'utf8').matchAll(/^[ \t]*(?:import|export)\b[^'";]*?\bfrom[ \t]*['"]\.\/([^'"/]+\.mjs)['"]/gm)) {
      const sibling = `${dir}/${m[1]}`;
      if (files.includes(sibling)) queue.push(sibling);
    }
  }
  return found;
}

export function inventory(packsDir, { rules = RULES } = {}) {
  const ids = readdirSync(packsDir).filter((n) => lstatSync(join(packsDir, n)).isDirectory()).sort(byBytes);
  const packs = [];
  const errors = [];
  for (const id of ids) {
    const dir = join(packsDir, id);
    const manifest = JSON.parse(readFileSync(join(dir, 'pack.json'), 'utf8'));
    const paths = walk(dir);
    const ctx = { skillChecks: skillCheckModules(dir, paths) };
    const files = [];
    for (const path of paths) {
      const matched = rules.filter((r) => r.match(path, ctx)).map((r) => r.class);
      if (matched.length > 1) errors.push(`${id}/${path} matches more than one class: ${matched.join(', ')}`);
      const engine = path.endsWith('.mjs') && importsEngine(readFileSync(join(dir, path), 'utf8'));
      files.push({ path, class: matched[0] ?? 'other', engine });
    }
    packs.push({ id, version: manifest.version, minEngineVersion: manifest.minEngineVersion, files });
  }
  if (errors.length) throw new InventoryError(errors.join('\n'));
  return { packs };
}

export function render(inv, { frozenAt }) {
  const count = (files, c) => files.filter((f) => f.class === c).length;
  const all = inv.packs.flatMap((p) => p.files);
  const floors = new Map();
  for (const p of inv.packs) floors.set(String(p.minEngineVersion), (floors.get(String(p.minEngineVersion)) ?? 0) + 1);
  const lines = [
    '# Porting inventory',
    '',
    `Generated by \`node tools/port/inventory.mjs\` from \`packs/\`; never edited by hand. Its test runs`,
    '`inventory.mjs --check`, which fails when this file differs from a fresh render. The tree began',
    `as Claudinite's \`packs/\` frozen at \`${frozenAt}\` (\`docs/import.md\`).`,
    '',
    'Build-plan phase 6 ports each pack by this rule: content and declared files ship as they are;',
    'coded checks become Go; tasks stay Node against `@claudinite/sdk`; tests are rewritten against',
    'the pinned `cn`, or dropped when they check only file shapes or doc text. A file that imports',
    "Claudinite's `engine/` by relative path does not run here until its slice replaces the import.",
    '',
    `\`minEngineVersion\` across the shelf: ${[...floors].sort(([a], [b]) => byBytes(a, b)).map(([v, n]) => `\`${v}\` (${n} pack${n === 1 ? '' : 's'})`).join(', ')}.`,
    "These are Claudinite's Node engine versions; the Engine's `shared/version` parses three parts",
    '(`<day>.<n>.0`), so no `cn` reads these manifests yet. A ported pack\'s first version sets',
    '`minEngineVersion` to the `cn` version it was tested on.',
    '',
    'Classes: `content` (`RULES.md`, `README.md`, every other `.md`, `provenance/**`, `badge.svg`);',
    '`declared` (`pack.json`, `declared-checks.json`, `merge-rules.json`, any other `.json` at the pack',
    'root or under `tasks/`); `coded-check` (non-test `.mjs` directly under `worldRules/`, `workRules/`,',
    "`checks/` or `hooks/`, and a skill's `checks.mjs` with the sibling modules it imports); `task`",
    '(`tasks/<name>/` `task.json`, `task.md`, `worker.mjs`, `preconditions.mjs`); `src` (every other',
    'non-test `.mjs`); `test` (`test/**`, `*.test.mjs`); `workflow` (`.yml` under `stubs/` or',
    '`.github/`); `other` (the rest, listed below by path).',
    '',
    `| pack | version | ${CLASSES.join(' | ')} | engine/ importers |`,
    `|---|---|${CLASSES.map(() => '---:').join('|')}|---:|`,
  ];
  for (const p of inv.packs) {
    lines.push(`| ${p.id} | ${p.version} | ${CLASSES.map((c) => count(p.files, c)).join(' | ')} | ${p.files.filter((f) => f.engine).length} |`);
  }
  lines.push(`| **${inv.packs.length} packs** | | ${CLASSES.map((c) => count(all, c)).join(' | ')} | ${all.filter((f) => f.engine).length} |`);
  for (const p of inv.packs) {
    const listed = LISTED.map((c) => [c, p.files.filter((f) => f.class === c)]).filter(([, l]) => l.length);
    if (!listed.length) continue;
    lines.push('', `## ${p.id}`);
    for (const [c, list] of listed) {
      lines.push('', `### ${c} (${list.length})`, '');
      for (const f of list) lines.push(`- \`${f.path}\`${f.engine ? ' (imports `engine/`)' : ''}`);
    }
  }
  return lines.join('\n') + '\n';
}

function frozenCommit() {
  const m = readFileSync(join(REPO_ROOT, 'docs/import.md'), 'utf8').match(/^## Frozen at `([0-9a-f]{40})`/m);
  if (!m) throw new InventoryError('docs/import.md has no "## Frozen at `<sha>`" heading');
  return m[1];
}

function main(argv) {
  const opts = { check: false, packs: join(REPO_ROOT, 'packs'), out: join(REPO_ROOT, DOC) };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--check') opts.check = true;
    else if ((argv[i] === '--packs' || argv[i] === '--out') && argv[i + 1] !== undefined) opts[argv[i].slice(2)] = argv[++i];
    else throw new InventoryError(`unknown argument ${argv[i]}; usage: inventory.mjs [--check] [--packs <dir>] [--out <file>]`);
  }
  const inv = inventory(opts.packs);
  const doc = render(inv, { frozenAt: frozenCommit() });
  const files = inv.packs.reduce((n, p) => n + p.files.length, 0);
  const other = inv.packs.reduce((n, p) => n + p.files.filter((f) => f.class === 'other').length, 0);
  if (opts.check) {
    let current = null;
    try { current = readFileSync(opts.out, 'utf8'); } catch { /* absent reads as stale */ }
    if (current !== doc) {
      console.log(`the porting inventory is stale: ${opts.out} differs from a fresh render; run node tools/port/inventory.mjs`);
      return 1;
    }
    console.log(`porting inventory current: ${inv.packs.length} packs, ${files} files, ${other} unclassified (listed)`);
    return 0;
  }
  writeFileSync(opts.out, doc);
  console.log(`wrote ${opts.out}: ${inv.packs.length} packs, ${files} files, ${other} unclassified (listed)`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (e) {
    if (!(e instanceof InventoryError)) throw e;
    console.error(`inventory.mjs: ${e.message}`);
    process.exitCode = 1;
  }
}
