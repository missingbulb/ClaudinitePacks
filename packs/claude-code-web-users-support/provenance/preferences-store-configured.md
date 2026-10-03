## 2026-08-08 · born · Personal preferences as a pack, and one general primitive: a pack's own session-start step (#567)
- **Reason:** the pack is seeded by default and carries an address rather than content, so a repo
  can declare it and never answer the adoption question - leaving the feature silently inert with
  nothing saying so.
- **Actor:** @missingbulb (owner).
- **Mechanism:** a world check, advisory: the loss is a nicety no other check or task depends on,
  and nothing here may block a session.
- **Landed:** #567 · pack version 1.

## 2026-09-21 · reworded · it reads the store's address from its new home (#2189)
- **Reason:** the address resolver moved from `store.mjs` to `user_pack_address.mjs`; the check's
  own judgment is unchanged.
- **Actor:** @missingbulb (owner).
- **Landed:** #2189

## 2026-09-25 · reworded · `severity: blocking|advisory` is spelled `on_fail: block|advise`
- **Reason:** owner decision, 2026-09-25: the field names what happens when the check fails, and
  *severity* keeps its impact sense; what this element enforces is unchanged.
- **Actor:** @missingbulb (owner).

## 2026-10-03 · moved · Ported to Go (missingbulb/ClaudiniteEngine#68)
- **Reason:** the Go engine runs a pack's coded checks from its `checks/` directory, built against
  the SDK, so the check is rewritten in Go with its `on_fail`, `why`, `doc` and finding text
  unchanged, and the `.mjs` with its import of the Node engine is removed.
- **Actor:** @missingbulb (owner), through the chunk 17 plan (ClaudinitePacks#30 T2).
- **Mechanism:** `packs/claude-code-web-users-support/checks/checks.go`, unit-tested beside it
  through the SDK's fake engine, run through `cn check --pack claude-code-web-users-support` by
  `test/`, and compared with the Node engine by ClaudiniteEngine's parity harness.
- **Landed:** pending.
