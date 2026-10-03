## 2026-09-20 · born · Provenance: the mechanism - the grammar, the tool, the checks, the forced skill, the record (#2176)
- **Source:** step 1 of the provenance plan, #2169.
- **Reason:** a person's own rules earn the same record every other pack element gets - why the rule
  reads as it does, and who decided - so the store carries a provenance file per rule beside the
  person's own prose.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5.1, per the commit trailer.
- **Mechanism:** a world check in this pack, advisory, carrying `since: 2026-09-20` so the existing
  unmarked backlog reads as advisory rather than failing the repos that hold a store.
- **Landed:** #2176 (Refs #2169) · pack version 60920.1.

## 2026-09-21 · severity-changed · a person's provenance moved inside their own pack (#2188)
- **Reason:** the sidecar `<path>-provenance/<email>/` existed because the store was flat and could
  hold nothing but `<email>.md`. A person's directory is a pack, so its provenance belongs at
  `provenance/` inside it, like every other pack's.
- **Actor:** @missingbulb (owner).
- **Mechanism:** unchanged carrier and severity. Its scope narrowed to the pack's own RULES.md: a
  person's pack also carries skill bodies and its own provenance files, and reading one of those as
  a rule index would report its every bullet.
- **Landed:** #2188

## 2026-09-25 · scope-changed · judges login-named packs (#2321)
- **Reason:** the store now names directories by GitHub login.
- **Actor:** @missingbulb (owner).
- **Mechanism:** unchanged.
- **Landed:** #2321

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
