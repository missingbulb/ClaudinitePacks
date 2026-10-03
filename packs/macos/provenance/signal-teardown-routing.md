## 2026-08-12 · born · an AppKit app with a capture tap must route the terminating signals (#756)
- **Source:** missingbulb/LaughCounter, a SwiftPM menu-bar agent app published as a notarized DMG
  through GitHub Actions: its `mac/scripts/`, `mac/Resources/`, release workflow and
  `dev/procedures/mac-audio-lifecycle.md`.
- **Reason:** the rule is itself conditional, so the gate is false-positive-free: the check fires
  only on an AppKit app that installs a capture tap, three arms covering nothing routed, a signal
  named nowhere, and `SIG_IGN` ordered after `resume()`. `sigaction` and a direct `signal(SIGTERM,
  ...)` both count as routing; a command-line tool and a tapless app are out of scope by the gate.
  The prose bullet beside it was kept rather than deleted, since it also carries the residual risk
  and the NSException exit path.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Mechanism:** a coded check, `packs/macos/signal-teardown-routing.mjs`, blocking, scanning
  `*.swift` anywhere with comments stripped rather than assuming a `mac/` layout.
- **Landed:** #756 (Closes #641) · pack version 1.

## 2026-09-25 · reworded · `severity: blocking|advisory` is spelled `on_fail: block|advise`
- **Reason:** owner decision, 2026-09-25: the field names what happens when the check fails, and
  *severity* keeps its impact sense; what this element enforces is unchanged.
- **Actor:** @missingbulb (owner).

## 2026-10-03 · moved · Ported to Go (missingbulb/ClaudiniteEngine#68)
- **Reason:** the Go engine runs a pack's coded checks from its `checks/` directory, built against
  the SDK, so the check is rewritten in Go with its `on_fail`, `why`, `doc` and finding text
  unchanged, and the `.mjs` with its import of the Node engine is removed.
- **Actor:** @missingbulb (owner), through the chunk 17 plan (ClaudinitePacks#30 T2).
- **Mechanism:** `packs/macos/checks/signal_teardown_routing.go`, unit-tested beside it through the
  SDK's fake engine, run through `cn check --pack macos` by `test/`, and compared with the Node
  engine by ClaudiniteEngine's parity harness.
- **Landed:** pending.
