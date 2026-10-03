## 2026-07-23 · born · Add leaflet pack (distilled from EdFringeNow) (#403)
- **Source:** EdFringeNow's `index.html`, which pinned and hashed `leaflet@1.9.4` core yet loaded
  `leaflet.markercluster@1.5.3` with no `integrity` attribute; the inconsistency is the lesson.
- **Actor:** the weekly pack-discovery run, merged by @missingbulb (owner).
- **Model:** Claude Opus 4.8, per the commit trailer.
- **Mechanism:** a `RULES.md` rule.
- **Landed:** #403 (Refs #303) · pack version 1.

## 2026-07-28 · converted · the CDN pin and SRI rule becomes a check (#510)
- **Reason:** what the rule constrains - the CDN wiring of the assets - is written into the page's
  own `<script>` and `<link>` tags, a static signature a post-hoc scan sees directly, with nothing
  in-flight or judgment about it.
- **Actor:** the daily prose-to-checks sweep run, merged by @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** a check-the-world rule reading each tag's own attributes, so only a tag whose own
  `src`/`href` is a remote URL naming a Leaflet asset is judged and the finding names which of pin,
  `integrity` or `crossorigin` is missing. Deletion test: the prose bullet goes whole, the failure
  message owning the rule with a `doc:` back to the pack.
- **Rejected:** grepping for the CDN host or for a missing `integrity`, which answers a question
  about the file rather than about the one tag the rule is about.
- **Landed:** #510 (Refs #504, #450) · pack version 1.

## 2026-09-25 · reworded · `severity: blocking|advisory` is spelled `on_fail: block|advise`
- **Reason:** owner decision, 2026-09-25: the field names what happens when the check fails, and
  *severity* keeps its impact sense; what this element enforces is unchanged.
- **Actor:** @missingbulb (owner).

## 2026-10-03 · moved · Ported to Go (missingbulb/ClaudiniteEngine#68)
- **Reason:** the Go engine runs a pack's coded checks from its `checks/` directory, built against
  the SDK, so the check is rewritten in Go with its `on_fail`, `why`, `doc` and finding text
  unchanged, and the `.mjs` with its import of the Node engine is removed.
- **Actor:** @missingbulb (owner), through the chunk 17 plan (ClaudinitePacks#30 T2).
- **Mechanism:** `packs/leaflet/checks/asset_integrity.go`, unit-tested beside it through the SDK's
  fake engine, run through `cn check --pack leaflet` by `test/`, and compared with the Node engine
  by ClaudiniteEngine's parity harness.
- **Landed:** pending.
