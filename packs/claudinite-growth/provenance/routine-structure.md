## 2026-07-08 · born · Routine-authoring guidelines + a skill-owned routine-structure check (#177)
- **Reason:** a skill defines an action, so the check validating that action's result belongs beside
  the SKILL.md rather than in the baseline pack.
- **Actor:** @missingbulb (owner).
- **Mechanism:** check routine-structure, in
  packs/claudinite-growth/skills/unattended-agents/routine-structure.mjs.
- **Retire when:** no repo keeps a `routine.md` folder any more.
- **Landed:** #177 (Closes #178).

## 2026-09-04 · reworded · Declarative checks: the four-moment design, the rule inventory, and pass two (derive → quantify) (#1676)
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5.1, per the commit trailer.
- **Landed:** #1676 (Closes #1675).

## 2026-09-25 · reworded · `severity: blocking|advisory` is spelled `on_fail: block|advise`
- **Reason:** owner decision, 2026-09-25: the field names what happens when the check fails, and
  *severity* keeps its impact sense; what this element enforces is unchanged.
- **Actor:** @missingbulb (owner).

## 2026-10-02 · moved · A `cn` built-in owned by this pack (missingbulb/ClaudiniteEngine#41)
- **Reason:** the Go engine folds this pack's checks into itself: the check runs as a `cn`
  built-in tagged with this pack, only where the pack is declared, with its id, `on_fail`, `since`,
  `why`, `doc` and finding text kept, so the `.mjs` and its test are removed.
- **Actor:** @missingbulb (owner), through the chunk 9 plan.
- **Mechanism:** `checks/builtin/routine_structure.go` in ClaudiniteEngine, unit-tested there and compared with
  the Node engine by its parity harness.
- **Landed:** pending.
