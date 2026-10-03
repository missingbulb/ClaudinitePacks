package test

import (
	"strings"
	"testing"

	"claudinitepacks.test/tools/checks/fixture"
)

const orchestrator = `name: Release to Chrome Store
on:
  push:
    branches: [main]
  schedule:
    - cron: "30 0 * * *"
  workflow_dispatch:
jobs:
  create-package:
    uses: ./.github/workflows/chrome-extension-create-package.yml
  publish:
    uses: ./.github/workflows/chrome-extension-publish-store.yml
    secrets: inherit
  daily:
    uses: ./.github/workflows/chrome-extension-daily-release.yml
    secrets: inherit
  bump:
    uses: ./.github/workflows/chrome-extension-bump-version.yml
`

const (
	orchestratorPath = ".github/workflows/chrome-extension-release.yml"
	manifestPath     = "extension/manifest.json"
	privacyPath      = "dev/build/release/store_artifacts/PRIVACY.md"
	releaseConfig    = "manifest_path=extension/manifest.json\npackage_json_path=package.json\nsetup_command=npm ci\ntest_command=npm test\nship_paths=extension\n"
)

func manifest(perms string) string {
	return `{
  "manifest_version": 3,
  "name": "x",
  "version": "1.2.3",
  "permissions": [` + perms + `],
  "host_permissions": ["https://e.com/*"]
}
`
}

// conformant is an extension repo that ships the vendored release set and
// satisfies every check of the pack.
func conformant() map[string]string {
	wf := func(n string) string { return "name: \"" + n + "\"\non:\n  workflow_call:\njobs:\n  x:\n    runs-on: ubuntu-latest\n    steps:\n      - run: 'true'\n" }
	act := func(n string) string { return "name: " + n + "\nruns:\n  using: composite\n  steps: []\n" }
	return map[string]string{
		manifestPath:     manifest(`"storage"`),
		"package.json":   `{"name":"x","version":"1.2.3"}`,
		orchestratorPath: orchestrator,
		".github/workflows/chrome-extension-create-package.yml": wf("Chrome extension: Create Package (reusable)"),
		".github/workflows/chrome-extension-publish-store.yml":  wf("Chrome extension: Publish to Chrome Web Store (reusable)"),
		".github/workflows/chrome-extension-daily-release.yml":  wf("Chrome extension: Daily Auto-Release (reusable)"),
		".github/workflows/chrome-extension-bump-version.yml":   wf("Chrome extension: Bump version (reusable)"),
		".github/workflows/deploy-privacy-page.yml":             wf("Deploy privacy policy to GitHub Pages (reusable)"),
		".github/actions/read-release-config/action.yml":        act("Read release config"),
		".github/actions/bump-extension-patch/action.yml":       act("Bump extension version"),
		".github/actions/report-failure/action.yml":             act("Report workflow failure"),
		".github/release.config":                                releaseConfig,
		privacyPath:                                             "We use storage to save settings locally, and connect to https://e.com/* to fetch data.\n",
		"README.md":                                             "# x\n\n## Install\n\nx\n\n## Releasing\n\nx\n",
	}
}

func with(set map[string]string, drop ...string) map[string]string {
	out := conformant()
	for k, v := range set {
		out[k] = v
	}
	for _, k := range drop {
		delete(out, k)
	}
	return out
}

func TestPack(t *testing.T) {
	fixture.Run(t, "chrome-extension", []fixture.Case{
		{Name: "a conformant extension repo is clean across the pack", Member: conformant()},
		{Name: "a repo that only codes an extension carries none of the release checks", Member: map[string]string{manifestPath: manifest(`"storage"`)}},

		{Name: "release-workflows flags a missing orchestrator", Member: with(nil, orchestratorPath),
			Expect: []string{"finding release-workflows " + orchestratorPath}},
		{Name: "release-workflows flags a stale cron", Member: with(map[string]string{orchestratorPath: strings.Replace(orchestrator, `"30 0 * * *"`, `"0 3 * * *"`, 1)}),
			Expect: []string{"finding release-workflows " + orchestratorPath}},
		{Name: "template-tokens flags a surviving __TOKEN__", Member: with(map[string]string{orchestratorPath: strings.Replace(orchestrator, "name: Release to Chrome Store", "name: Release to Chrome Store\nenv:\n  ZIP: __ZIP_NAME__", 1)}),
			Expect: []string{"finding cer/template-tokens " + orchestratorPath + ":3"}},
		{Name: "release-config: the file is required", Member: with(nil, ".github/release.config"),
			Expect: []string{"finding cer/release-config .github/release.config"}},
		{Name: "release-config flags a missing key, an unknown key and a malformed line", Member: with(map[string]string{".github/release.config": "manifest_path=extension/manifest.json\npackage_json_path=package.json\nsetup_command=npm ci\ntest_command=npm test\nshpi_paths=extension\nthis is not a config line\n"}),
			Expect: []string{"finding cer/release-config .github/release.config", "finding cer/release-config .github/release.config:5", "finding cer/release-config .github/release.config:6"}},
		{Name: "version-sync flags the manifest and package.json disagreeing", Member: with(map[string]string{"package.json": `{"name":"x","version":"9.9.9"}`}),
			Expect: []string{"finding cer/version-sync " + manifestPath}},
		{Name: "release-layout flags a missing PRIVACY.md", Member: with(nil, privacyPath),
			Expect: []string{"finding cer/release-layout " + privacyPath}},
		{Name: "privacy-permission-alignment flags a permission PRIVACY.md does not disclose", Member: with(map[string]string{manifestPath: manifest(`"storage", "tabs"`)}),
			Expect: []string{"finding cer/privacy-permission-alignment " + privacyPath}},
		{Name: "permission-added-store-issue advises on an added permission", Member: conformant(),
			Change: map[string]string{manifestPath: manifest(`"storage", "tabs"`), privacyPath: "We use storage and tabs, and connect to https://e.com/*.\n"},
			Expect: []string{"advisory cer/permission-added-store-issue " + manifestPath, "finding version-bumped " + manifestPath}},
		{Name: "readme-sections flags a README missing Releasing", Member: with(map[string]string{"README.md": "# x\n\n## Install\n\nx\n"}),
			Expect: []string{"finding cer/readme-sections README.md"}},
		{Name: "version-bumped flags a shipped change that leaves the version", Member: conformant(),
			Change: map[string]string{"extension/popup.js": "console.log(1);\n"},
			Expect: []string{"finding version-bumped " + manifestPath}, },
		{Name: "content-script-module-syntax flags an injected module", Member: map[string]string{
			"manifest.json": `{"manifest_version":3,"content_scripts":[{"js":["content/main.js"]}]}`,
			"content/main.js": "import { a } from './a.js';\n",
		}, Expect: []string{"finding content-script-module-syntax content/main.js:1"}},
		{Name: "declarative-content-set-icon flags a SetIcon path", Member: map[string]string{
			"manifest.json": `{"manifest_version":3}`,
			"sw.js":         "new chrome.declarativeContent.SetIcon({ path: 'a.png' });\n",
		}, Expect: []string{"finding declarative-content-set-icon sw.js:1"}},
	})
}
