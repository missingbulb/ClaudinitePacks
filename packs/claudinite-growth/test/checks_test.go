package test

import (
	"testing"

	"claudinitepacks.test/tools/checks/fixture"
)

// A check lands with the fixture that proves it: a new declared entry or a
// new rule module in the branch needs a test file changed in the same
// branch.
func TestCheckShipsWithTest(t *testing.T) {
	const decl = "packs/p/declared-checks.json"
	const entry = "[{\n  \"id\": \"a\",\n  \"on_fail\": \"advise\",\n  \"failureMessage\": \"m\"\n}]\n"
	fixture.Run(t, "claudinite-growth", unprovenanced([]fixture.Case{
		{Name: "a new declaration beside a test change",
			Member: map[string]string{decl: "[]\n", "packs/p/test/pack.test.mjs": "t\n"},
			Change: map[string]string{decl: entry, "packs/p/test/pack.test.mjs": "t2\n"}},
		{Name: "a message reworded in an existing declaration needs no fixture",
			Member: map[string]string{decl: entry},
			Change: map[string]string{decl: "[{\n  \"id\": \"a\",\n  \"on_fail\": \"advise\",\n  \"failureMessage\": \"clearer\"\n}]\n"}},
		{Name: "a new declaration and a new rule module, each without a test change",
			Member: map[string]string{decl: "[]\n"},
			Change: map[string]string{
				decl:                       entry,
				"packs/p/worldRules/b.mjs": "const rule = {\n  id: 'b',\n  on_fail: 'advise',\n};\nexport default rule;\n",
			},
			Expect: []string{
				"finding check-ships-with-test " + decl,
				"finding check-ships-with-test packs/p/worldRules/b.mjs",
			}},
	}))
}

// A rule module's `doc:` pointer is the More line its findings print; the
// tree must carry the path it names.
func TestDocPointersResolve(t *testing.T) {
	const id = "finding doc-pointers-resolve "
	fixture.Run(t, "claudinite-growth", unprovenanced([]fixture.Case{
		{Name: "a pointer at a tracked file is silent", Member: map[string]string{
			"packs/p/worldRules/a.mjs": "export default { id: 'a', doc: 'packs/p/README.md', run() { return []; } };\n",
			"packs/p/README.md":        "depth\n",
		}},
		{Name: "a commented-out pointer is not a pointer", Member: map[string]string{
			"packs/p/workRules/a.mjs": "export default { id: 'a', run() { return []; } }; // was { doc: 'packs/p/gone.md' }\n",
		}},
		{Name: "a fragment after the path is not part of it", Member: map[string]string{
			"packs/p/skills/s/checks.mjs": "export default [{ id: 'a', doc: 'packs/p/README.md#section', run() { return []; } }];\n",
			"packs/p/README.md":           "depth\n",
		}},
		{Name: "a pointer at nothing flags at its line, in a canon pack and a local one alike", Member: map[string]string{
			"packs/p/worldRules/a.mjs":                  "export default {\n  id: 'a',\n  doc: 'skills/p/SKILL.md',\n};\n",
			".claudinite/local/packs/q/workRules/b.mjs": "export default { id: 'b', doc: 'docs/q.md' };\n",
		}, Expect: []string{
			id + ".claudinite/local/packs/q/workRules/b.mjs:1",
			id + "packs/p/worldRules/a.mjs:3",
		}},
	}))
}

// The fixture packs carry no provenance files, which provenance-integrity
// would ask for.
func unprovenanced(cases []fixture.Case) []fixture.Case {
	for i := range cases {
		if cases[i].Rules == nil {
			cases[i].Rules = map[string]string{}
		}
		cases[i].Rules["provenance-integrity"] = "off"
	}
	return cases
}
