## 2026-09-05 · born · converted from references.md (check:synthetic-input-events-bubble)
- **Reason:** `bubbles` defaults to **false** on every DOM event constructor, and a host app handles
  input by delegation from one listener near its own root, so a non-bubbling synthetic event never
  arrives. `dispatchEvent` still returns true, nothing throws and nothing logs — the page simply
  does not respond, which reads as "the app ignores untrusted events" and is an expensive conclusion
  to back out of.
- **Mechanism:** a check
- **Retire when:** Reaffirm while the DOM constructor default stands; retire if it changes or if
  delegation stops being the norm.

## 2026-09-25 · reworded · `severity: blocking|advisory` is spelled `on_fail: block|advise`
- **Reason:** owner decision, 2026-09-25: the field names what happens when the check fails, and
  *severity* keeps its impact sense; what this element enforces is unchanged.
- **Actor:** @missingbulb (owner).

## 2026-10-03 · moved · Ported to Go (missingbulb/ClaudiniteEngine#68)
- **Reason:** the Go engine runs a pack's coded checks from its `checks/` directory, built against
  the SDK, so the check is rewritten in Go with its `on_fail`, `why`, `doc` and finding text
  unchanged, and the `.mjs` with its import of the Node engine is removed.
- **Actor:** @missingbulb (owner), through the chunk 17 plan (ClaudinitePacks#30 T2).
- **Mechanism:** `packs/host-page/checks/checks.go`, unit-tested beside it through the SDK's fake
  engine, run through `cn check --pack host-page` by `test/`, and compared with the Node engine by
  ClaudiniteEngine's parity harness.
- **Landed:** pending.
