package test

import (
	"testing"

	"claudinitepacks.test/tools/checks/fixture"
)

const pack = "claudinite-canon-curation"

func TestPackDirectoryKebabCase(t *testing.T) {
	fixture.Run(t, pack, []fixture.Case{
		{Name: "kebab-case directories and the shelf files beside them", Member: map[string]string{
			"packs/my-pack/pack.json": "{}\n", "packs/README.md": "shelf\n", "packs/directory.GENERATED.md": "x\n",
		}},
		{Name: "an underscore or a capital in a pack directory", Member: map[string]string{"packs/My_Pack/pack.json": "{}\n"}, Expect: []string{
			"finding pack-directory-kebab-case packs/My_Pack/pack.json",
		}},
	})
}

func TestCorpusCountInProse(t *testing.T) {
	fixture.Run(t, pack, []fixture.Case{
		{Name: "how to count, a version row, and a fenced example", Member: map[string]string{
			"packs/p/RULES.md":               "count them with the script.\n\n```\n3 rules\n```\n",
			"packs/p/provenance/VERSIONS.md": "| 1 | now 12 rules |\n",
		}},
		{Name: "a quoted total in pack prose", Member: map[string]string{"packs/p/RULES.md": "the corpus has 12 checks now.\n"}, Expect: []string{
			"advisory corpus-count-in-prose packs/p/RULES.md:1",
		}},
	})
}

func TestHomeOnlyPathInCanonProse(t *testing.T) {
	fixture.Run(t, pack, []fixture.Case{
		{Name: "a placeholder path, and a local pack naming its own home", Member: map[string]string{
			"packs/p/RULES.md":                   "local packs live under .claudinite/local/packs/<pack>/\n",
			".claudinite/local/packs/q/RULES.md": "see .claudinite/local/packs/q/x.md\n",
		}},
		{Name: "canon prose naming a home-only pack path", Member: map[string]string{"packs/p/RULES.md": "see .claudinite/local/packs/claudinite/x.md\n"}, Expect: []string{
			"finding home-only-path-in-canon-prose packs/p/RULES.md:1",
		}},
	})
}

func TestNamedImportOfNewEngineExport(t *testing.T) {
	base := map[string]string{"engine/h.mjs": "export function old() {}\n", "packs/p/pack.mjs": "import { old } from '../../engine/h.mjs';\n"}
	fixture.Run(t, pack, []fixture.Case{
		{Name: "a namespace import behind a typeof guard", Member: base, Change: map[string]string{
			"engine/h.mjs":     "export function old() {}\nexport function fresh() {}\n",
			"packs/p/pack.mjs": "import * as h from '../../engine/h.mjs';\nif (typeof h.fresh === 'function') h.fresh();\n",
		}},
		{Name: "no export added", Member: base, Change: map[string]string{"packs/p/pack.mjs": "import { old } from '../../engine/h.mjs';\nold();\n"}},
		{Name: "a named import of the export the same change adds", Member: base, Change: map[string]string{
			"engine/h.mjs":     "export function old() {}\nexport function fresh() {}\n",
			"packs/p/pack.mjs": "import { old, fresh } from '../../engine/h.mjs';\n",
		}, Expect: []string{
			"finding named-import-of-new-engine-export packs/p/pack.mjs:1",
		}},
	})
}
