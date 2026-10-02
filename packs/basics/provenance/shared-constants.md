## 2026-07-07 · born · Drift guards: sharpen the single-source rule and ship the shared-constants check (#148)
- **Source:** GoogleCalendarEventCreator's bespoke `shared_constants` test, generalized so every
  repo gets it instead of reinventing it.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 4.8, per the commit trailer.
- **Mechanism:** check shared-constants, in packs/basics/worldRules/shared-constants.mjs.
- **Rejected:** shipping it as a `design` skill. The rule's true trigger is writing or editing code,
  which the engineering-practices trigger already covered, and a broad skill would have fired at the
  wrong moments.
- **Landed:** #148, closing #147.

## 2026-07-08 · reworded · shared-constants: flag entries whose files can all share an import (#186)
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Landed:** #186.

## 2026-09-25 · reworded · `severity: blocking|advisory` is spelled `on_fail: block|advise`
- **Reason:** owner decision, 2026-09-25: the field names what happens when the check fails, and
  *severity* keeps its impact sense; what this element enforces is unchanged.
- **Actor:** @missingbulb (owner).

## 2026-10-02 · moved · Ported to Go (missingbulb/ClaudiniteEngine#39)
- **Reason:** the Go engine runs a pack's coded checks from its `checks/` directory, built against
  the SDK, so the check is rewritten in Go with its id, `on_fail`, `why`, `doc` and finding text
  unchanged, and the `.mjs` with its import of the Node engine is removed.
  The cases are read from this pack's entry, `config.sharedConstants`, rather than a top-level
  settings key; `cn verify` names a top-level one as a deprecation.
- **Actor:** @missingbulb (owner), through the chunk 8 plan.
- **Mechanism:** `packs/basics/checks/shared_constants.go`, unit-tested
  beside it through the SDK's fake engine and compared with the Node engine by
  ClaudiniteEngine's parity harness.
- **Landed:** pending.
