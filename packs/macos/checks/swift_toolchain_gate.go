package checks

import (
	"regexp"
	"strings"

	"claudinite.com/checksdk"
)

var (
	// probe asks "is there a swift?"; swiftc?\b leaves swiftlint and
	// swift-format alone.
	probe = regexp.MustCompile(`\b(?:command\s+-v|which|type\s+-p|hash)\s+(?:\/usr\/bin\/)?swiftc?\b`)
	gate  = regexp.MustCompile(`\bxcode-select\s+-p\b`)
	// shellComment is a # at a line's start or after whitespace, leaving
	// ${#var} and a # glued to a word alone.
	shellComment = regexp.MustCompile(`(^|\s)#.*$`)
	shellScript  = regexp.MustCompile(`\.(?:sh|bash|zsh)$`)
	yamlFile     = regexp.MustCompile(`\.ya?ml$`)
)

func inScope(f string) bool {
	return shellScript.MatchString(f) || strings.HasPrefix(f, ".github/workflows/") && yamlFile.MatchString(f)
}

type logical struct {
	line int
	text string
}

// logicalLines folds trailing-backslash continuations, each entry keeping
// the 1-based line its command started on.
func logicalLines(text string) []logical {
	var out []logical
	var buf *logical
	for i, line := range strings.Split(text, "\n") {
		continued := strings.HasSuffix(line, `\`)
		body := line
		if continued {
			body = line[:len(line)-1]
		}
		if buf == nil {
			buf = &logical{line: i + 1, text: body}
		} else {
			buf.text += " " + strings.TrimSpace(body)
		}
		if !continued {
			out = append(out, *buf)
			buf = nil
		}
	}
	if buf != nil {
		out = append(out, *buf)
	}
	return out
}

func init() {
	checksdk.Register(checksdk.Check{
		ID:     "swift-toolchain-gate",
		Tags:   []string{"world"},
		OnFail: "block",
		Doc:    "packs/macos/RULES.md",
		Why:    "/usr/bin/swift is a stub present on every Mac that prompts an 8 GB command-line-tools install when run without a developer directory, so `command -v swift` reports success on exactly the toolchain-less Mac the script is meant to degrade on",
		Run:    swiftToolchainGate,
	})
}

func swiftToolchainGate(repo checksdk.Repo) []checksdk.Finding {
	var out []checksdk.Finding
	for _, file := range repo.Files() {
		if !inScope(file) {
			continue
		}
		text, ok := repo.Read(file)
		if !ok {
			continue
		}
		gated := false
		for _, l := range logicalLines(text) {
			command := shellComment.ReplaceAllString(l.text, "${1}")
			if gate.MatchString(command) {
				gated = true
			}
			if gated || !probe.MatchString(command) {
				continue
			}
			out = append(out, checksdk.Finding{
				Path:     file,
				Line:     l.line,
				Sentence: "probes for a Swift toolchain with no `xcode-select -p` gate before it",
				Fix:      "gate on the developer directory first — `if xcode-select -p >/dev/null 2>&1 && command -v swift >/dev/null 2>&1; then …` — and keep the fallback path working with no toolchain at all",
			})
		}
	}
	return out
}
