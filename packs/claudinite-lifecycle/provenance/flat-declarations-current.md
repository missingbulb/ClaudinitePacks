## 2026-09-25 · born · the flat task and dashboard files are only worth reading while current (#2322)
- **Reason:** the dashboard and sessions read `.claudinite/flat/` instead of every pack's task.json
  and dashboard.json, so a stale copy misreports what runs here.
- **Actor:** @missingbulb (owner) asked for the flattening.
- **Mechanism:** a coded world check, blocking like its siblings `rules-index-current` and
  `skills-index-current`. It is inert until the engine writes the flat directory.
- **Landed:** #2322

## 2026-10-02 · moved · Its port waits on the task runner slice, which writes the flat tasks file it checks (missingbulb/ClaudiniteEngine#41)
- **Reason:** the check asserts something a later slice of the Go engine creates, so it ports to Go
  with that slice; no `.mjs` runs under `cn`, so it is removed now, and the frozen Node shelf at
  missingbulb/Claudinite@057841ac keeps the source the port reads.
- **Actor:** @missingbulb (owner), through the chunk 9 plan.
- **Mechanism:** none until that slice; ClaudiniteEngine's `parity/deferred.txt` names it, and
  the differential refuses any subtraction it does not explain.
- **Landed:** pending.
