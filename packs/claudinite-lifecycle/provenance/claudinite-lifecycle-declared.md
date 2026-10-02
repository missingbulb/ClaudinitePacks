## 2026-08-14 · born · a member that has lost this pack's declaration (#836)
- **Reason:** the third state neither the dependency edge nor the seed record covers: an entry
  deleted by hand in a repo whose other packs still hold the declaration open. It reports; it cannot
  rescue.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** a coded rule in this pack, advisory to start on the conformance-workflow precedent,
  because blocking would have turned every member red on its very next converge, before the seed
  record reached it.
- **Landed:** #836 (Closes #835, phase 1).

## 2026-08-15 · severity-changed · the declaration check goes blocking (#844)
- **Reason:** the seed record has reached the fleet, so the advisory grace the rule shipped under
  has done its job.
- **Actor:** @missingbulb (owner).
- **Mechanism:** the rule's severity alone; nothing about what it reads changes.
- **Landed:** #844.

## 2026-08-16 · converted · into a declared check (#891)
- **Actor:** @missingbulb (owner).
- **Mechanism:** a `requireValueInArray` row in this pack's `declared-checks.json`, reading the
  member's own declaration for this pack's entry.
- **Landed:** #891.

## 2026-08-19 · reworded · the check id follows the pack's rename (#1029)
- **Reason:** the id named the pack, so it could not survive the rename. Worth its own record: a
  check id appears in members' `accept` lists and no alias facility exists for one, so this was a
  real vocabulary change made only because the rule is blocking-critical and not meaningfully
  waivable.
- **Actor:** @missingbulb (owner).
- **Landed:** #1029 (Closes #1022) · pack version 8.

## 2026-09-22 · policy-changed · one settings-file name, now the rename's window has passed (#1919)
- **Reason:** `.claudinite-checks.json` was read everywhere beside `.claudinite-settings.json` while
  members converged onto the new name, and every reader that asked "is this the declaration" carried
  its own copy of the two-name loop. The convergence window `legacy-shape-in-use` opened has passed,
  so each of those readers now names one file. A member still carrying the retired name reads as
  having no declaration at all - the stated cost of the retirement, and why its policy is nothing.
- **Mechanism:** the reader takes `SETTINGS_FILE` rather than iterating `SETTINGS_FILES`, which is
  now a one-element list kept only as a link-time shim for fielded pack versions (#1911).
- **Actor:** claudinite/engine implement-request run, rebased and reconciled in an owner session.
- **Model:** claude-opus-5
- **Landed:** #1919

## 2026-09-25 · reworded · `severity: blocking|advisory` is spelled `on_fail: block|advise`
- **Reason:** owner decision, 2026-09-25: the field names what happens when the check fails, and
  *severity* keeps its impact sense; what this element enforces is unchanged.
- **Actor:** @missingbulb (owner).

## 2026-10-02 · scope-changed · the check reads `packs.declared` in `.claudinite/settings.*`
- **Reason:** the Node engine's `.claudinite-settings.json` is not a `cn` member's declaration, which is `.claudinite/settings.{yaml,toml,json}`; the check parsed a file a `cn` member never holds, so it could not fire.
- **Actor:** build lead, ClaudiniteEngine#49 (a `cn` member declares itself in `.claudinite/settings.*`; `cn settings import` reads the Node file once, on move day).
- **Mechanism:** `checkParsedFiles` over `filesMatching` the three spellings at `packs.declared`, entry objects counted by `id`; `cn` parses all three formats. The pack's test fires it on each format lacking the entry and holds it silent on each declaring it. claudinite-lifecycle 61002.4.
