// Package checks holds the python pack's coded checks: a package's
// optional heavy or native dependency imported lazily, and its guard's
// re-raise naming the install command.
package checks

import (
	"regexp"
	"strings"

	"claudinite.com/checksdk"
)

// Both checks are inert until the repo declares optional dependencies in
// a pyproject.toml ([project.optional-dependencies] is the only place a
// package is declared optional), and only those packages are in scope.
// Test files and the skill's own folder are excluded.
const skillDir = "skills/python-optional-deps/"

var (
	pyFile    = regexp.MustCompile(`\.py$`)
	testish   = regexp.MustCompile(`(^|/)(tests?|__tests__)/|(^|/)(test_[^/]*|conftest)\.py$|_test\.py$`)
	pyproject = regexp.MustCompile(`(^|/)pyproject\.toml$`)
	header    = regexp.MustCompile(`^\s*\[([^\]]+)\]`)
	quoted    = regexp.MustCompile(`["']([^"']+)["']`)
	distName  = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._-]*`)
	fromLine  = regexp.MustCompile(`^from\s+([.\w]+)\s+import\b`)
	importAll = regexp.MustCompile(`^import\s+(.+)$`)
	asSplit   = regexp.MustCompile(`\s+as\s+`)
)

// optionalDistNames are the distribution names under
// [project.optional-dependencies], read by line (the leading package token
// of every quoted requirement until the next header). The inline form
// under [project] is not parsed: a safe false negative.
func optionalDistNames(toml string) map[string]bool {
	names := map[string]bool{}
	in := false
	for _, raw := range strings.Split(toml, "\n") {
		if m := header.FindStringSubmatch(raw); m != nil {
			in = strings.TrimSpace(m[1]) == "project.optional-dependencies"
			continue
		}
		if !in {
			continue
		}
		for _, m := range quoted.FindAllStringSubmatch(raw, -1) {
			if n := distName.FindString(strings.TrimSpace(m[1])); n != "" {
				names[strings.ToLower(n)] = true
			}
		}
	}
	return names
}

// importNamesFor are the import names a dist could appear as: the name,
// and - or . turned to _. A dist whose import name is unrelated (Pillow
// as PIL) is not mapped, so it is never flagged.
func importNamesFor(dists map[string]bool) map[string]bool {
	out := map[string]bool{}
	for d := range dists {
		out[d] = true
		out[strings.NewReplacer("-", "_", ".", "_").Replace(d)] = true
	}
	return out
}

// topPackagesOf are the top-level packages an import line pulls in,
// lower-cased; a relative from-import yields none. Callers strip comments.
func topPackagesOf(line string) []string {
	line = strings.TrimFunc(line, checksdk.IsJSSpace)
	if m := fromLine.FindStringSubmatch(line); m != nil {
		if strings.HasPrefix(m[1], ".") {
			return nil
		}
		return []string{strings.ToLower(strings.Split(m[1], ".")[0])}
	}
	m := importAll.FindStringSubmatch(line)
	if m == nil {
		return nil
	}
	var out []string
	for _, part := range strings.Split(m[1], ",") {
		name := strings.TrimSpace(asSplit.Split(strings.TrimSpace(part), 2)[0])
		name = strings.ToLower(strings.Split(name, ".")[0])
		if name != "" && !strings.HasPrefix(name, ".") {
			out = append(out, name)
		}
	}
	return out
}

func optionalImportNames(repo checksdk.Repo) map[string]bool {
	optional := map[string]bool{}
	for _, f := range repo.Files() {
		if strings.HasPrefix(f, skillDir) || !pyproject.MatchString(f) {
			continue
		}
		text, _ := repo.Read(f)
		for n := range optionalDistNames(text) {
			optional[n] = true
		}
	}
	if len(optional) == 0 {
		return nil
	}
	return importNamesFor(optional)
}

func pyFiles(repo checksdk.Repo) []string {
	var out []string
	for _, f := range repo.Files() {
		if !strings.HasPrefix(f, skillDir) && pyFile.MatchString(f) && !testish.MatchString(f) {
			out = append(out, f)
		}
	}
	return out
}

func importsOptional(code string, names map[string]bool) string {
	for _, p := range topPackagesOf(code) {
		if names[p] {
			return p
		}
	}
	return ""
}
