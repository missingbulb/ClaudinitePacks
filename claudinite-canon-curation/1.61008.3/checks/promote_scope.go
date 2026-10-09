package checks

import (
	"encoding/json"
	"sort"
	"strings"

	"claudinite.com/checksdk"
)

// The growth promote stage's write surface is the canon's corpus roots:
// the packs/ shelf, plus each path this pack's entry declares under
// config.write_paths. The boundary is true for promote alone - an
// ordinary change legitimately edits anything - and nothing in a diff
// marks it as a promote run, so the check keys on the promote branch,
// whose name carries the task's id. Prose is the request; this is the
// guarantee.
func init() {
	checksdk.Register(checksdk.Check{
		ID:    "promote-scope",
		Tags:  []string{"work"},
		Since: "2026-10-07",
		Doc:   "packs/claudinite-canon-curation/tasks/growth-promote/task.md",
		Why:   "promote runs unattended with a fleet-wide token; a write outside the corpus roots escapes the review-by-blast-radius boundary the growth lifecycle is built on",
		Run:   promoteScope,
	})
}

const (
	promoteBranch = "growth-promote"
	// shelf is the corpus root no config removes: a canon with no shelf
	// is not a canon.
	shelf = "packs"
)

// corpusRoots are the roots the entry's config names, the shelf first,
// each with its trailing slash so a prefix cannot match a sibling file.
func corpusRoots(config json.RawMessage) []string {
	out := []string{shelf + "/"}
	var c struct {
		WritePaths []any `json:"write_paths"`
	}
	_ = json.Unmarshal(config, &c)
	for _, d := range c.WritePaths {
		s, _ := d.(string)
		s = strings.TrimRight(strings.TrimPrefix(strings.TrimSpace(s), "./"), "/")
		if s == "" {
			continue
		}
		r := s + "/"
		dup := false
		for _, o := range out {
			dup = dup || o == r
		}
		if !dup {
			out = append(out, r)
		}
	}
	return out
}

func promoteScope(repo checksdk.Repo) []checksdk.Finding {
	if !strings.Contains(repo.Branch(), promoteBranch) {
		return nil
	}
	if repo.MergeBase() == "" {
		return []checksdk.Finding{{Sentence: "the promote branch has no merge base with the base branch, so its diff cannot be scoped to the corpus roots",
			Fix: "branch the promote run from the canon's default branch, so what it touched can be measured"}}
	}
	roots := corpusRoots(repo.PackConfig("claudinite-canon-curation"))
	names := make([]string, len(roots))
	for i, r := range roots {
		names[i] = strings.TrimSuffix(r, "/")
	}
	seen := map[string]bool{}
	var stray []string
	for _, p := range append(append(repo.ChangedFiles(), repo.Deleted()...), repo.Untracked()...) {
		if seen[p] {
			continue
		}
		seen[p] = true
		inside := false
		for _, r := range roots {
			inside = inside || strings.HasPrefix(p, r)
		}
		if !inside {
			stray = append(stray, p)
		}
	}
	sort.Strings(stray)
	var out []checksdk.Finding
	for _, p := range stray {
		out = append(out, checksdk.Finding{Path: p,
			Sentence: "the promote phase touched " + p + ", outside " + strings.Join(names, " and "),
			Fix:      "a promoted lesson is portable canon — home it in a pack (prose or checks) or a skill the corpus carries; a lesson that can only live outside the corpus is out of promote scope, so leave it local"})
	}
	return out
}
