#!/usr/bin/env node
// The vendored-set rule: a pack directory minus `test/`, `docs/` and `provenance/` at the pack
// root and the Go tests beside its checks (`checks/*_test.go`), nothing else dropped, packed as a deterministic .tar.gz with its SHA-256.
//
//   node tools/vendor/vendor.mjs <pack dir> <out dir>
//   node tools/vendor/vendor.mjs --all <packs root> <out dir>
//
// Writes <out>/<id>-<version>.tar.gz and <out>/<id>-<version>.sha256 (sha256sum format), the id
// being the directory name and the version pack.json's `version`. Archive paths are relative to
// the pack root; entries are regular files only, sorted, with mtime 0, uid/gid 0, mode 0644 or
// 0755, and the gzip header carries no name, no timestamp and an unknown OS byte.
//
// A stand-in for `cn vendor`: the pack release workflow swaps to `cn vendor` once the binary
// exists, gated on the two producing byte-identical archives for every pack.
// Archive bytes depend on the zlib bundled with Node, so that gate runs under the Node major
// pinned in `.node-version`.
//
// Dropping at the root only is the design's rule; Claudinite's Node engine drops `test/`, `docs/`
// and `updates/` at any depth. The two agree while no such folder sits below a pack root, and the
// vendor test that asserts so on the real shelf is where the first nested one surfaces.
//
// `updates/` and `migrations/` ship: the rule names three folders and this tool follows it, while
// Claudinite's Node engine also drops `updates/` (only claudinite-lifecycle has one, and that pack
// folds into the engine; its phase-6 slice decides what of it survives).
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync, mkdirSync, lstatSync, existsSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';

const DROPPED_AT_ROOT = new Set(['test', 'docs', 'provenance']);

class VendorError extends Error {}

function readVersion(dir, id) {
  const manifest = join(dir, 'pack.json');
  if (!existsSync(manifest)) throw new VendorError(`${id}: no pack.json`);
  let parsed;
  try { parsed = JSON.parse(readFileSync(manifest, 'utf8')); } catch (e) { throw new VendorError(`${id}: pack.json does not parse: ${e.message}`); }
  if (typeof parsed.version !== 'string' || !parsed.version) throw new VendorError(`${id}: pack.json has no string version`);
  return parsed.version;
}

// Every file of the vendored set, as pack-relative paths in byte order.
function vendoredFiles(dir) {
  const files = [];
  const walk = (rel) => {
    for (const name of readdirSync(join(dir, rel))) {
      const path = rel ? `${rel}/${name}` : name;
      const st = lstatSync(join(dir, path));
      if (st.isDirectory()) {
        if (!rel && DROPPED_AT_ROOT.has(name)) continue;
        walk(path);
      } else if (st.isFile()) {
        if (rel === 'checks' && name.endsWith('_test.go')) continue;
        files.push({ path, executable: (st.mode & 0o111) !== 0 });
      } else {
        throw new VendorError(`${basename(dir)}: ${path} is neither a file nor a directory`);
      }
    }
  };
  walk('');
  return files.sort((a, b) => Buffer.compare(Buffer.from(a.path), Buffer.from(b.path)));
}

function octal(value, width) {
  return value.toString(8).padStart(width - 1, '0') + '\0';
}

// A ustar header; a path over 100 bytes is split into prefix and name at a slash.
function header(path, size, mode) {
  const bytes = Buffer.from(path);
  let name = bytes;
  let prefix = Buffer.alloc(0);
  if (bytes.length > 100) {
    const cut = bytes.lastIndexOf(0x2f, 155);
    if (cut <= 0 || bytes.length - cut - 1 > 100) throw new VendorError(`path too long for ustar: ${path}`);
    prefix = bytes.subarray(0, cut);
    name = bytes.subarray(cut + 1);
  }
  const h = Buffer.alloc(512);
  name.copy(h, 0);
  h.write(octal(mode, 8), 100, 'ascii');
  h.write(octal(0, 8), 108, 'ascii');
  h.write(octal(0, 8), 116, 'ascii');
  h.write(octal(size, 12), 124, 'ascii');
  h.write(octal(0, 12), 136, 'ascii');
  h.write('        ', 148, 'ascii');
  h.write('0', 156, 'ascii');
  h.write('ustar\0', 257, 'ascii');
  h.write('00', 263, 'ascii');
  prefix.copy(h, 345);
  let sum = 0;
  for (const b of h) sum += b;
  h.write(octal(sum, 7) + ' ', 148, 'ascii');
  return h;
}

function tarball(dir, files) {
  const parts = [];
  for (const f of files) {
    const body = readFileSync(join(dir, f.path));
    parts.push(header(f.path, body.length, f.executable ? 0o755 : 0o644), body);
    const pad = (512 - (body.length % 512)) % 512;
    if (pad) parts.push(Buffer.alloc(pad));
  }
  parts.push(Buffer.alloc(1024));
  const gz = gzipSync(Buffer.concat(parts), { level: 9 });
  gz[9] = 0xff;
  return gz;
}

export function vendorPack(packDir, outDir) {
  const dir = resolve(packDir);
  const id = basename(dir);
  const version = readVersion(dir, id);
  const archive = tarball(dir, vendoredFiles(dir));
  const sha256 = createHash('sha256').update(archive).digest('hex');
  const file = `${id}-${version}.tar.gz`;
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, file), archive);
  writeFileSync(join(outDir, `${id}-${version}.sha256`), `${sha256}  ${file}\n`);
  return { id, version, size: archive.length, sha256 };
}

function main(argv) {
  if (argv[0] === '--all' && argv.length === 3) {
    const root = argv[1];
    const ids = readdirSync(root).filter((n) => lstatSync(join(root, n)).isDirectory()).sort();
    const rows = [];
    const errors = [];
    for (const id of ids) {
      try { rows.push(vendorPack(join(root, id), argv[2])); } catch (e) { if (e instanceof VendorError) errors.push(e.message); else throw e; }
    }
    const w = Math.max(2, ...rows.map((r) => r.id.length));
    const v = Math.max(7, ...rows.map((r) => r.version.length));
    console.log(`${'id'.padEnd(w)}  ${'version'.padEnd(v)}  ${'size'.padStart(8)}  sha256`);
    for (const r of rows) console.log(`${r.id.padEnd(w)}  ${r.version.padEnd(v)}  ${String(r.size).padStart(8)}  ${r.sha256}`);
    console.log(`${rows.length} packs vendored`);
    for (const e of errors) console.error(`vendor.mjs: ${e}`);
    return errors.length ? 1 : 0;
  }
  if (argv.length === 2 && !argv[0].startsWith('-')) {
    const r = vendorPack(argv[0], argv[1]);
    console.log(`${r.id}  ${r.version}  ${r.size}  ${r.sha256}`);
    return 0;
  }
  console.error('usage: vendor.mjs <pack dir> <out dir> | vendor.mjs --all <packs root> <out dir>');
  return 2;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (e) {
    if (!(e instanceof VendorError)) throw e;
    console.error(`vendor.mjs: ${e.message}`);
    process.exitCode = 1;
  }
}
