## 2026-08-31 · born · An ad-hoc item may only ask for work the run can do here (#1521)
- **Reason:** #1349, #1351 and #1396 each named a member repo and each parked on a scope denial
  minutes after the queue picked it.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** a RULES.md rule, triggered on "Filing anything into the ad-hoc queue".
- **Rejected:** routing an unreachable artifact to a human-step form, which invites the filing the
  gate exists to suppress.
- **Landed:** #1521 · pack version 60831.4.

## 2026-08-31 · reworded · Coded production validations: URL probes judged as code-work (#1534)
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5, per the commit trailer.
- **Landed:** #1534 · pack version 60831.6.

## 2026-10-08 · moved · from basics' RULES.md into task-flow's
- **Reason:** its subject is filing, deferring, sequencing or verifying work through the queue or a
  migration plan, task-flow's; the text is unchanged.
- **Actor:** @missingbulb (owner), deciding the restructure.
- **Model:** Claude Opus 5.5 (1M context)
- **Mechanism:** a rule in task-flow's `RULES.md`, injected wherever task-flow is declared.
