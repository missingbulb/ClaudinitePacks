## 2026-09-22 · born · a guard on the labels an issue is filed with
- **Source:** the owner found `claudinite-queue`, `conformance-backlog`, `plan-tracking`, `bug` and
  `needs-decision` on issues in this repo, each invented by the session that filed one and read by
  nothing.
- **Reason:** #2181 wears `claudinite-queue` instead of the mark, so no scheduler run will ever
  adopt it and its `Not-before` passes unnoticed; the failure is silent at filing time, which is
  where a guard can still speak.
- **Actor:** @missingbulb (owner).
- **Model:** Opus 5
- **Mechanism:** an action guard on `mcp__github__issue_write`'s `labels`, blocking: the PreToolUse
  hook denies the call before the label exists, and the vocabulary is a namespace test rather than a
  list, so a label the queue gains needs no edit here.
- **Retire when:** something other than the queue reads a label in this repo.

## 2026-09-25 · reworded · `severity: blocking|advisory` is spelled `on_fail: block|advise`
- **Reason:** owner decision, 2026-09-25: the field names what happens when the check fails, and
  *severity* keeps its impact sense; what this element enforces is unchanged.
- **Actor:** @missingbulb (owner).

## 2026-10-06 · severity-changed · fires on a queue filing, no longer on every non-`task:` label
- **Source:** GoogleCalendarEventCreator's create-extractor task tells its agent to swap
  `agent-running` for `needs-human` on an `extractor-request` issue; the hook denied `issue_write`
  with labels `["extractor-request","needs-human"]` as "a label no queue code reads".
- **Reason:** the guard's premise held only in a repo where nothing but the queue reads a label -
  this entry's own retire test. In a member a project's tasks read their own labels, and because
  `issue_write` replaces the whole list, the guard made a project's own issue unrelabelable.
- **Actor:** @missingbulb (owner).
- **Model:** Opus 5.5
- **Mechanism:** two guards on `mcp__github__issue_write`'s `labels`, still blocking at PreToolUse:
  a non-`task:` label flags only beside a `task:` label in the same call (a queue filing carrying a
  stray label), and a label named for a queue (queue, queued, backlog, deferred, do-later) flags in
  place of the mark (the #2181 `claudinite-queue` shape). Every other label is the project's.
- **Rejected:** flagging only on `method: create` - a member filing its own `bug` or
  `extractor-request` issue would still be blocked; removing the check - the #2181 shape is still
  silent at filing time and still caught here.
- **Retire when:** the queue reads a label outside the `task:` namespace by name, or a queue-named
  label turns out to be a project's own.

## 2026-10-08 · ported · a `cn` built-in declared check tagged with this pack
- **Reason:** the queue vocabulary and the task surface it guards are the engine's, so the check
  ships with them rather than in the pack: same id, on_fail, finding and fix text, run wherever this
  pack is declared.
- **Actor:** @missingbulb (owner), deciding the restructure.
- **Model:** Claude Opus 5.5 (1M context)
- **Mechanism:** a declared check registered by `cn` under claudinite-tasks; the pack's
  `declared-checks.json` is deleted.
