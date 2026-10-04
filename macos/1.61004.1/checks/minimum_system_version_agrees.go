// Package checks holds macos's coded checks.
package checks

import (
	"regexp"
	"strconv"
	"strings"

	"claudinite.com/checksdk"
)

var (
	plistFile    = regexp.MustCompile(`\.plist$`)
	platformsKey = regexp.MustCompile(`\bplatforms\s*:`)
	macOSCall    = regexp.MustCompile(`\.macOS\s*\(([^()]*)\)`)
	lsMinimum    = regexp.MustCompile(`<\s*key\s*>\s*LSMinimumSystemVersion\s*<\s*\/\s*key\s*>\s*<\s*string\s*>\s*([^<]*?)\s*<\s*\/\s*string\s*>`)
	versionLit   = regexp.MustCompile(`^\d+(?:\.\d+)*$`)
	enumForm     = regexp.MustCompile(`^\s*\.v(\d+)(?:_(\d+))?\s*$`)
	stringForm   = regexp.MustCompile(`^\s*["'](\d+(?:\.\d+)*)["']\s*$`)
	xmlComment   = regexp.MustCompile(`(?s)<!--.*?-->`)
)

// isPackageManifest is a Package.swift at the root or one directory down,
// the pack's fingerprint depth.
func isPackageManifest(f string) bool {
	return strings.Count(f, "/") <= 1 && f[strings.LastIndex(f, "/")+1:] == "Package.swift"
}

func blank(s string) string {
	b := []byte(s)
	for i, c := range b {
		if c != '\n' {
			b[i] = ' '
		}
	}
	return string(b)
}

func lineOf(text string, index int) int { return strings.Count(text[:index], "\n") + 1 }

// bracketSpan is the inside of the balanced [ … ] following from.
func bracketSpan(text string, from int) (string, bool) {
	open := strings.Index(text[from:], "[")
	if open < 0 {
		return "", false
	}
	open += from
	depth := 0
	for i := open; i < len(text); i++ {
		switch text[i] {
		case '[':
			depth++
		case ']':
			depth--
			if depth == 0 {
				return text[open+1 : i], true
			}
		}
	}
	return "", false
}

// canonical is a dotted version without its trailing zeros, each part
// read as a number: 14, 14.0 and 14.0.0 are one floor.
func canonical(parts []string) string {
	nums := make([]string, len(parts))
	for i, p := range parts {
		f, _ := strconv.ParseFloat(p, 64)
		nums[i] = strconv.FormatFloat(f, 'f', -1, 64)
	}
	for len(nums) > 1 && nums[len(nums)-1] == "0" {
		nums = nums[:len(nums)-1]
	}
	return strings.Join(nums, ".")
}

// platformVersion reads .v14, .v10_15 or "14.1"; anything else is a floor
// the check cannot read, which is no disagreement.
func platformVersion(arg string) ([]string, bool) {
	if m := enumForm.FindStringSubmatch(arg); m != nil {
		if m[2] == "" {
			return []string{m[1]}, true
		}
		return []string{m[1], m[2]}, true
	}
	if m := stringForm.FindStringSubmatch(arg); m != nil {
		return strings.Split(m[1], "."), true
	}
	return nil, false
}

func init() {
	checksdk.Register(checksdk.Check{
		ID:     "minimum-system-version-agrees",
		Tags:   []string{"world"},
		OnFail: "block",
		Doc:    "packs/macos/skills/macos-app-bundle/SKILL.md",
		Why:    "the two are independent claims about the same minimum OS and only one of them is enforced at launch, so a drift ships a floor nobody chose and no build step compares them",
		Run:    minimumSystemVersionAgrees,
	})
}

type floorSource struct{ file, written string }

func minimumSystemVersionAgrees(repo checksdk.Repo) []checksdk.Finding {
	var order []string
	floors := map[string]floorSource{}
	files := repo.Files()
	for _, file := range files {
		if !isPackageManifest(file) {
			continue
		}
		raw, ok := repo.Read(file)
		if !ok {
			continue
		}
		text := checksdk.StripComments(raw)
		at := platformsKey.FindStringIndex(text)
		if at == nil {
			continue
		}
		list, ok := bracketSpan(text, at[0])
		if !ok {
			continue
		}
		for _, m := range macOSCall.FindAllStringSubmatch(list, -1) {
			version, ok := platformVersion(m[1])
			if !ok {
				continue
			}
			key := canonical(version)
			if _, seen := floors[key]; !seen {
				order = append(order, key)
			}
			floors[key] = floorSource{file: file, written: strings.TrimSpace(m[1])}
		}
	}
	if len(order) == 0 {
		return nil
	}
	var out []checksdk.Finding
	for _, file := range files {
		if !plistFile.MatchString(file) {
			continue
		}
		raw, ok := repo.Read(file)
		if !ok {
			continue
		}
		text := xmlComment.ReplaceAllStringFunc(raw, blank)
		claim := lsMinimum.FindStringSubmatchIndex(text)
		if claim == nil {
			continue
		}
		value := text[claim[2]:claim[3]]
		if !versionLit.MatchString(value) {
			continue
		}
		if _, ok := floors[canonical(strings.Split(value, "."))]; ok {
			continue
		}
		expected, source := order[0], floors[order[0]]
		out = append(out, checksdk.Finding{
			Path:     file,
			Line:     lineOf(text, claim[0]),
			Sentence: "LSMinimumSystemVersion is " + value + ", but " + source.file + " declares a macOS floor of " + expected + " (.macOS(" + source.written + "))",
			Fix:      "make the two claims one OS version — either <string>" + expected + "</string> here, or move the package's platforms: [.macOS(…)] to " + value,
		})
	}
	return out
}
