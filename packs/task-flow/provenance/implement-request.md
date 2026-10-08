## 2026-10-08 · born · the engine's built-in request task becomes this pack's task
- **Reason:** a built-in task is the one task a repo cannot see, version or replace; as a pack task
  it is declared, vendored and released like every other, and the engine keeps only the
  `request-eligible` term it gates on. Its history before this is the engine's.
- **Actor:** @missingbulb (owner), deciding the restructure.
- **Model:** Claude Opus 5.5 (1M context)
- **Mechanism:** `tasks/implement-request/task.json`, the engine's declaration unchanged but for its
  description, and the worker text that was `claudinite-tasks/public/implement-request.md`, now
  pointing at the delivery procedure `cn work validate` prints instead of `deliver-pr.md`.
