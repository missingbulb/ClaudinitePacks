## 2026-09-06 · born · converted from references.md (RULES-5)
- **Reason:** Owner process change: "When you create detailed, multi-task migration plans - before
  you start creating the issues - you need to get the owner's approval for the plan, including a
  quick description of every step (task), dependencies graph, and auto-merge rules (done after
  analyzing and predicting how the PR will look and what it will change)." The skill said "when the
  plan is agreed" three times without ever saying how agreement is obtained or that it gates filing,
  so a session could file tracker, links and edges and ask afterwards.
- **Mechanism:** prose
- **Retire when:** Retire only if the owner says a filed-then-reviewed plan is acceptable.

## 2026-10-08 · moved · from basics' RULES.md into task-flow's
- **Reason:** its subject is filing, deferring, sequencing or verifying work through the queue or a
  migration plan, task-flow's; the text is unchanged.
- **Actor:** @missingbulb (owner), deciding the restructure.
- **Model:** Claude Opus 5.5 (1M context)
- **Mechanism:** a rule in task-flow's `RULES.md`, injected wherever task-flow is declared.
