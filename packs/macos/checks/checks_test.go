package checks

import (
	"strings"
	"testing"
)

func manifest(platforms string) string {
	return "// swift-tools-version:5.9\nimport PackageDescription\n\nlet package = Package(\n  name: \"Fixture\",\n  platforms: [" + platforms + "],\n  products: [.executable(name: \"Fixture\", targets: [\"Fixture\"])],\n  targets: [.executableTarget(name: \"Fixture\")]\n)\n"
}

func plist(body string) string {
	return "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<!DOCTYPE plist PUBLIC \"-//Apple//DTD PLIST 1.0//EN\" \"http://www.apple.com/DTDs/PropertyList-1.0.dtd\">\n<plist version=\"1.0\">\n<dict>\n  <key>CFBundleName</key>\n  <string>Fixture</string>\n" + body + "\n</dict>\n</plist>\n"
}

func floorKey(v string) string {
	return "  <key>LSMinimumSystemVersion</key>\n  <string>" + v + "</string>"
}

func TestMinimumSystemVersionAgrees(t *testing.T) {
	cases := []struct {
		name  string
		files map[string]string
		want  string
		says  string
	}{
		{"below the package floor", map[string]string{"Package.swift": manifest(".macOS(.v14)"), "Resources/Info.plist": plist(floorKey("13.0"))}, "Resources/Info.plist:7", "LSMinimumSystemVersion is 13.0, but Package.swift declares a macOS floor of 14 (.macOS(.v14))"},
		{"the string form", map[string]string{"Package.swift": manifest(`.macOS("14.1")`), "Info.plist": plist(floorKey("14.0"))}, "Info.plist:7", "macOS floor of 14.1"},
		{"a two-part enum", map[string]string{"mac/Package.swift": manifest(".macOS(.v10_15)"), "mac/Resources/Info.plist": plist(floorKey("11.0"))}, "mac/Resources/Info.plist:7", "floor of 10.15"},
		{"every disagreeing plist", map[string]string{"Package.swift": manifest(".macOS(.v14), .iOS(.v17)"), "App/Info.plist": plist(floorKey("13.0")), "Helper/Info.plist": plist(floorKey("12.0"))}, "App/Info.plist:7 Helper/Info.plist:7", ""},
		{"agree exactly", map[string]string{"Package.swift": manifest(".macOS(.v14)"), "R/Info.plist": plist(floorKey("14.0"))}, "", ""},
		{"14.0.0 is 14", map[string]string{"Package.swift": manifest(".macOS(.v14)"), "R/Info.plist": plist(floorKey("14.0.0"))}, "", ""},
		{"10.15 spelled out", map[string]string{"Package.swift": manifest(".macOS(.v10_15)"), "R/Info.plist": plist(floorKey("10.15"))}, "", ""},
		{"no claim", map[string]string{"Package.swift": manifest(".macOS(.v14)"), "R/Info.plist": plist("  <key>LSUIElement</key>\n  <true/>")}, "", ""},
		{"a substitution", map[string]string{"Package.swift": manifest(".macOS(.v14)"), "R/Info.plist": plist(floorKey("$(MACOSX_DEPLOYMENT_TARGET)"))}, "", ""},
		{"inside an XML comment", map[string]string{"Package.swift": manifest(".macOS(.v14)"), "R/Info.plist": plist("  <!--\n" + floorKey("13.0") + "\n  -->")}, "", ""},
		{"outside the platforms array", map[string]string{"Package.swift": "let package = Package(\n  targets: [.executableTarget(\n    swiftSettings: [.define(\"MAC\", .when(platforms: [.macOS]))],\n    linkerSettings: [.unsafeFlags([\"-target\"], .when(platforms: [.macOS(\"14.0\")]))]\n  )]\n)\n", "R/Info.plist": plist(floorKey("13.0"))}, "", ""},
		{"too deep", map[string]string{"tests/fixtures/pkg/Package.swift": manifest(".macOS(.v14)"), "R/Info.plist": plist(floorKey("13.0"))}, "", ""},
		{"iOS only", map[string]string{"Package.swift": manifest(".iOS(.v17)"), "R/Info.plist": plist(floorKey("13.0"))}, "", ""},
	}
	for _, c := range cases {
		fs := run(t, minimumSystemVersionAgrees, c.files, nil)
		expect(t, c.name, fs, c.want)
		if !strings.Contains(said(fs), c.says) {
			t.Errorf("%s: said %q", c.name, said(fs))
		}
	}
}

const (
	delegate = "import AppKit\n\nfinal class AppDelegate: NSObject, NSApplicationDelegate {\n  func applicationDidFinishLaunching(_ n: Notification) { AudioHub.shared.start() }\n}\n"
	hub      = "import AVFoundation\n\nfinal class AudioHub {\n  static let shared = AudioHub()\n  func start() {\n    engine.inputNode.installTap(onBus: 0, bufferSize: 4096, format: fmt) { _, _ in }\n  }\n}\n"
	routed   = "import AppKit\n\nlet signalSources = [SIGTERM, SIGINT, SIGHUP].map { sig -> DispatchSourceSignal in\n  signal(sig, SIG_IGN)\n  let source = DispatchSource.makeSignalSource(signal: sig, queue: .main)\n  source.setEventHandler { NSApp.terminate(nil) }\n  source.resume()\n  return source\n}\n"
)

func TestSignalTeardownRouting(t *testing.T) {
	app := func(main string) map[string]string {
		files := map[string]string{"Sources/App/AppDelegate.swift": delegate, "Sources/App/AudioHub.swift": hub}
		if main != "" {
			files["Sources/App/main.swift"] = main
		}
		return files
	}
	cases := []struct {
		name  string
		files map[string]string
		want  string
		says  string
	}{
		{"no routing", app(""), "Sources/App/AudioHub.swift:6", "nothing in the sources routes termination signals"},
		{"a signal named nowhere", app(strings.Replace(routed, ", SIGHUP", "", 1)), "Sources/App/main.swift:5", "SIGHUP appears nowhere"},
		{"SIG_IGN after resume", app("import AppKit\n\nlet s = [SIGTERM, SIGINT, SIGHUP].map { sig -> DispatchSourceSignal in\n  let source = DispatchSource.makeSignalSource(signal: sig, queue: .main)\n  source.setEventHandler { NSApp.terminate(nil) }\n  source.resume()\n  signal(sig, SIG_IGN)\n  return source\n}\n"), "Sources/App/main.swift:6", "SIG_IGN) only after resume"},
		{"no SIG_IGN", app(strings.Replace(routed, "  signal(sig, SIG_IGN)\n", "", 1)), "Sources/App/main.swift:6", "without ever calling signal(…, SIG_IGN)"},
		{"routed", app(routed), "", ""},
		{"a command-line tool", map[string]string{"Sources/tool/main.swift": hub}, "", ""},
		{"no tap", map[string]string{"Sources/App/AppDelegate.swift": delegate}, "", ""},
		{"sigaction", app("import AppKit\nvar action = sigaction()\nfor sig in [SIGTERM, SIGINT, SIGHUP] { sigaction(sig, &action, nil) }\n"), "", ""},
		{"an unrelated earlier resume", app("import AppKit\n\nURLSession.shared.dataTask(with: url) { _, _, _ in }.resume()\n\n" + routed), "", ""},
		{"routing only in a comment", app("import AppKit\n// DispatchSource.makeSignalSource(signal: SIGTERM, queue: .main)\nNSApplication.shared.run()\n"), "Sources/App/AudioHub.swift:6", "nothing in the sources"},
	}
	for _, c := range cases {
		fs := run(t, signalTeardownRouting, c.files, nil)
		expect(t, c.name, fs, c.want)
		if !strings.Contains(said(fs), c.says) {
			t.Errorf("%s: said %q", c.name, said(fs))
		}
	}
}

func TestSwiftToolchainGate(t *testing.T) {
	cases := []struct{ name, file, text, want string }{
		{"ungated", "scripts/d.sh", "#!/bin/bash\nif command -v swift >/dev/null 2>&1; then\n  swift run Diagnose\nfi\n", "scripts/d.sh:2"},
		{"gated on the line", "scripts/d.sh", "#!/bin/bash\nif xcode-select -p >/dev/null 2>&1 && command -v swift >/dev/null 2>&1; then\nfi\n", ""},
		{"gated earlier", "scripts/d.sh", "#!/bin/bash\nxcode-select -p >/dev/null 2>&1 || exit 0\ncommand -v swift && swift run D\n", ""},
		{"a documenting comment", "scripts/d.sh", "#!/bin/bash\n# NOTE: command -v swift is NOT a usable test.\nxcode-select -p || exit 0\n", ""},
		{"a commented-out gate", "scripts/d.sh", "#!/bin/bash\n# xcode-select -p || exit 0\ncommand -v swift && swift run D\n", "scripts/d.sh:3"},
		{"a continuation", "scripts/d.sh", "#!/bin/bash\ncommand -v \\\n  swift >/dev/null 2>&1 && swift run D\n", "scripts/d.sh:2"},
		{"swiftlint", "scripts/l.sh", "command -v swiftlint && swiftlint\n", ""},
		{"a workflow", ".github/workflows/d.yml", "jobs:\n  run:\n    steps:\n      - run: command -v swift && swift build\n", ".github/workflows/d.yml:4"},
		{"yaml outside workflows", "ci/d.yml", "- run: which swift\n", ""},
	}
	for _, c := range cases {
		expect(t, c.name, run(t, swiftToolchainGate, map[string]string{c.file: c.text}, nil), c.want)
	}
}
