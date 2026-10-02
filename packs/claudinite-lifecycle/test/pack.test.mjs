import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, cleanup } from '../../../engine-tests/helpers.mjs';
import { buildContext } from '../../../engine/checks/helpers/repo-context.mjs';
import { runRule } from '../../../engine/checks/helpers/work.mjs';

function run(rule, root, mode = 'changed') {
  const ctx = buildContext({ root, mode });
  return runRule(rule, ctx);
}

// Built through the real path: a forbidReferences entry in the pack's own
// declared-checks.json, compiled by the declarative engine.
import { fileURLToPath } from 'node:url';
import { loadDeclaredChecks } from '../../../engine/checks/helpers/pattern-rules.mjs';
const claudiniteIsolation = loadDeclaredChecks(
  fileURLToPath(new URL('../../../packs/claudinite-lifecycle', import.meta.url)),
).find((r) => r.id === 'claudinite-isolation');

test('claudinite-isolation: inert without the vendored mount; a consumer file referencing the canon fires; wiring files and local packs stay open', () => {
  const violating = {
    'src/tool.mjs': 'const p = ".claudinite/shared/engine/checks/check_the_world.mjs";\n',
  };
  const wiring = {
    '.claude/settings.json': '{ "hooks": { "Stop": [ { "hooks": [ { "type": "command", "command": "node $CLAUDE_PROJECT_DIR/.claudinite/shared/engine/hooks/stop-command.mjs" } ] } ] } }\n',
    '.gitignore': '/.claudinite/*\n!/.claudinite/shared/\n',
    '.github/workflows/claudinite-checks-ci.yml': 'run: node .claudinite/shared/engine/checks/check_the_world.mjs\n',
    '.claudinite/local/packs/mine/check.mjs': 'import { run } from "../../shared/engine/check_the_world.mjs";\n',
    // The generated pack index's import (#807) — the shape every converged member now
    // carries. It contributes no finding for TWO independent reasons, and only one of
    // them is the carve-out restored beside it: a bare unquoted `.claudinite/...` in
    // prose already falls outside the engine's candidate shapes (this rule's own
    // coverage note). So this line does not by itself prove the carve-out works — it
    // pins the real-member shape, and the carve-out is what keeps that shape legal if
    // reference detection is ever widened to bare prose paths.
    'CLAUDE.md': '@.claudinite/flat/claudinite-rules.GENERATED.md\n',
  };
  const shared = {
    '.claudinite/shared/engine/checks/check_the_world.mjs': 'engine\n',
    '.claudinite/shared/engine/hooks/stop-command.mjs': 'engine\n',
    '.claudinite/shared/CLAUDE.md': 'index\n',
  };
  // No vendored mount → the gate keeps the rule inert even with a violating file.
  const off = makeRepo({ changed: { ...violating } });
  // Vendored mount present → the violating file fires; the wiring files do not.
  const on = makeRepo({ changed: { ...violating, ...wiring, ...shared } });
  try {
    assert.deepEqual(run(claudiniteIsolation, off, 'all'), []);
    const f = run(claudiniteIsolation, on, 'all');
    assert.equal(f.length, 1, JSON.stringify(f, null, 2));
    assert.equal(f[0].file, 'src/tool.mjs');
    assert.match(f[0].what, /\.claudinite\/shared\/engine\/checks\/check_the_world\.mjs/);
    assert.equal(f[0].on_fail, 'block');
  } finally { cleanup(off); cleanup(on); }
});

// The finding renders what / why / fix / doc — never the rule's `description`,
// so a remedy stated only there never reaches the agent that trips the rule.
// This rule's remedy IS "inline what you need": routing through a shared folder
// (the barrier engine's default first clause, written for a two-sided edge)
// is the wrong move for a one-sided isolation edge — there is no shared folder
// to route through, and the canon is not ours to restructure.
test('claudinite-isolation: the finding\'s own fix says to inline, not to route through a shared folder', () => {
  const root = makeRepo({ changed: {
    'src/tool.mjs': 'import x from "../.claudinite/shared/engine/checks/helpers/findings.mjs";\n',
    '.claudinite/shared/engine/checks/helpers/findings.mjs': 'engine\n',
  } });
  try {
    const f = run(claudiniteIsolation, root, 'all');
    assert.equal(f.length, 1, JSON.stringify(f, null, 2));
    assert.match(f[0].fix, /inline/i);
    assert.doesNotMatch(f[0].fix, /shared\/contracts/);
  } finally { cleanup(root); }
});
