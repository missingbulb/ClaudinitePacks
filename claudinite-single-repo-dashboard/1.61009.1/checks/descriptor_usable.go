// Package checks holds the claudinite-single-repo-dashboard pack's coded
// checks.
package checks

import (
	"regexp"
	"strings"

	"claudinite.com/checksdk"
)

// schemaPath is the schema a descriptor is written against, spelled as
// the shelf lays it out.
const schemaPath = "packs/claudinite-single-repo-dashboard/dashboard-descriptor.schema.json"

// A pack's dashboard descriptor must be one the dashboard's own reader
// can use, with every id its repo view selects declared. A descriptor the
// reader rejects does not break the page: it becomes one apologetic line
// on that pack's card in someone else's browser, so nothing goes red
// where the author looks unless this does. The scope is the descriptors a
// repo can fix, the shelf's packs/<id>/ and a member's own local packs,
// taken from every file the walk sees so an untracked one is covered; the
// vendored mount is the canon's to fix, never a member's.
func init() {
	checksdk.Register(checksdk.Check{
		ID:     "descriptor-usable",
		Tags:   []string{"world"},
		OnFail: "block",
		Since:  "2026-08-22",
		Doc:    schemaPath,
		Why:    "a descriptor the reader rejects renders as an apology on a card in someone else's browser — the pack ships, converges, and reports nothing, with nothing going red anywhere the author looks",
		Run:    descriptorUsable,
	})
}

// descriptorScope is a descriptor a repo can fix: the shelf's
// packs/<id>/ and a member's own .claudinite/local/packs/<id>/.
var descriptorScope = regexp.MustCompile(`^(\.claudinite/local/)?packs/([^/]+)/dashboard\.json$`)

func descriptorUsable(repo checksdk.Repo) []checksdk.Finding {
	var out []checksdk.Finding
	for _, f := range repo.AllFiles() {
		if strings.HasPrefix(f, ".claudinite/shared/") {
			continue
		}
		m := descriptorScope.FindStringSubmatch(f)
		if m == nil {
			continue
		}
		text, ok := repo.Read(f)
		if !ok {
			continue
		}
		for _, p := range descriptorProblems([]byte(text), m[2]) {
			out = append(out, checksdk.Finding{Path: f, Sentence: p.what, Fix: p.fix})
		}
	}
	return out
}

type problem struct{ what, fix string }

// descriptorProblems are the reader's fault, else the ids the repo view
// selects and the descriptor does not declare.
func descriptorProblems(text []byte, pack string) []problem {
	d := parseDescriptor(text, pack)
	if d.Fault != nil {
		return []problem{{
			what: "the dashboard reader rejects it: " + *d.Fault,
			fix:  "make it satisfy " + schemaPath + ` — at minimum a "widgets" array whose entries each carry an "id" and a "kind" from ` + strings.Join(descriptorKinds, ", "),
		}}
	}
	doc, _ := decodeJSON(text)
	selected, _ := doc.(map[string]any)["repo"].([]any)
	var dangling []string
	seen := map[string]bool{}
	for _, id := range selected {
		if d.declares(id) {
			continue
		}
		// A Set keeps one of each primitive; an object or array is its own.
		switch id.(type) {
		case map[string]any, []any:
		default:
			key := typeTag(id) + jsString(id)
			if seen[key] {
				continue
			}
			seen[key] = true
		}
		shown := ""
		if id != nil {
			shown = jsString(id)
		}
		dangling = append(dangling, shown)
	}
	if len(dangling) == 0 {
		return nil
	}
	return []problem{{
		what: "selects widget id(s) it does not declare: " + strings.Join(dangling, ", "),
		fix:  `declare the widget in "widgets", or drop the id from the view that names it — the page silently renders nothing for an id it cannot resolve`,
	}}
}

func typeTag(v any) string {
	switch v.(type) {
	case nil:
		return "n"
	case bool:
		return "b"
	case string:
		return "s"
	}
	return "#"
}
