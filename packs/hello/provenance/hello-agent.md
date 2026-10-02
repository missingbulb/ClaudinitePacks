## 2026-10-02 · born · hello 1.4: a request task handed to a routine (ClaudiniteEngine#43)
- **Reason:** the executor's hand-off — the item grant, the routine fire with its nonce, the
  session's `cn work validate` and `cn work converge` — needs a real pack's agentic task to prove it.
- **Actor:** @missingbulb (owner), through the chunk 10 plan.
- **Mechanism:** `tasks/hello-agent/` (on request, `automerge` nothing, a `task.md` that validates
  and converges); the pack declares the `createComment` and `openPr` GitHub actions. A copy of the
  engine's `release/testdata/hello` fixture, which the rehearsal's tasks mode drives with a stub
  agent in place of the routine.
- **Landed:** pending.
