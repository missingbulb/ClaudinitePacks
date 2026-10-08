import { test, before } from 'node:test';
import assert from 'node:assert/strict';

// The same few lines of DOM the other view tests use — enough for what a renderer
// touches, and no browser engine to assert that a div got a class.
class FakeEl {
  constructor(tag) { this.tagName = tag; this.children = []; this.textContent = ''; this.className = ''; }
  append(...kids) { for (const k of kids) this.children.push(k); }
  replaceChildren(...kids) { this.children = kids; }
  get classList() { return { add: (c) => { this.className = `${this.className} ${c}`.trim(); } }; }
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

let refNodes;
let reasonNodes;
let queueUrl;

before(async () => {
  globalThis.document = { createElement: (tag) => new FakeEl(tag) };
  ({ refNodes, reasonNodes, queueUrl } = await import('../src/render/ui.mjs'));
});

test('every #N in a sentence comes back as an anchor, and the prose between them survives', () => {
  const nodes = refNodes('an-owner/TicketWatch', 'blocked by #12, #13');
  assert.deepEqual(nodes.filter((n) => typeof n === 'string'), ['blocked by ', ', ']);
  const links = nodes.filter((n) => typeof n !== 'string');
  assert.deepEqual(links.map((a) => a.textContent), ['#12', '#13']);
  assert.deepEqual(links.map((a) => a.href), [
    'https://github.com/an-owner/TicketWatch/issues/12',
    'https://github.com/an-owner/TicketWatch/issues/13',
  ]);
});

test('a pull request number takes the same URL as an issue — GitHub redirects it', () => {
  const [link] = refNodes('an-owner/TicketWatch', '#42 lands when you merge PR #43');
  assert.equal(link.href, 'https://github.com/an-owner/TicketWatch/issues/42');
  const pr = refNodes('an-owner/TicketWatch', 'PR #43').at(-1);
  assert.equal(pr.href, 'https://github.com/an-owner/TicketWatch/issues/43');
});

test('text naming no number comes back as itself, so a caller can hand anything to it', () => {
  assert.deepEqual(refNodes('an-owner/TicketWatch', 'not read'), ['not read']);
});

test('a warning that names the items holding a task links each of them', () => {
  const [span] = reasonNodes([{ level: 'warning', text: 'blocked on #12, #13 for over 2 days' }], 'an-owner/TicketWatch');
  assert.equal(span.className, 'warn warning');
  assert.match(span.text, /▲ blocked on #12, #13 for over 2 days/);
  const links = span.children.filter((c) => typeof c !== 'string');
  assert.deepEqual(links.map((a) => a.href), [
    'https://github.com/an-owner/TicketWatch/issues/12',
    'https://github.com/an-owner/TicketWatch/issues/13',
  ]);
});

test('with no repo, a number stays text rather than a link to nowhere', () => {
  const [span] = reasonNodes([{ level: 'critical', text: '2 items parked broken, #12 the worst' }]);
  assert.match(span.text, /2 items parked broken, #12 the worst/);
  assert.equal(span.children.filter((c) => typeof c !== 'string').length, 0);
});

// --- the queue as one URL ------------------------------------------------------------

test('a queue inside one repo is that repo\'s open issues, narrowed to its numbers', () => {
  const url = queueUrl([
    { repo: 'an-owner/TicketWatch', number: 401 },
    { repo: 'an-owner/TicketWatch', number: 275 },
  ]);
  assert.equal(url, 'https://github.com/an-owner/TicketWatch/issues?q=is%3Aissue+state%3Aopen+401+275');
});

test('a queue spanning members is one cross-repository search, naming every member', () => {
  const url = queueUrl([
    { repo: 'an-owner/TicketWatch', number: 401 },
    { repo: 'an-owner/Shepherd', number: 12 },
  ]);
  assert.match(url, /^https:\/\/github\.com\/search\?type=issues&q=/);
  assert.match(decodeURIComponent(url), /repo:an-owner\/TicketWatch\+repo:an-owner\/Shepherd/);
  assert.match(decodeURIComponent(url), /401\+12/);
});

test('a candidate with no number of its own is not in the search, and a queue of none has no URL', () => {
  assert.equal(queueUrl([{ repo: 'an-owner/TicketWatch', number: null }]), null);
  assert.equal(queueUrl([]), null);
  assert.match(queueUrl([{ repo: 'a/b', number: null }, { repo: 'a/b', number: 7 }]), /issues\?q=is%3Aissue\+state%3Aopen\+7$/);
});

// --- the column chart's scale ---------------------------------------------------------

// A chart whose columns are hours states its peak per hour, and names its ends and its
// peak by the label it was given — an hourly series carries no `day` to fall back on.
test('an hourly chart reads its peak per hour and names its columns by their label', async () => {
  class SvgEl extends FakeEl {
    constructor(tag) { super(tag); this.attrs = {}; }
    setAttribute(k, v) { this.attrs[k] = v; }
  }
  const prior = globalThis.document;
  globalThis.document = { createElement: (tag) => new FakeEl(tag), createElementNS: (_ns, tag) => new SvgEl(tag) };
  try {
    const { stackedColumns } = await import('../src/render/ui.mjs');
    const series = [{ label: 'runs', color: 'red', value: (h) => h.n }];
    const hours = [{ hour: '2026-10-02T05', n: 1 }, { hour: '2026-10-02T06', n: 3 }];
    const label = (h) => `${h.hour.replace('T', ' ')}:00Z`;
    const chart = stackedColumns(hours, series, { label, unit: 'hour' });
    const axis = chart.find('chart-axis')[0].children.map((c) => c.textContent);
    assert.deepEqual(axis, ['2026-10-02 05:00Z', 'peak 3/hour', '2026-10-02 06:00Z']);
    assert.equal(chart.children[0].attrs['aria-label'], '2 hours, peak 3 on 2026-10-02 06:00Z');

    // The contrast: a day chart is unchanged.
    const days = stackedColumns([{ day: '2026-10-01', n: 2 }, { day: '2026-10-02', n: 0 }], series);
    assert.deepEqual(days.find('chart-axis')[0].children.map((c) => c.textContent), ['2026-10-01', 'peak 2/day', '2026-10-02']);
    assert.equal(days.children[0].attrs['aria-label'], '2 days, peak 2 on 2026-10-01');
  } finally { globalThis.document = prior; }
});
