import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  loadConfig, DEFAULTS, checkConfig, RETIRED_KEYS,
} from '../src/read/config.mjs';
import { isOAuthConfigured } from '../src/read/auth.mjs';

// Absent config is a valid deployment (a member repo, served locally), so every miss
// has to be a default rather than an error — a throw here would be a blank page.
test('a missing or broken config file yields the defaults', async () => {
  globalThis.fetch = async () => ({ ok: false, status: 404, json: async () => ({}) });
  assert.deepEqual(await loadConfig('./nope.json'), DEFAULTS);

  globalThis.fetch = async () => { throw new Error('offline'); };
  assert.deepEqual(await loadConfig('./nope.json'), DEFAULTS);

  globalThis.fetch = async () => ({ ok: true, json: async () => { throw new Error('not json'); } });
  assert.deepEqual(await loadConfig('./bad.json'), DEFAULTS);
});

test('a config file is merged over the defaults', async () => {
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ clientId: 'Iv1.x', defaultRepo: 'o/a' }) });
  const c = await loadConfig();
  assert.equal(c.clientId, 'Iv1.x');
  assert.equal(c.defaultRepo, 'o/a');
  assert.equal(c.exchangeUrl, null, 'unset keys keep their default');
});

// Sign-in needs BOTH halves: a client id with nowhere to exchange the code would
// render a button that always fails.
test('OAuth counts as configured only with both a client id and an exchange url', () => {
  assert.equal(isOAuthConfigured({ clientId: 'a', exchangeUrl: 'https://x' }), true);
  assert.equal(isOAuthConfigured({ clientId: 'a' }), false);
  assert.equal(isOAuthConfigured({ exchangeUrl: 'https://x' }), false);
  assert.equal(isOAuthConfigured(null), false);
});

// --- what the build refuses --------------------------------------------------------

// A deployment still carrying a fleet key believes the page covers more than one repo.
// It is refused naming the key rather than ignored.
test('a fleet key is refused, naming it', () => {
  for (const key of Object.keys(RETIRED_KEYS)) {
    assert.throws(() => checkConfig({ [key]: 'x' }), new RegExp(`"${key}"`));
  }
  assert.throws(() => checkConfig({ owner: 'acme', exclude: [] }), /"owner", "exclude"/);
});

test('mode is accepted only as "repo", and its absence is the ordinary case', () => {
  assert.doesNotThrow(() => checkConfig({}));
  assert.doesNotThrow(() => checkConfig(null));
  assert.doesNotThrow(() => checkConfig({ mode: 'repo', clientId: 'Iv1.x' }));
  assert.throws(() => checkConfig({ mode: 'fleet' }), /mode "fleet"/);
});
