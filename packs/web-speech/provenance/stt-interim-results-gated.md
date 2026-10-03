## 2026-09-05 · born · converted from references.md (check:stt-interim-results-gated)
- **Reason:** Interim hypotheses arrive on the same `result` event as the finished utterance, so
  enabling `interimResults` does not open a second channel — only `isFinal` distinguishes a guess
  from a transcript. A handler that delivers without gating hands the caller a half-heard fragment,
  then the next, several times per utterance: the `"heart heart"` shape.
- **Mechanism:** a check
- **Retire when:** Reaffirm while interim and final share one event; retire if the API separates
  them.

## 2026-09-25 · reworded · `severity: blocking|advisory` is spelled `on_fail: block|advise`
- **Reason:** owner decision, 2026-09-25: the field names what happens when the check fails, and
  *severity* keeps its impact sense; what this element enforces is unchanged.
- **Actor:** @missingbulb (owner).

## 2026-10-03 · moved · Ported to Go (missingbulb/ClaudiniteEngine#68)
- **Reason:** the Go engine runs a pack's coded checks from its `checks/` directory, built against
  the SDK, so the check is rewritten in Go with its `on_fail`, `why`, `doc` and finding text
  unchanged, and the `.mjs` with its import of the Node engine is removed.
- **Actor:** @missingbulb (owner), through the chunk 17 plan (ClaudinitePacks#30 T2).
- **Mechanism:** `packs/web-speech/checks/stt.go`, unit-tested beside it through the SDK's fake
  engine, run through `cn check --pack web-speech` by `test/`, and compared with the Node engine by
  ClaudiniteEngine's parity harness.
- **Landed:** pending.
