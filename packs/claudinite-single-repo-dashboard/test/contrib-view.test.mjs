import { test, before } from 'node:test';
import assert from 'node:assert/strict';

// A DOM the size of what these renderers actually use. The repo carries no
// dependencies and this is a few lines — a browser engine to assert that a span got a
// class would be a poor trade, and the real page is what proves the CSS.
class FakeEl {
  constructor(tag) { this.tagName = tag; this.children = []; this.textContent = ''; this.className = ''; }
  append(...kids) { for (const k of kids) this.children.push(k); }
  replaceChildren(...kids) { this.children = kids; }
  get classList() { return { add: (c) => { this.className = `${this.className} ${c}`.trim(); } }; }
  // Everything this subtree renders, flattened — text nodes are appended as strings.
  get text() {
    return [this.textContent, ...this.children.map((c) => (typeof c === 'string' ? c : c.text))].join('');
  }
  find(cls) {
    const hit = [];
    if (this.className.split(' ').includes(cls)) hit.push(this);
    for (const c of this.children) if (c instanceof FakeEl) hit.push(...c.find(cls));
    return hit;
  }
}

let packCard, parseDescriptor;

before(async () => {
  globalThis.document = { createElement: (tag) => new FakeEl(tag) };
  ({ packCard } = await import('../src/render/contrib-view.mjs'));
  ({ parseDescriptor } = await import('../src/read/contributions.mjs'));
});

const NOW = Date.UTC(2026, 7, 22, 12, 0, 0);
const descriptor = (over = {}) => parseDescriptor(JSON.stringify({
  widgets: [
    { id: 'stars', kind: 'stat', label: 'stars', noun: 'stars', glyph: '★', source: 'repo-stars' },
    { id: 'landed', kind: 'window', label: 'requirements changed', noun: 'reqs' },
    { id: 'recent', kind: 'list', label: 'recently changed' },
  ],
  repo: ['stars', 'landed', 'recent'],
  ...over,
}), 'demo');

// A descriptor the page cannot use becomes ONE named line — never a missing card, so a
// broken pack is visibly broken rather than invisibly absent.
test('a faulted descriptor renders a card that names the fault', () => {
  const card = packCard({ pack: 'demo', descriptor: { fault: 'its dashboard.json is not valid JSON' } }, NOW);
  assert.match(card.text, /demo/);
  assert.match(card.text, /not valid JSON/);
});

test('a withheld read renders as withheld, not as a pack with nothing to say', () => {
  const card = packCard({ pack: 'demo', withheld: true }, NOW);
  assert.match(card.text, /declined to spend/);
});

// Named once at the card and naming the FILE, because "what writes this" is the next
// question a reader has.
test('a pack whose values file does not exist names the file', () => {
  const card = packCard({ pack: 'demo', descriptor: descriptor(), values: null, live: { stars: 4 } }, NOW);
  assert.match(card.text, /\.claudinite\/usage\/demo-dashboard-values\.json/);
  // …and the widget that did have a live source still renders its number.
  assert.match(card.text, /4/);
});

// The previous window is spelled out rather than left as a bare arrow: a change with
// nothing to compare against is the vanity total this surface refuses.
test('a repo window widget shows its previous window in words', () => {
  const card = packCard({
    pack: 'demo', descriptor: descriptor({ repo: ['landed'] }),
    values: { generatedAt: null, values: { landed: { value: 12, previous: 7, window: '2w' } } },
  }, NOW);
  assert.match(card.text, /▲ 7/);
});
