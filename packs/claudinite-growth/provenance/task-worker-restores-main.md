## 2026-09-06 · born · Promote the validated survivors of four growth-promote PRs (#1828)
- **Reason:** one executor run drains several items from one checkout, so a worker that leaves a
  branch checked out hands the next item a tree it did not expect.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Mechanism:** check task-worker-restores-main, in
  packs/claudinite-growth/worldRules/task-worker-restores-main.mjs.
- **Landed:** #1828 · pack version 60906.7.

## 2026-09-25 · reworded · `severity: blocking|advisory` is spelled `on_fail: block|advise`
- **Reason:** owner decision, 2026-09-25: the field names what happens when the check fails, and
  *severity* keeps its impact sense; what this element enforces is unchanged.
- **Actor:** @missingbulb (owner).

## 2026-10-02 · moved · Its port waits on the task runner slice, beside the task contract it asserts (missingbulb/ClaudiniteEngine#41)
- **Reason:** the check asserts something a later slice of the Go engine creates, so it ports to Go
  with that slice; no `.mjs` runs under `cn`, so it is removed now, and the frozen Node shelf at
  missingbulb/Claudinite@057841ac keeps the source the port reads.
- **Actor:** @missingbulb (owner), through the chunk 9 plan.
- **Mechanism:** none until that slice; ClaudiniteEngine's `parity/deferred.txt` names it, and
  the differential refuses any subtraction it does not explain.
- **Landed:** pending.
