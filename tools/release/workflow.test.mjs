import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

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
  for (const file of ['release-packs.yml', 'verify-import.yml']) {
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

test('build runs the tools tests and the build; publish runs only the publish program', () => {
  const { build, publish } = workflow('release-packs.yml').jobs;
  const runs = (job) => job.steps.map((s) => s.run ?? '').join('\n');
  assert.match(runs(build), /node --test \$\(git ls-files 'tools\/\*\.test\.mjs'\)/);
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
