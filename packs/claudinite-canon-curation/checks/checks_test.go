package checks

import (
	"strings"
	"testing"

	"claudinite.com/checksdk"
)

// sentences is each finding as path:line sentence, for asserting what it says.
func sentences(fs []checksdk.Finding) string {
	var out []string
	for _, f := range fs {
		out = append(out, f.Path+":"+itoa(f.Line)+" "+f.Sentence)
	}
	return strings.Join(out, "\n")
}

func TestPackVersionLogOrdered(t *testing.T) {
	fs := run(t, versionLog, map[string]string{
		"packs/acme-pack/provenance/VERSIONS.md":  "# Version history\n\n| Version | Date | What changed |\n| --- | --- | --- |\n| 61003.2 | d | x |\n| 61003.1 | d | x |\n| 61002.4 | d | x |\n| 61003.3 | d | x |\n| 1.0 | d | not a version |\n| 60900.1 | d | x |\n",
		"packs/good-pack/provenance/VERSIONS.md":  "| 61003.2 | d | x |\n| 61003.1 | d | x |\n",
		"docs/provenance/VERSIONS.md":             "| 1 | d | x |\n| 2 | d | x |\n",
		"packs/new-pack/provenance/VERSIONS.md":   "| 1.61004.10 | d | x |\n| 1.61004.2 | d | x |\n| 61003.3 | d | x |\n| 1.61004.1 | d | x |\n",
		"packs/mixed-pack/provenance/VERSIONS.md": "| 2.60101.1 | d | x |\n| 1.61231.9 | d | x |\n| 61099.9 | d | x |\n| 61003 | d | x |\n",
	}, nil)
	expect(t, "a newer row below an older one", fs, "packs/acme-pack/provenance/VERSIONS.md:8 packs/new-pack/provenance/VERSIONS.md:4")
	if s := sentences(fs); !strings.Contains(s, "version 61003.3 sits below 61002.4 (line 7)") || !strings.Contains(s, "version 1.61004.1 sits below 61003.3 (line 3)") {
		t.Errorf("sentences: %s", s)
	}
}
