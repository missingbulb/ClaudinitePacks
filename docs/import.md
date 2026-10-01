# Importing packs from Claudinite

`packs/` here is Claudinite's `packs/` with its full history, produced by `tools/import/import.sh`
and proven complete by `tools/import/verify.mjs`.

## Status

Not frozen; rerun with `tools/import/import.sh` when Claudinite's packs/ moves.

Until Claudinite's packs/ is frozen (ClaudiniteEngine#3), nothing here edits `packs/`: it changes
only by a rerun of the import. CI's `packs-untouched-before-freeze` job enforces that.

## Rerunning

```
pip install git-filter-repo==2.47.0
SRC=$(mktemp -d)
git clone --no-local https://github.com/missingbulb/Claudinite "$SRC/src"
git -C "$SRC/src" fetch --depth=6000 origin main
COMMIT=$(git -C "$SRC/src" rev-parse origin/main)
tools/import/import.sh "$COMMIT" "$SRC" --push
git fetch "$SRC/out" +import:import
git merge --no-ff import -m "Merge the Claudinite packs/ import at missingbulb/Claudinite@$COMMIT"
node tools/import/verify.mjs --source "$SRC/src" --commit "$COMMIT" --import . --ref HEAD --landed --write-doc docs/import.md
```

Commit the rewritten `docs/import.md` and push `main`. The first landing merged with
`--allow-unrelated-histories`; every rerun is a plain merge, because a later source commit only
appends to the import history (the earlier tip is an ancestor of the later one).

`import.sh` builds `<workdir>/out` from a fresh, non-shallow clone of Claudinite, keeping the
paths in `tools/import/paths.txt`, and prints the tip. It refuses a source clone with local
changes or commits, a shallow one, and a commit not on Claudinite's `origin/main`. The same source
commit always gives the same tip SHA.

## What is kept

`tools/import/paths.txt` is the list. Besides `packs/`, it keeps every place a pack file lived
before it was renamed into `packs/`: the old pack-content directories whole (`packs-tests/`,
`skills/`, `technologies/`, `growth/`, `migrations/`, `always/`, `general/`, `tasks/`,
`templates/`), and single files from directories that otherwise hold engine or repository
content (root-level docs, `checks/test/`, `updates/`, `.github/`). None of them exists at the
source head, so the tip holds only `packs/`.

Engine-side directories that also renamed files into `packs/` (`engine-tests/`, `engine/`,
`docs/`, `.claudinite/`, `routines/`) are not kept: they would import most of the engine's history
for a handful of files. The verifier lists each file that loses history to them below.

## What the verification proves

Against the source clone at the source commit, `verify.mjs` checks that:

- every `packs/<id>/` exists in the import and no other does;
- every file under `packs/` is byte-identical (SHA-256) with the same mode;
- every non-merge commit that touched a kept path is in the import, with the same author,
  committer, dates and message; every merge in the import is one of the source's;
- `git rev-list --full-history --no-merges -- packs/<id>` has the same length for every pack;
- every file's first commit under `git log --follow` has the same date, or its earlier history
  sits under a deliberately dropped path, in which case it is listed below.

It exits 1 on any gap. `--landed` verifies a branch that merged the import beside its own files.

<!-- BEGIN GENERATED: verify -->
Source commit: `219161dbb5c6072a0abb67dd2ed7235e395e270e`

Verified at that commit: 38 packs, 1929 files byte-identical, 861 non-merge commits touching a kept path all carried.

### History deliberately not carried

97 files arrived in a kept path by a rename from a dropped ancestor; `git log --follow` on them here starts at that rename. Their earlier history is in Claudinite.

#### `engine-tests/` (31 files)

- `packs/claudinite-tasks/test/adopt/hash-minute.test.mjs`, from `engine-tests/scheduler/hash-minute.test.mjs` (first added 2026-07-23)
- `packs/claudinite-tasks/test/contract/contract.test.mjs`, from `engine-tests/scheduler/contract.test.mjs` (first added 2026-07-22)
- `packs/claudinite-tasks/test/contract/discover.test.mjs`, from `engine-tests/scheduler/discover.test.mjs` (first added 2026-07-22)
- `packs/claudinite-tasks/test/contract/manual-task-preconditions.test.mjs`, from `engine-tests/manual-task-preconditions.test.mjs` (first added 2026-08-17)
- `packs/claudinite-tasks/test/deliver/deliver-generated.test.mjs`, from `engine-tests/scheduler/deliver-generated.test.mjs` (first added 2026-07-28)
- `packs/claudinite-tasks/test/deliver/land-pr.test.mjs`, from `engine-tests/scheduler/land-pr.test.mjs` (first added 2026-08-07)
- `packs/claudinite-tasks/test/engine-pack-lane-shims.test.mjs`, from `engine-tests/scheduler/engine-pack-lane-shims.test.mjs` (first added 2026-08-18)
- `packs/claudinite-tasks/test/execute/code-work-run.test.mjs`, from `engine-tests/scheduler/queue/prework-run.test.mjs` (first added 2026-08-18)
- `packs/claudinite-tasks/test/execute/code-work.test.mjs`, from `engine-tests/scheduler/preprocess.test.mjs` (first added 2026-07-23)
- `packs/claudinite-tasks/test/execute/executor-rules.test.mjs`, from `engine-tests/scheduler/queue/executor-rules.test.mjs` (first added 2026-08-15)
- `packs/claudinite-tasks/test/execute/loop.test.mjs`, from `engine-tests/scheduler/queue/executor-loop.test.mjs` (first added 2026-08-15)
- `packs/claudinite-tasks/test/items/heartbeat.test.mjs`, from `engine-tests/scheduler/queue/heartbeat.test.mjs` (first added 2026-08-20)
- `packs/claudinite-tasks/test/items/run-record.test.mjs`, from `engine-tests/scheduler/run-record.test.mjs` (first added 2026-07-29)
- `packs/claudinite-tasks/test/items/tracker.test.mjs`, from `engine-tests/scheduler/tracker.test.mjs` (first added 2026-08-18)
- `packs/claudinite-tasks/test/items/vocabulary.test.mjs`, from `engine-tests/scheduler/queue/vocabulary.test.mjs` (first added 2026-08-21)
- `packs/claudinite-tasks/test/items/work-item.test.mjs`, from `engine-tests/scheduler/queue/work-item.test.mjs` (first added 2026-08-15)
- `packs/claudinite-tasks/test/schedule/drain-gate.test.mjs`, from `engine-tests/scheduler/queue/drain-gate.test.mjs` (first added 2026-08-22)
- `packs/claudinite-tasks/test/schedule/repair-rules.test.mjs`, from `engine-tests/scheduler/queue/janitor-rules.test.mjs` (first added 2026-08-15)
- `packs/claudinite-tasks/test/schedule/request-mode.test.mjs`, from `engine-tests/scheduler/queue/request-mode.test.mjs` (first added 2026-08-19)
- `packs/claudinite-tasks/test/schedule/run.test.mjs`, from `engine-tests/scheduler/queue/tick.test.mjs` (first added 2026-08-15)
- `packs/claudinite-tasks/test/schedule/workflow-runbook.test.mjs`, from `engine-tests/scheduler/queue/workflow-runbook.test.mjs` (first added 2026-08-23)
- `packs/claudinite-tasks/test/session/converge-item.test.mjs`, from `engine-tests/scheduler/queue/converge-item.test.mjs` (first added 2026-08-20)
- `packs/claudinite-tasks/test/session/dispatch.test.mjs`, from `engine-tests/scheduler/dispatch.test.mjs` (first added 2026-07-22)
- `packs/claudinite-tasks/test/session/narrow-diff.test.mjs`, from `engine-tests/scheduler/queue/narrow-diff.test.mjs` (first added 2026-08-20)
- `packs/claudinite-tasks/test/session/resolve-dispatch.test.mjs`, from `engine-tests/scheduler/resolve-dispatch.test.mjs` (first added 2026-07-26)
- `packs/claudinite-tasks/test/signals/fleet.test.mjs`, from `engine-tests/scheduler/fleet.test.mjs` (first added 2026-07-24)
- `packs/claudinite-tasks/test/signals/signal-context.test.mjs`, from `engine-tests/scheduler/signal-context.test.mjs` (first added 2026-07-27)
- `packs/claudinite-tasks/test/signals/signals.test.mjs`, from `engine-tests/scheduler/signals.test.mjs` (first added 2026-07-22)
- `packs/claudinite-tasks/test/world/hold.test.mjs`, from `engine-tests/scheduler/queue/suspend.test.mjs` (first added 2026-08-20)
- `packs/claudinite-tasks/test/world/secrets-bag.test.mjs`, from `engine-tests/scheduler/queue/secrets-bag.test.mjs` (first added 2026-08-24)
- `packs/claudinite-tasks/test/world/sessions.test.mjs`, from `engine-tests/scheduler/queue/invoke.test.mjs` (first added 2026-08-15)

#### `engine/` (46 files)

- `packs/claudinite-dashboard/src/derive/task-calendar.mjs`, from `engine/scheduler/calendar.mjs` (first added 2026-08-18)
- `packs/claudinite-tasks/public/implement-request.md`, from `engine/scheduler/queue/tasks/implement-request/task.md` (first added 2026-08-19)
- `packs/claudinite-tasks/public/instructions.md`, from `engine/scheduler/queue/instructions.md` (first added 2026-08-15)
- `packs/claudinite-tasks/public/work-item-grammar.mjs`, from `engine/scheduler/queue/work-item.mjs` (first added 2026-08-15)
- `packs/claudinite-tasks/queue/tasks/implement-request/narrow-diff.mjs`, from `engine/scheduler/queue/tasks/implement-request/narrow-diff.mjs` (first added 2026-08-20)
- `packs/claudinite-tasks/queue/tasks/implement-request/task.md`, from `engine/scheduler/queue/tasks/implement-request/task.md` (first added 2026-08-19)
- `packs/claudinite-tasks/src/adopt/hash-minute.mjs`, from `engine/scheduler/hash-minute.mjs` (first added 2026-07-23)
- `packs/claudinite-tasks/src/contract/built-in-tasks.mjs`, from `engine/scheduler/built-in-tasks.mjs` (first added 2026-08-19)
- `packs/claudinite-tasks/src/contract/calendar.mjs`, from `engine/scheduler/calendar.mjs` (first added 2026-08-18)
- `packs/claudinite-tasks/src/contract/discover.mjs`, from `engine/scheduler/discover.mjs` (first added 2026-07-22)
- `packs/claudinite-tasks/src/contract/model-map.mjs`, from `engine/scheduler/model-map.mjs` (first added 2026-07-22)
- `packs/claudinite-tasks/src/contract/task-contract.mjs`, from `engine/scheduler/task-contract.mjs` (first added 2026-07-22)
- `packs/claudinite-tasks/src/deliver/deliver-pr.md`, from `engine/scheduler/deliver-pr.md` (first added 2026-08-07)
- `packs/claudinite-tasks/src/deliver/land-pr.mjs`, from `engine/scheduler/land-pr.mjs` (first added 2026-08-07)
- `packs/claudinite-tasks/src/execute/code-work-run.mjs`, from `engine/scheduler/queue/prework-run.mjs` (first added 2026-08-15)
- `packs/claudinite-tasks/src/execute/code-work.mjs`, from `engine/scheduler/preprocess.mjs` (first added 2026-07-23)
- `packs/claudinite-tasks/src/execute/loop.mjs`, from `engine/scheduler/queue/executor.mjs` (first added 2026-08-15)
- `packs/claudinite-tasks/src/execute/prework-run.mjs`, from `engine/scheduler/queue/prework-run.mjs` (first added 2026-08-15)
- `packs/claudinite-tasks/src/items/anchors.mjs`, from `engine/scheduler/queue/anchors.mjs` (first added 2026-08-15)
- `packs/claudinite-tasks/src/items/apply-status.mjs`, from `engine/scheduler/queue/apply-status.mjs` (first added 2026-08-21)
- `packs/claudinite-tasks/src/items/heartbeat.mjs`, from `engine/scheduler/queue/heartbeat.mjs` (first added 2026-08-20)
- `packs/claudinite-tasks/src/items/read.mjs`, from `engine/scheduler/queue/read.mjs` (first added 2026-08-15)
- `packs/claudinite-tasks/src/items/run-record.mjs`, from `engine/scheduler/run-record.mjs` (first added 2026-07-29)
- `packs/claudinite-tasks/src/recover/continuation.mjs`, from `engine/scheduler/queue/executor-continuation.mjs` (first added 2026-08-23)
- `packs/claudinite-tasks/src/recover/workflow-failure.mjs`, from `engine/scheduler/queue/workflow-failure.mjs` (first added 2026-08-23)
- `packs/claudinite-tasks/src/schedule/create-work-item.mjs`, from `engine/scheduler/queue/create-work-item.mjs` (first added 2026-08-15)
- `packs/claudinite-tasks/src/schedule/drain-dispatch.mjs`, from `engine/scheduler/queue/drain-dispatch.mjs` (first added 2026-08-23)
- `packs/claudinite-tasks/src/schedule/readiness.mjs`, from `engine/scheduler/queue/readiness.mjs` (first added 2026-08-20)
- `packs/claudinite-tasks/src/schedule/repair-rules.mjs`, from `engine/scheduler/queue/janitor-rules.mjs` (first added 2026-08-15)
- `packs/claudinite-tasks/src/schedule/run.mjs`, from `engine/scheduler/queue/tick.mjs` (first added 2026-08-15)
- `packs/claudinite-tasks/src/session/converge-item.mjs`, from `engine/scheduler/queue/converge-item.mjs` (first added 2026-08-20)
- `packs/claudinite-tasks/src/session/dispatch.mjs`, from `engine/scheduler/dispatch.mjs` (first added 2026-07-22)
- `packs/claudinite-tasks/src/session/record-exec.mjs`, from `engine/scheduler/record-exec.mjs` (first added 2026-08-07)
- `packs/claudinite-tasks/src/session/resolve-dispatch.mjs`, from `engine/scheduler/resolve-dispatch.mjs` (first added 2026-07-26)
- `packs/claudinite-tasks/src/session/validate-dispatch.mjs`, from `engine/scheduler/validate-dispatch.mjs` (first added 2026-07-22)
- `packs/claudinite-tasks/src/session/verify-outcome.mjs`, from `engine/scheduler/verify-outcome.mjs` (first added 2026-07-22)
- `packs/claudinite-tasks/src/signals/context.mjs`, from `engine/scheduler/signals/context.mjs` (first added 2026-08-18)
- `packs/claudinite-tasks/src/signals/fleet.mjs`, from `engine/scheduler/signals/fleet.mjs` (first added 2026-07-24)
- `packs/claudinite-tasks/src/signals/for-task.mjs`, from `engine/scheduler/queue/signals.mjs` (first added 2026-08-15)
- `packs/claudinite-tasks/src/signals/index.mjs`, from `engine/scheduler/signals/index.mjs` (first added 2026-07-22)
- `packs/claudinite-tasks/src/world/git.mjs`, from `engine/scheduler/signals/local.mjs` (first added 2026-07-27)
- `packs/claudinite-tasks/src/world/hold.mjs`, from `engine/scheduler/queue/suspend.mjs` (first added 2026-08-20)
- `packs/claudinite-tasks/src/world/secrets-bag.mjs`, from `engine/scheduler/queue/secrets-bag.mjs` (first added 2026-08-24)
- `packs/claudinite-tasks/src/world/sessions.mjs`, from `engine/scheduler/queue/invoke.mjs` (first added 2026-08-15)
- `packs/claudinite-tasks/stubs/claudinite-executor.yml`, from `engine/scheduler/stubs/claudinite-executor.yml` (first added 2026-08-15)
- `packs/claudinite-tasks/stubs/claudinite-scheduler.yml`, from `engine/scheduler/stubs/claudinite-tick.yml` (first added 2026-08-15)

#### `docs/` (5 files)

- `packs/claudinite-dashboard/docs/pack-contributions.md`, from `docs/dashboard-pack-metrics/DESIGN.md` (first added 2026-08-22)
- `packs/claudinite-tasks/test/sim/coverage.test.mjs`, from `docs/tasks-dispatch/sim/coverage.test.mjs` (first added 2026-08-13)
- `packs/claudinite-tasks/test/sim/README.md`, from `docs/tasks-dispatch/sim/README.md` (first added 2026-08-13)
- `packs/claudinite-tasks/test/sim/scenarios.test.mjs`, from `docs/tasks-dispatch/sim/scenarios.test.mjs` (first added 2026-08-13)
- `packs/claudinite-tasks/test/sim/sim.mjs`, from `docs/tasks-dispatch/sim/sim.mjs` (first added 2026-08-13)

#### `.claudinite/` (13 files)

- `packs/claudinite-canon-curation/badge.svg`, from `.claudinite/local/packs/canon-curation/badge.svg` (first added 2026-07-28)
- `packs/claudinite-canon-curation/declared-checks.json`, from `.claudinite/local/packs/canon-curation/declared-checks.json` (first added 2026-08-14)
- `packs/claudinite-canon-curation/skills/writing-claudinite-skills/checks.mjs`, from `.claudinite/local_packs/canon-curation/skills/writing-claudinite-skills/checks.mjs` (first added 2026-07-19)
- `packs/claudinite-canon-curation/skills/writing-claudinite-skills/no-enforcement-narration.mjs`, from `.claudinite/local_packs/canon-curation/skills/writing-claudinite-skills/no-enforcement-narration.mjs` (first added 2026-07-19)
- `packs/claudinite-canon-curation/tasks/growth-discover-packs/task.md`, from `.claudinite/local/packs/canon-curation/tasks/growth-discover-packs/task.md` (first added 2026-07-24)
- `packs/claudinite-canon-curation/tasks/growth-promote/task.md`, from `.claudinite/local/packs/canon-curation/tasks/growth-promote/task.md` (first added 2026-07-24)
- `packs/claudinite-canon-curation/test/pack-discovery-entry-await.test.mjs`, from `.claudinite/local/packs/claudinite/pack-discovery-entry-await.test.mjs` (first added 2026-07-31)
- `packs/claudinite-canon-curation/test/pack.test.mjs`, from `.claudinite/local_packs/canon-curation/pack.test.mjs` (first added 2026-07-19)
- `packs/claudinite-canon-curation/test/skills/writing-claudinite-skills/no-enforcement-narration.test.mjs`, from `.claudinite/local_packs/canon-curation/skills/writing-claudinite-skills/no-enforcement-narration.test.mjs` (first added 2026-07-19)
- `packs/claudinite-canon-curation/test/tasks.test.mjs`, from `.claudinite/local/packs/canon-curation/tasks.test.mjs` (first added 2026-07-24)
- `packs/claudinite-canon-curation/worldRules/no-enforcement-narration.mjs`, from `.claudinite/local_packs/canon-curation/no-enforcement-narration.mjs` (first added 2026-07-19)
- `packs/claudinite-canon-curation/worldRules/pack-discovery-entry-await.mjs`, from `.claudinite/local/packs/claudinite/pack-discovery-entry-await.mjs` (first added 2026-07-31)
- `packs/claudinite-growth/skills/prose-to-checks/SKILL.md`, from `.claudinite/local_packs/canon-curation/skills/prose-to-checks/SKILL.md` (first added 2026-07-06)

#### `routines/` (1 files)

- `packs/claudinite-fleet-sheepdog/fleet-api.mjs`, from `routines/fleet/fleet-api.mjs` (first added 2026-07-13)

#### `.github/actions/report-failure/action.yml` (1 files)

- `packs/chrome-extension/stubs/actions/report-failure/action.yml`, from `.github/actions/report-failure/action.yml` (first added 2026-07-06)
<!-- END GENERATED: verify -->
