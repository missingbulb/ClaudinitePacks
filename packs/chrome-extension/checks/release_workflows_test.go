package checks

import (
	"encoding/json"
	"os"
	"strings"
	"testing"

	"claudinite.com/checksdk"
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

const orchestratorPath = ".github/workflows/chrome-extension-release.yml"

func conformant() map[string]string {
	wf := func(n string) string { return "name: \"" + n + "\"\non:\n  workflow_call:\njobs: {}\n" }
	act := func(n string) string { return "name: " + n + "\nruns:\n  using: composite\n  steps: []\n" }
	return map[string]string{
		"extension/manifest.json": `{"manifest_version":3,"name":"x","version":"1.2.3"}`,
		"package.json":            `{"name":"x","version":"1.2.3"}`,
		orchestratorPath:          orchestrator,
		".github/workflows/chrome-extension-create-package.yml": wf("Chrome extension: Create Package (reusable)"),
		".github/workflows/chrome-extension-publish-store.yml":  wf("Chrome extension: Publish to Chrome Web Store (reusable)"),
		".github/workflows/chrome-extension-daily-release.yml":  wf("Chrome extension: Daily Auto-Release (reusable)"),
		".github/workflows/chrome-extension-bump-version.yml":   wf("Chrome extension: Bump version (reusable)"),
		".github/workflows/deploy-privacy-page.yml":             wf("Deploy privacy policy to GitHub Pages (reusable)"),
		".github/actions/read-release-config/action.yml":        act("Read release config"),
		".github/actions/bump-extension-patch/action.yml":       act("Bump extension version"),
		".github/actions/report-failure/action.yml":             act("Report workflow failure"),
		".github/release.config":                                "manifest_path=extension/manifest.json\npackage_json_path=package.json\nsetup_command=npm ci\ntest_command=npm test\nship_paths=extension\n",
	}
}

func with(files map[string]string, set map[string]string, drop ...string) map[string]string {
	out := map[string]string{}
	for k, v := range files {
		out[k] = v
	}
	for k, v := range set {
		out[k] = v
	}
	for _, k := range drop {
		delete(out, k)
	}
	return out
}

func TestReleaseWorkflows(t *testing.T) {
	expect(t, "a conformant repo", run(t, releaseWorkflows, conformant(), nil), "")
	expect(t, "a repo that only codes an extension", run(t, releaseWorkflows, map[string]string{"extension/manifest.json": `{"manifest_version":3}`}, nil), "")

	fs := run(t, releaseWorkflows, with(conformant(), nil, orchestratorPath), nil)
	expect(t, "a missing orchestrator, the release config still shipping", fs, orchestratorPath)

	fs = run(t, releaseWorkflows, with(conformant(), map[string]string{orchestratorPath: strings.Replace(strings.Replace(orchestrator,
		"name: Release to Chrome Store", "name: Wrong Name", 1),
		"    uses: ./.github/workflows/chrome-extension-publish-store.yml", "    steps:\n      - run: echo inlined", 1)}), nil)
	expect(t, "a wrong name and an uncalled reusable", fs, orchestratorPath+" "+orchestratorPath)
	if s := said(fs); !strings.Contains(s, `"Wrong Name"`) || !strings.Contains(s, "does not call the local reusable workflow ./.github/workflows/chrome-extension-publish-store.yml") {
		t.Errorf("sentences: %s", s)
	}

	fs = run(t, releaseWorkflows, with(conformant(), nil, ".github/workflows/deploy-privacy-page.yml", ".github/actions/report-failure/action.yml"), nil)
	expect(t, "a missing reusable and composite action", fs, ".github/actions/report-failure/action.yml .github/workflows/deploy-privacy-page.yml")

	fs = run(t, releaseWorkflows, with(conformant(), map[string]string{orchestratorPath: strings.Replace(orchestrator, `- cron: "30 0 * * *"`, `- cron: "0 3 * * *"`, 1)}), nil)
	expect(t, "a stale cron", fs, orchestratorPath)
	if !strings.Contains(said(fs), `schedule cron is "0 3 * * *" — the contract requires "30 0 * * *"`) {
		t.Errorf("sentence: %s", said(fs))
	}

	fs = run(t, releaseWorkflows, with(conformant(), map[string]string{orchestratorPath: strings.Replace(orchestrator, "  schedule:\n    - cron: \"30 0 * * *\"\n", "", 1)}), nil)
	expect(t, "no cron before the scheduler", fs, orchestratorPath)
	if !strings.Contains(said(fs), "schedule cron is (none)") {
		t.Errorf("sentence: %s", said(fs))
	}

	scheduler := map[string]string{".github/workflows/claudinite-scheduler.yml": "name: Claudinite scheduler\non:\n  schedule:\n    - cron: '24 * * * *'\n"}
	fs = run(t, releaseWorkflows, with(conformant(), scheduler), nil)
	expect(t, "the scheduler present and the orchestrator still on a cron", fs, orchestratorPath)
	if !strings.Contains(said(fs), `has a schedule cron "30 0 * * *"`) {
		t.Errorf("sentence: %s", said(fs))
	}
	decron := with(conformant(), scheduler)
	decron[orchestratorPath] = strings.Replace(orchestrator, "  schedule:\n    - cron: \"30 0 * * *\"\n", "", 1)
	expect(t, "the scheduler present and the orchestrator dispatch-only", run(t, releaseWorkflows, decron, nil), "")

	legacy := strings.NewReplacer(
		"./.github/workflows/chrome-extension-create-package.yml", "missingbulb/Claudinite/.github/workflows/chrome-extension-release.yml@main",
		"./.github/workflows/chrome-extension-publish-store.yml", "missingbulb/Claudinite/.github/workflows/chrome-extension-publish-store.yml@main",
		"./.github/workflows/chrome-extension-daily-release.yml", "missingbulb/Claudinite/.github/workflows/chrome-extension-daily-release.yml@main",
	).Replace(orchestrator)
	files := map[string]string{orchestratorPath: legacy, ".github/release.config": conformant()[".github/release.config"]}
	fs = run(t, releaseWorkflows, files, nil)
	if len(fs) != 3+5+3 {
		t.Errorf("the pre-vendoring shape: %d findings, want 11\n%s", len(fs), said(fs))
	}

	fs = run(t, releaseWorkflows, with(conformant(), map[string]string{orchestratorPath: strings.Replace(orchestrator, "name: Release to Chrome Store", "name: Release", 1)}), nil)
	expect(t, "the legacy Release name still ships and is told to rename", fs, orchestratorPath)
	if !strings.Contains(said(fs), `name: is "Release"`) {
		t.Errorf("sentence: %s", said(fs))
	}
}

func TestShipsReleasePipeline(t *testing.T) {
	renamed := with(conformant(), map[string]string{orchestratorPath: strings.Replace(orchestrator, "name: Release to Chrome Store", "name: Ship It", 1)})
	canon := map[string]string{
		".github/workflows/chrome-extension-publish-store.yml": "name: \"Chrome extension: Publish to Chrome Web Store (reusable)\"\n",
		".github/workflows/chrome-extension-bump-version.yml":  "name: \"Chrome extension: Bump version (reusable)\"\n",
	}
	for name, c := range map[string]struct {
		files map[string]string
		want  bool
	}{
		"a publisher": {conformant(), true},
		"a publisher whose orchestrator was renamed away": {renamed, true},
		"the canon, hosting the reusables":                {canon, false},
		"a repo that only codes an extension":             {map[string]string{"extension/manifest.json": "{}"}, false},
	} {
		f := &checksdk.Fake{}
		if got := shipsReleasePipeline(f.Repo(tree(t, c.files))); got != c.want {
			t.Errorf("%s: ships %v, want %v", name, got, c.want)
		}
	}
}

// The declared checks cannot share code, so each carries the shipping gate
// as its relevantWhen: it must spell the same two patterns as the coded one.
func TestDeclaredChecksCarryTheShippingGate(t *testing.T) {
	raw, err := os.ReadFile("../declared-checks.json")
	if err != nil {
		t.Fatal(err)
	}
	var specs []struct {
		ID           string `json:"id"`
		RelevantWhen struct {
			SomeTrackedFileContains *struct {
				PathMatching string `json:"pathMatching"`
				Text         string `json:"text"`
			} `json:"someTrackedFileContains"`
		} `json:"relevantWhen"`
	}
	if err := json.Unmarshal(raw, &specs); err != nil {
		t.Fatal(err)
	}
	if len(specs) == 0 {
		t.Fatal("no declared checks")
	}
	for _, s := range specs {
		gate := s.RelevantWhen.SomeTrackedFileContains
		if gate == nil {
			t.Errorf("%s is not gated on the repo shipping", s.ID)
			continue
		}
		if gate.PathMatching != "/"+shipsPipelinePath.String()+"/" {
			t.Errorf("%s path gate %s, want /%s/", s.ID, gate.PathMatching, shipsPipelinePath)
		}
		if want := "/" + strings.TrimPrefix(shipsPipelineText.String(), "(?m)") + "/m"; gate.Text != want {
			t.Errorf("%s text gate %s, want %s", s.ID, gate.Text, want)
		}
	}
}
