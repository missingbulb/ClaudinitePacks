## 2026-10-08 · born · the task-flow pack: filing, deferring, sequencing and proving work through the queue
- **Reason:** the workflow a session follows to put work on the queue - deferring a change, chaining
  a plan's phases, filing a production verification - and the request lane's own task were spread
  over basics, claudinite-tasks and the engine's built-in task. The queue's machinery stays in
  claudinite-tasks and the engine; the workflow over it is one pack.
- **Actor:** @missingbulb (owner), deciding the restructure.
- **Model:** Claude Opus 5.5 (1M context)
- **Mechanism:** the manifest; `requires` claudinite-tasks, whose queue every element here files
  into, and basics, whose skills the moved skills link. Seeded by default: it carries
  `implement-request`, without which a repo running the queue has no request lane, and rules every
  basics-seeded repo carried until now.
- **Rejected:** opt-in, which drops the request lane and the deferral rules from every new repo that
  adopts the queue.
