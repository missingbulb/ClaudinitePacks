## 2026-09-06 · born · Promote the validated survivors of four growth-promote PRs (#1828)
- **Source:** #1303's candidate, re-derived against current `main` rather than rebased, and probed
  in the landing session: 14 tests pass, silent on the real tree, `ci.yml` in scope.
- **Reason:** the half of the prose rule with a signature is that the argument resolve to files that
  exist, a typo'd glob reading as a green run. Watched failing before landing: making
  `resolvesToFiles` always return `true` turned 3 of node's 14 tests red.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Mechanism:** world check `node/test-discovery-resolves`, blocking, stamped `since: 2026-09-06`
  so its advisory grace runs from when it reaches members rather than from its branch's date.
- **Landed:** #1828 (Refs #1715, #1690, #1419, #1303) · pack version 60906.2.

## 2026-09-25 · reworded · `severity: blocking|advisory` is spelled `on_fail: block|advise`
- **Reason:** owner decision, 2026-09-25: the field names what happens when the check fails, and
  *severity* keeps its impact sense; what this element enforces is unchanged.
- **Actor:** @missingbulb (owner).

## 2026-10-02 · moved · Ported to Go (missingbulb/ClaudiniteEngine#39)
- **Reason:** the Go engine runs a pack's coded checks from its `checks/` directory, built against
  the SDK, so the check is rewritten in Go with its id, `on_fail`, `why`, `doc` and finding text
  unchanged, and the `.mjs` with its import of the Node engine is removed.
- **Actor:** @missingbulb (owner), through the chunk 8 plan.
- **Mechanism:** `packs/node/checks/test_discovery_resolves.go`, unit-tested
  beside it through the SDK's fake engine and compared with the Node engine by
  ClaudiniteEngine's parity harness.
- **Landed:** pending.
