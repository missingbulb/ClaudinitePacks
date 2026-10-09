## 2026-09-01 · born · converted from references.md (adopt-claudinite-1)
- **Reason:** #1167 is where the executor-routine hand-over was settled: `create_trigger` and the
  SETUP block are the session's own work, and only the `CCR_ROUTINE_TOKEN` secret remains a human
  step.
- **Mechanism:** a step of the adopt-claudinite skill, a workflow

## 2026-09-21 · reworded · adoption now offers to convert the instructions already written (#2191)
- **Reason:** a repo adopting usually arrives with a CLAUDE.md, and nothing asked about it, so its
  rules were either left loading in every session forever or copied into a pack by hand by a later
  run. Adoption is the one moment the owner is present by construction and the conversion can ride
  the interview's existing batched pass and land in the same PR.
- **Actor:** @missingbulb (owner).
- **Model:** claude-opus-5
- **Landed:** #2191

## 2026-09-25 · trigger-changed · "baseline a repo" retired from the description
- **Reason:** owner decision retiring the baseline vocabulary; the mechanism that re-vendors a mount
  is called update.
- **Actor:** @missingbulb (owner).
- **Mechanism:** the skill description, re-vendoring kept as a trigger.

## 2026-09-25 · trigger-changed · description cut to the 30-word cap
- **Reason:** the description summarised the method the body already carries; every session paid for
  it.
- **Mechanism:** the description, as before.
- **Actor:** @missingbulb (owner).

## 2026-10-03 · trigger-changed · adoption is `cn init` and the work it leaves
- **Reason:** `cn init` does what `bootstrap.mjs`, the vendor set and the migration records did, and prints the questions, the handover and the next step; the skill now names that command, `cn settings answer`, the routine and the one issue. `interview.mjs` went with it: it imported the Node engine, and `cn` computes the pending set.
- **Actor:** build lead, ClaudiniteEngine#55.
- **Model:** Claude Opus 5.5 (1M context)
- **Mechanism:** the description names `cn init` and the handover issue; re-vendoring left the triggers, since the engine's update task refreshes a member. claudinite-lifecycle 61003.1.

## 2026-10-09 · reworded · a Node engine member is moved, not adopted with a flag
- **Reason:** the skill named `cn init --from-node`, which no engine ever shipped; moving a member off the Node engine is ClaudiniteEngine's move-member-off-node skill (its design record 151).
- **Actor:** @missingbulb (owner), asking for the docs errors in the cn command review fixed.
- **Mechanism:** the step's sentence, as before.
