package checks

import (
	"strings"
	"testing"

	"claudinite.com/checksdk"
)

const usageBlock = "---\nname: s\ndescription: d\nmetadata:\n  usage:\n    expect: judgment\n---\n"

// sentences is each finding as path:line sentence, for asserting what it says.
func sentences(fs []checksdk.Finding) string {
	var out []string
	for _, f := range fs {
		out = append(out, f.Path+":"+itoa(f.Line)+" "+f.Sentence)
	}
	return strings.Join(out, "\n")
}

func TestPackNoEnforcementNarration(t *testing.T) {
	fs := run(t, packNarration, map[string]string{
		"packs/acme-pack/pack.json":  `{"version": "1.0", "prose": "RULES.md"}` + "\n",
		"packs/acme-pack/RULES.md":   "# acme\n\n- run node engine/checks/run.mjs first\n- acme-check guards this\n- not-acme-check-ish is another word\n",
		"packs/acme-pack/check.mjs":  "export default { id: 'acme-check' };\n",
		"packs/acme-pack/README.md":  "acme-check and checks/run.mjs are the README's to list\n",
		"packs/other-pack/pack.json": `{"version": "1.0"}` + "\n",
		"packs/other-pack/RULES.md":  "run checks/run.mjs\n",
	}, nil)
	expect(t, "a runner instruction and an own rule's id in the named prose", fs, "packs/acme-pack/RULES.md:3 packs/acme-pack/RULES.md:4")
	if s := sentences(fs); !strings.Contains(s, "checks runner") || !strings.Contains(s, `"acme-check"`) {
		t.Errorf("sentences: %s", s)
	}
}

// A pack's Go checks, under checks/: an id given as a literal ID or
// through a helper registering by its first parameter is the pack's own
// rule too; a test file's ids never count.
func TestPackNoEnforcementNarrationGoChecks(t *testing.T) {
	fs := run(t, packNarration, map[string]string{
		"packs/acme-pack/pack.json":               `{"version": "1.0", "prose": "RULES.md"}` + "\n",
		"packs/acme-pack/RULES.md":                "# acme\n\n- go-check guards this\n- helper-check too\n- test-only-check is a word\n- acme-go-check-ish is another\n",
		"packs/acme-pack/checks/go_check.go":      "package checks\n\nfunc init() {\n\tchecksdk.Register(checksdk.Check{\n\t\tID:   \"go-check\",\n\t\tTags: []string{\"world\"},\n\t})\n}\n",
		"packs/acme-pack/checks/lib.go":           "package checks\n\nfunc register(id, why string) {\n\tchecksdk.Register(checksdk.Check{ID: id, Why: why})\n}\n",
		"packs/acme-pack/checks/helper.go":        "package checks\n\nfunc init() {\n\tregister(\"helper-check\", \"why\")\n}\n",
		"packs/acme-pack/checks/go_check_test.go": "package checks\n\nvar c = checksdk.Check{ID: \"test-only-check\"}\n",
	}, nil)
	expect(t, "a literal ID and a helper's id", fs, "packs/acme-pack/RULES.md:3 packs/acme-pack/RULES.md:4")
}

func TestSkillNoEnforcementNarration(t *testing.T) {
	fs := run(t, skillNarration, map[string]string{
		"packs/acme-pack/skills/acme-skill/SKILL.md":        usageBlock + "\nRun checks/run.mjs.\nacme-skill-check fires on it.\n",
		"packs/acme-pack/skills/acme-skill/checks.mjs":      "export default { id: 'acme-skill-check' };\n",
		"packs/acme-pack/skills/acme-skill/checks.test.mjs": "const x = { id: 'never-counted' };\n",
		".claude/skills/acme-skill/SKILL.md":                "Run checks/run.mjs.\n",
	}, nil)
	expect(t, "a corpus skill's runner line and own rule, never a mounted copy", fs, "packs/acme-pack/skills/acme-skill/SKILL.md:10 packs/acme-pack/skills/acme-skill/SKILL.md:9")
}

func TestSkillUsageDeclared(t *testing.T) {
	fs := run(t, skillUsage, map[string]string{
		"packs/acme-pack/skills/a/SKILL.md": "---\nname: a\ndescription: d\n---\n",
		"packs/acme-pack/skills/b/SKILL.md": "---\nname: b\ndescription: d\nmetadata:\n  usage:\n    expect: triggered\n---\n",
		"packs/acme-pack/skills/c/SKILL.md": "---\nname: c\ndescription: d\nmetadata:\n  usage:\n    expect: sometimes\n    weight: 2\n---\n",
		"packs/acme-pack/skills/d/SKILL.md": "---\nname: d\ndescription: d\nmetadata:\n  usage: triggered\n---\n",
		"packs/acme-pack/skills/e/SKILL.md": "---\nname: e\ndescription: d\nmetadata:\n  usage:\n    expect: triggered\n  force-load-on-file-edits-paths:\n    - \"x/**\"\n---\n",
		"packs/acme-pack/skills/f/SKILL.md": usageBlock,
		"other/skills/g/SKILL.md":           "---\nname: g\n---\n",
	}, nil)
	got := sentences(fs)
	for _, want := range []string{
		"skills/a/SKILL.md:0 declares no metadata.usage block",
		`skills/b/SKILL.md:0 expects "triggered" and declares no force-load`,
		"skills/c/SKILL.md:0 its metadata.usage expect: sometimes is outside adoption | triggered | judgment",
		"skills/c/SKILL.md:0 its metadata.usage weight is not a key of the usage block",
		"skills/d/SKILL.md:0 its metadata.usage usage is not a block of keys",
	} {
		if !strings.Contains(got, want) {
			t.Errorf("missing %q in\n%s", want, got)
		}
	}
	if len(fs) != 5 {
		t.Errorf("want 5 findings, got\n%s", got)
	}
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
