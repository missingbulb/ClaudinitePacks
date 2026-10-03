## 2026-09-05 · born · converted from references.md (check:mic-capture-released)
- **Reason:** A `getUserMedia` stream is freed only by stopping its tracks: dropping the reference,
  closing an `AudioContext` or unsetting a `srcObject` frees nothing, and both the browser's
  recording indicator and the OS microphone indicator stay lit. On a voice app that is the most
  alarming possible bug — it looks to the user like the app is still listening. File-scoped rather
  than flow-scoped on purpose: proving a particular stream is stopped needs real data-flow analysis,
  and a check that guesses is worse than one asking an honest question.
- **Mechanism:** a check
- **Retire when:** Reaffirm while track-stopping is the only release; retire if streams gain
  deterministic collection.

## 2026-09-25 · reworded · `severity: blocking|advisory` is spelled `on_fail: block|advise`
- **Reason:** owner decision, 2026-09-25: the field names what happens when the check fails, and
  *severity* keeps its impact sense; what this element enforces is unchanged.
- **Actor:** @missingbulb (owner).

## 2026-10-03 · moved · Ported to Go (missingbulb/ClaudiniteEngine#68)
- **Reason:** the Go engine runs a pack's coded checks from its `checks/` directory, built against
  the SDK, so the check is rewritten in Go with its `on_fail`, `why`, `doc` and finding text
  unchanged, and the `.mjs` with its import of the Node engine is removed.
- **Actor:** @missingbulb (owner), through the chunk 17 plan (ClaudinitePacks#30 T2).
- **Mechanism:** `packs/web-speech/checks/mic.go`, unit-tested beside it through the SDK's fake
  engine, run through `cn check --pack web-speech` by `test/`, and compared with the Node engine by
  ClaudiniteEngine's parity harness.
- **Landed:** pending.
