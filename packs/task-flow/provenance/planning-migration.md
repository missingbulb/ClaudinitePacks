## 2026-08-07 · born · basics: minimize task shelf-life - watch changes work now, never "check tomorrow" (#684)
- **Source:** an owner process change, 2026-08-07.
- **Reason:** the same shelf-life yardstick: a design that trickles across nightly cycles keeps the
  migration open for as long as the slowest straggler.
- **Actor:** @missingbulb (owner).
- **Mechanism:** prose; see `finishing-change`.
- **Landed:** #684.

## 2026-08-12 · reworded · Rewrite RULES.md as situation-keyed rules, and write down the method (#760)
- **Actor:** @missingbulb (owner).
- **Mechanism:** a RULES.md rule, triggered on "Planning a migration".
- **Landed:** #760, closing #759 · pack version 1.

## 2026-08-17 · reworded · Add writing-migration-plans skill to basics (#932)
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Landed:** #932 · pack version 3.

## 2026-08-21 · reworded · Migration plans run as a chain, not a checklist (#1156)
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Landed:** #1156 · pack version 60821.2.

## 2026-10-08 · moved · from basics' RULES.md into task-flow's
- **Reason:** its subject is filing, deferring, sequencing or verifying work through the queue or a
  migration plan, task-flow's; the text is unchanged.
- **Actor:** @missingbulb (owner), deciding the restructure.
- **Model:** Claude Opus 5.5 (1M context)
- **Mechanism:** a rule in task-flow's `RULES.md`, injected wherever task-flow is declared.
