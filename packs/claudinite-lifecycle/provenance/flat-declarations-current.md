## 2026-09-25 · born · the flat task and dashboard files are only worth reading while current (#2322)
- **Reason:** the dashboard and sessions read `.claudinite/flat/` instead of every pack's task.json
  and dashboard.json, so a stale copy misreports what runs here.
- **Actor:** @missingbulb (owner) asked for the flattening.
- **Mechanism:** a coded world check, blocking like its siblings `rules-index-current` and
  `skills-index-current`. It is inert until the engine writes the flat directory.
- **Landed:** #2322

## 2026-10-02 · moved · Its port waits on the task runner slice, which writes the flat tasks file it checks (missingbulb/ClaudiniteEngine#41)
- **Reason:** the check asserts something a later slice of the Go engine creates, so it ports to Go
  with that slice; no `.mjs` runs under `cn`, so it is removed now, and the frozen Node shelf
  keeps the source the port reads.
- **Actor:** @missingbulb (owner), through the chunk 9 plan.
- **Mechanism:** none until that slice; ClaudiniteEngine's `parity/deferred.txt` names it, and
  the differential refuses any subtraction it does not explain.
- **Landed:** pending.

## 2026-10-02 · ported · A `cn` built-in tagged with this pack, beside the task contract it asserts (missingbulb/ClaudiniteEngine#43)
- **Reason:** the task runner slice brought the task contract into the Go engine, so the check
  ports with it: same id, on_fail, why and finding text, run by `cn` wherever this pack is
  declared. Its remedy names `cn tasks flat --write` and its doc this pack's README, since the Node
  generator it pointed at is gone; the Node rule's probe for an engine that writes no flat files is
  dropped, because every `cn` converge writes them.
- **Actor:** @missingbulb (owner), through the chunk 10 plan.
- **Mechanism:** a `cn` built-in (ClaudiniteEngine `checks/builtin/`), compared against the frozen
  Node rule by the parity differential.
- **Landed:** missingbulb/ClaudiniteEngine#44.
