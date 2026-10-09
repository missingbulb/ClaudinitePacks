## 2026-09-21 · born · the shelf's half of the usage triage (#2214)
- **Source:** docs/usage-review/DESIGN.md §6.4, the owner's design of 2026-09-21.
- **Reason:** a growth task runs in every member, where `packs/` is a read-only mount, so an action
  over a canon's shelf is a curation task loading the growth skill for its method.
- **Mechanism:** a weekly agentic task over `packs/`, `fresh_pr`, automerge `nothing`, the same gate
  and the same skill as its member-side twin. The two gates are duplicated rather than shared
  because the packs are independent by construction; a test drives both implementations over the
  same inputs and compares their answers.
- **Retire when:** as its twin - proposals opened and none merged over two months.
- **Landed:** #2214

## 2026-09-25 · policy-changed · the precondition reads the review from .claudinite/usage/ (#2322)
- **Reason:** it follows the review file, falling back to the old path until that file has moved.
- **Mechanism:** unchanged, a task-local precondition term.
- **Landed:** #2322

## 2026-10-08 · reworded · a finding is named by rule and subject, not an issue
- **Reason:** the usage review no longer files finding issues; an unsettled cause goes in the run's summary.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5.5 (1M context)

## 2026-10-08 · reworded · delivery follows the routine instructions
- **Reason:** `claudinite-tasks/public/deliver-pr.md` folded into the routine instructions the engine writes at session start.
- **Actor:** @missingbulb (owner), deciding the restructure.
- **Model:** Claude Opus 5.5 (1M context)
