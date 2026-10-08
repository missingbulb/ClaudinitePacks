package checks

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"sort"
	"strings"
	"testing"

	"claudinite.com/checksdk"
)

// testdata/descriptor-verdicts.json is the page's verdict on each edge;
// test/descriptor-drift.test.mjs holds the page to the same file.
func TestReaderMatchesThePage(t *testing.T) {
	raw, err := os.ReadFile("testdata/descriptor-verdicts.json")
	if err != nil {
		t.Fatal(err)
	}
	var cases []struct {
		Pack    string          `json:"pack"`
		Text    string          `json:"text"`
		Verdict json.RawMessage `json:"verdict"`
	}
	if err := json.Unmarshal(raw, &cases); err != nil {
		t.Fatal(err)
	}
	if len(cases) == 0 {
		t.Fatal("no verdicts to compare")
	}
	for _, c := range cases {
		got, _ := json.Marshal(parseDescriptor([]byte(c.Text), c.Pack))
		var a, b any
		_ = json.Unmarshal(got, &a)
		_ = json.Unmarshal(c.Verdict, &b)
		if !reflect.DeepEqual(a, b) {
			t.Errorf("%s:\n got %s\nwant %s", c.Pack, got, c.Verdict)
		}
	}
}

func whats(ps []problem) string {
	var out []string
	for _, p := range ps {
		out = append(out, p.what)
	}
	return strings.Join(out, "|")
}

// Each of the check's findings, and a descriptor clean of them.
func TestProblems(t *testing.T) {
	for name, c := range map[string]struct{ text, want string }{
		"usable":   {`{"widgets": [{"id": "s", "kind": "stat", "noun": "stars"}], "repo": ["s"]}`, ""},
		"rejected": {`{"widgets": []}`, "the dashboard reader rejects it: its dashboard.json declares no usable widget"},
		"dangling": {`{"widgets": [{"id": "s", "kind": "event"}], "repo": ["s", "x", "x", "y"]}`, "selects widget id(s) it does not declare: x, y"},
		"mixed":    {`{"widgets": [{"id": "s", "kind": "event"}], "repo": [1, 1.0, "1", null, null, [2], [2], {}]}`, "selects widget id(s) it does not declare: 1, 1, , 2, 2, [object Object]"},
		"unknown":  {`{"widgets": [{"id": "h", "kind": "heatmap"}], "repo": ["h"]}`, ""},
	} {
		if got := whats(descriptorProblems([]byte(c.text), "acme-pack")); got != c.want {
			t.Errorf("%s: %q, want %q", name, got, c.want)
		}
	}
}

func TestScope(t *testing.T) {
	root := t.TempDir()
	for _, rel := range []string{
		"packs/a/dashboard.json",
		".claudinite/local/packs/b/dashboard.json",
		".claudinite/shared/packs/c/dashboard.json",
		"packs/a/sub/dashboard.json",
		"vendor/.claudinite/local/packs/d/dashboard.json",
	} {
		p := filepath.Join(root, filepath.FromSlash(rel))
		if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(p, []byte("{"), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	var got []string
	for _, f := range descriptorUsable((&checksdk.Fake{}).Repo(root)) {
		got = append(got, f.Path)
	}
	sort.Strings(got)
	want := []string{".claudinite/local/packs/b/dashboard.json", "packs/a/dashboard.json"}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("judged %v, want the shelf's and the local pack's alone", got)
	}
}

func TestParseClipsAndDrops(t *testing.T) {
	d := parseDescriptor([]byte(`{"widgets": [{"id": "a", "kind": "stat", "label": "  `+strings.Repeat("x", 40)+`", "glyph": "★★"}, {"id": "a", "kind": "event"}], "repo": ["a","a","a","a","a","a","a"]}`), "p")
	if d.Fault != nil || len(d.Widgets) != 1 || len([]rune(d.Widgets[0].Label)) != maxLabel || d.Widgets[0].Glyph != nil {
		t.Errorf("%+v", d)
	}
	if !reflect.DeepEqual(d.Repo, []string{"a", "a", "a", "a", "a", "a"}) {
		t.Errorf("repo %v: the clip keeps six, duplicates and all", d.Repo)
	}
}

// Every descriptor the shelf ships passes the check.
func TestShelfDescriptorsAreUsable(t *testing.T) {
	files, _ := filepath.Glob("../../*/dashboard.json")
	if len(files) == 0 {
		t.Fatal("the shelf carries no descriptor to judge")
	}
	for _, f := range files {
		text, err := os.ReadFile(f)
		if err != nil {
			t.Fatal(err)
		}
		if got := whats(descriptorProblems(text, filepath.Base(filepath.Dir(f)))); got != "" {
			t.Errorf("%s: %s", f, got)
		}
	}
}
