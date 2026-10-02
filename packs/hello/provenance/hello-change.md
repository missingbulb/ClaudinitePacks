## 2026-10-02 · born · hello 1.3: a Go check that reads the change through the SDK (ClaudiniteEngine#39)
- **Reason:** a pack's Go checks call back to the engine from chunk 8; the chassis proves the call
  reaches a real pack's check end to end.
- **Actor:** @missingbulb (owner), through the chunk 8 plan.
- **Mechanism:** `checks/change.go` advises on every file the change adds under `HELLO_CHANGED/`,
  read through `ChangedFiles` and `AddedLines`, a copy of the engine's `release/testdata/hello`
  fixture, which the rehearsal's packs mode drives (step 20).
- **Landed:** pending.
