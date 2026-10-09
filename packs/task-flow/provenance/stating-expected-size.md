## 2026-10-09 · born · every change states its expected size; a tiny one past 10 files stops for a re-think
- **Source:** the owner, in the Claude project "Commercialization of Claudinite".
- **Reason:** a change's real size against the size expected of it is the earliest signal that the
  design structure or its complexity was misjudged; read only at handover (basics'
  `handing-change-diff`), the misjudgment has already been built out across the files.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5.5 (1M context)
- **Mechanism:** a rule in task-flow's `RULES.md`, triggered on starting a change. Prose: the
  estimate is a judgment stated in the PR body or plan step, and no check can know which changes
  were expected to be tiny.
- **Rejected:** a check counting a diff's files, which fires on every large change that was
  expected large.
- **Retire when:** a change's expected size is a field the work item or PR already carries and a
  check compares the diff against it.
