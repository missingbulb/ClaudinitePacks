package checks

import (
	"regexp"
	"strings"

	"claudinite.com/checksdk"
)

// A `try: import … except ImportError:` guard around a declared-optional
// import whose except-body re-raises should carry an install hint naming
// the extra, or the user meets a bare ModuleNotFoundError. A probe guard
// that sets a flag instead of raising is out of scope. Advisory: whether
// a message names the exact extra is a wording judgment.
var (
	tryLine    = regexp.MustCompile(`^(\s*)try\s*:`)
	isImport   = regexp.MustCompile(`^\s*(import|from)\s`)
	exceptLine = regexp.MustCompile(`^\s*except\b.*\bImportError\b`)
	pipInstall = regexp.MustCompile(`\bpip install\b`)
	raiseLine  = regexp.MustCompile(`^\s*raise\b`)
)

func init() {
	checksdk.Register(checksdk.Check{
		ID:     "python-optional-import-install-hint",
		Tags:   []string{"world"},
		OnFail: "advise",
		Doc:    "packs/python/skills/python-optional-deps/SKILL.md",
		Why:    "a `try/except ImportError` guard that re-raises without an install hint leaves the user a bare ModuleNotFoundError from deep inside a backend instead of the exact `pip install pkg[extra]` that fixes it",
		Run:    optionalImportInstallHint,
	})
}

func indentOf(s string) int { return len(s) - len(strings.TrimLeftFunc(s, checksdk.IsJSSpace)) }

func blank(s string) bool { return strings.TrimFunc(s, checksdk.IsJSSpace) == "" }

// offendingGuards are the 1-based lines of the raise in each guard whose
// try-body imports an optional package and whose except-body re-raises
// with no pip install hint.
func offendingGuards(text string, names map[string]bool) []int {
	lines := strings.Split(text, "\n")
	var hits []int
	for i := range lines {
		m := tryLine.FindStringSubmatch(lines[i])
		if m == nil {
			continue
		}
		base := len(m[1])
		j := i + 1
		optional := false
		for ; j < len(lines); j++ {
			if blank(lines[j]) {
				continue
			}
			if indentOf(lines[j]) <= base {
				break
			}
			code, _, _ := strings.Cut(lines[j], "#")
			if isImport.MatchString(code) && importsOptional(code, names) != "" {
				optional = true
			}
		}
		if !optional || j >= len(lines) || indentOf(lines[j]) != base || !exceptLine.MatchString(lines[j]) {
			continue
		}
		raise, hint := 0, false
		for k := j + 1; k < len(lines); k++ {
			if blank(lines[k]) {
				continue
			}
			if indentOf(lines[k]) <= base {
				break
			}
			hint = hint || pipInstall.MatchString(lines[k])
			if raise == 0 && raiseLine.MatchString(lines[k]) {
				raise = k + 1
			}
		}
		if raise != 0 && !hint {
			hits = append(hits, raise)
		}
	}
	return hits
}

func optionalImportInstallHint(repo checksdk.Repo) []checksdk.Finding {
	names := optionalImportNames(repo)
	if names == nil {
		return nil
	}
	var out []checksdk.Finding
	for _, file := range pyFiles(repo) {
		text, ok := repo.Read(file)
		if !ok {
			continue
		}
		for _, line := range offendingGuards(text, names) {
			out = append(out, checksdk.Finding{
				Path: file, Line: line,
				Sentence: "re-raises a missing optional dependency without a `pip install` hint",
				Fix:      `raise ImportError from the caught error with a message naming the exact extra — e.g. pip install "pkg[extra]" — so the failure tells the user how to fix it`,
			})
		}
	}
	return out
}
