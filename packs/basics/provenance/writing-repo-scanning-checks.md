## 2026-09-05 · born · Rules → skills: the audit's path-forced extractions; description-triggered ones stay prose (#1667)
- **Reason:** every moment these rules are needed is an edit to a check file, which a forced path
  covers exactly.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5.1, per the commit trailer.
- **Mechanism:** the writing-repo-scanning-checks skill, body guidelines, reached by its
  description.
- **Landed:** #1667 · pack version 60904.3.

## 2026-09-25 · trigger-changed · description cut to the 30-word cap
- **Reason:** the description summarised the method the body already carries; every session paid for
  it.
- **Mechanism:** the description, as before.
- **Actor:** @missingbulb (owner).

## 2026-10-02 · scope-changed · Forced on an edit of a pack's Go check
- **Reason:** a pack's coded checks move to `checks/*.go` (missingbulb/ClaudiniteEngine#39), so the
  skill's trigger widens to that home beside the `.mjs` ones still on the shelf.
- **Actor:** @missingbulb (owner), through the chunk 8 plan.
- **Mechanism:** the skill's `force-load-on-file-edits-paths`.
- **Landed:** pending.
