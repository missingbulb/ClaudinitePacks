## 2026-08-11 · born · the member adopts what the fleet asked it for (#750)
- **Source:** the enforcer-side agent stage that parked for a human, because a session scoped
  to the enforcer repo cannot act on four member repos.
- **Reason:** the fan-out model is the answer: what crosses a repo boundary is an issue and a
  workflow dispatch, and the agent that adopts runs inside the member, on the ordinary Action token,
  with the repo checked out.
- **Actor:** @missingbulb (owner).
- **Mechanism:** a task in the `grow_with_claudinite` pack whose code-work requests the agent only
  when this repo has an open add-packs work list, so an empty re-fire ends quietly; the agent adopts
  requested entries verbatim and confirms suspicions against the checkout.
- **Landed:** #750 (Closes #749).

## 2026-08-14 · moved · out of the growth pack into this one (#836)
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** the task adopts packs into a member, which judges and changes that member's
  Claudinite status rather than capturing a lesson.
- **Landed:** #836 (Closes #835, phase 1).

## 2026-08-21 · policy-changed · the work-list issue is the item (#1119)
- **Reason:** the fleet marks an issue in the member, so the member's own scheduler run picks it up
  as an ordinary work item and the wake dispatch becomes a latency nudge rather than the trigger.
- **Actor:** @missingbulb (owner).
- **Mechanism:** the task declares no code-work gate and carries no worker; the marked issue is the
  list it acts on.
- **Landed:** #1119 · pack version 60821.1.

## 2026-08-30 · policy-changed · it lands its pull request instead of holding it for review (#1453)
- **Reason:** the review ceiling existed so a human reviewed a change that switches on new checks in
  the member's CI, and the review never came: one member's adoption sat parked for eleven days and
  never reached the repo it was for. The member's own checks still gate the merge.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** the task's outcome ceiling.
- **Landed:** #1453 (Refs #1452, #1453) · pack version 60830.2.

## 2026-08-30 · policy-changed · its automerge policy narrows to what an adoption writes (#1459)
- **Reason:** the whole-tree converge lane is the update task's, and an adoption's diff is
  predictable: the mount's policy sources, the settings update and the regenerated rules index.
- **Actor:** @missingbulb (owner).
- **Mechanism:** the task's automerge policy, stated as a prediction of the diff.
- **Landed:** #1459 · pack version 60830.3.

## 2026-09-22 · reworded · the queue mark it tells a session to apply is named literally
- **Reason:** "for the queue" and "a tagged … issue" left the label to the reader, who invented
  one; `task:origin:ad-hoc` is the spelling a scheduler run adopts.
- **Actor:** @missingbulb (owner).
- **Model:** Opus 5

## 2026-10-03 · reworded · the fingerprint sentence goes; requested entries go through `cn adopt` and `cn settings answer`
- **Reason:** `fingerprint-fit.mjs` lived in a canon clone the `cn` flow never fetches, and `cn` carries no fingerprint.
- **Actor:** build lead, ClaudiniteEngine#55.
- **Model:** Claude Opus 5.5 (1M context)

## 2026-10-03 · reworded · the protocol is pinned to `cn fleet protocol`; undecided fingerprints are settled against the checkout
- **Reason:** the fleet half of the protocol moved into the engine (`cn fleet add-packs`), so the byte-identity guard against the sheepdog's copy had nothing left to compare; the member's copy is now held to what `cn fleet protocol --json` prints. The fleet's suspected list again names the fingerprints it could not decide, under *Not decided from outside*, and the agent settles them by running each over this checkout.
- **Actor:** build lead, ClaudiniteEngine#61.
- **Model:** Claude Opus 5.5 (1M context)
- **Mechanism:** the task's protocol test, which runs `cn fleet protocol --json`; the task.md line on undecided fingerprints. claudinite-lifecycle 61003.2.

## 2026-10-08 · reworded · work lists are named by title, not label
- **Reason:** the owner dropped `add-packs` from the approved labels; the converged titles already key the work lists.
- **Actor:** @missingbulb (owner), approving a closed list of labels canon packs may write.
- **Model:** Claude Opus 5.5 (1M context)
