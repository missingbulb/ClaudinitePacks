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

## 2026-10-09 · scope-changed · requires no claudinite-tasks
- **Reason:** the task queue is the engine's on every member (ClaudiniteEngine#146), so the pack it
  once needed is retiring.
- **Actor:** @missingbulb (owner), folding claudinite-tasks into the engine.
- **Model:** Claude Opus 5.5
- **Mechanism:** the manifest's `requires`. task-flow 1.61009.1.

## 2026-10-09 · reworded · excludes names the engine for the queue machinery
- **Reason:** claudinite-tasks is deleted.
- **Actor:** @missingbulb (owner), collapsing claudinite-tasks, claudinite-canon-curation,
  claudinite-fleet-sheepdog and claudinite-single-repo-dashboard into the engine.
