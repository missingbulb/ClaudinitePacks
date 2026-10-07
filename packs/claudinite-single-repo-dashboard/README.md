<img src="badge.svg" width="24" height="24" alt=""> claudinite-single-repo-dashboard

A read-only view of what one repo's Claudinite is doing: what is stuck, what is queued,
what has run, and what the corpus has been costing and catching.

The end-state specification of the page, the fields the fold gains for them and the
visual identity is [docs/](docs/README.md); this file describes what a reader of the
pages sees.

**Opt-in.** Nothing fingerprints it and `--init` never seeds it: a repo carries this
because someone declared it. Adopting it wires the GitHub Pages deploy.

## Adopting it

```jsonc
// .claudinite/settings.json — or the same declaration in YAML or TOML
{ "packs": ["claudinite-single-repo-dashboard"] }
```

That is the whole of it for a member: the dashboard covers this repo and publishes to
Pages. It also needs sign-in turned on before anyone can read it — the checklist is
["Turning sign-in on"](#turning-sign-in-on) below. The
[publish-pages task](tasks/publish-pages/README.md) builds the site whenever the
page's sources move and fires
[the deploy workflow](stubs/workflows/claudinite-single-repo-dashboard-pages.yml) adoption seeds
into `.github/workflows/` — four `uses:` steps and nothing else — and **you must enable
Pages with source *GitHub Actions***, a repository setting no Action can flip; until
then that task parks naming it, and nothing else is affected.

Everything else is optional `config` on the declaration:

| Key | Default | What it buys |
|---|---|---|
| `clientId`, `exchangeUrl` | — | **Legacy.** Both together turn on **Sign in with GitHub**, but they live as the repository variables `CLAUDINITE_DASHBOARD_CLIENT_ID` and `CLAUDINITE_DASHBOARD_EXCHANGE_URL` now; a declaration still carrying them is read as the fallback and the build says so |
| `redirectUri` | the page's URL | Override when the callback differs |
| `defaultRepo` | this repo | Which repo the page shows when the URL names none (`?repo=owner/name` names one) |
| `rates` | — | USD per **million** tokens, per model, per counter: `{ "claude-opus-5": { "in": 15, "cacheRead": 1.5, "out": 75 } }`. `cacheWrite` is optional and falls back to `in`. Unset is a supported deployment, not a broken one — every dollar figure then reads *unpriced* and names this key, and the token counts stand; a model the table does not name is an unpriced remainder, counted in tokens and never folded into the sum |

`owner`, `exclude`, `repos`, `rosterFile`, `rosterUrl` and `canonRepo` are **refused**,
and so is any `mode` but `"repo"`: a build whose declaration carries one fails naming
it and publishes nothing, since this page shows one repository and builds no fleet
overview.

The build reads the declaration out of `.claudinite/cache/member.GENERATED.json`, which
the member's own `cn` writes from its settings in whichever format they are kept. A
repo where that file is missing or does not read is refused, naming the file and
`cn tasks flat --write`, the command that writes it.

## How the code is laid out

```
src/index.html        the page; its one module script names ./src/app.mjs
src/app.mjs           the shell — configure, authenticate, route to the repo view
src/derive/           pure: facts in, rows and figures out. No DOM, no fetch, no clock
                      it was not handed, so all of it is testable in plain Node
src/read/             the I/O plane — the credential, the one GitHub client, its cache,
                      the rate-limit policy, the per-file readers
src/render/           the shared visual vocabulary and the drawing primitives
src/views/            the page, which fetches through read/, derive through derive/
                      and draws through render/
tooling/              node-only: the dev server, the site build, the deployment-settings
                      reader, and the serverless sign-in source. Never published
favicon.svg           served beside the page, at the pack root
```

### The page is stored under `src/` and served from the pack root

Everything the browser loads lives under `src/`, the page included — but the dashboard's
URL stays `…/packs/claudinite-single-repo-dashboard/`, one directory above it.

That is worth knowing before editing `src/index.html`, because an HTML `src=` resolves
against the **document's URL**, never the file's path on disk. The page's script tag
therefore reads `./src/app.mjs` and its icon `./favicon.svg` — both written from the URL
it is served at, both wrong relative to the directory it is stored in. Opening the file
directly, or pointing a static server at `src/`, breaks every module it loads.

Two places put it back where it belongs, and nothing else should serve it:
[`tooling/serve.mjs`](tooling/serve.mjs) resolves a directory request to the page under
`src/`, and [`tooling/build-site.mjs`](tooling/build-site.mjs) *moves* it up to the
served root while staging — a move rather than a copy, so no second, broken entry is
left behind at `src/index.html`. A staged tree that skipped either step is caught by
`the staged tree is the pack alone, with the root a redirect`.

The layering runs one way: a view may reach any layer below it, and anything shared
moves *down* rather than sideways. The one edge that crosses back is
`read/contributions.mjs` reaching `render/ui.mjs` for `duration`, which its own header
explains — the layout leaves that visible rather than hiding it.

Depth stops at one level under `src/`: sibling layer folders sit at folder distance two
of each other, and a second level would turn every cross-folder import into a reach.

Everything the browser loads is under `src/`, which is how the site build decides what to
publish — a directory the tree already names, rather than a list of filenames to keep in
step ([`tooling/build-site.mjs`](tooling/build-site.mjs)).

## Running it locally

```sh
node packs/claudinite-single-repo-dashboard/tooling/serve.mjs missingbulb/Claudinite
```

## Two kinds of data, read two different ways

Everything on the page is one of two things, and the difference is the whole reason
the page can afford what it shows.

**What is true right now** is a live read, and there are few of them: the repo, its
head commit, one page of issues, one page of Actions runs. All are ETag-revalidated,
and a `304` costs no rate-limit budget at all.

**What happened before** is one file: the repo's own
`.claudinite/usage/sessions-and-elements.json`, folded hourly by the
[usage-fold task](../claudinite-tasks/tasks/usage-fold/README.md) in the
claudinite-growth pack. It is content at a sha, so it is read once when the default
branch moves and **not at all** while it has not. Reaching a month back over the API
instead would be a paginated crawl per repo per load, which is exactly the shape this
client is built to avoid.

Measured against a stubbed API, one repo with five declared tasks:

| | Requests | Of those, free |
|---|---|---|
| Cold (empty cache) | 14 | 0 |
| Warm (same head sha) | 5 | **5** — every one a `304`, nothing spent |

So a warm reload of a repo page costs **nothing** against the viewer's budget.

The two freshnesses are reported separately in the footer, because they are not the
same: the live half is as fresh as this load, the past half as fresh as the repo's last
fold. A page that showed one timestamp for both would be claiming the older half is as
current as the newer.

A repo that does not fold the file is a normal state, not a fault: the panels that
wanted it say so, and nothing else on the page is affected.

## What the repo page shows

| Panel | Answers |
|---|---|
| **Start here** | The one piece of work most worth doing in this repo, named with the issue to open and what it costs you — the top row of the same ranking the work table is ordered by |
| **At a glance** | Minutes waiting on a person and what they are made of, items parked, open pull requests and issues, CI on the default branch, runs in flight and stars |
| **Work** | One row per piece of work, in three views — **stuck** (what has stopped, and for how long), **pending** (what is moving, and what happens next), **all** (what each task is and what it has done). The page opens on the worst view that has anything in it |
| **What the queue closed** | Per-day outcomes over a fortnight — today from the live issue page, the days before it from the fold |
| **What ran** | 48 hours of scheduler runs, executor runs and agent sessions per hour; hovering an hour names the tasks that executed in it |
| **What Claudinite is doing here** | 30 days of checks executed against the runs that caught something, on two stated scales — plus tokens spent, lines committed and releases where the fold carries them |
| **What the packs report** | One card per declared pack that contributes — see [below](#what-a-pack-contributes). Last, because it is the only region whose contents differ from repo to repo |

### One table, not two

The roster and the queue used to be separate tables, and they were the same rows
twice: a task's row could not say what its item was doing without repeating the item
table, and an item's row could not say what it was *for* without repeating the roster.
Worse, the reader had to join them by eye to answer the question they opened the page
with — is anything stuck.

So there is one row per piece of work and the **view decides which rows and which
columns**. The three views are three genuinely different questions, which is why they
do not share a column set. Switching between them moves the rows rather than redrawing
them, so the row you were reading stays findable; a reader who has asked their platform
for less motion gets the repaint and none of the movement.

Two rows exist that neither old table could show. A **declared task that has never
run** — usually the thing you opened the page for, and invisible in any list built from
work items. And an **open item whose task this repo no longer declares**: nothing will
ever pick it up, and no recovery rule will say so.

Everything flagged mirrors a rule the engine will actually act on — a blown leash the
next run reclaims, a dependency past the janitor's threshold, a park holding its task's
lane — never a display heuristic.

### Not read is not zero

The rule that runs through every panel here. A day the fold has not reached is drawn
**blank**, not at the floor; a line breaks over a day nothing answered for rather than
dipping through it; a series the file does not carry is **named as absent** instead of
rendering as an empty chart; and a total sums only the days that had an opinion, or
reports nothing at all.

This matters most where a number is a report card. "No session recorded its token
spend" and "the sessions were free" are different facts, and a page that draws them
identically is worse than one that omits the panel.

## What a pack contributes

Every panel above is this pack's own. These are what a member's **other** packs have to
say about it — `git-github` the repo's stars, a release pack its last release, a spec
pack the requirements that moved. The contract in one line: **a pack contributes data,
never code** — the page executes nothing a pack ships, because it renders a repo the
viewer may merely have read access to, and importing its modules would run that repo's
code in the viewer's browser with the viewer's token in scope.

A contributing pack ships one file, `packs/<id>/dashboard.json`, validated by
[the schema beside this one](dashboard-descriptor.schema.json) and found **by that path**
— nothing registers it, so adding a descriptor is the whole change. It declares the
pack's widgets once, and the repo page selects from that list by id:

```jsonc
{
  "widgets": [{ "id": "stars", "kind": "stat", "label": "stars", "noun": "stars",
                "glyph": "★", "source": "repo-stars" }],
  "repo": ["stars"]
}
```

Four kinds — `stat` (a fact true now), `event` (the last time something happened),
`window` (a count, always against the window before it) and `list` (the few most recent
named things). There is deliberately no shape a growing cumulative total fits.

Values come from one of three **sources**. `generated` reads the pack's own
`.claudinite/usage/<pack>-dashboard-values.json`, written by that pack's own task;
`latest-release` and `repo-stars` are platform facts this page already reads for every
repo, so a pack using one ships a descriptor and no code at all.

A pack cannot **colour** its own card — colour on the page is the engine's severity
edge, and a pack that could paint itself red would be claiming attention it did not
earn — and contributions never feed the work ranking or the at-a-glance tiles.

Costs are the same shape as everything else here: discovery is free (the declaration
and the tree listing are already in hand), the descriptor and values are content at a
sha and therefore free on a warm load, and `latest-release` is the one live request,
withheld before anything the queue depends on.

## Who it runs as

**The viewer, and only the viewer.** There is no backend, no shared credential and
no service account: the page calls `api.github.com` from the browser as whoever is
using it, so it can show nobody anything their own GitHub account cannot already
read.

**The page is gated on a credential**, on a screen of its own that is all a viewer sees
until they have one. There is no anonymous view to fall back to: every request is made
as the viewer, so without a credential there is nothing to show and — at 60 requests an
hour per IP — no budget worth showing it with. A `?repo=owner/name` deep link survives
the gate; signing in lands on the view it named.

One way to get one: **Sign in with GitHub** — a button, no typing, which needs the
deployment to have configured `clientId` and `exchangeUrl`. There is no second route.
A deployment that has not configured them cannot sign anybody in, and the gate says so,
naming the two variables its owner sets: it is not finished being set up.

**Locally**, `tooling/serve.mjs` takes the developer's own token out of the environment
(`DASHBOARD_DEV_TOKEN`, else `GITHUB_TOKEN`/`GH_TOKEN`) and hands it to the page in the
config it synthesizes — a checkout has no registered app behind it and no business
registering one. The page keeps it for the tab only, and nothing published can carry
one: the site build writes a fixed list of config keys and `devToken` is not among them.

The credential dies with the tab unless the viewer ticks **Remember me**, which keeps it
in this browser (`localStorage`) until they sign out. Signing out drops the cached data
with it; clearing the cache does not sign you out.

Everything that belongs to the viewer rather than to the view — who they are, the rate
budget, **Reload**, **Clear cache**, **Sign out** and the note on how this page reads a
repo — sits behind the avatar in the topbar, so the page itself carries no account
chrome at all.

### What each credential is worth

The reason sign-in is not a nicety. GitHub's limits, per hour:

| Credential | Limit |
|---|---|
| unauthenticated | **60**, per IP address |
| a user token — PAT, OAuth, or a GitHub App user token | **5,000**, shared across every app acting for that user |
| a GitHub App *installation* token | 5,000 minimum, up to 12,500 by size |
| an Actions `GITHUB_TOKEN` | 1,000, per repository |

A cold repo page costs 14 requests — so the anonymous 60 is four loads an hour, and
5,000/hour is not an optimisation over it, it is 83×. There is
no higher tier available to a page that runs as its viewer: an installation token
would raise the ceiling, but only by putting a shared credential behind a backend,
which would show every viewer everything that app can see. That is a different
product, not a bigger limit.

### Who has to register the app — one owner

Sign-in belongs to **whoever owns the deployment**, and it is not inheritable. An
owner's second, fifth and tenth dashboard reuse one registration: a GitHub App holds
up to ten redirect URIs, and with wildcard matching a single `https://<user>.github.io/`
covers every project Pages site on that host, so a new deployment only copies the two
config keys.

A **different** owner cannot reuse it, and the reason is not policy but mechanism:

- a private App "can only be installed on the account that owns the app. Only members
  of the organization that owns it can authorize it" — a stranger cannot even sign in;
- making it public lets anyone authorize it, but a user access token "can only access
  resources that both the user and app can access", so until they install that App on
  their own account every repo still reads *not visible to you*;
- and if they did install it, their redirect URI would have to live in someone else's
  App and their tokens would be minted by someone else's endpoint. That is a trust
  relationship, not a configuration.

So an adopter with no app of their own registers one — the checklist below — and a
dashboard is not readable until they have. That is the cost of the alternative being a
paste box: a deployment can be up, deployed and serving a page that nobody but its
owner can be asked to use.

#### Turning sign-in on

Copy this into the deployment's own issue, substituting its owner and repo — it is the
checklist the adoption handover points at. Notes are below it, deliberately: a reader
working through these has the settings page open in the next tab.

- [ ] Register a GitHub App — `https://github.com/settings/apps/new`
- [ ] Set its **Homepage URL** and **Redirect URI** to `https://<owner>.github.io/`, and tick **Enable wildcard matching** beneath the redirect URI
- [ ] Tick *Request user authorization (OAuth) during installation*
- [ ] Untick **Webhook → Active**
- [ ] Under **Permissions → Repository**, set Contents, Issues, Metadata and Actions to **Read-only**, then press **Create GitHub App**
- [ ] Copy the **Client ID** — the App's General page, under the app name; begins `Iv23`
- [ ] Add it as the variable `CLAUDINITE_DASHBOARD_CLIENT_ID` — `<repo>/settings/variables/actions/new`
- [ ] Press **Generate a new client secret**, and copy the value under **Client secrets** — shown once
- [ ] Add it as the Actions secret `DASHBOARD_OAUTH_CLIENT_SECRET` — `<repo>/settings/secrets/actions/new`
- [ ] Install the App on the account holding the repos — `https://github.com/settings/apps/<app-slug>/installations`
- [ ] Copy your Cloudflare **Account ID** — `https://dash.cloudflare.com/?to=/:account/workers`, the right-hand sidebar under *Account details*; 32 hex characters
- [ ] Add it as the variable `CLOUDFLARE_ACCOUNT_ID` — `<repo>/settings/variables/actions/new`
- [ ] Create a Cloudflare API token — `https://dash.cloudflare.com/profile/api-tokens` — template **Edit Cloudflare Workers**, name `claudinite-single-repo-dashboard-deploy`, **Account Resources** *Include* the hosting account, **Zone Resources** *Include · All zones*
- [ ] Copy the token — shown once, on the confirmation screen
- [ ] Add it as the Actions secret `CLOUDFLARE_API_TOKEN` — `<repo>/settings/secrets/actions/new`
- [ ] Run `cn work create claudinite-single-repo-dashboard/deploy-oauth-exchange`, and copy the `workers.dev` URL it reports
- [ ] Add it as the variable `CLAUDINITE_DASHBOARD_EXCHANGE_URL` — `<repo>/settings/variables/actions/new`

**Done when** a signed-in viewer's rate pill reads `…/5000 · user`.

Notes. **Webhook → Active** arrives ticked and the form then refuses to submit without a
Webhook URL; this App is a sign-in credential and receives nothing, so unticking it is
what lets the registration through. The token's **Zone Resources** are asked for because
the template carries a zone-scoped permission, and *All zones* is the answer that always
works: this deploy never exercises them, calling only `/accounts/<id>/workers/…`.
Installing the App lands you on the redirect URI,
and `https://<owner>.github.io/` is a **404** unless that owner happens to keep a
user-site repo — expected, and not a failed step: the root is registered so that wildcard
matching permits the project pages beneath it, and sign-in returns to the dashboard's own
URL rather than to the root. The two Cloudflare credentials are the
[deploy task](tasks/deploy-oauth-exchange/README.md)'s, which says why the API token is
that narrow. The App is installed per *account*, not per repo — a user token reaches only what
it is installed on, so a repo under an uninstalled account renders as *not visible to
you*. Wildcard matching on the `github.io` root covers every project Pages site on that
host, so one App serves every dashboard you own. The sign-in pair are repository
variables rather than config or secrets: they are what you set while standing in the
App's settings, the exchange URL is minted by the deploy rather than authored, and
neither is confidential — the client id is in every authorize URL and the exchange URL is
fetched by the browser. The client id alone does nothing; the pair is what makes the
button appear.

### Why "just use my existing GitHub login" is not on that list

It cannot be. A browser will not send github.com's session cookies to
`api.github.com`, and the API does not accept cookie auth cross-origin at all —
"already logged in to GitHub" is not a credential a web page can spend. Every
GitHub-backed dashboard you have used either asked for a token or ran an OAuth
sign-in; there is no third option.

Sign-in is the closest thing, and it is genuinely *your* permissions: after one
authorization, every call runs as you. The only piece that cannot live in the page
is the `code` → token exchange, which needs the app's client secret **and** hits an
endpoint that sends no CORS headers. That is what `exchangeUrl` points at —
[`oauth-exchange.mjs`](tooling/oauth-exchange.mjs) is a deployable
implementation. It sees one code, returns one token, and never touches repo data.

## Caching

A reload is only free because most of what the page reads does not change.
Three strategies, because the data has three shapes — see
[`cache.mjs`](src/read/cache.mjs):

| Data | Strategy | Why |
|---|---|---|
| Repo content (task declarations, the tree) | keyed by **commit SHA**, never expires | a path at a sha cannot change, so an unmoved `main` costs zero calls |
| Open items, runs, repo metadata | **ETag** revalidation | a `304` is free — it does not count against the rate limit, so this is fresh data at no cost |
| Closed-issue history pages | **24h TTL** | settled, but not addressable by a sha |
| Merged pull requests, 14 days | kept in the projection above | the lead-time series for the days the fold has not reached — they arrive in the issues listing the page already fetches, so the viewer makes no new request, and the body is still dropped once the issue it closes has been read out of it |

A fourth thing decides how hard those three are leaned on: **the budget policy**
([`budget.mjs`](src/read/budget.mjs)), planned before a load starts and re-planned on every
one. It exists because caching alone still *asks* — an ETag revalidation costs no
primary budget but is still a request, and a cold entry has nothing to revalidate.

| Budget, measured in whole page loads | Mode | What changes |
|---|---|---|
| 20 loads or more | `live` | everything revalidated — today's behaviour |
| 6–20 | `tight` | anything read in the last 5m is served with no request |
| 1–6 | `low` | …in the last 30m |
| under 1 | `scarce` | …until the rate limit resets, and the spend stops short of the viewer's last requests |
| spent | `frozen` | no requests at all; the page serves what it has and says so |

The rung that matters is `scarce`: the staleness floor reaches the **reset**, so a
full page refresh costs nothing until the window rolls. Three supporting pieces make
that hold up — the free `GET /rate_limit` preflight and a budget carried across page
loads (so a fresh tab plans before it spends rather than learning the limit by hitting
it), and a latch on a `403`/`429` with nothing left (so the rest of the load does not
spend a request per read discovering the same thing; requests *made* are what the secondary
limit counts). A withheld read is its own state everywhere it surfaces — a row that
says the page declined to spend, never one that says the repo is broken.

Measured on this repo, cold versus warm: **21 requests → 4**, and the warm load
spends **zero** rate limit (its four requests are all 304s). The open queue is still
never stale — only settled history ages.

Stored payloads are compact projections, not API responses: a closed item's body is
dropped and an open one's truncated past its scheduling fields, because
`localStorage` gives about 5MB and a busy repo's raw issue JSON is far more. A full
quota degrades to "uncached", never to an error. **Clear cache** forces a cold read.

## How publishing works

[`build-site.mjs`](tooling/build-site.mjs) stages the pack's own `src/` and its icon into
`_site/`, then writes the `dashboard.config.json` the page reads — derived from the
declaration's `config` as the member file states it, so there is no second place to
configure the same thing. The page imports nothing outside this pack, so nothing else
is staged: no engine and no sibling pack.

The [publish-pages task](tasks/publish-pages/README.md) runs the build, pushes the tree
to `gh-pages` and fires the seeded workflow, which holds only the four Pages actions
that need a workflow job. `.github/workflows/` is the one directory an update cannot
push to, so the workflow is frozen at adoption and nothing in it can need to change.

- **The staged tree keeps the pack's place**, publishing at
  `/packs/claudinite-single-repo-dashboard/` with the root as a redirect, so a deployment's URL is
  the same whichever build produced it.
- **The build refuses rather than guessing**: a declaration carrying a fleet key or a
  `mode` other than `"repo"` fails it, and nothing is published.

The build is inert in one case alone, the pack present without its page: it exits clean
with no `_site`, and the task publishes nothing rather than replacing a working site
with an empty one.

`serve.mjs` is for local use only: it binds loopback, serves the pack read-only, and
never talks to GitHub.

## Why it carries its own copy of the queue's vocabulary

The queue's vocabulary — labels, the title grammar, the leash constants, the body
fields — is the engine's, which a browser cannot import. The page reads it from its own
[`queue-vocabulary.mjs`](src/read/queue-vocabulary.mjs), and everything it computes over
that vocabulary — the anchor arithmetic, dormancy, the
declaration text reader, the closing-issue parse — is likewise its own copy under `src/`,
because packs share no code. Each copy is held to the engine by a drift-guard test that
runs both over the same inputs through `cn tasks`.

ES module imports are CORS-checked, which is the one consequence: the page needs an
`http(s)://` origin and will not run from `file://`. Any static server satisfies it.

The tests pin both halves: that the modules the page loads stay free of `node:` imports (a
**browser-only** breakage the Node suite would otherwise never catch), and that this
tool hardcodes no queue label outside its vocabulary copy.

## Limits it reports rather than hides

- **Issue history is a window** — the most recent few hundred issues, not all of
  them. Outside it, a task's history reads as "none in window", never "never run".
  The footer states which.
- **Declaration fields are lifted as text**, because there is nothing to `import`
  when reading another repo over the API. A field it cannot read renders *unknown*
  and is never defaulted — a confident wrong cadence would move a next-anchor the
  work table is read for.
- **The past-data half is only as fresh as the repo's last fold**, which the footer
  states separately from this load's own time. A repo that folds nothing has no past
  half at all, and the panels that wanted it say which task writes the file.
- **Which tasks a given hour *evaluated* is not shown**, only what executed. Nothing in
  a run listing names a task, and reading each run's job log to find out would be two
  API calls per run — the cost the fold itself dropped for the same reason. Why a task
  declined its last ask is on its own row instead, from the verdict the item carries.

## Checks

One check, `descriptor-usable`, built into the engine and active wherever this pack is
declared. It holds another pack's `dashboard.json` to what this page's own reader
accepts — not a second copy of the schema, which ordinary tooling already validates,
but the thing a schema cannot check: that the file is usable, and that the ids its
views select by resolve. The failure is otherwise silent, since a rejected descriptor
renders as one apologetic line in a viewer's browser and nothing goes red where its
author is looking. `cn dashboard descriptor FILE…` prints the same verdicts by hand.

| Check | Severity | Reason | Enforcement |
|---|---|---|---|
| `descriptor-usable` | medium | correctness | check: blocking |
