package checks

import (
	"regexp"
	"sort"
	"strings"
	"unicode/utf8"

	"claudinite.com/checksdk"
)

// A corpus SKILL.md declares the usage it expects of itself under its
// frontmatter metadata.usage, read by the reader the usage review uses.
// Without it, a skill that never loads and one that is never needed read
// the same zero. A skill expecting "triggered" must carry a force-load
// declaration to be triggered by; the converse is no fault, since a skill
// may carry a trigger and still expect most loads by judgment. Anchored at
// packs/<pack>/skills/, so it is inert in a repo with no shelf.
func init() {
	checksdk.Register(checksdk.Check{
		ID:    "skill-usage-declared",
		Tags:  []string{"world"},
		Since: "2026-09-21",
		Doc:   "packs/claudinite-canon-curation/skills/writing-claudinite-skills/SKILL.md",
		Why:   "without a declared expectation, a skill that never loads and one that is never needed read the same zero, and the usage review cannot tell a broken skill from a healthy one",
		Run:   skillUsage,
	})
}

// usageExpects are the values metadata.usage.expect takes.
var usageExpects = []string{"adoption", "triggered", "judgment"}

var forceLoadKey = regexp.MustCompile(`(?m)^\s*force-load-on-\S+:`)

func skillUsage(repo checksdk.Repo) []checksdk.Finding {
	expects := strings.Join(usageExpects, " | ")
	var out []checksdk.Finding
	for _, f := range repo.Files() {
		if !skillDoc.MatchString(f) {
			continue
		}
		text, ok := repo.Read(f)
		if !ok {
			continue
		}
		expect, problems, declared := usageOf(frontmatter(text))
		if !declared {
			out = append(out, checksdk.Finding{Path: f, Sentence: "declares no metadata.usage block",
				Fix: `add one under metadata - "usage:" then "expect:" one of ` + expects + `; a skill that loads at its own force-load moments and nowhere else is "triggered"`})
			continue
		}
		if expect == "triggered" && triggerCount(text) == 0 {
			out = append(out, checksdk.Finding{Path: f, Sentence: `expects "triggered" and declares no force-load trigger to be triggered by`,
				Fix: `declare the force-load moment it loads at, or expect "judgment" - loaded when the model judges its description fits`})
		}
		for _, p := range problems {
			out = append(out, checksdk.Finding{Path: f, Sentence: "its metadata.usage " + p, Fix: "correct the block - the usage review reads it exactly as this check does"})
		}
	}
	return out
}

// triggerCount is how many force-load keys the frontmatter carries, read
// as text up to the closing fence.
func triggerCount(text string) int {
	end := -1
	if len(text) > 3 {
		if i := strings.Index(text[3:], "\n---"); i >= 0 {
			end = i + 3
		}
	}
	return len(forceLoadKey.FindAllStringIndex(text[:end+1], -1))
}

// usageOf reads the frontmatter's metadata.usage block: its expect when
// that is one of usageExpects, what is wrong with the block, and whether
// there is one at all.
func usageOf(fm map[string]any) (expect string, problems []string, declared bool) {
	md, _ := fm["metadata"].(map[string]any)
	v, ok := md["usage"]
	if !ok {
		return "", nil, false
	}
	block, ok := v.(map[string]any)
	if !ok {
		return "", []string{"usage is not a block of keys"}, true
	}
	raw, _ := block["expect"].(string)
	raw = strings.TrimSpace(raw)
	for _, e := range usageExpects {
		if raw == e {
			expect = e
		}
	}
	all := strings.Join(usageExpects, " | ")
	switch {
	case expect != "":
	case raw != "":
		problems = append(problems, "expect: "+raw+" is outside "+all)
	default:
		problems = append(problems, "expect is missing - one of "+all)
	}
	var keys []string
	for k := range block {
		if k != "expect" {
			keys = append(keys, k)
		}
	}
	sort.Strings(keys)
	for _, k := range keys {
		problems = append(problems, k+" is not a key of the usage block, whose only key is expect")
	}
	return expect, problems, true
}

var (
	fmItem = regexp.MustCompile(`^\s+-\s*(.*)$`)
	fmKV   = regexp.MustCompile(`^\s*([A-Za-z_][A-Za-z0-9_-]*):\s*(.*)$`)
	fmFlow = regexp.MustCompile(`^\[(.*)\]$`)
)

func unquote(s string) string {
	t := strings.TrimSpace(s)
	if len(t) >= 2 && ((t[0] == '"' && t[len(t)-1] == '"') || (t[0] == '\'' && t[len(t)-1] == '\'')) {
		return t[1 : len(t)-1]
	}
	return t
}

// frontmatter reads a SKILL.md's frontmatter with the deliberate YAML
// subset the harness-side skill reader uses: scalars, a block list,
// nested maps, a flow list split on commas, quotes stripped. Text with no
// frontmatter reads as an empty map.
func frontmatter(text string) map[string]any {
	out := map[string]any{}
	if !strings.HasPrefix(text, "---") {
		return out
	}
	end := strings.Index(text[3:], "\n---")
	if end == -1 {
		return out
	}
	end += 3
	first := strings.Index(text, "\n")
	if first+1 > end {
		return out
	}
	type frame struct {
		key    string
		indent int
		parent map[string]any
	}
	var stack []frame
	for _, line := range strings.Split(text[first+1:end], "\n") {
		if strings.TrimSpace(line) == "" {
			continue
		}
		indent := utf8.RuneCountInString(line) - utf8.RuneCountInString(strings.TrimLeft(line, " \t"))
		for len(stack) > 0 && indent <= stack[len(stack)-1].indent {
			stack = stack[:len(stack)-1]
		}
		var open *frame
		if len(stack) > 0 {
			open = &stack[len(stack)-1]
		}
		if m := fmItem.FindStringSubmatch(line); m != nil && open != nil {
			if l, ok := open.parent[open.key].([]any); ok {
				open.parent[open.key] = append(l, unquote(m[1]))
			}
			continue
		}
		m := fmKV.FindStringSubmatch(line)
		if m == nil {
			continue
		}
		key, rest := m[1], m[2]
		target := out
		if open != nil {
			if l, ok := open.parent[open.key].([]any); ok && len(l) == 0 {
				open.parent[open.key] = map[string]any{}
			}
			t, ok := open.parent[open.key].(map[string]any)
			if !ok {
				continue
			}
			target = t
		}
		if strings.TrimSpace(rest) == "" {
			target[key] = []any{}
			stack = append(stack, frame{key: key, indent: indent, parent: target})
			continue
		}
		if f := fmFlow.FindStringSubmatch(strings.TrimSpace(rest)); f != nil {
			list := []any{}
			for _, p := range strings.Split(f[1], ",") {
				if u := unquote(p); u != "" {
					list = append(list, u)
				}
			}
			target[key] = list
			continue
		}
		target[key] = unquote(rest)
	}
	return out
}
