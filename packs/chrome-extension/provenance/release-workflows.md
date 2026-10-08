## 2026-07-06 · born · with the pack, from the conversion inventory of the release standard (#128)
- **Source:** the corpus-wide inventory of instructions that convert to deterministic checks.
- **Reason:** a repo that publishes carries the standard's orchestrator workflow with the standard's shape, or it cannot release the standard way.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5, per the commit trailer.
- **Mechanism:** a world-scope coded check over `.github/workflows/`, blocking: the pipeline is a contract, and a repo off it fails only at the store.
- **Retire when:** the pipeline stops being a vendored contract every extension repo hosts.
- **Landed:** #128 (Refs #127) · pack version 1.

## 2026-07-10 · reworded · one stub named "Release to Chrome Store", explicit `release.config`, daily at 00:30 UTC (#205, #214)
- **Actor:** @missingbulb (owner).
- **Landed:** #205, #214 · pack version 1.

## 2026-07-13 · reworded · the check requires the vendored set under the repo's own `.github/` (#280)
- **Reason:** the reusables and composite actions now live in each repo; the pre-vendoring `@main` shape is tolerated while the vendoring migration is recent, since baselining re-materializes it.
- **Actor:** @missingbulb (owner).
- **Mechanism:** the tolerance is keyed on the migration record's recency (`migrationActive`), so it expires with the record rather than with a hand edit.
- **Landed:** #280 · pack version 1.

## 2026-08-21 · reworded · the orchestrator's bump dispatch joins the expected calls (#1151)
- **Actor:** @missingbulb (owner).
- **Landed:** #1151 · pack version 60821.1.

## 2026-09-03 · strengthened · the tolerated `@main` shape reports an advisory, and the tolerance retires on a window (#1645, #1653)
- **Reason:** a repo never told it still makes those calls is what held the removal gate shut.
- **Actor:** @missingbulb (owner).
- **Mechanism:** the tolerance now fires an advisory naming the window its tolerance ends on, annotated `@legacy-tolerance advisory:cer/release-workflows retire:#1643`, so the holder is told in its own repo and the removal is a dated link rather than a census.
- **Rejected:** gating the removal on "no repo still makes those calls" - a census the canon cannot take, since it cannot see which members are live, inert or stale.
- **Landed:** #1645 (Refs #1637), #1653 (Refs #1652) · pack versions 60903.3 and 60903.4; the removal issue #1643.

## 2026-09-25 · reworded · `severity: blocking|advisory` is spelled `on_fail: block|advise`
- **Reason:** owner decision, 2026-09-25: the field names what happens when the check fails, and
  *severity* keeps its impact sense; what this element enforces is unchanged.
- **Actor:** @missingbulb (owner).

## 2026-09-25 · reworded · "baseline" / "baselining" vocabulary retired
- **Reason:** owner decision: the mechanism that re-vendors a mount is called update, and the pack
  every repo declares is basics; the baseline wording named a retired mechanism.
- **Actor:** @missingbulb (owner).


## 2026-10-03 · moved · Ported to Go (missingbulb/ClaudiniteEngine#68)
- **Reason:** the Go engine runs a pack's coded checks from its `checks/` directory, built against
  the SDK, so the check is rewritten in Go with its `on_fail`, `why`, `doc` and finding text
  unchanged, and the `.mjs` with its import of the Node engine is removed. The Go SDK's check ids
  are lowercase letters, digits and dashes, so `cer/release-workflows` is `release-workflows`, and
  this file moves from `cer-release-workflows.md` to match.
- **Actor:** @missingbulb (owner), through the chunk 17 plan (ClaudinitePacks#30 T2).
- **Mechanism:** `packs/chrome-extension/checks/release_workflows.go`, unit-tested beside it through
  the SDK's fake engine, run through `cn check --pack chrome-extension` by `test/`, and compared
  with the Node engine by ClaudiniteEngine's parity harness.
- **Landed:** pending.

## 2026-10-08 · policy-changed · report-failure opens its issue unlabelled
- **Reason:** the owner dropped `workflow-failure` from the approved labels; earlier failure issues are found by their title prefix alone.
- **Actor:** @missingbulb (owner), approving a closed list of labels canon packs may write.
- **Model:** Claude Opus 5.5 (1M context)
- **Mechanism:** the stub's `gh` calls; `tools/test/labels.test.mjs` holds packs to the list.
