## 2026-08-10 · born · the fit sweep becomes a parameterised add-packs task (#741)
- **Source:** the `fleet-fit` sweep, which answered only "what might a member want that it does not
  declare", by fingerprint, weekly.
- **Reason:** the owner's other question has the same shape and had no home: put this pack on these
  repos, with this config, now. Both questions share their second stage entirely, so a second task
  would have duplicated the agent stage only to change the work list's provenance.
- **Actor:** @missingbulb (owner).
- **Mechanism:** one task with parameters and no defaults, each call site stating what it wants in
  full: the weekly run on the command line, a forced run through the scheduler's override bag.
  `all-covered-members` is a keyword a caller sends, so no call site can reach the whole fleet by
  omission, and a force refuses outright on an unknown pack id, a non-member target, the fleet
  keyword, or an unanswered interview question.
- **Landed:** #741.

## 2026-08-22 · reworded · the canon clone is disposed through the shared tree delete (#1222)
- **Reason:** the `ENOTEMPTY` race on a temp `.git` had been closed three times and come back twice,
  because each fix repaired the one call site that happened to fail while every other site kept
  spelling its own bare delete.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Landed:** #1222 (Closes #1219) · pack version 60822.1.

## 2026-09-13 · policy-changed · the fit sweep honours the ignore list (#1976)
- **Reason:** the sweep never consulted `exclude` at all, so a repo the fleet was told to leave
  alone could still be fingerprinted and handed a work-list issue. A force naming one is now refused
  rather than written around.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Mechanism:** the ignore list is read in the fit sweep's own walk, before a declaration is.
- **Landed:** #1976 (Closes #1975) · pack version 60913.1.

## 2026-09-22 · converted · The work step is declared as `code_worker_mjs` and the runner wraps it
- **Reason:** every worker re-implemented the same wrapping - the environment parsed by hand, the
  exit code, the failure line, the elapsed time, the agent-request file - and each copy was free to
  get it slightly differently wrong. The runner already owns the subprocess, so it owns the entry
  point: the module exports `worker(params)` and holds the work and nothing else.
- **Mechanism:** `code_worker_mjs` names the module beside the declaration; the executor spawns
  `claudinite-tasks`' own `worker-entry.mjs` around it, hands the module the parsed `CLAUDINITE_*`
  bag (the task's declared secrets and the Action token among it) and renders the verdict it returns
  into the queue's triage, requeue and agent-request protocol. No behaviour of the task changes: the
  same work runs, exits the same way and prints the same markers.
- **Actor:** @missingbulb (owner), who asked why every task re-implements one runner's job.
- **Model:** Opus 5

## 2026-09-27 · policy-changed · the fit sweep judges a pack's `relevanceDetector`
- **Reason:** fingerprints became data, so the remote sweep reads only the files a relevance detector's paths
  name, rather than probing a function for what it asks.
- **Actor:** @missingbulb (owner).
- **Mechanism:** fingerprint-fit.mjs and remote-context.mjs evaluate `relevanceDetector`; the budget still
  turns an over-wide read into undecided.

## 2026-10-03 · ported · the sweep is `cn fleet add-packs`, fingerprinting against the shelf's catalog
- **Reason:** the worker and its modules imported the Node engine and fingerprinted against a scratch clone of `canonRepo`; `cn` has no canon to clone, so the corpus is the shelf's signed `catalog.json` (every pack's newest version on this repo's channel, with its `relevanceDetector` and its adoption questions), and the work-list protocol is unchanged on the wire.
- **Actor:** build lead, ClaudiniteEngine#61.
- **Model:** Claude Opus 5.5 (1M context)
- **Mechanism:** the task's `code_work`, `cn fleet add-packs --scan-for-needed-packs=true --repos=all-covered-members`, with `FLEET_GITHUB_TOKEN` its declared secret; a forced item's Context overrides each parameter.

## 2026-10-03 · policy-changed · each member is fingerprinted on its own channel
- **Reason:** the corpus was the catalog as the enforcer's own channel saw it, so a stable enforcer measured a canary member against packs its update would never deliver, and a canary pack was offered to no one unless the enforcer itself went canary. A member is now offered exactly what its own update delivers, the channel its freshness is already judged on; the floor and a force's id check read every id either channel offers. A documented `channel: canary` on the enforcer was the alternative, rejected because it makes the enforcer's own update canary to make a scan work.
- **Actor:** build lead, ClaudiniteEngine#65.
- **Model:** Claude Opus 5.5 (1M context)
- **Mechanism:** `cn fleet add-packs` reading the catalog per member; its count line names both channels.

## 2026-10-08 · reworded · the work-list issue is unlabelled
- **Reason:** the owner dropped `add-packs` from the approved labels; the converged titles already key the work lists.
- **Actor:** @missingbulb (owner), approving a closed list of labels canon packs may write.
- **Model:** Claude Opus 5.5 (1M context)
