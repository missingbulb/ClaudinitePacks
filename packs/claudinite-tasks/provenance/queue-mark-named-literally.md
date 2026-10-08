## 2026-09-22 · born · the instruction that files queue work names its label
- **Source:** five instruction sites said "marked for the queue" or "a tagged <something>-backlog
  issue" and named no label; the labels sessions invented at each are the ones found on this repo's
  issues.
- **Reason:** a reader who is told to mark an issue and not told the spelling picks one, so the
  fuzzy instruction is the cause and the invented label only the symptom.
- **Actor:** @missingbulb (owner).
- **Model:** Opus 5
- **Mechanism:** a line match over pack prose: `RULES.md`, `SKILL.md`, `task.md` in both roots,
  cleared by naming `task:origin:` on the line, so the remedy is the literal the reader needed.

## 2026-09-25 · reworded · `severity: blocking|advisory` is spelled `on_fail: block|advise`
- **Reason:** owner decision, 2026-09-25: the field names what happens when the check fails, and
  *severity* keeps its impact sense; what this element enforces is unchanged.
- **Actor:** @missingbulb (owner).

## 2026-10-08 · ported · a `cn` built-in declared check tagged with this pack
- **Reason:** the queue vocabulary and the task surface it guards are the engine's, so the check
  ships with them rather than in the pack: same id, on_fail, finding and fix text, run wherever this
  pack is declared.
- **Actor:** @missingbulb (owner), deciding the restructure.
- **Model:** Claude Opus 5.5 (1M context)
- **Mechanism:** a declared check registered by `cn` under claudinite-tasks; the pack's
  `declared-checks.json` is deleted.
