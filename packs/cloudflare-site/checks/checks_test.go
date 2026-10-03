package checks

import (
	"encoding/json"
	"os/exec"
	"reflect"
	"strings"
	"testing"
)

const token = "4f8b21ce9a7d4e0fb3c65a1d2e7f9081"

func with(base map[string]string, more map[string]string) map[string]string {
	out := map[string]string{}
	for k, v := range base {
		out[k] = v
	}
	for k, v := range more {
		out[k] = v
	}
	return out
}

func TestBeaconToken(t *testing.T) {
	base := map[string]string{"wrangler.json": `{ "assets": { "directory": "./site" } }` + "\n"}
	for name, files := range map[string]map[string]string{
		"the loader as committed":    {"site/analytics.js": `{"token": "` + beaconPlaceholder + `"}` + "\n"},
		"a commented-out loader":     {"site/analytics.js": `// var beacon = {"token": "` + token + `"};` + "\n"},
		"outside the published tree": {"site/index.html": "<p>x</p>\n", "docs/notes.md": `{"token": "` + token + `"}` + "\n"},
	} {
		expect(t, name, run(t, beaconTokenIsNotCommitted, with(base, files), nil), "")
	}
	fs := run(t, beaconTokenIsNotCommitted, with(base, map[string]string{"site/analytics.js": "var x = 1;\nvar beacon = {\"token\": \"" + token + "\"};\n"}), nil)
	expect(t, "a committed token", fs, "site/analytics.js:2")
	if s := said(fs); !strings.Contains(s, "beacon token is committed (4f8b21…)") || !strings.Contains(s, beaconPlaceholder) {
		t.Errorf("said %q", s)
	}
	expect(t, "a data-cf-beacon attribute", run(t, beaconTokenIsNotCommitted, with(base, map[string]string{
		"site/index.html": `<script defer data-cf-beacon='{"token": "` + token + `"}'></script>` + "\n"}), nil), "site/index.html:1")
}

func TestNoSecondPublisher(t *testing.T) {
	base := map[string]string{"wrangler.json": `{ "assets": { "directory": "./site" } }` + "\n", "site/index.html": "<p>x</p>\n"}
	workflow := func(step string) string { return "name: x\non: push\njobs:\n  a:\n    steps:\n      " + step + "\n" }
	expect(t, "a build-only workflow", run(t, noSecondPublisher, with(base, map[string]string{".github/workflows/ci.yml": workflow("- run: node --test")}), nil), "")
	expect(t, "a commented-out step", run(t, noSecondPublisher, with(base, map[string]string{".github/workflows/ci.yml": workflow("# - uses: actions/deploy-pages@v4")}), nil), "")
	expect(t, "a Pages deploy", run(t, noSecondPublisher, with(base, map[string]string{".github/workflows/pages.yml": workflow("- uses: actions/deploy-pages@v4")}), nil), ".github/workflows/pages.yml:6")
	expect(t, "a second wrangler deploy", run(t, noSecondPublisher, with(base, map[string]string{".github/workflows/ci.yml": workflow("- run: npx wrangler@4.128.0 deploy")}), nil), ".github/workflows/ci.yml:6")
	expect(t, "a CNAME", run(t, noSecondPublisher, with(base, map[string]string{"site/CNAME": "example.com\n"}), nil), "site/CNAME")
}

func TestPublishesASiteDirectory(t *testing.T) {
	sound := `{"assets": {"directory": "./site"}, "compatibility_date": "2026-09-08"}`
	cases := []struct {
		name  string
		files map[string]string
		want  string
		says  string
	}{
		{"a sound config", map[string]string{"wrangler.json": sound, "site/index.html": "x"}, "", ""},
		{"one directory down", map[string]string{"web/wrangler.json": sound, "web/site/index.html": "x"}, "", ""},
		{"jsonc with comments", map[string]string{"wrangler.jsonc": "// c\n{\"assets\": {\"directory\": \"site\" /* x */}, \"compatibility_date\": \"a//b\"}", "site/index.html": "x"}, "", ""},
		{"no config", map[string]string{"site/index.html": "x"}, "wrangler.json", "no wrangler.json or wrangler.jsonc"},
		{"unparseable", map[string]string{"wrangler.json": `{ "assets": `, "site/index.html": "x"}, "wrangler.json", "does not parse as JSON"},
		{"no directory", map[string]string{"wrangler.json": `{"compatibility_date": "2026-09-08"}`}, "wrangler.json", "declares no assets.directory"},
		{"the repo root", map[string]string{"wrangler.json": `{"assets": {"directory": "."}, "compatibility_date": "x"}`, "site/index.html": "x"}, "wrangler.json", "publishes the repo root"},
		{"the config's own directory", map[string]string{"web/wrangler.json": `{"assets": {"directory": "./"}, "compatibility_date": "x"}`, "web/i.html": "x"}, "web/wrangler.json", "names web/, which holds no tracked file"},
		{"an empty tree", map[string]string{"wrangler.json": sound, "README.md": "x"}, "wrangler.json", "names site, which holds no tracked file"},
		{"no runtime pin", map[string]string{"wrangler.json": `{"assets": {"directory": "./site"}}`, "site/index.html": "x"}, "wrangler.json", "declares no compatibility_date"},
	}
	for _, c := range cases {
		fs := run(t, publishesASiteDirectory, c.files, nil)
		expect(t, c.name, fs, c.want)
		if !strings.Contains(said(fs), c.says) {
			t.Errorf("%s: said %q, want %q", c.name, said(fs), c.says)
		}
	}
}

// The readings are lib.mjs's, which the release task reads: node holds
// the two equal over the inputs that select each branch.
func TestReadingsMatchTheRelease(t *testing.T) {
	node, err := exec.LookPath("node")
	if err != nil {
		t.Skip("node is not on PATH; the release reads the config in JavaScript")
	}
	pathSets := [][]string{
		{"wrangler.json"}, {"web/wrangler.jsonc", "wrangler.jsonc"}, {"a/b/wrangler.json"},
		{"x/wrangler.json", "x/wrangler.jsonc", "y/wrangler.jsonc"}, {"wrangler.toml"}, {},
	}
	configs := []string{
		`{"assets":{"directory":"./site/"}}`, "// c\n{\"assets\":{\"directory\":\"s\\\"/*\"}}", `{"assets":{"directory":"  "}}`,
		`{"assets":{"directory":"./"}}`, `{"assets":{"directory":7}}`, `[1]`, `{ "assets": `, "/* a */ {\"assets\": {\"directory\": \"x//y\"}}",
	}
	script := `
import { wranglerConfigPath, parseWranglerConfig, publishedDir } from './lib.mjs';
const { pathSets, configs } = JSON.parse(process.argv[1]);
console.log(JSON.stringify({
  paths: pathSets.map((p) => wranglerConfigPath(p) ?? ''),
  dirs: configs.map((c) => { const p = parseWranglerConfig(c); return p === null ? null : (publishedDir(p, 'web/wrangler.json') ?? ''); }),
}));
`
	in, _ := json.Marshal(map[string]any{"pathSets": pathSets, "configs": configs})
	cmd := exec.Command(node, "--input-type=module", "-e", script, string(in))
	cmd.Dir = ".."
	out, err := cmd.Output()
	if err != nil {
		t.Fatalf("node: %v", err)
	}
	var want struct {
		Paths []string  `json:"paths"`
		Dirs  []*string `json:"dirs"`
	}
	if err := json.Unmarshal(out, &want); err != nil {
		t.Fatal(err)
	}
	var paths []string
	for _, p := range pathSets {
		paths = append(paths, wranglerConfigPath(p))
	}
	if !reflect.DeepEqual(paths, want.Paths) {
		t.Errorf("config paths %q, the release reads %q", paths, want.Paths)
	}
	for i, c := range configs {
		var got *string
		if config, ok := parseWranglerConfig(c); ok {
			d := publishedDir(config, "web/wrangler.json")
			got = &d
		}
		if (got == nil) != (want.Dirs[i] == nil) || got != nil && *got != *want.Dirs[i] {
			t.Errorf("config %q: published %v, the release reads %v", c, got, want.Dirs[i])
		}
	}
}
