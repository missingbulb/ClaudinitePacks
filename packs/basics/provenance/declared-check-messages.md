## 2026-08-15 · born · Declarative checks: review document + the implementation it recommends (#839)
- **Reason:** a declared check's message is the whole of what a session sees, and nothing held it to
  a length or stopped one rule repeating its own fix. Blocking, and authored red-first against 17
  findings.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5, per the commit trailer.
- **Mechanism:** check declared-check-messages, in
  packs/basics/worldRules/declared-check-messages.mjs.
- **Landed:** #839 · pack version 3.

## 2026-09-25 · reworded · `severity: blocking|advisory` is spelled `on_fail: block|advise`
- **Reason:** owner decision, 2026-09-25: the field names what happens when the check fails, and
  *severity* keeps its impact sense; what this element enforces is unchanged.
- **Actor:** @missingbulb (owner).

## 2026-10-02 · moved · Ported to Go (missingbulb/ClaudiniteEngine#39)
- **Reason:** the Go engine runs a pack's coded checks from its `checks/` directory, built against
  the SDK, so the check is rewritten in Go with its id, `on_fail`, `why`, `doc` and finding text
  unchanged, and the `.mjs` with its import of the Node engine is removed.
- **Actor:** @missingbulb (owner), through the chunk 8 plan.
- **Mechanism:** `packs/basics/checks/declared_check_messages.go`, unit-tested
  beside it through the SDK's fake engine and compared with the Node engine by
  ClaudiniteEngine's parity harness.
- **Landed:** pending.
