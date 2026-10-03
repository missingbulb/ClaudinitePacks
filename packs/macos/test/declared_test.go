package test

import (
	"testing"

	"claudinitepacks.test/tools/checks/fixture"
)

const (
	delegate = "import AppKit\n\nfinal class AppDelegate: NSObject, NSApplicationDelegate {\n  func applicationWillTerminate(_ notification: Notification) {\n    AudioHub.shared.stop()\n  }\n}\n"
	submit   = "xcrun notarytool submit build/Fixture.dmg --keychain-profile ci --wait\n"
	staple   = "xcrun stapler staple build/Fixture.dmg\nxcrun stapler validate build/Fixture.dmg\n"
)

func plist(body string) string {
	return "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<plist version=\"1.0\">\n<dict>\n" + body + "\n</dict>\n</plist>\n"
}

var suddenTrue = plist("  <key>NSSupportsSuddenTermination</key>\n  <true/>")

func TestPack(t *testing.T) {
	fixture.Run(t, "macos", []fixture.Case{
		{Name: "sudden-termination-vs-teardown flags the key in an app with terminate teardown",
			Member: map[string]string{"Sources/App/AppDelegate.swift": delegate, "Resources/Info.plist": suddenTrue},
			Expect: []string{"finding sudden-termination-vs-teardown Resources/Info.plist"}},
		{Name: "an installTap alone is teardown to lose",
			Member: map[string]string{"Sources/App/AudioHub.swift": "engine.inputNode.installTap(onBus: 0, bufferSize: 4096, format: fmt) { _, _ in }\n", "Info.plist": suddenTrue},
			Expect: []string{"finding sudden-termination-vs-teardown Info.plist"}},
		{Name: "the key set false is the opt-out",
			Member: map[string]string{"Sources/App/AppDelegate.swift": delegate, "Info.plist": plist("  <key>NSSupportsSuddenTermination</key>\n  <false/>")}},
		{Name: "an app with nothing at terminate, or only a comment naming it, keeps the optimisation",
			Member: map[string]string{"Sources/App/main.swift": "// no applicationWillTerminate here\nimport AppKit\nNSApplication.shared.run()\n", "Info.plist": suddenTrue}},
		{Name: "notarize-then-staple flags a submit nothing staples",
			Member: map[string]string{"scripts/release.sh": "#!/bin/bash\nset -euo pipefail\n" + submit},
			Expect: []string{"finding notarize-then-staple scripts/release.sh:3"}},
		{Name: "a submit in a workflow step",
			Member: map[string]string{".github/workflows/release.yml": "jobs:\n  release:\n    steps:\n      - run: " + submit},
			Expect: []string{"finding notarize-then-staple .github/workflows/release.yml:4"}},
		{Name: "a staple anywhere in the repo, a commented-out submit, or a runbook stays quiet", Member: map[string]string{
			"scripts/notarize.sh": "#!/bin/bash\n" + submit, "scripts/package.sh": "#!/bin/bash\n" + staple,
		}},
		{Name: "a commented-out submit and a runbook are not submits", Member: map[string]string{
			"scripts/release.sh": "#!/bin/bash\n# " + submit + "swift build -c release\n", "docs/release.md": "Run `" + submit + "` from the job.\n",
		}},
		{Name: "the coded checks fire through the pack", Member: map[string]string{
			"Package.swift":         "let package = Package(\n  platforms: [.macOS(.v14)]\n)\n",
			"Resources/Info.plist":  plist("  <key>LSMinimumSystemVersion</key>\n  <string>13.0</string>"),
			"Sources/App/Hub.swift": "import AppKit\nlet a = NSApp\nengine.installTap(onBus: 0) { _, _ in }\n",
			"scripts/d.sh":          "command -v swift\n",
		}, Expect: []string{
			"finding minimum-system-version-agrees Resources/Info.plist:4",
			"finding signal-teardown-routing Sources/App/Hub.swift:3",
			"finding swift-toolchain-gate scripts/d.sh:1",
		}},
	})
}
