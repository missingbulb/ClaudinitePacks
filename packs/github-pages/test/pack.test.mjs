import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { CONFIG_PATH, parseConfig, publishSet } from '../lib.mjs';
import { assemble, main as buildSite, resolveBuildVars } from '../build-site.mjs';

const CONFIG = 'publish_root=.\npublish_paths=index.html assets\nbuild_command=\n';

function pagesTree(files) {
  const root = mkdtempSync(join(tmpdir(), 'github-pages-'));
  for (const [rel, text] of Object.entries({ [CONFIG_PATH]: CONFIG, 'index.html': '<!doctype html>\n', 'assets/style.css': 'body{}\n', ...files })) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), text);
  }
  return root;
}

test('site.config: build_vars is optional, and its entries must be variable names', () => {
  assert.deepEqual(parseConfig(CONFIG).errors, []);
  assert.deepEqual(parseConfig(`${CONFIG}build_vars=SITE_TOKEN BASE_URL\n`).errors, []);
  assert.match(parseConfig(`${CONFIG}build_vars=FOO=bar\n`).errors.join('\n'), /not a variable name/);
  const { paths, fullOf } = publishSet(parseConfig('publish_root=site/\npublish_paths=index.html data\nbuild_command=\n').values);
  assert.deepEqual(paths.map(fullOf), ['site/index.html', 'site/data']);
});

test('build variables: declared names resolve from the repo variables, and an unset one is named', () => {
  assert.deepEqual(resolveBuildVars('A B', { A: '1', B: 'x', C: 'never' }), { resolved: [['A', '1'], ['B', 'x']], missing: [] });
  assert.deepEqual(resolveBuildVars('A B', { A: '' }), { resolved: [], missing: ['A', 'B'] });
});

test('build-site assembles the publish set, runs the build with its variables, and refuses a broken set', () => {
  const root = pagesTree({
    [CONFIG_PATH]: 'publish_root=.\npublish_paths=index.html assets out\nbuild_command=mkdir -p out && echo "$GREETING" > out/hello.txt\nbuild_vars=GREETING\n',
  });
  try {
    const files = buildSite(root, { REPO_VARS_JSON: JSON.stringify({ GREETING: 'hi' }), PATH: process.env.PATH });
    assert.deepEqual(files, ['assets/style.css', 'index.html', 'out/hello.txt']);
    assert.equal(readFileSync(join(root, '_site', 'out', 'hello.txt'), 'utf8').trim(), 'hi');
    assert.deepEqual(buildSite(root, { REPO_VARS_JSON: JSON.stringify({ GREETING: 'again' }), PATH: process.env.PATH }), files);
    assert.throws(() => buildSite(root, { REPO_VARS_JSON: '{}' }), /GREETING/);

    const values = parseConfig('publish_root=.\npublish_paths=index.html gone\nbuild_command=\n').values;
    assert.throws(() => assemble(root, values), /publish path 'gone' does not exist/);
    mkdirSync(join(root, 'site'));
    writeFileSync(join(root, 'site', 'about.html'), '<p>');
    assert.throws(() => assemble(root, parseConfig('publish_root=site\npublish_paths=about.html\nbuild_command=\n').values), /no index\.html at its root/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
