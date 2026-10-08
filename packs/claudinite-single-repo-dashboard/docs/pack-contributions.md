# Pack-contributed dashboard metrics

How any pack surfaces its own key figures on the dashboard — a release pack the last
release, `executable-requirements` the requirements that moved, the canon the packs it
recently gained — without the dashboard knowing any pack's business and without a pack
being able to hurt the page.

The whole contract in one line: **a pack contributes data, never code.**

## The contract

This is the posture the `contributes` manifest key already establishes — a pack ships
another pack's rules as data (`contributes: { barriers: [...] }`), composed by
declaration rather than a code import. The dashboard's descriptor is the same idea for a
reader that cannot import anything: `contributes` is read in-process by the engine, in
the member's own checkout, where reading a pack's manifest is ordinary; the dashboard is a
browser reading *another repo* over the API, where it is not possible at all.

A pack that wants figures on the dashboard carries one file, `packs/<id>/dashboard.json`
— the **descriptor** — vendored with the pack like everything else it ships. It declares,
in a closed vocabulary the dashboard owns:

- the **widgets** it has at all — what each one is, and which **source** its value
  comes from,
- and which of them make the **repo page** card (up to six).

The page executes nothing from any pack. Descriptors and values are JSON lifted as text
over the API — the same way task-declaration fields already are, and for the same reason:
there is no `import` when reading another repo. The page renders a repo the viewer may
merely have read access to; importing its modules would run that repo's code in the
viewer's browser, with the viewer's token in scope. Data only has to be *tolerated*
across pack versions; code would have to be version-matched and sandboxed.

## The descriptor

```jsonc
// packs/<id>/dashboard.json
{
  "$schema": "../claudinite-single-repo-dashboard/dashboard-descriptor.schema.json",
  "widgets": [
    { "id": "last",   "kind": "event",  "label": "last release",         "source": "latest-release" },
    { "id": "landed", "kind": "window", "label": "requirements changed", "noun": "reqs" },
    { "id": "recent", "kind": "list",   "label": "recently changed" },
    { "id": "stars",  "kind": "stat",   "label": "stars", "noun": "stars",
      "glyph": "★", "source": "repo-stars" }
  ],
  "repo": ["last", "landed", "recent"]
}
```

A widget is declared once and the repo page **selects** from that list by id. There is no
templating and no expression language: a widget's `id` is the key its value is looked up
under, and everything else is fixed vocabulary. A schema
(`dashboard-descriptor.schema.json`, owned by the dashboard pack, pointed at by
`$schema`) validates descriptors with ordinary tooling, and a canon check holds every
pack's descriptor to it. The page revalidates structurally on read and treats an invalid
descriptor as one named fault line on that pack's card — never a broken page, never an
invented value.

## Sources — where a value comes from

Two kinds, and the vocabulary is the dashboard's to extend, one deliberate kind at a
time:

- **`generated`** (the default): the value is read from the pack's own generated file in
  the member's tree, `.claudinite/usage/<pack>-dashboard-values.json`, keyed by widget
  `id`:

  ```jsonc
  { "generatedAt": "2026-08-20T04:12:00Z",
    "values": {
      "landed": { "value": 5, "previous": 8, "window": "2w" },
      "recent": { "items": [ { "text": "REQ-041 checkout retry", "url": "…", "at": "…" } ] } } }
  ```

  The owning pack's own machinery writes it — a task landing through
  `deliver-generated`, on whatever cadence its signal moves. One file per pack: two
  independently-adopted packs never share a write target or a format.

- **`latest-release`**: the repo's latest GitHub release — tag and published time,
  rendered as an `event`.
- **`repo-stars`**: the repository's stargazer count, rendered as a `stat`.

  Both are platform facts no file in the tree carries and no pack task should have to
  mirror. Each comes from a read the page **already makes** for the repo — the repo
  metadata and the releases listing — ETag-revalidated and shared by every pack that
  asks, so a live source costs a contributing pack nothing and the page no extra request.
  The vocabulary is the dashboard's to extend, one deliberate source at a time; it is not
  open to a pack naming a URL of its own.

## Widgets — how a value renders

Four kinds, all rendered by the dashboard's own `ui.mjs` renderers, all through
`textContent`:

| kind | value shape | for |
|---|---|---|
| `stat` | `{ "value", "unit"? }` | a point-in-time fact — pages in the wiki, requirements in the spec |
| `event` | `{ "text", "at", "url"? }` | the last time something happened, and what — "v1.4.2 · 3 days ago" |
| `window` | `{ "value", "previous", "window" }` | a count of things that happened, this window against the previous — the writer states the span it counted (`"2w"`), since only it knows |
| `list` | `{ "items": [{ "text", "url"?, "at"? }] }` | the few most recent named things — capped at 5 by the renderer, overflow shown as a count, never silently |

`window` is the only sanctioned shape for a count of happenings — `stat` is for facts
that are true now, and there is deliberately no shape a monotonic cumulative total fits.
The schema cannot check meaning, so the descriptor schema's own description states the
rule and review enforces it.

Rendering is bounded everywhere: labels, texts and item counts truncate at renderer-owned
budgets with the overflow named; a `url` must parse as `https:` or renders as plain text.

## The repo page

A *What the packs report* region after the core panels: one card per declared pack whose
mount carries a descriptor with a `repo` half — the pack's badge and id, then its
widgets. A widget whose value is missing renders as the absent state the page already
has, naming the file that would carry it.

A card never colours itself by severity, however urgent its pack believes its number to
be. Colour on the page is the engine's severity edge, and a pack that could paint itself
red would be claiming attention it did not earn. Pack contributions never feed the work
ranking or the at-a-glance tiles: attention is earned by engine-defined truths the page
can defend.

## What it costs

Discovery is free: the page already reads the member's declaration and the tree
listing at the head sha, so a contribution exists exactly when
`…/packs/<id>/dashboard.json` — and its values file — appear in a listing already in
hand. No probe reads.

Descriptors and values files are content at a sha: read once when the default branch
moves, cached forever, **zero** requests while it has not. `latest-release` is one
ETag-revalidated read per repo — free on a 304 — shared across every pack that asks.
Cold, the worst case is two reads per contributing pack, only for packs that
actually carry the files.

Pack metrics are decoration in the budget policy's terms: priced by the planner and
skipped below `tight`, before anything core is. A
withheld read renders as withheld, never as a pack with nothing to say.

## What it does not touch

The mechanism lands inside the dashboard pack, and the blast radius is worth stating
because it is the first thing anyone will ask.

**Nothing in `engine/`.** A descriptor is found by path — `packs/<id>/dashboard.json`, a
convention - and not by registration: no manifest key, no field on the manifest, no list of
which packs contribute. A pack that adds one is discovered by the file being there, and a
pack that drops one disappears the same way.

**Nothing in vendoring.** `computeVendorSet` walks a declared pack's directory whole and
drops only `*.test.mjs`, so a new `.json` beside the manifest reaches every member that
declares the pack with no change and no whitelist entry.

**Nothing in the scheduler's signal collection.** No signal feeds this and no task
collects for it. The page already holds the declaration and tree listing at the
head sha, and the descriptor and values are two more reads against that same sha.

**Nothing in `.claudinite/usage`'s shape.** The values file sits beside the member's other
rolling records, named for its pack so two packs never share a file.

**And nothing in another pack — until that pack chooses to contribute.** A pack on a live
source (`latest-release`, `repo-stars`) ships a descriptor and no code at all. Only a pack
wanting a `generated` value gains anything, and what it gains is a writer in a task it
already owns — its own change, on its own schedule, and never a precondition for this
landing.

## Faults, absences and version skew

Every miss is one state, named: a missing values file, a missing key, an unreadable
repo, a withheld read and a malformed file are each rendered as what they are —
*not read is not zero* holds here as everywhere on the page.

Descriptor and values come from the member's own tree at the same sha, so a member on an
older pack version renders that version's contract, self-consistently — no coordination
between canon, member and deployment. Readers drop unknown keys; a descriptor carrying a
widget or source kind newer than the deployed page renders that widget as "this
dashboard predates the descriptor", never a guess.

## What the corpus has to say

The vocabulary is four kinds because that is what the canon's packs actually have, and
the shape of the answer matters as much as its contents: **most packs contribute
nothing, and that is the ordinary case.** Sixteen of the thirty-two carry conventions
rather than state — there is no number a repo's tree could answer for `node`, `leaflet`
or `ios` — so they carry no descriptor and their repos never render the region. Two more
abstain deliberately: `claudinite-single-repo-dashboard` would be reporting on itself, and
`claudinite-lifecycle`'s freshness is the fleet manager's verdict, not a fact this page reads.

Of the rest, the split that matters is whether a writer exists. Seven contribute from
machinery already running — the release packs off `latest-release` and `git-github` off
`repo-stars`, neither needing a line of code, and `claudinite-growth`,
`product-wiki`, `jwt`, `basics` and `claudinite-fleet-sheepdog` from tasks they already
own. The remaining six —
`executable-requirements`, `spec-driven-product`, `research-project`, `barriers`,
`web-scraping` and the store-release packs' in-repo half — have a figure worth showing
and nothing writing it yet, which is a task per pack rather than anything this contract
owes them.

One pack joins the list purely by dogfooding: **`git-github` contributes the repo's
stars**, a `stat` off `repo-stars`, and it is the case that proves the contract carries
its own weight. Stars is drawn today by the dashboard's own code as an identity mark
beside the repo's name; as a contribution it is a descriptor and no code at all, and
the page hardcodes one less fact about a repo. It costs what dogfooding costs and the
cost is the point: a repo that does not declare `git-github` has no stars on its page. A fact the page happens to have in hand is not a reason to render
it — something has to have asked for it.

Two limits are worth stating where they will be asked about. Store-side state (in
review, rollout percentage) needs credentials no page running as its viewer can hold, so
the release packs report the repo's own releases and name the rest as out of scope. And
`basics`' CI wall-clock is the clearest case for the whole mechanism: the dashboard shows
which runs happened and structurally cannot know what they cost, while the pack that
measures it already does.

## Alternatives

- **The descriptor on the manifest under `contributes`** - the canon's own composition key,
  and one authored home for everything a pack addresses to another. It cannot serve this
  reader: the page reads other repos over the API, so the descriptor would have to be
  text-lifted out of a JavaScript module by a browser. The dashboard already does that
  for task declarations and reports it as a limitation — a field it cannot read renders
  *unknown* — which is an acceptable floor for a cadence it merely displays and not for
  the thing that decides what renders at all. Materialising the JSON from `contributes`
  at build time would fix the parse and keep the single home, at the cost of a generated
  file per pack and a regeneration step in a lane that has none; the JSON is small enough
  to write.
- **Pack render code, imported by the page** — executes member code in the viewer's
  browser with the viewer's token in scope, must be version-matched per member, and can
  fetch, making its cost invisible to the budget planner.
- **HTML fragments in the values file** — markup is code by another name (injection
  through the same door), and the page stops being one page the moment two packs style
  themselves.
- **One shared metrics file all packs write** — write contention between
  independently-adopted packs' tasks, and one format every pack must agree on; per-pack
  files keep pack independence.
- **Descriptor embedded in the values file** (self-describing, as the usage fold's
  `fields` header is) — one read and zero drift, but it cannot describe a live source
  (`latest-release` has no values file), and the descriptor belongs with the pack —
  versioned, reviewed, schema-checked — not inside a generated artifact.
- **Contributing through the usage fold** — couples every pack to `claudinite-growth`'s
  presence and format; a member without that pack could contribute nothing.
- **Free-form live sources** ("GET this endpoint") — unpriceable, unbounded, and points
  the viewer's token wherever a pack says.
