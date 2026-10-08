import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deploymentConfig, SIGN_IN_VARS } from '../tooling/deployment-config.mjs';

const member = (config) => {
  const root = mkdtempSync(join(tmpdir(), 'claudinite-depcfg-'));
  mkdirSync(join(root, '.claudinite', 'flat'), { recursive: true });
  writeFileSync(join(root, '.claudinite', 'flat', 'member.GENERATED.json'),
    JSON.stringify({ version: 1, packs: { declared: [{ id: 'claudinite-single-repo-dashboard', config }] } }, null, 2));
  return root;
};

const removeTree = (root) => rmSync(root, { recursive: true, force: true });

test('a repository variable is the sign-in pair\'s store, and reports no fallback', async (t) => {
  const root = member({ mode: 'repo' });
  t.after(() => removeTree(root));
  const { cfg, legacy } = await deploymentConfig(root, {
    [SIGN_IN_VARS.clientId]: 'Iv1.fromVar',
    [SIGN_IN_VARS.exchangeUrl]: 'https://w.example',
  });
  assert.equal(cfg.clientId, 'Iv1.fromVar');
  assert.equal(cfg.exchangeUrl, 'https://w.example');
  assert.deepEqual(legacy, []);
});

// Nothing converges a member's own settings file, so a deployment configured before the
// variables existed must keep its button rather than lose it on the next build.
test('a declared pair still works, and every key that fell back is named', async (t) => {
  const root = member({ mode: 'repo', clientId: 'Iv1.declared', exchangeUrl: 'https://old.example' });
  t.after(() => removeTree(root));
  const { cfg, legacy } = await deploymentConfig(root, {});
  assert.equal(cfg.clientId, 'Iv1.declared');
  assert.equal(cfg.exchangeUrl, 'https://old.example');
  assert.equal(legacy.length, 2);
  assert.match(legacy.join(' '), /clientId.*CLAUDINITE_DASHBOARD_CLIENT_ID/);
  assert.match(legacy.join(' '), /exchangeUrl.*CLAUDINITE_DASHBOARD_EXCHANGE_URL/);
});

// A cleared settings box arrives as an empty string, not as an absent name. Reading
// that as an override would turn clearing one variable into a silently disabled button
// on a deployment whose declaration still carries the value.
test('an empty variable is unset, not an override', async (t) => {
  const root = member({ mode: 'repo', clientId: 'Iv1.declared' });
  t.after(() => removeTree(root));
  const { cfg, legacy } = await deploymentConfig(root, { [SIGN_IN_VARS.clientId]: '   ' });
  assert.equal(cfg.clientId, 'Iv1.declared');
  assert.equal(legacy.length, 1);
});

test('a repo with neither store configured is an ordinary token-box deployment', async (t) => {
  const root = member({ mode: 'repo' });
  t.after(() => removeTree(root));
  const { cfg, legacy } = await deploymentConfig(root, {});
  assert.equal(cfg.clientId, undefined);
  assert.deepEqual(legacy, []);
});

// The member file is the one statement of the declaration a build reads, and one
// absent is a fault the caller names rather than an empty declaration: a member whose
// `cn` has not written its flat files is told to run `cn tasks flat --write`, never to
// set a mode its settings file may already state. A Node settings file beside it is
// not consulted.
test('a missing member file is a fault naming it and the command that writes it', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'claudinite-depcfg-'));
  t.after(() => removeTree(root));
  writeFileSync(join(root, '.claudinite-settings.json'),
    JSON.stringify({ packs: [{ id: 'claudinite-single-repo-dashboard', config: { clientId: 'Iv1.node' } }] }));
  const { cfg, legacy, memberFault } = await deploymentConfig(root, {});
  assert.equal(cfg.clientId, undefined);
  assert.deepEqual(legacy, []);
  assert.match(memberFault, /member\.GENERATED\.json is missing/);
  assert.match(memberFault, /cn tasks flat --write/);
});

// A file that is there but does not read is a different fault from one never written.
test('a malformed member file is a fault of its own, also naming the command', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'claudinite-depcfg-'));
  t.after(() => removeTree(root));
  mkdirSync(join(root, '.claudinite', 'flat'), { recursive: true });
  writeFileSync(join(root, '.claudinite', 'flat', 'member.GENERATED.json'), '{"packs":');
  const { memberFault } = await deploymentConfig(root, {});
  assert.match(memberFault, /member\.GENERATED\.json is not valid JSON/);
  assert.match(memberFault, /cn tasks flat --write/);

  writeFileSync(join(root, '.claudinite', 'flat', 'member.GENERATED.json'), '{"version":1}');
  assert.match((await deploymentConfig(root, {})).memberFault, /carries no packs\.declared list.*cn tasks flat --write/);
});

test('a readable member file is no fault, whether or not it declares this pack', async (t) => {
  const root = member({ mode: 'repo' });
  t.after(() => removeTree(root));
  assert.equal((await deploymentConfig(root, {})).memberFault, null);
});
