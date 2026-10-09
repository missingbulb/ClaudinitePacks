## 2026-08-16 · born · Where CI time goes: fixture signing, the fleet-wide numbers, and a weekly measurement (#857)
- **Reason:** the answer to "where does CI time go" had been a hand-run investigation; the task
  makes the next one a measurement that arrives on its own. Weekly, comparing each workflow's median
  against the previous window and requesting an agent only on a real regression, so a quiet week
  costs no session.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** task ci-performance.
- **Landed:** #857, fixing #855 · pack version 3.

## 2026-08-18 · reworded · Task-owned trackers, and no fallback for a missing required input (#941)
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Landed:** #941 · pack version 5.

## 2026-10-02 · ported · ci-performance runs on `@claudinite/sdk`
- **Reason:** the worker's tracker and Actions reads went through the removed runner's library.
- **Actor:** build lead, completing ClaudinitePacks #20 so the runner's removal lands with every importer ported.
- **Mechanism:** the tracker through the SDK's tracker actions, the Actions runs and jobs through a pack-local REST copy on the job's token.

## 2026-10-08 · reworded · delivery follows the routine instructions
- **Reason:** `claudinite-tasks/public/deliver-pr.md` folded into the routine instructions the engine writes at session start.
- **Actor:** @missingbulb (owner), deciding the restructure.
- **Model:** Claude Opus 5.5 (1M context)

## 2026-10-09 · fixed · the run ledger covers both windows
- **Reason:** one repo-wide page of 100 runs reached back only hours on a busy repo, so a quiet workflow's previous window was a handful of runs from whatever that page held (CrosswordChat #421).
- **Actor:** @missingbulb (owner), asking for that repo's open issues to be implemented or closed.
- **Model:** Claude, per the commit trailer.
- **Mechanism:** the worker pages the ledger filtered to runs created since the start of the previous window.
