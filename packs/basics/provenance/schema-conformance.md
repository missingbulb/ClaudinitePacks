## 2026-09-06 · born · Declared checks at every moment: schema rung, work and action scopes, skill triggers, and the creation path (#1711)
- **Reason:** anything a schema can enforce is better handled there, so a declared assertion or a
  coded twin restating a required field is a schema check in disguise.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5.1, per the commit trailer.
- **Mechanism:** check schema-conformance, in packs/basics/worldRules/schema-conformance.mjs.
- **Landed:** #1711 · pack version 60906.2.

## 2026-09-25 · reworded · `severity: blocking|advisory` is spelled `on_fail: block|advise`
- **Reason:** owner decision, 2026-09-25: the field names what happens when the check fails, and
  *severity* keeps its impact sense; what this element enforces is unchanged.
- **Actor:** @missingbulb (owner).

## 2026-10-02 · moved · Ported to Go (missingbulb/ClaudiniteEngine#39)
- **Reason:** the Go engine runs a pack's coded checks from its `checks/` directory, built against
  the SDK, so the check is rewritten in Go with its id, `on_fail`, `why`, `doc` and finding text
  unchanged, and the `.mjs` with its import of the Node engine is removed.
- **Actor:** @missingbulb (owner), through the chunk 8 plan.
- **Mechanism:** `packs/basics/checks/schema_conformance.go`, unit-tested
  beside it through the SDK's fake engine and compared with the Node engine by
  ClaudiniteEngine's parity harness.
- **Landed:** pending.
