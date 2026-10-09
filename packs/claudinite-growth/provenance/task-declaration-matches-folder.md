## 2026-08-14 · born · prose-to-checks: the task declaration must agree with its own folder (#805)
- **Reason:** task discovery is fail-soft per task, so a declaration disagreeing with its folder
  never runs and nothing goes red; caught at author time instead.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** check task-declaration-matches-folder, in
  packs/claudinite-growth/worldRules/task-declaration-matches-folder.mjs.
- **Landed:** #805 (Refs #630).

## 2026-09-06 · scope-changed · Retire the task.mjs module form of a task declaration (#1795)
- **Reason:** `task.json` is now the only declaration file a task folder may carry.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** the check parses `task.json` only, the module form having been retired.
- **Landed:** #1795 · pack version 60906.8.

## 2026-09-25 · reworded · `severity: blocking|advisory` is spelled `on_fail: block|advise`
- **Reason:** owner decision, 2026-09-25: the field names what happens when the check fails, and
  *severity* keeps its impact sense; what this element enforces is unchanged.
- **Actor:** @missingbulb (owner).

## 2026-10-02 · moved · Its port waits on the task runner slice, beside the task contract it asserts (missingbulb/ClaudiniteEngine#41)
- **Reason:** the check asserts something a later slice of the Go engine creates, so it ports to Go
  with that slice; no `.mjs` runs under `cn`, so it is removed now, and the frozen Node shelf
  keeps the source the port reads.
- **Actor:** @missingbulb (owner), through the chunk 9 plan.
- **Mechanism:** none until that slice; ClaudiniteEngine's `parity/deferred.txt` names it, and
  the differential refuses any subtraction it does not explain.
- **Landed:** pending.

## 2026-10-02 · ported · A `cn` built-in tagged with this pack, beside the task contract it asserts (missingbulb/ClaudiniteEngine#43)
- **Reason:** the task runner slice brought the task contract into the Go engine, so the check
  ports with it: same id, on_fail, since, why, doc and finding text, run by `cn` wherever this pack
  is declared.
- **Actor:** @missingbulb (owner), through the chunk 10 plan.
- **Mechanism:** a `cn` built-in (ClaudiniteEngine `checks/builtin/`), compared against the frozen
  Node rule by the parity differential.
- **Landed:** missingbulb/ClaudiniteEngine#44.
