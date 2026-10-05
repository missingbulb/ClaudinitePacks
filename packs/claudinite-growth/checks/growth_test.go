package checks

import (
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"

	"claudinite.com/checksdk"
)

// run is check's findings over the head tree files with the fake engine f.
func run(t *testing.T, check func(checksdk.Repo) []checksdk.Finding, files map[string]string, f *checksdk.Fake) []checksdk.Finding {
	t.Helper()
	root := t.TempDir()
	for rel, text := range files {
		p := filepath.Join(root, filepath.FromSlash(rel))
		if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(p, []byte(text), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	return check(f.Repo(root))
}

// want is one expected finding: its path, line, and patterns its
// sentence and fix match.
type want struct {
	path      string
	line      int
	what, fix string
}

func expect(t *testing.T, name string, got []checksdk.Finding, ws ...want) {
	t.Helper()
	if len(got) != len(ws) {
		t.Fatalf("%s: %d findings, want %d: %+v", name, len(got), len(ws), got)
	}
	for i, w := range ws {
		g := got[i]
		if g.Path != w.path || g.Line != w.line || !regexp.MustCompile(w.what).MatchString(g.Sentence) || !strings.Contains(g.Fix, w.fix) {
			t.Errorf("%s: finding %d is %+v, want %+v", name, i, g, w)
		}
	}
}

func TestGrowthWriteScope(t *testing.T) {
	head := map[string]string{"README.md": "# member\n\nA lesson.\n", ".claudinite/local/packs/mypack/RULES.md": "# mypack\n\n- **A** — b.\n"}
	outside := func(msg string) *checksdk.Fake {
		return &checksdk.Fake{MergeBase: "base", Messages: []string{msg},
			ChangedFiles: []string{"README.md", ".claudinite/local/packs/mypack/RULES.md"}, Deleted: []string{"docs/old.md"}}
	}
	expect(t, "a run writing outside the local packs", run(t, growthWriteScope, head, outside("Claudinite growth: extract lessons from the week")),
		want{path: "README.md", what: `^a growth run touched README\.md, outside \.claudinite/local/packs/$`, fix: "claudinite-canon-curation"},
		want{path: "docs/old.md", what: `touched docs/old\.md`})
	inside := &checksdk.Fake{MergeBase: "base", Messages: []string{"Claudinite growth: dedup local packs"}, ChangedFiles: []string{".claudinite/local/packs/mypack/RULES.md"}}
	expect(t, "a run inside the local packs", run(t, growthWriteScope, head, inside))
	for _, msg := range []string{"change", "Claudinite growth: capture log", "Claudinite canon: dedup"} {
		expect(t, "not a growth run: "+msg, run(t, growthWriteScope, head, outside(msg)))
	}
	onMain := outside("Claudinite growth: extract lessons")
	onMain.Branch = "main"
	expect(t, "on the default branch", run(t, growthWriteScope, head, onMain))
}

func TestGrowthRunSubjects(t *testing.T) {
	for _, s := range []string{"Claudinite growth: extract lessons", "Claudinite growth: conversation extract", "Claudinite growth: dedup local packs", "Claudinite growth: prose to checks", "Claudinite growth: rule revalidation"} {
		if !growthRun.MatchString(s + " (#12)") {
			t.Errorf("%q is not matched", s)
		}
	}
	for _, s := range []string{"Claudinite growth: capture log", "Claudinite canon: dedup", "growth: extract lessons"} {
		if growthRun.MatchString(s) {
			t.Errorf("%q is matched", s)
		}
	}
	if !dedupRun.MatchString("Claudinite growth: dedup local packs") || !dedupRun.MatchString("the canon now covers it") || dedupRun.MatchString("deduplicate") {
		t.Error("dedupRun")
	}
	for s, w := range map[string]bool{
		"This rule is portable (canon): the basics pack owns it.": true,
		"(canon): here only the residue":                          false,
		"Owned by the canon now.":                                 true,
		"the canon now owns this":                                 true,
	} {
		if restatesCanon.MatchString(s) != w {
			t.Errorf("restatesCanon(%q) != %v", s, w)
		}
	}
}

func TestDedupPruneIntegrity(t *testing.T) {
	rules := ".claudinite/local/packs/mypack/RULES.md"
	prov := ".claudinite/local/packs/mypack/provenance/w.md"
	base := map[string]string{rules: "# mypack\n\n- **A** — b.\n\n- **W** — check v before w, every time.\n", prov: "## 2026-09-01 · born · w\n- **Mechanism:** prose.\n"}
	fake := func(msg string, changed ...string) *checksdk.Fake {
		return &checksdk.Fake{MergeBase: "base", Base: base, Messages: []string{msg}, ChangedFiles: changed, Added: []checksdk.Line{}}
	}

	restated := map[string]string{rules: "# mypack\n\n- **A** — b.\n\n- **W** — this rule is portable (canon): the basics pack owns it.\n  Check v before w, every time.\n"}
	added := []checksdk.Line{{Path: rules, Line: 5, Text: "- **W** — this rule is portable (canon): the basics pack owns it."}, {Path: rules, Line: 6, Text: "  Check v before w, every time."}}
	f := fake("Claudinite growth: dedup local packs", rules)
	f.Added = added
	expect(t, "a dedup run restating a canon rule", run(t, dedupPruneIntegrity, restated, f),
		want{path: rules, line: 5, what: `^local-pack prose re-imports a canon rule: "- \*\*W\*\* — this rule is portable \(canon\)`, fix: "(canon): here"},
		want{path: rules, what: `^a dedup run grew .*RULES\.md from 6 to 7 lines`})
	f = fake("change", rules)
	f.Added = added
	expect(t, "a restatement on any branch", run(t, dedupPruneIntegrity, restated, f),
		want{path: rules, line: 5, what: "re-imports a canon rule"})

	pruned := map[string]string{rules: "# mypack\n\n- **A** — b.\n", prov: "## 2026-09-01 · born · w\n- **Mechanism:** prose.\n\n## 2026-10-01 · retired · the canon covers it\n- **Reason:** basics carries it.\n"}
	expect(t, "a prune, its provenance grown", run(t, dedupPruneIntegrity, pruned, fake("Claudinite growth: dedup local packs", rules, prov)))

	rewrapped := map[string]string{rules: "# mypack\n\n- **A** — b.\n\n- **W** — check v before w, every single time, whatever.\n"}
	expect(t, "a dedup run that grew a line", run(t, dedupPruneIntegrity, rewrapped, fake("Claudinite growth: dedup local packs", rules)),
		want{path: rules, what: "characters"})

	reaching := map[string]string{rules: "# mypack\n\n- **A** — b, longer now than it was.\n\n- **W** — check v before w, every time.\n", "README.md": "fix the dedup routine\n"}
	expect(t, "a change fixing the routine reaches outside", run(t, dedupPruneIntegrity, reaching, fake("Fix the dedup routine", rules, "README.md")))
}
