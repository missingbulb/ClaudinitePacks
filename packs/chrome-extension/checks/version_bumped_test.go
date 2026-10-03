package checks

import (
	"encoding/json"
	"os/exec"
	"reflect"
	"strings"
	"testing"

	"claudinite.com/checksdk"
)

func bumpRepo(version string) map[string]string {
	return map[string]string{
		orchestratorPath:          "name: Release to Chrome Store\n",
		".github/release.config":  "manifest_path=extension/manifest.json\npackage_json_path=package.json\nsetup_command=npm ci\ntest_command=npm test\nship_paths=extension\n",
		"extension/manifest.json": "{\n  \"manifest_version\": 3,\n  \"version\": \"" + version + "\"\n}\n",
	}
}

func bumped(t *testing.T, changed []string, head, base string, files map[string]string) []checksdk.Finding {
	t.Helper()
	if files == nil {
		files = bumpRepo(head)
	}
	f := &checksdk.Fake{ChangedFiles: changed, Base: map[string]string{}}
	if base != "" {
		f.Base["extension/manifest.json"] = bumpRepo(base)["extension/manifest.json"]
	}
	return run(t, versionBumped, files, f)
}

func TestShipPaths(t *testing.T) {
	if got := shipPaths(map[string]string{"ship_paths": "extension  tools/x.js"}); !reflect.DeepEqual(got, []string{"extension", "tools/x.js"}) {
		t.Errorf("ship paths %q", got)
	}
	if got := shipPaths(map[string]string{}); len(got) != 0 {
		t.Errorf("no ship paths %q", got)
	}
	roots := []string{"extension"}
	for changed, want := range map[string]bool{"extension": true, "extension/popup.js": true, "extension-docs/readme.md": false} {
		if got := len(touchesShippedFiles([]string{changed}, roots)) == 1; got != want {
			t.Errorf("%s touches the root: %v, want %v", changed, got, want)
		}
	}
	cfg := parseReleaseConfig("# c\n\na = '1'\nb=\"2\"\nc=\"\nnot a line\nd=x=y\n")
	if !reflect.DeepEqual(cfg, map[string]string{"a": "1", "b": "2", "c": "", "d": "x=y"}) {
		t.Errorf("config %q", cfg)
	}
}

func TestVersionBumped(t *testing.T) {
	fs := bumped(t, []string{"extension/popup.js"}, "1.2.3", "1.2.3", nil)
	expect(t, "a shipped file changed and the version left", fs, "extension/manifest.json")
	if s := said(fs); !strings.Contains(s, "leaves the version at 1.2.3") || !strings.Contains(s, "(extension/popup.js)") || !strings.Contains(s, "raise it to 1.2.4") {
		t.Errorf("sentence: %s", s)
	}
	fs = bumped(t, []string{"extension/popup.js", "extension/manifest.json"}, "1.2.3", "1.2.3", nil)
	if !strings.Contains(said(fs), "extension/popup.js, +1 more") {
		t.Errorf("sentence: %s", said(fs))
	}
	for _, c := range [][2]string{{"1.2.4", "1.2.3"}, {"1.3.0", "1.2.9"}, {"2.0.0", "1.9.9"}} {
		expect(t, c[1]+" raised to "+c[0], bumped(t, []string{"extension/popup.js"}, c[0], c[1], nil), "")
	}
	fs = bumped(t, []string{"extension/popup.js"}, "1.2.2", "1.2.3", nil)
	expect(t, "a version moving backwards", fs, "extension/manifest.json")
	if !strings.Contains(said(fs), "moves backwards, 1.2.3 → 1.2.2") {
		t.Errorf("sentence: %s", said(fs))
	}

	expect(t, "a change that ships nothing", bumped(t, []string{"README.md", "tests/popup.test.mjs", ".github/release.config"}, "1.2.3", "1.2.3", nil), "")
	notShipping := bumpRepo("1.2.3")
	delete(notShipping, orchestratorPath)
	delete(notShipping, ".github/release.config")
	expect(t, "a repo that does not ship the pipeline", bumped(t, []string{"extension/popup.js"}, "1.2.3", "1.2.3", notShipping), "")
	expect(t, "an off-scheme head", bumped(t, []string{"extension/popup.js"}, "1.2", "1.2.3", nil), "")
	expect(t, "an off-scheme base", bumped(t, []string{"extension/popup.js"}, "1.2.3", "nope", nil), "")
	expect(t, "a manifest the change introduces", bumped(t, []string{"extension/popup.js"}, "1.2.3", "", nil), "")
	noConfig := bumpRepo("1.2.3")
	delete(noConfig, ".github/release.config")
	expect(t, "a missing release config", bumped(t, []string{"extension/popup.js"}, "1.2.3", "1.2.3", noConfig), "")
}

// The release config and the version are read here as the vendored
// read-release-config and bump-extension-patch actions read them; the
// actions are the source, so each reading is held to theirs over one
// matrix.
func TestReadingsMatchTheVendoredActions(t *testing.T) {
	node, err := exec.LookPath("node")
	if err != nil {
		t.Skip("node is not on PATH; the vendored actions are JavaScript")
	}
	configs := []string{
		"manifest_path=a/manifest.json\nship_paths=a  b/c.js\n",
		"# comment\n\n  key = 'quoted'  \nother=\"x\"\nempty=\nlone=\"\nbad line\nk=a=b\n",
		"ship_paths=\t\n",
	}
	versions := []string{`{"version": "1.2.3"}`, `{"version":"1.2"}`, `{"name":"x"}`, `{"version": "10.0.1", "version": "2.0.0"}`}
	script := `
import { parseConfig } from './stubs/actions/read-release-config/read-config.mjs';
import { readVersion, compare, BumpError } from './stubs/actions/bump-extension-patch/bump.mjs';
const { configs, versions } = JSON.parse(process.argv[1]);
const read = versions.map((t) => { try { return readVersion('m', t); } catch (e) { if (e instanceof BumpError) return null; throw e; } });
const cmp = [];
for (const a of read) for (const b of read) { try { cmp.push(compare(a, b)); } catch (e) { cmp.push(null); } }
console.log(JSON.stringify({ configs: configs.map((c) => parseConfig(c).cfg), read, cmp }));
`
	in, _ := json.Marshal(map[string]any{"configs": configs, "versions": versions})
	cmd := exec.Command(node, "--input-type=module", "-e", script, string(in))
	cmd.Dir = ".."
	out, err := cmd.Output()
	if err != nil {
		t.Fatalf("node: %v", err)
	}
	var want struct {
		Configs []map[string]string `json:"configs"`
		Read    []*string           `json:"read"`
		Cmp     []*int              `json:"cmp"`
	}
	if err := json.Unmarshal(out, &want); err != nil {
		t.Fatal(err)
	}
	for i, c := range configs {
		if got := parseReleaseConfig(c); !reflect.DeepEqual(got, want.Configs[i]) {
			t.Errorf("config %q: %q, the action reads %q", c, got, want.Configs[i])
		}
	}
	var read []*string
	for i, v := range versions {
		var got *string
		if m := versionToken.FindStringSubmatch(v); m != nil {
			got = &m[1]
		}
		read = append(read, got)
		if (got == nil) != (want.Read[i] == nil) || got != nil && *got != *want.Read[i] {
			t.Errorf("version of %s: %v, the action reads %v", v, got, want.Read[i])
		}
	}
	k := 0
	for _, a := range read {
		for _, b := range read {
			var got *int
			if a != nil && b != nil {
				av, okA := parseVersion(*a)
				bv, okB := parseVersion(*b)
				if okA && okB {
					c := compareVersions(av, bv)
					got = &c
				}
			}
			w := want.Cmp[k]
			k++
			if (got == nil) != (w == nil) || got != nil && *got != *w {
				t.Errorf("compare %v %v: %v, the action says %v", a, b, got, w)
			}
		}
	}
}
