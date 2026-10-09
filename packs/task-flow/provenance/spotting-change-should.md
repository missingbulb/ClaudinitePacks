## 2026-08-20 · born · /do-later - defer a change into a chained, blocked request run (#1082)
- **Reason:** a follow-up spotted mid-session had nowhere to go: implementing it derails the
  session, and an ordinary issue waits for somebody to remember it.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** a RULES.md rule, triggered on "Spotting a change that should wait until the work in
  flight lands".
- **Landed:** #1082 · pack version 12.

## 2026-10-08 · moved · from basics' RULES.md into task-flow's
- **Reason:** its subject is filing, deferring, sequencing or verifying work through the queue or a
  migration plan, task-flow's; the text is unchanged.
- **Actor:** @missingbulb (owner), deciding the restructure.
- **Model:** Claude Opus 5.5 (1M context)
- **Mechanism:** a rule in task-flow's `RULES.md`, injected wherever task-flow is declared.
