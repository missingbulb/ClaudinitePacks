## 2026-09-18 · born · Rebuild github-pages as a nightly release task over one deploy workflow (#2101)
- **Source:** `static-website`'s `sw/site-config`, which held the same config from #611; the config
  and its check stay with the pack that builds and publishes.
- **Reason:** the publish set is deliberately additive, and the check makes the cost of that choice
  survivable. Additive inverts the failure: a forgotten entry is a missing page, and the check
  catches a path that matches nothing tracked, a tooling directory in the set and a set with no
  `index.html` before any of them reaches the default branch.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, Claude Fable 5.1, per the commit trailers.
- **Mechanism:** a check, blocking at high severity, relevant on either of two independent signals,
  the site config or the vendored deploy workflow: gating on the config alone would let a repo that
  vendored the workflow and never wrote its config pass silently, which is the one case this check
  exists to report.
- **Rejected:** publishing the repo except the tooling, which publishes every draft, note and key
  nobody thought to exclude, and publishes each new one silently the day it lands.
- **Retire when:** the artifact stops being built from an explicit list.
- **Landed:** #2101 · pack version 60917.1.

## 2026-09-25 · reworded · `severity: blocking|advisory` is spelled `on_fail: block|advise`
- **Reason:** owner decision, 2026-09-25: the field names what happens when the check fails, and
  *severity* keeps its impact sense; what this element enforces is unchanged.
- **Actor:** @missingbulb (owner).

## 2026-10-03 · moved · Ported to Go (missingbulb/ClaudiniteEngine#68)
- **Reason:** the Go engine runs a pack's coded checks from its `checks/` directory, built against
  the SDK, so the check is rewritten in Go with its `on_fail`, `why`, `doc` and finding text
  unchanged, and the `.mjs` with its import of the Node engine is removed. The Go SDK's check ids
  are lowercase letters, digits and dashes, so `gp/site-config` is `site-config`, and this file
  moves from `gp-site-config.md` to match.
- **Actor:** @missingbulb (owner), through the chunk 17 plan (ClaudinitePacks#30 T2).
- **Mechanism:** `packs/github-pages/checks/site_config.go`, unit-tested beside it through the SDK's
  fake engine, run through `cn check --pack github-pages` by `test/`, and compared with the Node
  engine by ClaudiniteEngine's parity harness.
- **Landed:** pending.
