package checks

import (
	"strings"
	"testing"

	"claudinite.com/checksdk"
)

func TestPromoteScope(t *testing.T) {
	files := map[string]string{"packs/p/RULES.md": "x\n", "skills/s.md": "x\n", "engine/e.mjs": "x\n"}
	promote := func(branch, mergeBase string, config any, changed, deleted, untracked []string) *checksdk.Fake {
		return &checksdk.Fake{Branch: branch, MergeBase: mergeBase, ChangedFiles: changed, Deleted: deleted, Untracked: untracked,
			PackConfig: map[string]any{"claudinite-canon-curation": config}}
	}
	expect(t, "a promote branch inside the shelf", run(t, promoteScope, files, promote("claudinite/growth-promote-1", "abc", nil, []string{"packs/p/RULES.md"}, nil, nil)), "")
	expect(t, "a promote branch writing, deleting and leaving files past the shelf", run(t, promoteScope, files,
		promote("claudinite/growth-promote-1", "abc", nil, []string{"packs/p/RULES.md", "engine/e.mjs"}, []string{"README.md"}, []string{"packsx/a.md"})),
		"README.md engine/e.mjs packsx/a.md")
	expect(t, "a second root the entry declares", run(t, promoteScope, files,
		promote("growth-promote", "abc", map[string]any{"write_paths": []any{" ./skills/ ", "", 7}}, []string{"skills/s.md", "engine/e.mjs"}, nil, nil)),
		"engine/e.mjs")
	expect(t, "any other branch writes anything", run(t, promoteScope, files, promote("claude/fix", "abc", nil, []string{"engine/e.mjs"}, nil, nil)), "")
	fs := run(t, promoteScope, files, promote("growth-promote", "", nil, []string{"packs/p/RULES.md"}, nil, nil))
	if len(fs) != 1 || !strings.Contains(fs[0].Sentence, "no merge base") {
		t.Errorf("a promote branch with no merge base is refused, got %+v", fs)
	}
	if got := strings.Join(corpusRoots([]byte(`{"write_paths": [" skills ", "./prompts/", "packs", "", 7, "skills/"]}`)), " "); got != "packs/ skills/ prompts/" {
		t.Errorf("corpusRoots = %s", got)
	}
}
