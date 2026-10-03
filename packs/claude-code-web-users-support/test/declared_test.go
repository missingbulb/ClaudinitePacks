package test

import (
	"testing"

	"claudinitepacks.test/tools/checks/fixture"
)

func TestPack(t *testing.T) {
	store := map[string]any{"repo": "acme/prefs"}
	fixture.Run(t, "claude-code-web-users-support", []fixture.Case{
		{Name: "preferences-store-configured advises on a declaration naming no store", Member: map[string]string{"README.md": "x\n"},
			Expect: []string{"advisory preferences-store-configured .claudinite/settings.json"}},
		{Name: "a YAML member's finding names its own settings file", Format: "yaml", Member: map[string]string{"README.md": "x\n"},
			Expect: []string{"advisory preferences-store-configured .claudinite/settings.yaml"}},
		{Name: "a repo naming a store it does not hold is quiet", Config: store, Member: map[string]string{"README.md": "x\n"}},
		{Name: "the store repo's names, CODEOWNERS and provenance are judged", Config: store, Member: map[string]string{
			"preferences/README.md":        "x\n",
			"preferences/Octocat/RULES.md": "x\n",
			"preferences/octocat/RULES.md": "- **Ending a turn** - close. (ending-turn)\n",
		}, Expect: []string{
			"advisory preferences-store-file-names preferences/Octocat",
			"advisory preferences-store-codeowners .github/CODEOWNERS",
			"advisory preferences-provenance preferences/octocat/RULES.md:1",
		}},
	})
}
