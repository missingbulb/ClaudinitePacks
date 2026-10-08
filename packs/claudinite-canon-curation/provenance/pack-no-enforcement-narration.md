## 2026-07-19 · born · google-identity: prose to skill-owned checks, enforcement-silent canon docs (#350)
- **Reason:** a doc that narrates its own enforcement duplicates the mechanism and springs the drift
  trap: checks run on their own at every Stop and in CI, and each failure message already carries
  its rule.
- **Actor:** @missingbulb (owner).
- **Mechanism:** a coded check over the file each `pack.mjs` declares as prose - it must not tell
  the reader to run the checks runner nor name a rule the pack's own modules define. Gated to the
  canon home by declaration.
- **Landed:** #350 (Refs #303).

## 2026-09-25 · reworded · `severity: blocking|advisory` is spelled `on_fail: block|advise`
- **Reason:** owner decision, 2026-09-25: the field names what happens when the check fails, and
  *severity* keeps its impact sense; what this element enforces is unchanged.
- **Actor:** @missingbulb (owner).

## 2026-09-28 · scope-changed · reads a pack.json manifest as well as a pack.mjs
- **Reason:** a manifest may now be data, pack.json preferred, and this element selected manifests
  by the pack.mjs name alone.
- **Actor:** @missingbulb (owner), asking for pack.json manifests.
- **Mechanism:** unchanged carrier; its path and field patterns name both spellings.

## 2026-10-03 · moved · the check is an engine built-in
- **Reason:** cn runs no pack JavaScript checks, and the check's code reads the engine's own rule
  shapes (ClaudiniteEngine#68 Q1, code to the engine).
- **Actor:** Claude, ClaudinitePacks#30 T3.
- **Model:** Claude Opus 5.5
- **Mechanism:** cn's built-in, active where this pack is declared.

## 2026-10-07 · moved · the check is a Go check in the pack again
- **Reason:** owner decision, 2026-10-07: canon curation is a pack, so its functionality lives in
  the pack; a check that polices only a canon's shelf is the pack's, and `cn` keeps only checks of
  what the engine itself runs.
- **Actor:** @missingbulb (owner).
- **Mechanism:** a world-scoped Go check in the pack's `checks/`, same id, `on_fail` and finding
  text, active where the pack is declared; the small engine readers it borrowed are re-implemented
  beside it.

## 2026-10-08 · retired · dropped with the move out of the engine
- **Reason:** owner decision, 2026-10-08, on review of the move: it guarded nothing live, since no `pack.json` names a prose file the way it reads one, so it could not fire on the shelf.
- **Actor:** @missingbulb (owner).
- **Mechanism:** none; the Go check and its tests are deleted.
