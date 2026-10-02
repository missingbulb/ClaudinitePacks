## 2026-09-06 · born · Make a blocking action check date itself (#1787)
- **Reason:** an action check is re-judged over the whole transcript at Stop, so a blocking one
  landing mid-session convicts calls made before it existed and no edit can clear them. Blocking,
  and it carries its own `since` so a member holding an undated check reads the rule before it
  blocks.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** check declared-check-since, in packs/basics/worldRules/declared-check-since.mjs.
- **Landed:** #1787 · pack version 60906.4.

## 2026-09-25 · reworded · `severity: blocking|advisory` is spelled `on_fail: block|advise`
- **Reason:** owner decision, 2026-09-25: the field names what happens when the check fails, and
  *severity* keeps its impact sense; what this element enforces is unchanged.
- **Actor:** @missingbulb (owner).

## 2026-10-02 · moved · Ported to Go (missingbulb/ClaudiniteEngine#39)
- **Reason:** the Go engine runs a pack's coded checks from its `checks/` directory, built against
  the SDK, so the check is rewritten in Go with its id, `on_fail`, `why`, `doc` and finding text
  unchanged, and the `.mjs` with its import of the Node engine is removed.
  The read of a legacy `severity: blocking` is dropped: `cn` refuses `severity` on a
  declaration, so no declaration it loads can carry one.
- **Actor:** @missingbulb (owner), through the chunk 8 plan.
- **Mechanism:** `packs/basics/checks/declared_check_since.go`, unit-tested
  beside it through the SDK's fake engine and compared with the Node engine by
  ClaudiniteEngine's parity harness.
- **Landed:** pending.
