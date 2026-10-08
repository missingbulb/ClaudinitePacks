// THE DRIFT GUARD for `parseDescriptor`, the page's own reader of a pack's
// `dashboard.json`, against the `descriptor-usable` check's reader in this pack's
// checks/: the check blocks on its verdict, so a descriptor the check passes must be
// one the page renders, and one the page faults must be one the check refuses. The
// split is forced — the page runs in the viewer's browser and the check in cn — so
// both are held to checks/testdata/descriptor-verdicts.json, the edges each rule
// exists for with the verdict expected, which the Go suite reads too.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, existsSync, readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDescriptor } from '../src/read/contributions.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKS = resolve(HERE, '../..');
const VERDICTS = JSON.parse(readFileSync(resolve(HERE, '../checks/testdata/descriptor-verdicts.json'), 'utf8'));

// The page's verdict in the check's JSON shape: the widget map as its values in
// declaration order, the repo view, and the fault.
const pageVerdict = (text, pack) => {
  const d = parseDescriptor(text, pack);
  if (d.fault) return { pack, widgets: null, repo: null, fault: d.fault };
  return { pack, widgets: [...d.widgets.values()], repo: d.repo, fault: null };
};

test('the page reads every edge as the check\'s reader is held to', () => {
  const diffs = [];
  for (const { pack, text, verdict } of VERDICTS) {
    try { assert.deepEqual(pageVerdict(text, pack), verdict); } catch (e) { diffs.push(`${pack}: ${e.message}`); }
  }
  assert.deepEqual(diffs, []);
  // Both answers are exercised: a fault the page shows, and a card it renders.
  assert.ok(VERDICTS.some((v) => v.verdict.fault) && VERDICTS.some((v) => !v.verdict.fault));
});

test('every descriptor on the shelf is one the page renders', () => {
  const faults = [];
  for (const pack of readdirSync(PACKS)) {
    const f = join(PACKS, pack, 'dashboard.json');
    if (!existsSync(f)) continue;
    const d = parseDescriptor(readFileSync(f, 'utf8'), pack);
    if (d.fault) faults.push(`${pack}: ${d.fault}`);
  }
  assert.deepEqual(faults, []);
});
