package checks

import (
	"fmt"
	"regexp"
	"strings"

	"claudinite.com/checksdk"
)

// A declared-optional dependency imported at module top level runs at
// `import <pkg>` time, dragging its heavy or native stack into the
// dependency-free core. Column 0 is top level; a guarded import is
// indented and belongs to the install-hint check.
var topLevelImport = regexp.MustCompile(`^(import|from)\s`)

func init() {
	checksdk.Register(checksdk.Check{
		ID:   "python-optional-import-top-level",
		Tags: []string{"world"},
		Doc:  "packs/python/skills/python-optional-deps/SKILL.md",
		Why:  "a top-level import runs at `import <pkg>` time, so a package the project itself declared optional drags its heavy/native stack into the dependency-free core and breaks every path for anyone who installed without that extra",
		Run:  optionalImportTopLevel,
	})
}

func optionalImportTopLevel(repo checksdk.Repo) []checksdk.Finding {
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
		for i, ln := range strings.Split(text, "\n") {
			if !topLevelImport.MatchString(ln) {
				continue
			}
			code, _, _ := strings.Cut(ln, "#")
			if pkg := importsOptional(code, names); pkg != "" {
				out = append(out, checksdk.Finding{
					Path: file, Line: i + 1,
					Sentence: fmt.Sprintf("imports the optional dependency %q at module top level", pkg),
					Fix:      "move the import inside the function/method/__init__ that uses it (guarded by try/except ImportError), so `import <pkg>` stays dependency-free",
				})
			}
		}
	}
	return out
}
