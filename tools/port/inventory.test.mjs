import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CLASSES, importsEngine, inventory, render, RULES } from './inventory.mjs';

const INVENTORY = fileURLToPath(new URL('./inventory.mjs', import.meta.url));
const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const scratch = () => mkdtempSync(join(tmpdir(), 'acme-inventory-'));

function put(root, path, content) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
}

const ENGINE = "import { x } from '../../engine/acme.mjs';\n";

// One file of every class, plus the shapes that must not be misread.
function acmeShelf() {
  const root = scratch();
  const p = (path, content = 'x\n') => put(join(root, 'acme-pack'), path, content);
  p('pack.json', JSON.stringify({ version: '60101.1', minEngineVersion: '60101.1' }) + '\n');
  p('RULES.md');
  p('README.md');
  p('badge.svg');
  p('provenance/acme-rule.md');
  p('skills/acme-skill/SKILL.md');
  p('skills/acme-skill/checks.mjs', "import acmeCheck from './acme-check.mjs';\nexport default [acmeCheck];\n");
  p('skills/acme-skill/acme-check.mjs', ENGINE);
  p('skills/acme-skill/interview.mjs');
  p('skills/acme-skill/declared-checks.json', '[]\n');
  p('docs/design.md');
  p('declared-checks.json', '[]\n');
  p('merge-rules.json', '{}\n');
  p('acme.schema.json', '{}\n');
  p('worldRules/acme-world.mjs', ENGINE);
  p('workRules/acme-work.mjs');
  p('tasks/acme-task/task.json', '{}\n');
  p('tasks/acme-task/worker.mjs', "import {\n  a,\n  b,\n} from '../../../../engine/acme.mjs';\n");
  p('tasks/acme-task/task.md');
  p('tasks/acme-task/preconditions.mjs');
  p('tasks/acme-task/helper.mjs', "const { y } = await import('../../../../engine/acme.mjs');\n");
  p('tasks/acme-task/params.json', '{}\n');
  p('src/acme.mjs', "const fixture = \"import { x } from '../../engine/acme.mjs';\";\nconst f2 = 'await import(\"../../engine/acme.mjs\")';\n");
  p('migrations/2026-01-01-acme/migration.mjs');
  p('test/acme.test.mjs', ENGINE);
  p('test/README.md');
  p('worldRules/acme-world.test.mjs');
  p('stubs/workflows/acme.yml');
  p('stubs/actions/acme/action.yml');
  p('favicon.svg');
  p('setup.sh');
  put(root, 'README.md', 'not a pack\n');
  return root;
}

test('every file of a synthetic pack lands in the class its path says, engine importers marked by real import syntax only', () => {
  const inv = inventory(acmeShelf());
  assert.equal(inv.packs.length, 1);
  const [pack] = inv.packs;
  assert.equal(pack.id, 'acme-pack');
  assert.equal(pack.version, '60101.1');
  const byClass = Object.fromEntries(CLASSES.map((c) => [c, pack.files.filter((f) => f.class === c).map((f) => f.path)]));
  assert.deepEqual(byClass, {
    content: ['README.md', 'RULES.md', 'badge.svg', 'docs/design.md', 'provenance/acme-rule.md', 'skills/acme-skill/SKILL.md'],
    declared: ['acme.schema.json', 'declared-checks.json', 'merge-rules.json', 'pack.json', 'skills/acme-skill/declared-checks.json', 'tasks/acme-task/params.json'],
    'coded-check': ['skills/acme-skill/acme-check.mjs', 'skills/acme-skill/checks.mjs', 'workRules/acme-work.mjs', 'worldRules/acme-world.mjs'],
    task: ['tasks/acme-task/preconditions.mjs', 'tasks/acme-task/task.json', 'tasks/acme-task/task.md', 'tasks/acme-task/worker.mjs'],
    src: ['migrations/2026-01-01-acme/migration.mjs', 'skills/acme-skill/interview.mjs', 'src/acme.mjs', 'tasks/acme-task/helper.mjs'],
    test: ['test/README.md', 'test/acme.test.mjs', 'worldRules/acme-world.test.mjs'],
    workflow: ['stubs/actions/acme/action.yml', 'stubs/workflows/acme.yml'],
    other: ['favicon.svg', 'setup.sh'],
  });
  const engine = pack.files.filter((f) => f.engine).map((f) => f.path);
  assert.deepEqual(engine, ['skills/acme-skill/acme-check.mjs', 'tasks/acme-task/helper.mjs', 'tasks/acme-task/worker.mjs', 'test/acme.test.mjs', 'worldRules/acme-world.mjs']);
});

test('importsEngine reads import and export statements, not import syntax quoted as data', () => {
  assert.equal(importsEngine("import a from '../engine/x.mjs';"), true);
  assert.equal(importsEngine("export { a } from '../../engine/x.mjs';"), true);
  assert.equal(importsEngine("import '../../engine/side-effect.mjs';"), true);
  assert.equal(importsEngine("  const m = await import('../../engine/x.mjs');"), true);
  assert.equal(importsEngine("const s = \"import a from '../engine/x.mjs'\";"), false);
  assert.equal(importsEngine("const s = 'await import(\"../engine/x.mjs\")';"), false);
  assert.equal(importsEngine("import a from './engine/x.mjs';"), false);
  assert.equal(importsEngine("import a from '../../engine-tests/x.mjs';"), false);
});

test('a file matching two classes fails the inventory, naming it, rather than being counted twice', () => {
  const root = acmeShelf();
  put(join(root, 'acme-pack'), 'tasks/acme-task/worker.test.mjs', 'x\n');
  assert.doesNotThrow(() => inventory(root), 'a test file in a task directory is a test');
  put(join(root, 'acme-pack'), 'stubs/acme.md', 'x\n');
  assert.doesNotThrow(() => inventory(root));
  const overlapping = [...RULES, { class: 'content', match: (rel) => rel === 'pack.json' }];
  assert.throws(() => inventory(root, { rules: overlapping }), /acme-pack\/pack\.json matches more than one class: declared, content/);
});

test('the rendered doc names the generator and the frozen commit, and lists per pack the files a port rewrites', () => {
  const inv = inventory(acmeShelf());
  const doc = render(inv, { frozenAt: 'a'.repeat(40) });
  assert.match(doc, /tools\/port\/inventory\.mjs/);
  assert.ok(doc.includes('a'.repeat(40)));
  assert.match(doc, /^\| acme-pack \| 60101\.1 \|/m);
  assert.match(doc, /^- `worldRules\/acme-world\.mjs` \(imports `engine\/`\)$/m);
  assert.match(doc, /^- `src\/acme\.mjs`$/m);
  assert.doesNotMatch(doc, /^- `RULES\.md`/m, 'content files are counted, not listed');
  assert.match(doc, /^- `favicon\.svg`$/m, 'an unclassified file is listed by path');
  assert.equal(render(inv, { frozenAt: 'a'.repeat(40) }), doc, 'rendering is deterministic');
});

test('the real shelf: 38 packs, every file in exactly one class, at least 200 engine importers, every other file listed', () => {
  const inv = inventory(join(REPO_ROOT, 'packs'));
  assert.equal(inv.packs.length, 38);
  const files = inv.packs.flatMap((p) => p.files);
  assert.ok(files.length > 1900, `${files.length} files`);
  assert.ok(files.filter((f) => f.engine).length >= 200);
  const doc = readFileSync(join(REPO_ROOT, 'docs/porting-inventory.GENERATED.md'), 'utf8');
  for (const p of inv.packs) for (const f of p.files.filter((x) => x.class === 'other')) assert.ok(doc.includes(`\`${f.path}\``), `${p.id}/${f.path}`);
});

test('inventory.mjs --check passes on the committed doc and fails, exit 1, on a doc that drifted', () => {
  const ok = spawnSync(process.execPath, [INVENTORY, '--check'], { cwd: REPO_ROOT, encoding: 'utf8' });
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  const drifted = join(scratch(), 'inventory.md');
  writeFileSync(drifted, readFileSync(join(REPO_ROOT, 'docs/porting-inventory.GENERATED.md'), 'utf8').replace(/\| 38 \|/, '| 37 |') + '\nhand edit\n');
  const bad = spawnSync(process.execPath, [INVENTORY, '--check', '--out', drifted], { cwd: REPO_ROOT, encoding: 'utf8' });
  assert.equal(bad.status, 1, bad.stdout + bad.stderr);
  assert.match(bad.stdout + bad.stderr, /porting inventory is stale/);
});
