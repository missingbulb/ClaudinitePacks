## 2026-09-05 · born · converted from references.md (check:tts-speak-settles)
- **Reason:** Both engines end an utterance in more ways than "it finished": `chrome.tts` reports
  `interrupted` whenever a later `speak()` with `enqueue: false` displaces it and `cancelled` when
  it is dropped before starting, and `speechSynthesis` reports a failed utterance through `error`
  and never through `end`. In any app that can speak twice or stop early those are the common path,
  not edge cases, so a handler resolving on `end` alone leaves the awaiting caller pending forever
  with nothing thrown and nothing logged.
- **Mechanism:** a check
- **Retire when:** Reaffirm while the terminal-event sets stand; retire if either engine collapses
  them into one.

## 2026-09-25 · reworded · `severity: blocking|advisory` is spelled `on_fail: block|advise`
- **Reason:** owner decision, 2026-09-25: the field names what happens when the check fails, and
  *severity* keeps its impact sense; what this element enforces is unchanged.
- **Actor:** @missingbulb (owner).

## 2026-10-03 · moved · Ported to Go (missingbulb/ClaudiniteEngine#68)
- **Reason:** the Go engine runs a pack's coded checks from its `checks/` directory, built against
  the SDK, so the check is rewritten in Go with its `on_fail`, `why`, `doc` and finding text
  unchanged, and the `.mjs` with its import of the Node engine is removed.
- **Actor:** @missingbulb (owner), through the chunk 17 plan (ClaudinitePacks#30 T2).
- **Mechanism:** `packs/web-speech/checks/tts.go`, unit-tested beside it through the SDK's fake
  engine, run through `cn check --pack web-speech` by `test/`, and compared with the Node engine by
  ClaudiniteEngine's parity harness.
- **Landed:** pending.
