package checks

import (
	"encoding/json"
	"os"
	"slices"
	"strings"
	"testing"

	"claudinite.com/checksdk"
)

func turn(reply, classLine string, classes ...string) checksdk.Turn {
	return checksdk.Turn{Index: 1, Timestamp: "2026-10-01T10:00:00Z", Text: "please", Reply: reply, ClassLine: classLine, Classes: classes}
}

func TestCommentClassificationForm(t *testing.T) {
	cases := []struct {
		line    string
		classes []string
		want    string
	}{
		{"Comment class: other", []string{"other"}, ""},
		{"Comment class: correction, process-change", []string{"correction", "process-change"}, ""},
		{"**Comment class: feature**", []string{"feature"}, ""},
		{"Comment class: Feature and correction.", []string{"feature", "correction"}, ""},
		{"Comment class: other — unrelated to any feature request", []string{"other", "feature"}, "(conversation)"},
		{"Comment class: correction | feature | process-change | other", []string{"correction", "feature", "process-change", "other"}, "(conversation)"},
		{"Comment class: question", nil, ""},
		{"", nil, ""},
	}
	for _, c := range cases {
		f := &checksdk.Fake{Turns: []checksdk.Turn{turn(c.line+"\nmore", c.line, c.classes...)}}
		expect(t, c.line, run(t, commentClassificationForm, nil, f), c.want)
	}
	expect(t, "no transcript", run(t, commentClassificationForm, nil, nil), "")
	fs := run(t, commentClassificationForm, nil, &checksdk.Fake{Turns: []checksdk.Turn{turn("", "Comment class: other, not a feature", "other", "feature")}})
	if len(fs) != 1 || !strings.Contains(fs[0].Sentence, "declaring `feature`, `other`") {
		t.Errorf("the sentence names the classes read, sorted: %+v", fs)
	}
}

func TestWorkRequestNotStarted(t *testing.T) {
	work := []checksdk.Turn{turn("Comment class: feature", "Comment class: feature", "feature")}
	expect(t, "a work class and no tool call", run(t, workRequestNotStarted, nil, &checksdk.Fake{Turns: work}), "(conversation)")
	expect(t, "a work class and a subagent's call", run(t, workRequestNotStarted, nil, &checksdk.Fake{Turns: work, ToolCalls: []checksdk.ToolCall{{Tool: "Bash", Sidechain: true}}}), "")
	expect(t, "other needs no tool", run(t, workRequestNotStarted, nil, &checksdk.Fake{Turns: []checksdk.Turn{turn("Comment class: other", "Comment class: other", "other")}}), "")
	expect(t, "no transcript", run(t, workRequestNotStarted, nil, nil), "")
}

func TestReferenceIntegrity(t *testing.T) {
	links := map[string]string{"doc.md": "[gone](missing/file.md) and [ok](README.md)\n", "README.md": "x\n"}
	expect(t, "a dangling link, and a resolving one", run(t, referenceIntegrity, links, nil), "doc.md:1")

	deleted := &checksdk.Fake{Deleted: []string{"old.md"}}
	files := map[string]string{"index.md": "see [old](old.md)\n", ".claudinite/shared/packs/basics/README.md": "canon doc mentioning old.md generically\n"}
	expect(t, "surviving references to a deleted file, never from the mount", run(t, referenceIntegrity, files, deleted), "index.md:1 index.md:1")

	wf := &checksdk.Fake{Deleted: []string{".github/workflows/legacy-release.yml"}}
	governed := map[string]string{
		"packs/demo/migrations/2026-01-01-vendoring/migration.mjs": "export default { id: 'vendoring', materialize: [{ dest: '.github/workflows/legacy-release.yml' }] };\n",
		"packs/demo/notes.md": "the consumer hosts `.github/workflows/legacy-release.yml`\n",
	}
	expect(t, "a migration record governs the path it names", run(t, referenceIntegrity, governed, wf), "")
	prose := map[string]string{
		"packs/demo/migrations/2026-01-01-vendoring/migration.mjs": "// Superseded .github/workflows/legacy-release.yml, which nothing writes now.\nexport default { id: 'vendoring' };\n",
		"packs/demo/notes.md": "the consumer hosts `.github/workflows/legacy-release.yml`\n",
	}
	expect(t, "a record naming the path only in a comment governs nothing", run(t, referenceIntegrity, prose, wf), "packs/demo/migrations/2026-01-01-vendoring/migration.mjs:1 packs/demo/notes.md:1")
	renamed := map[string]string{"mount/old.sh": "y\n", "doc.md": "see mount/old.sh\n"}
	expect(t, "a surviving path sharing the deleted basename", run(t, referenceIntegrity, renamed, &checksdk.Fake{Deleted: []string{"old.sh"}}), "")
}

const tidy = "Claudinite tidy: improve comments\n\nRefs #12"

func comments(base map[string]string, changed map[string]string, deleted ...string) (map[string]string, *checksdk.Fake) {
	f := &checksdk.Fake{Base: base, Messages: []string{tidy}, Deleted: deleted}
	for p := range changed {
		f.ChangedFiles = append(f.ChangedFiles, p)
	}
	slices.Sort(f.ChangedFiles)
	return changed, f
}

func TestImproveCommentsScope(t *testing.T) {
	files, f := comments(map[string]string{"src/app.mjs": "// the old wrong note\ncall();\n"}, map[string]string{"src/app.mjs": "/* corrected, and moved to a block */\ncall();\n"})
	expect(t, "a comment-only edit", run(t, improveCommentsScope, files, f), "")
	files, f = comments(map[string]string{"src/app.mjs": "// says it\ncall();\n"}, map[string]string{"src/app.mjs": "call();\n"})
	expect(t, "deleting every comment", run(t, improveCommentsScope, files, f), "")
	files, f = comments(map[string]string{"src/app.mjs": "// note\ncall();\n"}, map[string]string{"src/app.mjs": "// note\ncall(2);\n"})
	expect(t, "a code change riding along", run(t, improveCommentsScope, files, f), "src/app.mjs")
	files, f = comments(map[string]string{"README.md": "old\n"}, map[string]string{"README.md": "new\n", "docs/README.md": "added\n"})
	expect(t, "a README rewritten, and one added", run(t, improveCommentsScope, files, f), "")
	files, f = comments(map[string]string{"README.md": "old\n"}, map[string]string{}, "README.md")
	expect(t, "a README deleted", run(t, improveCommentsScope, files, f), "README.md")
	files, f = comments(map[string]string{"src/gone.mjs": "x();\n"}, map[string]string{"src/new.mjs": "// only a comment\n"}, "src/gone.mjs")
	expect(t, "an added and a deleted code file", run(t, improveCommentsScope, files, f), "src/gone.mjs src/new.mjs")
	files, f = comments(map[string]string{"tool.py": "# note\nx = 1\n"}, map[string]string{"tool.py": "# better\nx = 1\n"})
	fs := run(t, improveCommentsScope, files, f)
	expect(t, "a language the parser cannot read", fs, "tool.py")
	if len(fs) == 1 && !strings.Contains(fs[0].Sentence, "cannot read") {
		t.Errorf("the remedy names the parser: %+v", fs)
	}
	files, f = comments(map[string]string{".claudinite/local/packs/x/hook.mjs": "// old\nrun();\n", ".claudinite/shared/packs/x/a.mjs": "// old\n"}, map[string]string{".claudinite/local/packs/x/hook.mjs": "// better\nrun();\n", ".claudinite/shared/packs/x/a.mjs": "// better\n"})
	expect(t, "the local half is the repo's own, the vendored half never", run(t, improveCommentsScope, files, f), ".claudinite/shared/packs/x/a.mjs")
	files, f = comments(map[string]string{"src/app.mjs": "a();\n"}, map[string]string{"src/app.mjs": "b();\n"})
	f.Messages = []string{"an ordinary change"}
	expect(t, "an ordinary branch", run(t, improveCommentsScope, files, f), "")
	f.Messages, f.Branch = []string{tidy}, "main"
	expect(t, "the default branch", run(t, improveCommentsScope, files, f), "")
}

// The scope gate keys on the worker doc's pinned title, and the task scopes
// its rounds outside the same mount prefix the gate refuses.
func TestImproveCommentsTaskAgrees(t *testing.T) {
	raw, err := os.ReadFile("../tasks/improve-comments/task.json")
	if err != nil {
		t.Fatal(err)
	}
	var task struct {
		Preconditions     []string `json:"preconditions"`
		AgentInstructions string   `json:"agent_instructions"`
	}
	if err := json.Unmarshal(raw, &task); err != nil {
		t.Fatal(err)
	}
	if !slices.Contains(task.Preconditions, "commits-outside:"+mountPrefix) {
		t.Errorf("preconditions %v lack commits-outside:%s", task.Preconditions, mountPrefix)
	}
	doc, err := os.ReadFile("../tasks/improve-comments/" + task.AgentInstructions)
	if err != nil {
		t.Fatal(err)
	}
	if subject, _, _ := strings.Cut(tidy, "\n"); !strings.Contains(string(doc), subject) || !improveCommentsRun.MatchString(subject) {
		t.Errorf("the worker doc does not pin %q", subject)
	}
}
