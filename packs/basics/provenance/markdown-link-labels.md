## 2026-07-06 · born · Context-relief architecture: packs (prose + checks) and skills, with enforcement (#128)
- **Reason:** a Markdown link carries its path twice, in the visible label and in the target, so a
  `sed` anchored on the `](../href)` form rewrites the target and leaves the label reading the old
  path: the doc then points right while reading wrong.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5, per the commit trailer.
- **Mechanism:** check markdown-link-labels, in packs/basics/worldRules/markdown-link-labels.mjs.
- **Retire when:** Markdown stops duplicating the path across label and target.
- **Landed:** #128, closing #127 and #131.

## 2026-09-04 · reworded · Declarative checks: the four-moment design, the rule inventory, and pass two (derive → quantify) (#1676)
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5.1, per the commit trailer.
- **Landed:** #1676 · pack version 60904.1.

## 2026-09-25 · reworded · `severity: blocking|advisory` is spelled `on_fail: block|advise`
- **Reason:** owner decision, 2026-09-25: the field names what happens when the check fails, and
  *severity* keeps its impact sense; what this element enforces is unchanged.
- **Actor:** @missingbulb (owner).

## 2026-10-02 · moved · Ported to Go (missingbulb/ClaudiniteEngine#39)
- **Reason:** the Go engine runs a pack's coded checks from its `checks/` directory, built against
  the SDK, so the check is rewritten in Go with its id, `on_fail`, `why`, `doc` and finding text
  unchanged, and the `.mjs` with its import of the Node engine is removed.
- **Actor:** @missingbulb (owner), through the chunk 8 plan.
- **Mechanism:** `packs/basics/checks/markdown_link_labels.go`, unit-tested
  beside it through the SDK's fake engine and compared with the Node engine by
  ClaudiniteEngine's parity harness.
- **Landed:** pending.
