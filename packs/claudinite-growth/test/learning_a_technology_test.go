package test

import (
	"strings"
	"testing"

	"claudinitepacks.test/tools/checks/fixture"
)

// The learning-a-technology skill's three declared checks hold the shape
// that makes a technology skill liftable: it says what it was written
// from, and nothing in its folder points out of it.
const (
	techSkill = "packs/site/skills/cloudflare-email/SKILL.md"
	techCode  = "packs/site/skills/cloudflare-email/send.mjs"
	techTest  = "packs/site/skills/cloudflare-email/send.test.mjs"
)

var (
	techSources  = []string{"## Sources", "", "- https://developers.example.com/email/send/ — fetched 2026-09-10", ""}
	techVerified = []string{"## Verified", "", "- 2026-09-10: one send to the owner, accepted with id `abc`."}
)

// markedSkill is a technology skill: the `technology:` key the three rules
// select on, then body.
func markedSkill(body ...string) string {
	return strings.Join(append([]string{
		"---",
		"name: cloudflare-email",
		"description: Send one transactional email through the vendor.",
		"metadata:",
		"  technology: Cloudflare Email Service",
		"---",
		"",
	}, append(body, "")...), "\n")
}

func completeSkill() string {
	return markedSkill(append(append([]string{}, techSources...), techVerified...)...)
}

// unmarkedSkill is an ordinary procedure skill, which every one of these
// rules must leave alone.
func unmarkedSkill(body ...string) string {
	return strings.Join(append([]string{
		"---",
		"name: some-procedure",
		"description: A procedure that is not about a vendor.",
		"---",
		"",
	}, append(body, "")...), "\n")
}

func concat(parts ...[]string) []string {
	var out []string
	for _, p := range parts {
		out = append(out, p...)
	}
	return out
}

func TestTechnologySkillCitesDatedSources(t *testing.T) {
	const id = "finding technology-skill-cites-dated-sources "
	fixture.Run(t, "claudinite-growth", unprovenanced([]fixture.Case{
		{Name: "a marked skill carrying both provenance sections is silent", Member: map[string]string{techSkill: completeSkill()}},
		{Name: "an unmarked skill is not asked for provenance at all", Member: map[string]string{
			techSkill: unmarkedSkill("A skill about a procedure, not a vendor."),
		}},
		{Name: "the marker is the frontmatter key, not the word in prose", Member: map[string]string{
			techSkill: unmarkedSkill("Record the technology: whichever one the job needs."),
		}},
		{Name: "a Sources section with no fetch date beside its URL", Member: map[string]string{
			techSkill: markedSkill(concat([]string{"## Sources", "", "- https://developers.example.com/email/send/", ""}, techVerified)...),
		}, Expect: []string{id + techSkill}},
		{Name: "no Verified section — nothing says whether a call was ever made", Member: map[string]string{
			techSkill: markedSkill(techSources...),
		}, Expect: []string{id + techSkill}},
		{Name: "a dated URL only inside a fenced example is not a source", Member: map[string]string{
			techSkill: markedSkill(concat([]string{"## Sources", "", "```", "curl https://developers.example.com/ # 2026-09-10", "```", ""}, techVerified)...),
		}, Expect: []string{id + techSkill}},
	}))
}

func TestTechnologySkillLinksInsideItsFolder(t *testing.T) {
	const id = "finding technology-skill-links-inside-its-folder "
	fixture.Run(t, "claudinite-growth", unprovenanced([]fixture.Case{
		{Name: "a link to a sibling inside the folder is what promotion carries", Member: map[string]string{
			techSkill: markedSkill(concat(techSources, techVerified, []string{"", "Run [send.mjs](send.mjs)."})...),
		}},
		{Name: "an outward path inside a fenced example is an example, not a link", Member: map[string]string{
			techSkill: markedSkill(concat(techSources, techVerified, []string{"", "```", "cp -r .claudinite/local/packs/site/skills/x .", "```"})...),
		}},
		{Name: "an unmarked skill may link its siblings across the pack", Member: map[string]string{
			techSkill: unmarkedSkill("See [the contract](../writing-tasks/SKILL.md)."),
		}},
		{Name: "a relative link out of the folder, and a mount path, each at their line", Member: map[string]string{
			techSkill: strings.Join([]string{
				"---",
				"name: cloudflare-email",
				"metadata:",
				"  technology: Cloudflare Email Service",
				"---",
				"See [the task contract](../../claudinite-growth/skills/writing-tasks/SKILL.md).",
				"Or read .claudinite/local/packs/site/RULES.md first.",
				"",
			}, "\n"),
		}, Rules: map[string]string{"technology-skill-cites-dated-sources": "off"},
			Expect: []string{id + techSkill + ":6", id + techSkill + ":7"}},
	}))
}

func TestTechnologySkillCodeImportsInsideItsFolder(t *testing.T) {
	const id = "finding technology-skill-code-imports-inside-its-folder "
	fixture.Run(t, "claudinite-growth", unprovenanced([]fixture.Case{
		{Name: "code importing only its own folder is silent", Member: map[string]string{
			techSkill: completeSkill(), techCode: "import { post } from './http.mjs';\nexport const send = post;\n",
		}},
		{Name: "a commented-out outward import is not an import", Member: map[string]string{
			techSkill: completeSkill(), techCode: "// import x from '../x.mjs';\nexport const a = 1;\n",
		}},
		{Name: "the skill's own fixture may reach the engine it tests against", Member: map[string]string{
			techSkill: completeSkill(), techTest: "import { declaredCheck } from '../../../../engine-tests/helpers.mjs';\n",
		}},
		{Name: "code beside an unmarked skill is not judged", Member: map[string]string{
			techSkill: unmarkedSkill("A procedure."), techCode: "import x from '../x.mjs';\n",
		}},
		{Name: "an outward import in the technology code, named by its technology", Member: map[string]string{
			techSkill: completeSkill(), techCode: "import { finding } from '../../../engine/checks/helpers/findings.mjs';\n",
		}, Expect: []string{id + techCode + ":1"}},
		{Name: "a require() reaching out is the same escape", Member: map[string]string{
			techSkill: completeSkill(), techCode: "const { finding } = require('../helpers.cjs');\n",
		}, Expect: []string{id + techCode + ":1"}},
	}))
}
