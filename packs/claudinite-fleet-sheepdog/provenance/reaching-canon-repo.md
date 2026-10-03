## 2026-10-03 · born · `canonRepo` is no longer read
- **Reason:** `cn` measures freshness by what each member's own update would move it to and fingerprints against the shelf's signed catalog, so the freshness sweep's one knob has nothing left to name; an entry still carrying it is read and ignored, and a session tuning it would be tuning nothing.
- **Actor:** build lead, ClaudiniteEngine#61.
- **Model:** Claude Opus 5.5 (1M context)
- **Mechanism:** a guideline of the `configuring-the-fleet` skill, force-loaded on an edit of the enforcer's declaration.
