// The view a viewer asked for survives the trip to GitHub and back. GitHub returns to
// the registered callback — the page's bare URL, `redirect_uri` — with only `code` and
// `state`, so `?repo=` is not in the URL the page lands on; it has to be carried.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

class Mem {
  constructor() { this.m = new Map(); }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) { this.m.set(k, String(v)); }
  removeItem(k) { this.m.delete(k); }
}

let replaced;
let assigned;
const at = (url) => {
  const u = new URL(url);
  globalThis.location = {
    href: u.href, origin: u.origin, pathname: u.pathname, search: u.search,
    assign: (to) => { assigned = to; },
  };
};

beforeEach(() => {
  globalThis.sessionStorage = new Mem();
  globalThis.localStorage = new Mem();
  replaced = [];
  assigned = null;
  globalThis.history = { replaceState: (_a, _b, url) => replaced.push(String(url)) };
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ access_token: 'gho_t' }) });
});

const load = () => import(`../src/read/auth.mjs?t=${Math.random()}`);
const CONFIG = { clientId: 'Iv1.x', exchangeUrl: 'https://exchange.example/gh' };

async function roundTrip(startUrl) {
  const a = await load();
  at(startUrl);
  a.beginSignIn(CONFIG);
  const sent = new URL(assigned);
  assert.equal(sent.searchParams.get('redirect_uri'), 'https://o.github.io/R/packs/claudinite-single-repo-dashboard/');
  at(`https://o.github.io/R/packs/claudinite-single-repo-dashboard/?code=c1&state=${sent.searchParams.get('state')}`);
  const out = await a.completeSignIn(CONFIG);
  assert.equal(out.status, 'signed-in');
  return new URL(replaced.at(-1));
}

test('?repo= comes back from GitHub, and the code does not stay', async () => {
  const back = await roundTrip('https://o.github.io/R/packs/claudinite-single-repo-dashboard/?repo=octo%2Fcat');
  assert.equal(back.searchParams.get('repo'), 'octo/cat');
  assert.equal(back.searchParams.get('code'), null);
  assert.equal(back.searchParams.get('state'), null);
  assert.equal(back.pathname, '/R/packs/claudinite-single-repo-dashboard/');
});

test('signing in from the bare page lands on the bare page', async () => {
  const back = await roundTrip('https://o.github.io/R/packs/claudinite-single-repo-dashboard/');
  assert.equal(back.search, '');
});

test('a failed callback still restores the view that was asked for', async () => {
  const a = await load();
  at('https://o.github.io/R/packs/claudinite-single-repo-dashboard/?repo=octo%2Fcat');
  a.beginSignIn(CONFIG);
  at('https://o.github.io/R/packs/claudinite-single-repo-dashboard/?error=access_denied');
  const out = await a.completeSignIn(CONFIG);
  assert.equal(out.status, 'error');
  assert.equal(new URL(replaced.at(-1)).searchParams.get('repo'), 'octo/cat');
});
