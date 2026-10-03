import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isDormant } from '../src/read/dormancy.mjs';
import { memberFromFile } from '../src/read/member.mjs';
import { CN, needsCn } from '../../../tools/test/cn-tasks.mjs';

// THE DRIFT GUARD for `src/read/dormancy.mjs`, this pack's own copy of the scheduler's
// dormancy predicate, against the engine's: `cn fleet decide dormancy` is the predicate
// a member's own scheduler stops itself with, and the one the fleet sweep reads. The
// split is forced — the page runs in the viewer's browser and imports nothing from the
// engine — so both are run over the same declarations, in both directions: a repo this
// pack reads as awake while its own scheduler has stopped is exactly the repo that then
// gets nagged for stopping.

function cnDormancy(configs) {
  const dir = mkdtempSync(join(tmpdir(), 'acme-cn-dormancy-'));
  try {
    const file = join(dir, 'world.json');
    writeFileSync(file, JSON.stringify({ configs }));
    const r = spawnSync(CN, ['fleet', 'decide', 'dormancy', '--world', file], { encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`cn fleet decide dormancy exited ${r.status}: ${r.stderr || r.stdout}`);
    return JSON.parse(r.stdout);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

const DECLARATIONS = [
  null, undefined, 42, 'dormant', {}, { dormant: true }, { dormant: false }, { dormant: 'true' },
  { raw: { dormant: true } }, { raw: { dormant: false }, dormant: true },
  { packs: [] }, { packs: ['acme-pack'] }, { packs: [{ id: 'claudinite-tasks' }] }, // @real-entity dormancy is this pack's own setting; the drift guard reads its real key
  { packs: [{ id: 'claudinite-tasks', config: { dormant: true } }] }, // @real-entity dormancy is this pack's own setting; the drift guard reads its real key
  { packs: [{ id: 'claudinite-tasks', config: { dormant: false } }], dormant: true }, // @real-entity dormancy is this pack's own setting; the drift guard reads its real key
  { packs: [{ id: 'claudinite-tasks', config: { dormant: { since: 1 } } }] }, // @real-entity dormancy is this pack's own setting; the drift guard reads its real key
  { packs: [{ id: 'tasks', config: { dormant: true } }] },
  { packs: [{ id: 'claudinite-scheduler', config: { dormant: true } }] },
  { packConfig: { 'claudinite-tasks': { dormant: true } } }, // @real-entity dormancy is this pack's own setting; the drift guard reads its real key
  { packConfig: { 'claudinite-tasks': {} }, packs: [{ id: 'claudinite-tasks', config: { dormant: true } }] }, // @real-entity dormancy is this pack's own setting; the drift guard reads its real key
  { packConfig: { 'claudinite-tasks': null }, raw: { dormant: true } }, // @real-entity dormancy is this pack's own setting; the drift guard reads its real key
];

// `undefined` has no JSON spelling; the engine is asked the null it would arrive as.
const ASKED = DECLARATIONS.filter((d) => d !== undefined);

test('this pack reads the dormancy of every declaration exactly as cn does', needsCn, () => {
  const engine = cnDormancy(ASKED);
  assert.equal(engine.length, ASKED.length);
  const diffs = ASKED.filter((d, i) => isDormant(d) !== engine[i]).map((d) => JSON.stringify(d));
  assert.deepEqual(diffs, []);
  assert.ok(engine.includes(true) && engine.includes(false), 'the corpus exercises both answers');
});

// A cn member states its dormancy in its member file, written by its own cn from its
// declaration. The page must read that stated answer rather than re-derive one, and the
// stated answer is cn's over the declared list.
test('a cn member reads as dormant exactly when its own cn says its declaration is', needsCn, () => {
  const lists = ASKED.filter((d) => Array.isArray(d?.packs)).map((d) => d.packs);
  const engine = cnDormancy(lists.map((packs) => ({ packs })));
  const diffs = lists.filter((packs, i) => {
    const m = memberFromFile(JSON.stringify({ version: 1, packs: { declared: packs }, dormant: engine[i] }));
    return isDormant(m) !== engine[i];
  }).map((p) => JSON.stringify(p));
  assert.deepEqual(diffs, []);
  assert.ok(engine.includes(true) && engine.includes(false), 'the corpus exercises both answers');
});
