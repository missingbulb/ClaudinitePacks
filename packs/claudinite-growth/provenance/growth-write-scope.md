## 2026-08-12 · born · Growth dedup: method moves into a pack skill; growth-write-scope gates the capture runs' write surface (#492)
- **Reason:** both capture runs auto-merge, so nothing human reviews a run that reaches outside the
  local packs; a merged run had already edited `packs/README.md`.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** check growth-write-scope, in
  packs/claudinite-growth/workRules/growth-write-scope.mjs.
- **Landed:** #492 (Closes #491).

## 2026-09-15 · scope-changed · Scope claudinite-growth to local packs, give the shelf its own tasks (#2047)
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** the check's commit-title trigger widens from the two capture runs to all four
  growth runs, the sweeps having become the same write surface.
- **Landed:** #2047 (Closes #2044).

## 2026-09-25 · reworded · `severity: blocking|advisory` is spelled `on_fail: block|advise`
- **Reason:** owner decision, 2026-09-25: the field names what happens when the check fails, and
  *severity* keeps its impact sense; what this element enforces is unchanged.
- **Actor:** @missingbulb (owner).

## 2026-10-02 · moved · A `cn` built-in owned by this pack (missingbulb/ClaudiniteEngine#41)
- **Reason:** the Go engine folds this pack's checks into itself: the check runs as a `cn`
  built-in tagged with this pack, only where the pack is declared, with its id, `on_fail`, `since`,
  `why`, `doc` and finding text kept, so the `.mjs` and its test are removed.
- **Actor:** @missingbulb (owner), through the chunk 9 plan.
- **Mechanism:** `checks/builtin/growth_write_scope.go` in ClaudiniteEngine, unit-tested there and compared with
  the Node engine by its parity harness.
- **Landed:** pending.

## 2026-10-05 · moved · Back from a `cn` built-in to this pack's Go checks
- **Reason:** it polices this pack's own runs, not a declaration the engine reads to run; owner
  decision in the project thread.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5.5
- **Mechanism:** `checks/growth_write_scope.go` in this pack, a coded check tagged `work`; id,
  `on_fail`, `why`, `doc` and finding text kept.
- **Landed:** pending.

## 2026-10-09 · reworded · the fix names an engine fleet task for the shelf
- **Reason:** claudinite-canon-curation is deleted; its tasks are the engine's fleet pack's.
- **Actor:** @missingbulb (owner), collapsing claudinite-tasks, claudinite-canon-curation,
  claudinite-fleet-sheepdog and claudinite-single-repo-dashboard into the engine.
