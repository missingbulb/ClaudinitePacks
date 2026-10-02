## 2026-09-05 · born · the enforcer's config rules, forced for the declaration file (#1667)
- **Source:** the rules-to-skills audit, under the bar the owner set mid-review: a rule leaves
  RULES.md for a skill only where that skill's forced paths cover every moment the rule is needed.
- **Reason:** the three config rules are all needed at exactly one moment, editing the enforcer's
  own declaration, and a forced path predicts that moment exactly.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5.1, per the commit trailer.
- **Mechanism:** a skill carrying the three guidelines, force-loaded on any edit of
  `.claudinite-settings.json`.
- **Landed:** #1667 (Closes #1662) · pack version 60903.2.

## 2026-09-25 · trigger-changed · description cut to the 30-word cap
- **Reason:** the description summarised the method the body already carries; every session paid for
  it.
- **Mechanism:** the description, as before.
- **Actor:** @missingbulb (owner).

## 2026-10-02 · trigger-changed · the skill loads for an edit of `.claudinite/settings.*`
- **Reason:** the Node engine's `.claudinite-settings.json` is not a `cn` member's declaration, which is `.claudinite/settings.{yaml,toml,json}`; the path trigger watched a file the enforcer repo no longer edits once it moves.
- **Actor:** build lead, ClaudiniteEngine#49 (a `cn` member declares itself in `.claudinite/settings.*`; `cn settings import` reads the Node file once, on move day).
- **Mechanism:** `force-load-on-file-edits-paths` names the three `.claudinite/settings.*` spellings, and the description says so. claudinite-fleet-sheepdog 61002.2.
