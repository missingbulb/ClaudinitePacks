## 2026-10-02 · born · hello 1.4: a scheduled task whose worker runs under cn (ClaudiniteEngine#43)
- **Reason:** the Go engine's task runner runs a pack's worker through its embedded Node runner and
  SDK from chunk 10; the chassis proves a real pack's scheduled task is filed, run, landed and
  converged end to end.
- **Actor:** @missingbulb (owner), through the chunk 10 plan.
- **Mechanism:** `tasks/hello-fold/` (at most daily after any commit, no agent, the secret
  `HELLO_FOLD_SECRET`) writes `HELLO_FOLD.json` through the SDK and opens its pull request, which
  lands under the `hello-generated` merge rule; a copy of the engine's `release/testdata/hello`
  fixture, which the rehearsal's tasks mode drives.
- **Landed:** pending.
