// THE PAGE'S IMPORT GRAPH MUST STAY BROWSER-PURE.
//
// The dashboard is served as raw ESM: the browser fetches `index.html`, follows its
// module script, and follows every relative import from there. The site the build
// stages is this pack and nothing else, so every import must also stay inside it: a
// climb to an engine or a sibling pack resolves in this repo and 404s on the published
// site. Nothing bundles, so there is no build
// step to rewrite a `node:` builtin into something a browser can load. One such import
// anywhere in the graph fails the page's FIRST module load, and the whole dashboard is
// a blank screen.
//
// It fails in the browser and NOWHERE ELSE — every Node test keeps passing, since Node
// resolves `node:fs` happily — so the property is pinned here.
//
// The graph is WALKED rather than listed. A hand-kept list of "the modules the page
// imports" is a snapshot of one day's graph: it stayed green while the page grew an
// import of a module that reads the disk (#1286). Walking from
// the real entry point means a module the page starts importing tomorrow is covered the
// day it is imported.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, relative } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const PAGE = resolve(HERE, '..');
const ROOT = resolve(PAGE, '../..');

// Import statements only. A `from '…'` inside a string literal is prose the page
// renders, not an edge of the graph, so the statement's own keyword has to be there.
const IMPORTS = /(?:^|[\n;])\s*(?:import|export)\b[^;]*?from\s*'([^']+)'/g;

const stripLineComments = (src) => src.replace(/^\s*\/\/.*$/gm, '');

// Every file the browser would load, starting from whatever `index.html` actually
// names — so a renamed entry point re-points the walk instead of silently emptying it.
async function graph() {
  // The page is stored at `src/index.html` and served from the directory above it, so
  // its entry specifier is relative to PAGE — the pack root — not to the file's own
  // directory. Reading it from one place and resolving it against the other is the
  // whole of that relocation, and getting it backwards is what this walk would catch.
  const html = await readFile(resolve(PAGE, 'src/index.html'), 'utf8');
  const entry = html.match(/<script[^>]*\btype="module"[^>]*\bsrc="([^"]+)"/)?.[1];
  assert.ok(entry, 'index.html names no module entry point — the walk would cover nothing');

  const files = new Map();
  const visit = async (file) => {
    if (files.has(file)) return;
    const code = stripLineComments(await readFile(file, 'utf8'));
    files.set(file, code);
    for (const [, spec] of code.matchAll(IMPORTS)) {
      if (!spec.startsWith('.')) continue;                 // judged by the caller, not followed
      await visit(resolve(dirname(file), spec));
    }
  };
  await visit(resolve(PAGE, entry));
  return files;
}

test('every module the page loads is browser-pure', async () => {
  const files = await graph();
  assert.ok(files.size > 20, `the walk reached only ${files.size} files — it is not covering the page`);

  for (const [file, code] of files) {
    const rel = relative(ROOT, file);
    for (const [, spec] of code.matchAll(IMPORTS)) {
      assert.ok(
        spec.startsWith('.'),
        `${rel} imports '${spec}' — the page loads unbundled, so only relative specifiers resolve`,
      );
    }
    assert.doesNotMatch(code, /\brequire\s*\(/, `${rel} uses require()`);
    assert.doesNotMatch(code, /\bprocess\./, `${rel} touches process`);
  }
});

test('no module the page loads lives outside this pack', async () => {
  const outside = [...(await graph()).keys()].filter((f) => relative(PAGE, f).startsWith('..')).map((f) => relative(ROOT, f));
  assert.deepEqual(outside, [], 'the published site is this pack alone');
});

// The queue's vocabulary is what the page renders, so the walk has to prove it reached
// it: a page that stopped importing it would satisfy every assertion above trivially.
test('the walk reaches the queue vocabulary the page renders', async () => {
  const files = [...(await graph()).keys()].map((f) => relative(ROOT, f));
  assert.ok(
    files.includes('packs/claudinite-single-repo-dashboard/src/read/queue-vocabulary.mjs'),
    'the page no longer imports the queue vocabulary it renders',
  );
});
