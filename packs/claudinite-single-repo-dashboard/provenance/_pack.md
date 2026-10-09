## 2026-08-17 · born · claudinite-dashboard: an opt-in pack for a fleet + per-repo scheduler dashboard (#935)
- **Source:** #934; it supersedes and closes an earlier attempt in the Sheepdog repository.
- **Reason:** nothing converges, runs the scheduler or executes because the dashboard exists, and a
  member that never looks at it should not carry it. Engine code is what every member runs; this is
  content a member opts into, and adoptable content in this corpus is a pack - which also buys it a
  version and migration lane, a declaration that gates it, and an adoption moment at which the
  deploy can be wired. It states none of the queue's vocabulary itself, importing the labels, the
  title grammar, the leash thresholds and the anchor arithmetic from the modules that define them,
  so there is no second copy to drift from the mechanism being rendered - and those relative paths
  resolve identically in the canon and in a member's mount, so the pack reads straight out of the
  mount with nothing rewritten.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Mechanism:** the pack manifest, with no fingerprint and no prose - nothing in a repo's shape
  implies wanting a dashboard, and a page is not a practice, so prose here would bill every session
  in every declaring repo for something no session acts on. `.github/workflows/` is the one
  directory the nightly update can never push to, so the deploy workflow arrives by `seedOps` at
  adoption while the build script stays in the pack and keeps converging.
- **Landed:** #935 (Closes #934) · pack version 1.

## 2026-08-19 · reworded · Move fleet-digest to the pack that owns its reader (#1053)
- **Reason:** the task writing the digest series lived in the sheepdog pack, which enumerates the
  fleet, while the only thing that surfaced the series was this page - so producer and reader became
  one adoption. Moved plain, with no config gate, so declaring the pack brought a daily task needing
  a fleet token; without it the work item parks asking for one. The two cross-repo helpers it
  imported were duplicated in trimmed form rather than imported, since two independently-adopted
  packs must not depend on each other.
- **Actor:** @missingbulb (owner).
- **Landed:** #1053.

## 2026-08-30 · reworded · Retire the fleet-digest task and the digests panel (#1397)
- **Reason:** the fleet morning brief was no longer wanted, and the task was gated on no config, so
  as long as it shipped in the pack it wrote the series back every morning. The producer goes, and
  with it the only thing that read its output - keeping the panel would leave a config key promising
  a file nothing writes.
- **Actor:** @missingbulb (owner).
- **Landed:** #1397 (Refs #1392) · pack version 60830.1.

## 2026-09-14 · reworded · Dashboard: move the page's modules under src/, split by layer (#2007)
- **Reason:** the pack kept 33 modules flat at its root beside the page, the schema and the
  manifest: the import graph carried the whole structure - what the browser loads, what is
  node-only, what is pure derivation, what draws DOM - and the folder tree carried none of it. Depth
  stops at one level under `src/`, and everything the browser loads now sits under one directory, so
  the site build decides what to publish by naming `tooling/` rather than by a list of filenames to
  keep in step.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Landed:** #2007 (Refs #2005) · pack version 60913.5.

## 2026-09-25 · scope-changed · `minEngineVersion` rises to 60925.1
- **Reason:** this pack's checks declare `on_fail`, which an older engine does not read; the pack
  update holds this version until the member's engine is at 60925.1.
- **Actor:** @missingbulb (owner).
- **Mechanism:** the manifest's `minEngineVersion`, which the pack update enforces.

## 2026-09-27 · born · a pitch paragraph for the dashboard's plain-repo view
- **Reason:** the dashboard shows a repo that does not run Claudinite the packs that fit it, and the
  owner asked for one paragraph per pack naming its main skills and process gains, with rough counts
  so it outlives the pack's growth.
- **Actor:** @missingbulb (owner).
- **Mechanism:** the manifest's `pitch` field, beside `ruleRoutingGuidance`.

## 2026-09-28 · reworded · the manifest's comments leave it, their decisions recorded here
- **Reason:** a manifest that is data carries no comments. What they decided: never fingerprinted:
  nothing in a repo's shape implies wanting a dashboard, and a scan keyed on the scheduler would
  suspect it in every member. It requires claudinite-tasks because the page reads the queue's
  vocabulary out of that pack's public/, the one sanctioned cross-pack import. Mode is the one
  question, since both answers are ordinary and a wrong guess publishes a plausible site covering
  the wrong thing. Enabling Pages is a handover because configure-pages' enablement needs a PAT with
  repo or an app with administration:write, far wider than one click; sign-in is one handover step
  rather than a dozen, the mechanics living in the README.
- **Actor:** @missingbulb (owner), asking for pack.json manifests, their comments deleted or moved
  to a README or provenance.

## 2026-09-28 · moved · the manifest becomes pack.json
- **Reason:** a manifest that is data is read with no import and by any tool; the conversion wrote
  the module's evaluated export, and the pack loads identically.
- **Actor:** @missingbulb (owner), asking for pack.json manifests.
- **Mechanism:** pack.json, which the loader prefers over pack.mjs; a canon pack now needs engine
  60928.1, the first to read it.

## 2026-10-02 · ported · the page and publish-pages stop importing the tasks pack
- **Reason:** the page imported the queue's vocabulary from `claudinite-tasks/public/*.mjs`, which left with the Node runner, and publish-pages pushed and dispatched through the runner's GitHub client.
- **Actor:** build lead, completing ClaudinitePacks #20 so the runner's removal lands with every importer ported.
- **Mechanism:** the vocabulary is the pack's own `src/read/queue-vocabulary.mjs`, drift-guarded against `cn tasks grammar`; publish-pages pushes through the SDK's `git` and dispatches through `github.dispatchWorkflow` (granted in pack.json), its run and Pages reads a pack-local REST copy; the build no longer copies the tasks pack into the site. dashboard 61002.1.

## 2026-10-02 · scope-changed · `minEngineVersion` moves to `61001.1.0`
- **Reason:** `60928.1` is a Node engine version, which `cn` reads only as the legacy two-part form any engine satisfies (ClaudiniteEngine#18); a new version must name the `cn` release it needs, and release-packs refused claudinite-dashboard 61002.1 for carrying it. `61001.1.0` is the engine floor, below which no `cn` is released, so it holds back no engine the old value admitted.
- **Actor:** build lead, repairing release-packs on main after ClaudinitePacks #20.
- **Mechanism:** the manifest's `minEngineVersion`, which the pack update enforces; `release.mjs plan` now refuses a two-part value on a version to publish before the merge. claudinite-dashboard 61002.1.

## 2026-10-03 · ported · the page reads `cn` members and the fleet-roster, and imports nothing outside the pack
- **Reason:** the page priced each member against a canon in the browser and read the Node settings file, neither of which a `cn` member has; the build staged the engine beside the page, so on a `cn` member, with no engine in any mount, it exited clean having published nothing while publish-pages reported success.
- **Actor:** build lead, through ClaudiniteEngine chunk 16b (#65).
- **Model:** Claude Opus 5.5, per the commit trailer.
- **Mechanism:** `read/member.mjs` reads `.claudinite/flat/member.GENERATED.json` (a Node member's settings file where there is none, with the frozen stamp's rules spelled in the page); `read/roster.mjs` reads the deployment's `.claudinite/fleet/roster.GENERATED.json` and `freshnessOf` maps each verdict, *unknown* naming its absence; the repo page's Drift tile goes; `repos`, `rosterFile`, `rosterUrl` and `canonRepo` are refused by `resolveMode` (design record row 111); a new `deploymentRepo` key, written from `GITHUB_REPOSITORY`, says where the roster and the deployment cards are read now that `canonRepo` is gone. Also absorbed from the website fork: `?repo=` survives the sign-in round trip, the hourly chart's peak reads per hour, and a wide table scrolls inside its card. Every test import of the engine or a sibling pack's module is a `cn` command under `needsCn` or gone. dashboard 61003.1.
- **Rejected:** pricing freshness in the browser against npm packuments and the CDN's signed indexes, for every member on every load; reading a `cn` member's settings file when its member file is absent, since two of its three formats have no parser in the page.

## 2026-10-04 · scope-changed · the version takes the <major>.<day>.<n> form
- **Reason:** pack versions follow the Engine's `<major>.<day>.<n>` scheme; an index sorts every
  earlier version below one in that form, so this one outranks what the pack store already holds.
- **Actor:** @missingbulb (owner), asking that pack versions follow the same scheme.
- **Model:** Claude Opus 5.5
- **Mechanism:** the manifest's `version`, which the release now requires in this form for a new
  version. claudinite-dashboard 1.61004.1.

## 2026-10-07 · moved · claudinite-dashboard is renamed claudinite-single-repo-dashboard
- **Reason:** owner decision, 2026-10-07: the dashboard code leaves the engine for a pack named
  claudinite-single-repo-dashboard, and fleet work leaves Claudinite for Shepherd's own code, so the
  pack's id names the one repo it shows.
- **Actor:** @missingbulb (owner).
- **Mechanism:** `git mv` of the pack, its version history kept; the seeded workflow is
  `claudinite-single-repo-dashboard-pages.yml` and the site publishes under
  `packs/claudinite-single-repo-dashboard/`. The browser storage keys keep the old id, since they
  name what viewers already hold.

## 2026-10-07 · scope-changed · the pack shows one repo; fleet mode is gone
- **Reason:** owner decision, 2026-10-07: a single-repo dashboard. The fleet view, its roster and
  sweep, the `mode` question and the fleet half of the descriptor go with it.
- **Actor:** @missingbulb (owner).
- **Mechanism:** the build refuses a fleet key or a `mode` other than `"repo"` by name and publishes
  nothing, so a fleet deployment fails loudly rather than rendering one repo.
- **Rejected:** keeping `mode` as a required one-value question - it asks nothing.

## 2026-10-09 · scope-changed · requires no claudinite-tasks
- **Reason:** the task queue is the engine's on every member (ClaudiniteEngine#146), so the pack it
  once needed is retiring.
- **Actor:** @missingbulb (owner), folding claudinite-tasks into the engine.
- **Model:** Claude Opus 5.5
- **Mechanism:** the manifest's `requires`. claudinite-single-repo-dashboard 1.61009.1.
