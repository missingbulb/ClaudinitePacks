package checks

import (
	"encoding/json"
	"os/exec"
	"strings"
	"testing"

	"claudinite.com/checksdk"
)

func configured(config string) *checksdk.Fake {
	var v any
	if err := json.Unmarshal([]byte(config), &v); err != nil {
		panic(err)
	}
	return &checksdk.Fake{PackConfig: map[string]any{pack: v}}
}

func TestResolveStore(t *testing.T) {
	for config, want := range map[string]string{
		`{"repo": "acme/prefs"}`:                      "acme/prefs preferences",
		`{"repo": "acme/prefs", "path": "./people/"}`: "acme/prefs people",
		`{"repo": "acme/prefs", "path": ".//x//"}`:    "acme/prefs x",
		`{"repo": "acme/prefs", "path": "/"}`:         "",
		`{"repo": "acme/prefs", "path": ""}`:          "acme/prefs preferences",
		`{"repo": "acme/prefs", "path": null}`:        "",
		`{"repo": "acme/prefs", "path": "a/../b"}`:    "",
		`{"repo": "acme"}`:                            "",
		`{"repo": "a b/c"}`:                           "",
		`["acme/prefs"]`:                              "",
		`null`:                                        "",
		`"acme/prefs"`:                                "",
	} {
		got := ""
		if s, ok := resolveStore(json.RawMessage(config)); ok {
			got = s.repo + " " + s.path
		}
		if got != want {
			t.Errorf("%s: %q, want %q", config, got, want)
		}
	}
}

func TestUsableIdentity(t *testing.T) {
	for name, want := range map[string]bool{
		"octocat": true, "a": true, "a-b-c": true, "a1": true, strings.Repeat("a", 39): true,
		"": false, "-a": false, "a-": false, "a--b": false, "Octocat": false, "a_b": false, "a.b": false, strings.Repeat("a", 40): false,
	} {
		if usableIdentity(name) != want {
			t.Errorf("%q: %v, want %v", name, !want, want)
		}
	}
}

func TestStoreConfigured(t *testing.T) {
	fs := run(t, storeConfigured, map[string]string{".claudinite/settings.yaml": "packs: []\n"}, &checksdk.Fake{})
	expect(t, "no config", fs, ".claudinite/settings.yaml")
	if !strings.Contains(said(fs), "is declared but names no store") {
		t.Errorf("said %q", said(fs))
	}
	fs = run(t, storeConfigured, map[string]string{"x": ""}, configured(`{"repo": "nope"}`))
	if !strings.Contains(said(fs), `does not resolve ({"repo":"nope"})`) {
		t.Errorf("said %q", said(fs))
	}
	expect(t, "a store", run(t, storeConfigured, map[string]string{"x": ""}, configured(`{"repo": "acme/prefs"}`)), "")
}

func TestStoreFileNames(t *testing.T) {
	files := map[string]string{
		"preferences/README.md":                  "x",
		"preferences/notes.md":                   "x",
		"preferences/octocat/RULES.md":           "x",
		"preferences/Octocat/RULES.md":           "x",
		"preferences/Octocat/skills/a.md":        "x",
		"preferences/arielra@gmail.com/RULES.md": "x",
		"elsewhere/x.md":                         "x",
	}
	expect(t, "misnamed entries", run(t, storeFileNames, files, configured(`{"repo": "acme/prefs"}`)),
		"preferences/Octocat preferences/arielra@gmail.com preferences/notes.md")
	expect(t, "not the store", run(t, storeFileNames, map[string]string{"a.md": "x"}, configured(`{"repo": "acme/prefs"}`)), "")
	expect(t, "no store", run(t, storeFileNames, files, &checksdk.Fake{}), "")
}

func TestStoreCodeowners(t *testing.T) {
	s := store{repo: "acme/prefs", path: "preferences"}
	people := map[string]string{"preferences/octocat/RULES.md": "x", "preferences/b-c/RULES.md": "x", "preferences/README.md": "x"}
	block := codeownersBlock(s, []string{"preferences/octocat/RULES.md", "preferences/b-c/RULES.md", "preferences/Bad/x", "preferences/README.md"})
	if want := blockBegin + "\n# from preferences/ - regenerate with write_store_codeowners.mjs, never edit by hand\n/preferences/ @acme\n/preferences/b-c/ @b-c @acme\n/preferences/octocat/ @octocat @acme\n/.github/CODEOWNERS @acme\n" + blockEnd; block != want {
		t.Errorf("block\n%s\nwant\n%s", block, want)
	}
	with := func(owners string) map[string]string {
		out := map[string]string{codeownersFile: owners}
		for k, v := range people {
			out[k] = v
		}
		return out
	}
	cfg := configured(`{"repo": "acme/prefs"}`)
	expect(t, "in step", run(t, storeCodeowners, with("* @x\n"+block+"\n"), cfg), "")
	fs := run(t, storeCodeowners, with("* @x\n"), cfg)
	expect(t, "no block", fs, codeownersFile)
	expect(t, "no file", run(t, storeCodeowners, people, cfg), codeownersFile)
	fs = run(t, storeCodeowners, with(strings.Replace(block, "/preferences/b-c/ @b-c @acme\n", "", 1)+"\n/preferences/ @someone\n# fine\n"), cfg)
	expect(t, "stale, with owner lines after", fs, codeownersFile+" "+codeownersFile)
	if s := said(fs); !strings.Contains(s, "missing /preferences/b-c/ @b-c @acme") || !strings.Contains(s, "owner lines after the generated block (/preferences/ @someone)") {
		t.Errorf("said %q", s)
	}
}

func TestPreferencesProvenance(t *testing.T) {
	files := map[string]string{
		"preferences/octocat/RULES.md":                          "# me\n\n- **Ending a turn** - close with a callout. (ending-turn-callout)\n\n- **Saying LGTM** - merge it.\n- **Gone** - x\n  y (gone-rule-file)\n",
		"preferences/octocat/provenance/ending-turn-callout.md": "x",
		"preferences/Bad/RULES.md":                              "- **No marker** here\n",
		"preferences/octocat/skills/s/RULES.md":                 "- **No marker** here\n",
	}
	fs := run(t, preferencesProvenance, files, configured(`{"repo": "acme/prefs"}`))
	expect(t, "an unmarked rule and a dangling marker", fs, "preferences/octocat/RULES.md:5 preferences/octocat/RULES.md:7")
	if s := said(fs); !strings.Contains(s, `the rule "Saying LGTM" ends with no marker`) || !strings.Contains(s, "e.g. (saying-lgtm)") ||
		!strings.Contains(s, "names preferences/octocat/provenance/gone-rule-file.md, which does not exist") {
		t.Errorf("said %q", s)
	}
	if got := slugHint("Handing the owner a command block"); got != "handing-the-owner" {
		t.Errorf("slug hint %q", got)
	}
}

// The readings are the script's that stays beside the checks, the
// CODEOWNERS writer's address and block: node holds the two equal.
func TestReadingsMatchTheScripts(t *testing.T) {
	node, err := exec.LookPath("node")
	if err != nil {
		t.Skip("node is not on PATH; the scripts are JavaScript")
	}
	configs := []string{`{"repo":"acme/prefs"}`, `{"repo":"acme/prefs","path":"./a//"}`, `{"repo":"acme/prefs","path":"/"}`, `{"repo":"acme/prefs","path":null}`,
		`{"repo":"acme/prefs","path":".."}`, `{"repo":"a b/c"}`, `[1]`, `null`, `{"repo":"x/y","path":""}`, `{"repo":"x/y","path":7}`}
	names := []string{"octocat", "a-b", "-a", "a-", "a--b", "A", strings.Repeat("z", 39), strings.Repeat("z", 40), "", "a.b", "é"}
	files := []string{"preferences/octocat/RULES.md", "preferences/b/x/y", "preferences/Bad/RULES.md", "preferences/README.md", "other/a/b", "preferences/b/z"}
	script := `
import { resolveStore, isUsableIdentity, codeownersBlock } from './store_codeowners.mjs';
const { configs, names, files } = JSON.parse(process.argv[1]);
console.log(JSON.stringify({
  stores: configs.map((c) => { const s = resolveStore(JSON.parse(c)); return s ? s.repo + ' ' + s.path : ''; }),
  names: names.map(isUsableIdentity),
  block: codeownersBlock({ repo: 'acme/prefs', path: 'preferences' }, files),
}));
`
	in, _ := json.Marshal(map[string]any{"configs": configs, "names": names, "files": files})
	cmd := exec.Command(node, "--input-type=module", "-e", script, string(in))
	cmd.Dir = ".."
	out, err := cmd.Output()
	if err != nil {
		t.Fatalf("node: %v", err)
	}
	var want struct {
		Stores []string `json:"stores"`
		Names  []bool   `json:"names"`
		Block  string   `json:"block"`
	}
	if err := json.Unmarshal(out, &want); err != nil {
		t.Fatal(err)
	}
	for i, c := range configs {
		got := ""
		if s, ok := resolveStore(json.RawMessage(c)); ok {
			got = s.repo + " " + s.path
		}
		if got != want.Stores[i] {
			t.Errorf("store of %s: %q, the session step reads %q", c, got, want.Stores[i])
		}
	}
	for i, n := range names {
		if usableIdentity(n) != want.Names[i] {
			t.Errorf("identity %q: %v, the scripts read %v", n, usableIdentity(n), want.Names[i])
		}
	}
	if got := codeownersBlock(store{"acme/prefs", "preferences"}, files); got != want.Block {
		t.Errorf("block\n%s\nthe writer writes\n%s", got, want.Block)
	}
}
