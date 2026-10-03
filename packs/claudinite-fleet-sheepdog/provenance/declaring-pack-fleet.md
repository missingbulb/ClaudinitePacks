## 2026-08-17 · born · declaring a pack this fleet also seeds (#958)
- **Source:** the pack's RULES.md rewrite from description into instructions, stating in prose what
  `fleet-pack-seed-agrees` checks.
- **Reason:** agreement is compared literally, because nothing in this pack may know what one pack's
  absent key means, so every default is spelled out on both sides.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Mechanism:** a RULES.md rule, triggered on "Declaring a pack this fleet also seeds".
- **Landed:** #958 (Closes #954).

## 2026-09-05 · moved · out of RULES.md into the configuring-the-fleet skill (#1667)
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5.1, per the commit trailer.
- **Mechanism:** a guideline of the `configuring-the-fleet` skill, which is force-loaded on any edit
  of `.claudinite-settings.json`; the rule's own text is unchanged.
- **Landed:** #1667 (Closes #1662) · pack version 60903.2.

## 2026-10-03 · reworded · the check is named by its id, `fleet-pack-seed-agrees`
- **Reason:** `seeds-agree` was the Node world rule's file name, which goes with the rule; the engine's built-in carries the id.
- **Actor:** build lead, ClaudiniteEngine#61.
- **Model:** Claude Opus 5.5 (1M context)
- **Mechanism:** the skill guideline's text; what it asks is unchanged.
