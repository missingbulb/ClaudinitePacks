import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GIT_ENV } from './test-fixture.mjs';

const WORKFLOWS = new URL('../../.github/workflows/', import.meta.url);

// Enough YAML for a workflow file: block maps and lists, flow lists, quoted and plain scalars,
// `|` block scalars and comments. Anything else throws, so a construct it does not know fails
// the test rather than parsing wrong.
function parseYaml(text) {
  const raw = text.split('\n');
  let i = 0;
  const ind = (s) => s.match(/^ */)[0].length;
  const skip = () => { while (i < raw.length && (!raw[i].trim() || raw[i].trim().startsWith('#'))) i++; };
  const isItem = (s) => s.trim().startsWith('- ');
  const KEY = /^([\w.-]+|"[^"]*"):(?: +(.*))?$/;
  const stripComment = (s) => {
    let q = null;
    for (let k = 0; k < s.length; k++) {
      const c = s[k];
      if (q) { if (c === q) q = null; } else if (c === '"' || c === "'") q = c; else if (c === '#' && (k === 0 || s[k - 1] === ' ')) return s.slice(0, k).trimEnd();
    }
    return s.trimEnd();
  };
  const scalar = (s) => {
    s = s.trim();
    if (s.startsWith('[') && s.endsWith(']')) return s.slice(1, -1).split(',').map(scalar).filter((x) => x !== null);
    if (/^".*"$/.test(s) || /^'.*'$/.test(s)) return s.slice(1, -1);
    if (s === 'true') return true;
    if (s === 'false') return false;
    if (/^-?\d+$/.test(s)) return Number(s);
    if (s === '' || s === '~' || s === 'null') return null;
    if (/^[{&*!>]/.test(s)) throw new Error(`unsupported YAML scalar: ${s}`);
    return s;
  };
  function block(indent) {
    const out = [];
    while (i < raw.length && (!raw[i].trim() || ind(raw[i]) > indent)) out.push(raw[i++]);
    while (out.length && !out[out.length - 1].trim()) out.pop();
    const base = Math.min(...out.filter((l) => l.trim()).map(ind));
    return out.map((l) => l.slice(base)).join('\n') + '\n';
  }
  function afterKey(rest, indent) {
    if (rest === '|') return block(indent);
    if (rest !== '') return scalar(rest);
    skip();
    if (i < raw.length && ind(raw[i]) > indent) return node(ind(raw[i]));
    if (i < raw.length && ind(raw[i]) === indent && isItem(raw[i])) return list(indent);
    return null;
  }
  function entry(obj, line, indent) {
    const m = line.match(KEY);
    if (!m) throw new Error(`unsupported YAML line ${i}: ${line}`);
    obj[scalar(m[1])] = afterKey(m[2] ?? '', indent);
  }
  function map(indent, obj = {}) {
    for (;;) {
      skip();
      if (i >= raw.length || ind(raw[i]) !== indent || isItem(raw[i])) return obj;
      entry(obj, stripComment(raw[i++].trim()), indent);
    }
  }
  function list(indent) {
    const out = [];
    for (;;) {
      skip();
      if (i >= raw.length || ind(raw[i]) !== indent || !isItem(raw[i])) return out;
      const item = stripComment(raw[i++].trim().slice(2));
      if (KEY.test(item)) {
        const obj = {};
        entry(obj, item, indent + 2);
        out.push(map(indent + 2, obj));
      } else out.push(scalar(item));
    }
  }
  function node(indent) {
    skip();
    return isItem(raw[i]) ? list(indent) : map(indent);
  }
  const doc = node(0);
  skip();
  if (i < raw.length) throw new Error(`unparsed YAML from line ${i + 1}: ${raw[i]}`);
  return doc;
}

const workflow = (name) => parseYaml(readFileSync(new URL(name, WORKFLOWS), 'utf8'));

test('the YAML subset parser reads the shapes the assertions rely on', () => {
  const y = parseYaml('a: 1\nb:\n  - x: "q" # c\n    y: [p, q]\n  - plain\nc: |\n  one\n  two\nd: true\n');
  assert.deepEqual(y, { a: 1, b: [{ x: 'q', y: ['p', 'q'] }, 'plain'], c: 'one\ntwo\n', d: true });
});

test('release-packs triggers on pushes to main touching packs, tools or itself, and on dispatch', () => {
  const w = workflow('release-packs.yml');
  assert.deepEqual(Object.keys(w.on).sort(), ['push', 'workflow_dispatch']);
  assert.deepEqual(w.on.push.branches, ['main']);
  assert.deepEqual(w.on.push.paths, ['packs/**', 'tools/**', '.github/workflows/release-packs.yml']);
});

test('release-packs runs one release at a time and never cancels one in flight', () => {
  const w = workflow('release-packs.yml');
  assert.equal(w.concurrency.group, 'release-packs');
  assert.equal(w.concurrency['cancel-in-progress'], false);
});

test('the build job reads only and holds no environment; publish holds release and writes', () => {
  const { build, publish } = workflow('release-packs.yml').jobs;
  assert.deepEqual(build.permissions, { contents: 'read' });
  assert.equal(build.environment, undefined);
  assert.equal(publish.environment, 'release');
  assert.deepEqual(publish.permissions, { contents: 'write' });
  assert.equal(publish.needs, 'build');
});

test('both jobs take Node from .node-version, and every action is pinned to a commit sha', () => {
  for (const file of ['release-packs.yml', 'verify-import.yml', 'dev-key-expiry.yml', 'promote-packs.yml']) {
    const w = workflow(file);
    for (const [name, job] of Object.entries(w.jobs)) {
      for (const step of job.steps.filter((s) => s.uses)) {
        assert.match(step.uses, /^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/, `${file} ${name}: ${step.uses}`);
        if (step.uses.startsWith('actions/setup-node@')) assert.deepEqual(step.with, { 'node-version-file': '.node-version' }, `${file} ${name}`);
      }
    }
  }
  const { build, publish } = workflow('release-packs.yml').jobs;
  for (const job of [build, publish]) assert.ok(job.steps.some((s) => s.with?.['node-version-file'] === '.node-version'));
});

test('build runs the release, sign and vendor tests and the build; publish runs only the publish program', () => {
  const { build, publish } = workflow('release-packs.yml').jobs;
  const runs = (job) => job.steps.map((s) => s.run ?? '').join('\n');
  // The import tests need git-filter-repo, which only verify-import installs.
  assert.match(runs(build), /node --test \$\(git ls-files 'tools\/release\/\*\.test\.mjs' 'tools\/sign\/\*\.test\.mjs' 'tools\/vendor\/\*\.test\.mjs'\)/);
  assert.doesNotMatch(runs(build), /tools\/import|'tools\/\*\.test\.mjs'/);
  assert.match(runs(build), /node tools\/release\/release\.mjs build --out /);
  assert.doesNotMatch(runs(publish), /node --test|release\.mjs build|vendor\.mjs/);
  assert.match(runs(publish), /node tools\/release\/release\.mjs publish --archives .* --roots keys\/dev\/roots --summary "\$GITHUB_STEP_SUMMARY"/);
  assert.match(runs(publish), /::warning::signed with the development key/);
  const checkout = publish.steps.find((s) => s.uses?.startsWith('actions/checkout@'));
  assert.equal(checkout.with['fetch-depth'], 0);
  assert.equal(checkout.with['persist-credentials'], true);
});

test('verify-import still runs on main only, so pushes to vendored trigger nothing', () => {
  assert.deepEqual(workflow('verify-import.yml').on.push.branches, ['main']);
});

test('verify-import, after the freeze: the fresh import is verified against the recorded commit, the branch only for ancestry', () => {
  const w = workflow('verify-import.yml');
  assert.deepEqual(Object.keys(w.jobs).filter((j) => j !== 'release-plan'), ['verify']);
  const runs = w.jobs.verify.steps.map((s) => s.run ?? '').join('\n');
  assert.doesNotMatch(runs, /--landed/);
  assert.match(runs, /node tools\/import\/verify\.mjs --source "\$RUNNER_TEMP\/import\/src" --commit "\$\{\{ steps\.source\.outputs\.commit \}\}" --import "\$RUNNER_TEMP\/import\/out"$/m);
  assert.ok(w.jobs.verify.steps.some((s) => s.name === 'This branch carries the import history'));
});

// Runs the workflow's own ancestry step against a branch that merged a synthetic import and one
// that did not, so the history guarantee is proven by the text CI executes.
test('verify-import\'s ancestry step passes a branch carrying the import tip and fails one that does not', () => {
  const step = workflow('verify-import.yml').jobs.verify.steps.find((s) => s.name === 'This branch carries the import history');
  const root = mkdtempSync(join(tmpdir(), 'acme-ancestry-'));
  const g = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...GIT_ENV } }).trim();
  const out = join(root, 'import', 'out');
  mkdirSync(join(out, 'packs', 'acme-pack'), { recursive: true });
  g(out, 'init', '-q', '-b', 'import');
  writeFileSync(join(out, 'packs', 'acme-pack', 'RULES.md'), '# acme\n');
  g(out, 'add', '-A');
  g(out, 'commit', '-qm', 'acme import');
  const branch = (merge) => {
    const dir = mkdtempSync(join(root, 'branch-'));
    g(dir, 'init', '-q', '-b', 'main');
    writeFileSync(join(dir, 'README.md'), 'acme\n');
    g(dir, 'add', '-A');
    g(dir, 'commit', '-qm', 'tooling');
    if (merge) {
      g(dir, 'fetch', '-q', out, 'import:import');
      g(dir, 'merge', '-q', '--allow-unrelated-histories', '--no-ff', '-m', 'Merge import', 'import');
    }
    return dir;
  };
  const exec = (dir) => spawnSync('bash', ['-e', '-c', step.run], { cwd: dir, encoding: 'utf8', env: { ...process.env, ...GIT_ENV, RUNNER_TEMP: root } });
  const ok = exec(branch(true));
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  const bad = exec(branch(false));
  assert.equal(bad.status, 1, bad.stdout + bad.stderr);
  assert.match(bad.stdout, /::error::the import tip [0-9a-f]{40} is not in this branch's history/);
});

test('release-plan runs on every pull request and on dispatch, reads only, holds no secret and runs plan --content', () => {
  const w = workflow('verify-import.yml');
  assert.ok('pull_request' in w.on && 'workflow_dispatch' in w.on);
  const job = w.jobs['release-plan'];
  assert.ok(job, 'verify-import.yml has a release-plan job');
  assert.equal(job.if, "github.event_name != 'push'");
  assert.deepEqual(job.permissions, { contents: 'read' });
  assert.equal(job.environment, undefined);
  const checkout = job.steps.find((s) => s.uses?.startsWith('actions/checkout@'));
  assert.equal(checkout.with['fetch-depth'], 0);
  assert.equal(checkout.with['persist-credentials'], false);
  assert.ok(job.steps.some((s) => s.with?.['node-version-file'] === '.node-version'));
  assert.doesNotMatch(JSON.stringify(job), /secrets\./);
  const runs = job.steps.map((s) => s.run ?? '').join('\n');
  assert.match(runs, /^node tools\/release\/release\.mjs plan --content --remote origin$/m);
});

test('dev-key-expiry runs weekly off the hour and on dispatch, reads only, and runs the expiry script', () => {
  const w = workflow('dev-key-expiry.yml');
  assert.deepEqual(Object.keys(w.on).sort(), ['schedule', 'workflow_dispatch']);
  const [minute] = w.on.schedule[0].cron.split(' ');
  assert.notEqual(minute, '0', 'GitHub drops on-the-hour crons under load');
  assert.deepEqual(w.permissions, { contents: 'read' });
  const runs = Object.values(w.jobs).flatMap((j) => j.steps.map((s) => s.run ?? '')).join('\n');
  assert.match(runs, /^node tools\/release\/dev-key-expiry\.mjs$/m);
});

test('upload runs after publish in the release environment, reads only, and gets the two Cloudflare secrets and nothing else', () => {
  const { publish, upload } = workflow('release-packs.yml').jobs;
  assert.equal(upload.needs, 'publish');
  assert.equal(upload.environment, 'release');
  assert.deepEqual(upload.permissions, { contents: 'read' });
  const checkout = upload.steps.find((s) => s.uses?.startsWith('actions/checkout@'));
  assert.equal(checkout.with['persist-credentials'], false);
  assert.ok(upload.steps.some((s) => s.with?.['node-version-file'] === '.node-version'));
  const secrets = upload.steps.flatMap((s) => Object.entries(s.env ?? {})).filter(([, v]) => String(v).includes('secrets.'));
  assert.deepEqual(secrets.map(([k]) => k).sort(), ['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN']);
  for (const [k, v] of secrets) assert.equal(v, `\${{ secrets.${k} }}`);
  const runs = (job) => job.steps.map((s) => s.run ?? '').join('\n');
  assert.match(runs(upload), /node tools\/release\/release\.mjs upload --r2 claudinite-packs --roots keys\/dev\/roots --remote origin --summary "\$GITHUB_STEP_SUMMARY"/);
  assert.doesNotMatch(runs(upload), /node --test|release\.mjs (build|publish)|vendor\.mjs/);
  assert.doesNotMatch(runs(publish), /release\.mjs upload/);
});

test('promote-packs runs hourly off the hour and on dispatch with action, pack and version, in the release concurrency group', () => {
  const w = workflow('promote-packs.yml');
  assert.deepEqual(Object.keys(w.on).sort(), ['schedule', 'workflow_dispatch']);
  const [minute, hour] = w.on.schedule[0].cron.split(' ');
  assert.notEqual(minute, '0', 'GitHub drops on-the-hour crons under load');
  assert.equal(hour, '*');
  assert.deepEqual(Object.keys(w.on.workflow_dispatch.inputs).sort(), ['action', 'pack', 'version']);
  assert.deepEqual(w.on.workflow_dispatch.inputs.action.options, ['promote', 'revoke']);
  assert.equal(w.concurrency.group, workflow('release-packs.yml').concurrency.group);
  assert.equal(w.concurrency['cancel-in-progress'], false);
});

test('promote-packs: the promote job writes in the release environment; upload follows with only the Cloudflare secrets', () => {
  const { promote, upload } = workflow('promote-packs.yml').jobs;
  assert.equal(promote.environment, 'release');
  assert.deepEqual(promote.permissions, { contents: 'write' });
  assert.equal(upload.needs, 'promote');
  assert.equal(upload.environment, 'release');
  assert.deepEqual(upload.permissions, { contents: 'read' });
  const runs = (job) => job.steps.map((s) => s.run ?? '').join('\n');
  const r = runs(promote);
  assert.match(r, /node tools\/release\/release\.mjs evidence --out /);
  assert.match(r, /node tools\/release\/release\.mjs promote --evidence /);
  assert.match(r, /node tools\/release\/release\.mjs "\$ACTION" --pack "\$PACK" --version "\$VERSION" --by "\$ACTOR"/);
  assert.doesNotMatch(r, /\$\{\{/, 'inputs reach the script through env, never interpolated into it');
  assert.doesNotMatch(r, /node --test|release\.mjs (build|publish)|vendor\.mjs/);
  const env = Object.assign({}, ...promote.steps.map((s) => s.env ?? {}));
  assert.equal(env.ACTOR, '${{ github.actor }}');
  assert.match(runs(upload), /node tools\/release\/release\.mjs upload --r2 claudinite-packs --roots keys\/dev\/roots --remote origin --summary "\$GITHUB_STEP_SUMMARY"/);
  const secrets = upload.steps.flatMap((s) => Object.entries(s.env ?? {})).filter(([, v]) => String(v).includes('secrets.'));
  assert.deepEqual(secrets.map(([k]) => k).sort(), ['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN']);
});
