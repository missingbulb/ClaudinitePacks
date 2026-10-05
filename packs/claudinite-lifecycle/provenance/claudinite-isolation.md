## 2026-07-18 · born · a member may not reference the mount outside the wiring set (#320)
- **Source:** phase 1 of the vendored-mount design.
- **Reason:** the mount is a tree the vendor writer rebuilds whole, so a reference to it from
  anywhere but the wiring set is a dependency on a file that can vanish under the repo.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** a coded rule in the `basics` pack composed on the barrier engine, gated on
  `.claudinite/shared/` existing so it is inert in the canon and in every pre-flip consumer, and
  arms per repo as the flip lands.
- **Landed:** #320.

## 2026-08-14 · converted · the isolation wall becomes a declared check here (#839)
- **Reason:** the three fixed barriers were one mechanism with a fixed reference graph, which the
  declared vocabulary's `forbidReferences` carries directly; the scan engine moves into the engine
  helper both the declaration and the per-repo config rule read.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5, per the commit trailer.
- **Mechanism:** a `forbidReferences` row in this pack's `declared-checks.json`, findings
  byte-identical to the coded rule's apart from the `doc` field a declared check drops.
- **Landed:** #839 (Refs #838).

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

## 2026-10-02 · reworded · an acceptance goes under `checks.accept`
- **Reason:** the Node engine's `.claudinite-settings.json` is not a `cn` member's declaration, which is `.claudinite/settings.{yaml,toml,json}`; the `fix` named the Node file for an acceptance. The Node file stays in `except`: a half-moved member still holds it, and its acceptances name `.claudinite/` paths, so dropping it would break `claudinite-isolation` there. It leaves with the legacy shapes, at missingbulb/ClaudiniteEngine#50, which the `reason` names.
- **Actor:** build lead, ClaudiniteEngine#49 (a `cn` member declares itself in `.claudinite/settings.*`; `cn settings import` reads the Node file once, on move day), on review.
- **Mechanism:** the `fix` names `checks.accept` in `.claudinite/settings.yaml`; `except` is unchanged and its `reason` names the retire issue. claudinite-lifecycle 61002.4.

## 2026-10-05 · scope-changed · the member's own local packs are not the mount
- **Reason:** the barrier bars all of `.claudinite/` to keep consumer files off the vendored mount, but `.claudinite/local/` holds the member's own packs, which its docs rightly link to. Moving GoogleCalendarEventCreator to `cn` showed 29 such links reported as blocking, a crossing the Node rule also reported but no CI there ran.
- **Mechanism:** `"allow": [".claudinite/local"]` on the `forbidReferences` row, so a reference resolving under it is open; references to `.claudinite/shared/` and the rest of the barred folder still fire.
- **Actor:** @missingbulb (owner), choosing to fix the rule rather than accept the findings.
- **Model:** Claude, per the commit trailer.
