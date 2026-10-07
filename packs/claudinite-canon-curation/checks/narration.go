// Package checks holds the claudinite-canon-curation pack's coded checks:
// they police the content of a canon's packs/ shelf, and each is inert in
// a repo that keeps no shelf.
package checks

import (
	"path"
	"regexp"
	"sort"
	"strings"

	"claudinite.com/checksdk"
)

// A canon pack's injected prose and its corpus skills must not narrate
// their own enforcement: checks run on their own at every Stop and in CI,
// and each failure message carries its rule. The pack scan reads exactly
// the file each shelf manifest names as its prose, never the README, whose
// catalog lists the rules and how each is enforced; the skill scan reads
// every SKILL.md under packs/<pack>/skills/, on a shelf or in a member's
// own packs, and never a mounted .claude/skills/.
func init() {
	checksdk.Register(checksdk.Check{
		ID:   "pack-no-enforcement-narration",
		Tags: []string{"world"},
		Doc:  "packs/claudinite-canon-curation/README.md",
		Why:  "checks run automatically at every Stop and in CI, and each failure message carries its rule — prose narrating its own enforcement duplicates the mechanism and drifts from it",
		Run:  packNarration,
	})
	checksdk.Register(checksdk.Check{
		ID:   "skill-no-enforcement-narration",
		Tags: []string{"world"},
		Doc:  "packs/claudinite-canon-curation/skills/writing-claudinite-skills/SKILL.md",
		Why:  "checks run automatically at every Stop and in CI, and each failure message carries its rule — a skill narrating its own enforcement duplicates the mechanism and drifts from it",
		Run:  skillNarration,
	})
}

var (
	runnerRe   = regexp.MustCompile(`checks/run\.mjs`)
	shelfManRe = regexp.MustCompile(`^packs/[^/]+/pack\.(?:json|mjs)$`)
	proseRe    = regexp.MustCompile(`(?:^|[\s{,])"?prose"?:\s*['"]([^'"]+)['"]`)
	mjsIDRe    = regexp.MustCompile(`\bid:\s*'([a-z][\w-]+)'`)
	goIDRe     = regexp.MustCompile(`\bID:\s*"([^"]+)"`)
	// goRegistrar is a named function or a closure whose first parameter
	// a check's ID field may take.
	goRegistrar = regexp.MustCompile(`(?:\bfunc\s+(\w+)|\b(\w+)\s*:?=\s*func)\s*\(\s*(\w+)\b`)
	// skillDoc spans a shelf's packs/ and a member's .claudinite/local/packs/.
	skillDoc = regexp.MustCompile(`(^|/)packs/[^/]+/skills/[^/]+/SKILL\.md$`)
)

func packNarration(repo checksdk.Repo) []checksdk.Finding {
	var docs []string
	for _, f := range repo.Files() {
		if !shelfManRe.MatchString(f) {
			continue
		}
		text, _ := repo.Read(f)
		if m := proseRe.FindStringSubmatch(text); m != nil {
			docs = append(docs, path.Join(path.Dir(f), m[1]))
		}
	}
	return narration(repo, docs)
}

func skillNarration(repo checksdk.Repo) []checksdk.Finding {
	var docs []string
	for _, f := range repo.Files() {
		if skillDoc.MatchString(f) {
			docs = append(docs, f)
		}
	}
	return narration(repo, docs)
}

// narration flags each doc's lines that tell the reader to run the checks
// runner or name a rule its directory's own coded checks declare.
func narration(repo checksdk.Repo, docs []string) []checksdk.Finding {
	var out []checksdk.Finding
	lines := func(doc string, re *regexp.Regexp, what, fix string) {
		text, ok := repo.Read(doc)
		if !ok {
			return
		}
		for i, l := range strings.Split(text, "\n") {
			if re.MatchString(l) {
				out = append(out, checksdk.Finding{Path: doc, Line: i + 1, Sentence: what, Fix: fix})
			}
		}
	}
	for _, doc := range docs {
		lines(doc, runnerRe, "tells the reader to run the checks runner", "delete the instruction — the Stop hook and CI run every check on their own")
	}
	files := repo.Files()
	for _, doc := range docs {
		for _, id := range codedIDsIn(repo, files, path.Dir(doc)) {
			word := regexp.MustCompile(`(^|[^\w-])` + regexp.QuoteMeta(id) + `([^\w-]|$)`)
			lines(doc, word, `names its own check rule "`+id+`"`, "remove the mention — the rule announces itself when it fires, and its failure message carries the instruction")
		}
	}
	return out
}

// codedIDsIn are the rule ids dir's coded checks declare, sorted: the
// JavaScript modules directly in dir, and the Go package in dir/checks
// (its _test.go files aside), sit beside the prose they would narrate.
func codedIDsIn(repo checksdk.Repo, files []string, dir string) []string {
	seen := map[string]bool{}
	var goSources []string
	for _, f := range files {
		if path.Dir(f) == dir+"/checks" && strings.HasSuffix(f, ".go") && !strings.HasSuffix(f, "_test.go") {
			if text, ok := repo.Read(f); ok {
				goSources = append(goSources, text)
			}
		}
	}
	for _, id := range goCheckIDs(goSources) {
		seen[id] = true
	}
	for _, f := range files {
		if path.Dir(f) != dir || !strings.HasSuffix(f, ".mjs") || strings.HasSuffix(f, "/pack.mjs") || strings.HasSuffix(f, ".test.mjs") {
			continue
		}
		text, ok := repo.Read(f)
		if !ok {
			continue
		}
		for _, m := range mjsIDRe.FindAllStringSubmatch(text, -1) {
			seen[m[1]] = true
		}
	}
	ids := make([]string, 0, len(seen))
	for id := range seen {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	return ids
}

// goCheckIDs are the check ids one Go package's sources register: each
// ID: literal, and the first argument, a string literal, of every call to
// a function or closure that passes its first parameter to an ID field.
func goCheckIDs(sources []string) []string {
	var out []string
	for _, src := range sources {
		for _, m := range goIDRe.FindAllStringSubmatch(src, -1) {
			out = append(out, m[1])
		}
	}
	var registrars []string
	for _, src := range sources {
		for _, loc := range goRegistrar.FindAllStringSubmatchIndex(src, -1) {
			name := ""
			for _, g := range [][2]int{{loc[2], loc[3]}, {loc[4], loc[5]}} {
				if g[0] >= 0 {
					name = src[g[0]:g[1]]
				}
			}
			param := src[loc[6]:loc[7]]
			body := src[loc[1]:]
			if next := strings.Index(body, "\nfunc "); next >= 0 {
				body = body[:next]
			}
			if regexp.MustCompile(`\bID:\s*` + regexp.QuoteMeta(param) + `\s*[,}]`).MatchString(body) {
				registrars = append(registrars, name)
			}
		}
	}
	for _, name := range registrars {
		call := regexp.MustCompile(`\b` + regexp.QuoteMeta(name) + `\(\s*"([^"]+)"`)
		for _, src := range sources {
			for _, m := range call.FindAllStringSubmatch(src, -1) {
				out = append(out, m[1])
			}
		}
	}
	return out
}
