## 2026-09-13 · born · Add the cloudflare-site pack: serving a static site from Cloudflare (#1982)
- **Source:** ClaudiniteWebsite's local pack, where this deployment existed as one repo's own
  machinery, generalized onto the shelf (Closes #1981).
- **Reason:** `assets.directory` is the only boundary between the published site and the repo
  holding the vendored mount, the packs and the queue's workers. Widening it to the repo root
  publishes all of that to a public URL, and the deploy reports success either way.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Mechanism:** a check, blocking at critical severity, on the wrangler config the pack
  fingerprints on.
- **Retire when:** a Cloudflare deployment gains a second, independent statement of what is
  uploaded.
- **Landed:** #1982 (Closes #1981) · pack version 60913.1.

## 2026-09-25 · reworded · `severity: blocking|advisory` is spelled `on_fail: block|advise`
- **Reason:** owner decision, 2026-09-25: the field names what happens when the check fails, and
  *severity* keeps its impact sense; what this element enforces is unchanged.
- **Actor:** @missingbulb (owner).

## 2026-10-03 · moved · Ported to Go (missingbulb/ClaudiniteEngine#68)
- **Reason:** the Go engine runs a pack's coded checks from its `checks/` directory, built against
  the SDK, so the check is rewritten in Go with its `on_fail`, `why`, `doc` and finding text
  unchanged, and the `.mjs` with its import of the Node engine is removed.
- **Actor:** @missingbulb (owner), through the chunk 17 plan (ClaudinitePacks#30 T2).
- **Mechanism:** `packs/cloudflare-site/checks/checks.go`, unit-tested beside it through the SDK's
  fake engine, run through `cn check --pack cloudflare-site` by `test/`, and compared with the Node
  engine by ClaudiniteEngine's parity harness.
- **Landed:** pending.
