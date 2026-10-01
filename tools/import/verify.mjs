#!/usr/bin/env node
// Proves an import of Claudinite's packs/ is complete: every pack directory, every file byte for
// byte, every non-merge commit that touched a kept path (paths.txt), per-pack history length, and
// per-file history continuity, where a file whose history before packs/ lives under a dropped
// ancestor is listed as deliberately not carried rather than failed.
//
//   node tools/import/verify.mjs --source <claudinite clone> --commit <sha> --import <repo>
//        [--ref import] [--landed] [--paths tools/import/paths.txt] [--write-doc docs/import.md]
//
// --landed is for a branch that merged the import beside its own files (main): files outside
// packs/ are allowed there, except under a kept ancestor. --write-doc rewrites the generated
// section of the doc, and only when verification passes. Exit 0 on success, 1 on any gap.
import { execFile, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const MAX = 1 << 30;
const BEGIN = '<!-- BEGIN GENERATED: verify -->';
const END = '<!-- END GENERATED: verify -->';

function parseArgs(argv) {
  const opts = { ref: 'import', landed: false, paths: fileURLToPath(new URL('./paths.txt', import.meta.url)) };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const take = () => { if (i + 1 >= argv.length) usage(`${a} needs a value`); return argv[++i]; };
    if (a === '--source') opts.source = take();
    else if (a === '--commit') opts.commit = take();
    else if (a === '--import') opts.import = take();
    else if (a === '--ref') opts.ref = take();
    else if (a === '--paths') opts.paths = take();
    else if (a === '--write-doc') opts.writeDoc = take();
    else if (a === '--landed') opts.landed = true;
    else usage(`unknown argument ${a}`);
  }
  if (!opts.source || !opts.commit || !opts.import) usage('--source, --commit and --import are required');
  return opts;
}

function usage(msg) {
  console.error(`verify.mjs: ${msg}`);
  console.error('usage: verify.mjs --source <dir> --commit <sha> --import <dir> [--ref <ref>] [--landed] [--paths <file>] [--write-doc <file>]');
  process.exit(2);
}

function readPaths(file) {
  const kept = [];
  const dropped = [];
  for (const raw of readFileSync(file, 'utf8').split('\n')) {
    const line = raw.trim();
    const d = line.match(/^#\s*dropped:\s*(\S+)$/);
    if (d) dropped.push(d[1]);
    else if (line && !line.startsWith('#')) kept.push(line);
  }
  return { kept, dropped };
}

const gitSync = (repo, args, input) => execFileSync('git', ['-C', repo, ...args], { maxBuffer: MAX, input });
const gitText = (repo, args) => gitSync(repo, args).toString('utf8');
const gitAsync = async (repo, args) => (await run('git', ['-C', repo, ...args], { maxBuffer: MAX })).stdout;

function packDirs(repo, rev) {
  return gitText(repo, ['ls-tree', '-d', '--name-only', rev, 'packs/'])
    .split('\n').filter(Boolean).map((p) => p.slice('packs/'.length));
}

// path -> { mode, sha256 } for every file under packs/ at rev.
function manifest(repo, rev) {
  const entries = gitText(repo, ['ls-tree', '-r', '-z', rev, '--', 'packs']).split('\0').filter(Boolean).map((e) => {
    const [meta, path] = e.split('\t');
    const [mode, type, oid] = meta.split(' ');
    return { mode, type, oid, path };
  }).filter((e) => e.type === 'blob');
  const batch = gitSync(repo, ['cat-file', '--batch'], entries.map((e) => e.oid).join('\n') + '\n');
  const result = new Map();
  let at = 0;
  for (const e of entries) {
    const nl = batch.indexOf(10, at);
    const size = Number(batch.subarray(at, nl).toString().split(' ')[2]);
    const body = batch.subarray(nl + 1, nl + 1 + size);
    at = nl + 1 + size + 1;
    result.set(e.path, { mode: e.mode, sha256: createHash('sha256').update(body).digest('hex') });
  }
  return result;
}

// Non-merge commits touching the kept paths, keyed by everything but their hash.
function commitIdentities(repo, rev, paths, merges) {
  const fmt = '%H%x00%an%x00%ae%x00%ad%x00%cn%x00%ce%x00%cd%x00%B%x01';
  const args = ['log', '--full-history', merges ? '--merges' : '--no-merges', `--format=${fmt}`, '--date=raw', rev];
  if (paths) args.push('--', ...paths);
  const out = new Map();
  for (const rec of gitText(repo, args).split('\x01')) {
    const t = rec.replace(/^\n/, '');
    if (!t) continue;
    const [sha, ...rest] = t.split('\0');
    const key = createHash('sha256').update(rest.join('\0')).digest('hex');
    const subject = rest[6].split('\n')[0];
    if (!out.has(key)) out.set(key, []);
    out.get(key).push({ sha, subject });
  }
  return out;
}

function multisetDiff(a, b) {
  const missing = [];
  for (const [key, list] of a) {
    const have = b.get(key)?.length ?? 0;
    for (const c of list.slice(have)) missing.push(c);
  }
  return missing;
}

const count = (m) => [...m.values()].reduce((n, l) => n + l.length, 0);

async function pool(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }));
  return results;
}

async function firstAdded(repo, rev, file) {
  const out = await gitAsync(repo, ['log', '--follow', '--diff-filter=A', '--format=%ad', '--date=raw', rev, '--', file]);
  const lines = out.split('\n').filter(Boolean);
  return lines.at(-1) ?? null;
}

async function pathHistory(repo, rev, file) {
  const out = await gitAsync(repo, ['log', '--follow', '--name-only', '--format=', rev, '--', file]);
  return out.split('\n').filter(Boolean);
}

const isoDate = (raw) => (raw ? new Date(Number(raw.split(' ')[0]) * 1000).toISOString().slice(0, 10) : 'never');
// The same matching git filter-repo applies to a --paths-from-file line: the file itself, or
// anything below it as a directory.
const matches = (expr, path) => path === expr.replace(/\/$/, '') || path.startsWith(expr.endsWith('/') ? expr : `${expr}/`);
const under = (path, exprs) => exprs.find((e) => matches(e, path));

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const { kept, dropped } = readPaths(opts.paths);
  const commit = gitText(opts.source, ['rev-parse', '--verify', `${opts.commit}^{commit}`]).trim();
  const tip = gitText(opts.import, ['rev-parse', '--verify', `${opts.ref}^{commit}`]).trim();
  const problems = [];
  const lines = [];

  const srcPacks = packDirs(opts.source, commit);
  const impPacks = packDirs(opts.import, tip);
  for (const p of srcPacks) if (!impPacks.includes(p)) problems.push(`missing pack: ${p}`);
  for (const p of impPacks) if (!srcPacks.includes(p)) problems.push(`extra pack: ${p}`);
  lines.push(`packs             ${srcPacks.length} in source, ${impPacks.length} in import`);

  const srcFiles = manifest(opts.source, commit);
  const impFiles = manifest(opts.import, tip);
  let mismatches = 0;
  for (const [path, s] of srcFiles) {
    const i = impFiles.get(path);
    if (!i) { problems.push(`missing file: ${path}`); mismatches++; }
    else if (i.sha256 !== s.sha256) { problems.push(`content differs: ${path}`); mismatches++; }
    else if (i.mode !== s.mode) { problems.push(`mode differs: ${path} (${s.mode} vs ${i.mode})`); mismatches++; }
  }
  for (const path of impFiles.keys()) if (!srcFiles.has(path)) { problems.push(`extra file: ${path}`); mismatches++; }
  lines.push(`files             ${srcFiles.size} compared by SHA-256, ${mismatches} mismatches`);

  const tipFiles = gitText(opts.import, ['ls-tree', '-r', '--name-only', tip]).split('\n').filter(Boolean);
  const ancestors = kept.filter((k) => k !== 'packs/');
  const outside = opts.landed
    ? tipFiles.filter((f) => under(f, ancestors))
    : [...new Set(tipFiles.filter((f) => !f.startsWith('packs/')).map((f) => f.split('/')[0]))];
  for (const t of outside) problems.push(opts.landed ? `kept ancestor path present at the tip: ${t}` : `outside packs/: ${t}`);
  lines.push(`outside packs/    ${outside.length ? outside.join(', ') : 'none'}${opts.landed ? ' under a kept ancestor (--landed)' : ''}`);

  const srcCommits = commitIdentities(opts.source, commit, kept, false);
  const impCommits = commitIdentities(opts.import, tip, kept, false);
  const missingCommits = multisetDiff(srcCommits, impCommits);
  const extraCommits = multisetDiff(impCommits, srcCommits);
  for (const c of missingCommits) problems.push(`missing commit: ${c.sha.slice(0, 10)} ${c.subject}`);
  for (const c of extraCommits) problems.push(`extra commit: ${c.sha.slice(0, 10)} ${c.subject}`);
  let mergeNote = 'merges not checked (--landed: this branch adds its own)';
  if (!opts.landed) {
    const srcMerges = commitIdentities(opts.source, commit, null, true);
    const impMerges = commitIdentities(opts.import, tip, null, true);
    for (const c of multisetDiff(impMerges, srcMerges)) problems.push(`merge not in source: ${c.sha.slice(0, 10)} ${c.subject}`);
    mergeNote = `${count(impMerges)} merges carried, each one of the source's`;
  }
  lines.push(`commits           ${count(srcCommits)} non-merge in source touching kept paths, ${count(impCommits)} in import; ${mergeNote}`);

  const histProblems = [];
  for (const p of srcPacks) {
    if (!impPacks.includes(p)) continue;
    const args = (rev) => ['rev-list', '--count', '--full-history', '--no-merges', rev, '--', `packs/${p}`];
    const s = gitText(opts.source, args(commit)).trim();
    const i = gitText(opts.import, args(tip)).trim();
    if (s !== i) histProblems.push(`pack history length differs: ${p} (${s} in source, ${i} in import)`);
  }
  problems.push(...histProblems);
  lines.push(`per-pack history  ${srcPacks.length} packs, ${histProblems.length} with a different length`);

  const notCarried = [];
  const lost = [];
  const shared = [...srcFiles.keys()].filter((f) => impFiles.has(f));
  await pool(shared, Math.max(4, cpus().length * 2), async (file) => {
    const [s, i] = await Promise.all([firstAdded(opts.source, commit, file), firstAdded(opts.import, tip, file)]);
    if (s === i) return;
    const history = await pathHistory(opts.source, commit, file);
    const foreign = history.filter((p) => !under(p, kept));
    if (foreign.length && foreign.every((p) => under(p, dropped))) {
      const earliest = foreign.at(-1);
      notCarried.push({ file, prefix: under(earliest, dropped), earliest, date: isoDate(s) });
    } else {
      lost.push(`history lost: ${file} (first added ${isoDate(s)} in source, ${isoDate(i)} in import)`);
    }
  });
  lost.sort();
  notCarried.sort((a, b) => a.file.localeCompare(b.file));
  problems.push(...lost);
  lines.push(`continuity        ${shared.length} files: ${shared.length - notCarried.length - lost.length} equal, ${notCarried.length} history deliberately not carried, ${lost.length} lost`);
  const byPrefix = new Map(dropped.map((d) => [d, notCarried.filter((n) => n.prefix === d)]));
  for (const [prefix, list] of byPrefix) if (list.length) lines.push(`                    ${prefix.padEnd(14)} ${list.length} files`);
  if (notCarried.length && notCarried.length <= 20) {
    for (const n of notCarried) lines.push(`                    not carried: ${n.file} (from ${n.earliest} under ${n.prefix})`);
  }

  console.log('Import verification');
  console.log(`  source  ${opts.source} @ ${commit}`);
  console.log(`  import  ${opts.import} @ ${opts.ref} ${tip}${opts.landed ? ' (landed)' : ''}`);
  for (const l of lines) console.log(`  ${l}`);
  const shown = problems.slice(0, 40);
  for (const p of shown) console.log(`  PROBLEM ${p}`);
  if (problems.length > shown.length) console.log(`  ... and ${problems.length - shown.length} more problems`);

  if (problems.length) {
    console.log(`RESULT: FAIL (${problems.length} problems)`);
    process.exit(1);
  }
  if (opts.writeDoc) writeDoc(opts.writeDoc, { commit, srcPacks, srcFiles, srcCommits, byPrefix, notCarried });
  console.log('RESULT: OK');
}

function writeDoc(file, { commit, srcPacks, srcFiles, srcCommits, byPrefix, notCarried }) {
  const text = readFileSync(file, 'utf8');
  const b = text.indexOf(BEGIN);
  const e = text.indexOf(END);
  if (b < 0 || e < b) {
    console.error(`verify.mjs: ${file} has no ${BEGIN} ... ${END} section`);
    process.exit(1);
  }
  const out = [
    BEGIN,
    `Source commit: \`${commit}\``,
    '',
    `Verified at that commit: ${srcPacks.length} packs, ${srcFiles.size} files byte-identical, ${count(srcCommits)} non-merge commits touching a kept path all carried.`,
    '',
    '### History deliberately not carried',
    '',
    notCarried.length
      ? `${notCarried.length} files arrived in a kept path by a rename from a dropped ancestor; \`git log --follow\` on them here starts at that rename. Their earlier history is in Claudinite.`
      : 'None: every file\'s history reaches its first commit.',
  ];
  for (const [prefix, list] of byPrefix) {
    if (!list.length) continue;
    out.push('', `#### \`${prefix}\` (${list.length} files)`, '');
    for (const n of list) out.push(`- \`${n.file}\`, from \`${n.earliest}\` (first added ${n.date})`);
  }
  out.push(END);
  writeFileSync(file, text.slice(0, b) + out.join('\n') + text.slice(e + END.length));
}

main().catch((err) => {
  console.error(`verify.mjs: ${err.stderr?.toString() || err.message}`);
  process.exit(1);
});
