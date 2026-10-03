## 2026-07-22 · born · Per-project scheduling - Phase 0: engine/scheduler, groundwork, checks, task conversions (#396)
- **Reason:** the capture stage was a fleet-orchestrated `run_daily` unit; per-project scheduling
  made it a task the repo's own scheduler discovers and runs.
- **Actor:** @missingbulb (owner).
- **Mechanism:** `tasks/growth-extract/`, declared in the pack's own tree.
- **Landed:** #396 (Refs #394).

## 2026-08-23 · policy-changed · Collapse the frequency vocabulary and take the cron to two ticks a day (#1230)
- **Reason:** `hourly` cannot mean anything under a cron firing twice a day, and the `daily+-Nh`
  offsets staggered dependent tasks where the ordering field declares that intent.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** the declaration's frequency, normalized at the declaration door rather than in the
  calendar, since more than the anchor reads it.
- **Landed:** #1230 (Closes #1231).

## 2026-08-27 · reworded · A new check declares when it was added, and is advisory for two weeks (#1379)
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Landed:** #1379 (Closes #1378).

## 2026-08-30 · reworded · Local packs keep no VERSIONS.md - the commit is their record (#1442)
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Landed:** #1442 (Closes #1439).

## 2026-09-03 · reworded · A task doc opens on what the run does (#1651)
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Landed:** #1651 (Closes #1649).

## 2026-09-13 · policy-changed · Drop pr_name; keep the rule, and simplify the growth policies (#1951)
- **Reason:** the diff-class intersections encoded a guess about the diff's shape on top of the
  folder scope, and each guess was a second gate a correct run could fail.
- **Actor:** @missingbulb (owner).
- **Mechanism:** `automerge`, one folder scope with no diff-class intersection.
- **Landed:** #1951 (Closes #1977, Closes #1978).

## 2026-09-20 · reworded · Claudinite canon: rule revalidation (#2157)
- **Actor:** @missingbulb (owner).
- **Landed:** #2157 · pack version 60920.2.

## 2026-10-02 · gate-changed · yields to the engine's `engine/update`
- **Reason:** the update is the engine's built-in task now (ClaudiniteEngine design record row
  71); `claudinite-lifecycle/update` is retired, so the `schedule_after` names the task that
  refreshes the mount today.
- **Actor:** @missingbulb (owner), through ClaudiniteEngine chunk 11 (#45).
- **Model:** Claude Opus 5.5, per the commit trailer.

## 2026-10-03 · reworded · a repo with no local pack starts with `cn pack new`
- **Reason:** nothing scaffolded a member's first local pack once adoption stopped seeding one (ClaudiniteEngine#55 Q7); `cn pack new` writes and declares it.
- **Actor:** build lead, ClaudiniteEngine#57.
- **Model:** Claude Opus 5.5 (1M context)
