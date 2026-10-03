package test

import (
	"os"
	"regexp"
	"strings"
	"testing"
	"time"

	"claudinitepacks.test/tools/checks/fixture"
)

// daysAgo keeps every dated fixture relative to today, so the suite never
// rots.
func daysAgo(n int) string { return time.Now().UTC().AddDate(0, 0, -n).Format("2006-01-02") }

type page struct{ title, seed, sources, insights string }

func (p page) String() string {
	if p.title == "" {
		p.title = "Market"
	}
	if p.seed == "" {
		p.seed = daysAgo(1)
	}
	if p.sources == "" {
		p.sources = "- [Example](https://example.com/x)"
	}
	if p.insights == "" {
		p.insights = "- The market is smaller than assumed.\n- Two competitors already ship the core feature."
	}
	if p.insights == "-" {
		p.insights = ""
	}
	return "# " + p.title + "\n\nIntro.\n\n## Key insights\n\n" + p.insights + "\n\n## Findings\n\n- a cited claim\n\n## Sources\n\n" + p.sources +
		"\n\n## Open questions\n\n- next?\n\n## Growth log\n\n- **" + p.seed + "** — initial seed.\n"
}

const market = "product-wiki/Market/README.md"

func scaffold(extra map[string]string) map[string]string {
	out := map[string]string{
		"product-wiki/README.md":                      "# product\n\nThe product research root.\n",
		"product-wiki/product-requirements/README.md": "# Product requirements\n\nThe reviewed sink.\n",
		market: page{}.String(),
	}
	for k, v := range extra {
		out[k] = v
	}
	return out
}

func withMarket(text string) map[string]string { return scaffold(map[string]string{market: text}) }

func replace1(s, pattern, with string) string {
	re := regexp.MustCompile(pattern)
	done := false
	return re.ReplaceAllStringFunc(s, func(m string) string {
		if done {
			return m
		}
		done = true
		return with
	})
}

func TestLayout(t *testing.T) {
	fixture.Run(t, "product-wiki", []fixture.Case{
		{Name: "the full scaffold", Member: scaffold(nil)},
		{Name: "no product-wiki at all", Member: map[string]string{"src/a.js": "x\n"}, Expect: []string{
			"finding product-wiki-layout product-wiki/README.md",
			"finding product-wiki-layout product-wiki/product-requirements/README.md",
			"finding product-wiki-isolation .claudinite/settings.json",
		}},
		{Name: "the sink alone missing", Member: map[string]string{"product-wiki/README.md": "# product\n"}, Expect: []string{
			"finding product-wiki-layout product-wiki/product-requirements/README.md",
			"finding product-wiki-isolation .claudinite/settings.json",
		}},
		{Name: "a scaffold not yet staged", Untracked: scaffold(nil)},
	})
}

func TestPageSections(t *testing.T) {
	bare := "product-wiki/Users/competitors/README.md"
	fenced := "# Wiki\n\nA template example:\n\n```markdown\n## Key insights\n\n- an example insight\n\n## Sources\n\n## Open questions\n\n## Growth log\n\n- **YYYY-MM-DD** — initial seed.\n```\n"
	fourMissing := func(path string) []string {
		var out []string
		for i := 0; i < 4; i++ {
			out = append(out, "finding product-wiki-page-sections "+path)
		}
		return out
	}
	fixture.Run(t, "product-wiki", []fixture.Case{
		{Name: "suffixed and case-varied headings; reserved trees exempt", Member: scaffold(map[string]string{
			"product-wiki/Users/README.md":                      "# Users\n\n## KEY INSIGHTS\n\n- Buyers decide before they compare.\n\n## SOURCES\n\n## Growth Log\n\n- **" + daysAgo(2) + "** — seed.\n\n## Open questions (for the next growth pass)\n\n- q\n",
			"product-wiki/sample-data/README.md":                "# sample data\n",
			"product-wiki/product-requirements/notes/README.md": "# notes\n",
		})},
		{Name: "a nested wiki page is checked, one finding per section", Member: scaffold(map[string]string{bare: "# bare\n"}),
			Expect: fourMissing(bare)},
		{Name: "exactly the missing section", Member: withMarket(strings.Replace(page{}.String(), "## Growth log\n", "## History\n", 1)),
			Expect: []string{"finding product-wiki-page-sections " + market}},
		{Name: "headings in a code fence do not count", Member: withMarket(fenced), Expect: fourMissing(market)},
	})
}

func TestKeyInsights(t *testing.T) {
	id := "finding product-wiki-key-insights " + market
	wrapped := strings.Replace(page{insights: "- **KEY INSIGHTS** works as a heading, and this bullet\n  carries onto a second line.\n\n- so does a blank line between bullets."}.String(),
		"## Key insights", "## KEY INSIGHTS (the reader header)", 1)
	buried := "# Market\n\nIntro.\n\n## Findings\n\n- a cited claim\n\n## Key insights\n\n- the header, buried.\n\n## Sources\n\n- [Example](https://example.com/x)\n\n## Open questions\n\n- next?\n\n## Growth log\n\n- **" + daysAgo(1) + "** — initial seed.\n"
	bullets := func(n int) string {
		var b []string
		for i := 1; i <= n; i++ {
			b = append(b, "- insight number "+string(rune('0'+i))+".")
		}
		return strings.Join(b, "\n")
	}
	terse := "- Two thirds of buyers buy one ticket — the Fringe is one decision, not a run of shows."
	long := "- " + strings.Repeat("the market is crowded and this sentence keeps qualifying itself. ", 3)
	longWrapped := "- " + strings.Repeat("the market is crowded and this sentence keeps going. ", 2) + "\n  " + strings.Repeat("and it continues onto a second line for a while longer. ", 2)
	fixture.Run(t, "product-wiki", []fixture.Case{
		{Name: "a leading, bulleted, succinct header", Member: scaffold(nil)},
		{Name: "a case-varied heading and wrapped bullets", Member: withMarket(wrapped)},
		{Name: "a header that does not lead", Member: withMarket(buried), Expect: []string{id}},
		{Name: "a header with no bullets", Member: withMarket(page{insights: "-"}.String()), Expect: []string{id}},
		{Name: "prose in the header, at its line", Member: withMarket(page{insights: "This page summarises the market.\n\n- and one real insight."}.String()), Expect: []string{id + ":7"}},
		{Name: "eight bullets", Member: withMarket(page{insights: bullets(8)}.String()), Expect: []string{id}},
		{Name: "seven bullets", Member: withMarket(page{insights: bullets(7)}.String())},
		{Name: "a terse finding", Member: withMarket(page{insights: terse}.String())},
		{Name: "a bullet that keeps qualifying itself", Member: withMarket(page{insights: long}.String()), Expect: []string{id + ":7"}},
		{Name: "wrapping cannot hide a long bullet", Member: withMarket(page{insights: longWrapped}.String()), Expect: []string{id + ":7"}},
		{Name: "a page with no header is page-sections territory", Member: withMarket(replace1(page{}.String(), `## Key insights\n\n[^#]*`, "")),
			Expect: []string{"finding product-wiki-page-sections " + market}},
	})
}

func TestGrowthLogAndSources(t *testing.T) {
	log := "finding product-wiki-growth-log " + market
	src := "finding product-wiki-sources " + market
	base := page{}.String()
	template := base + "\n## Template\n\n```markdown\n## Growth log\n\n- **YYYY-MM-DD** — initial seed.\n\n## Sources\n\n- An uncited example source\n```\n"
	growth := func(body string) string {
		return replace1(base, `## Growth log\n\n[^\n]*\n`, "## Growth log\n\n"+body)
	}
	fixture.Run(t, "product-wiki", []fixture.Case{
		{Name: "a fenced template inside a real page", Member: withMarket(template)},
		{Name: "bold and plain dated bullets, continuations and prose", Member: withMarket(growth("Entries below, newest last.\n\n- **" + daysAgo(3) + "** — seed.\n  carried onto a second line.\n- " + daysAgo(2) + " — plain-date entry.\n"))},
		{Name: "an undated bullet, at its line", Member: withMarket(growth("- added a claim without dating it\n")), Expect: []string{log + ":24"}},
		{Name: "a plus-marked undated bullet", Member: withMarket(strings.Replace(base, "## Growth log\n", "## Growth log\n\n+ added competitor pricing, undated\n", 1)), Expect: []string{log + ":24"}},
		{Name: "an impossible calendar date", Member: withMarket(page{seed: "2026-13-40"}.String()), Expect: []string{log + ":24"}},
		{Name: "no bullets at all", Member: withMarket(growth("nothing recorded yet.\n")), Expect: []string{log}},
		{Name: "a page with no log is page-sections territory", Member: withMarket(replace1(base, `## Growth log\n\n[^\n]*\n`, "")),
			Expect: []string{"finding product-wiki-page-sections " + market}},
		{Name: "linked bullets and link-free prose", Member: withMarket(page{sources: "Personas here are hypotheses from design decisions, not yet user research.\n\n- [Report](https://example.com/report)"}.String())},
		{Name: "an empty sources section", Member: withMarket(replace1(base, `## Sources\n\n[^\n]*\n`, "## Sources\n\n"))},
		{Name: "a source with no URL", Member: withMarket(page{sources: "- The 2026 Calendar Market Report"}.String()), Expect: []string{src + ":16"}},
		{Name: "a bare URL and a wrapped bullet", Member: withMarket(page{sources: "- <https://example.com/report>\n- The 2026 Calendar Market Report,\n  [full text](https://example.com/full)"}.String())},
		{Name: "plus bullets are checked", Member: withMarket(page{sources: "+ An unlinked source"}.String()), Expect: []string{src + ":16"}},
	})
}

func TestFreshness(t *testing.T) {
	id := "advisory product-wiki-freshness " + market
	base := page{}.String()
	fixture.Run(t, "product-wiki", []fixture.Case{
		{Name: "a recent entry", Member: withMarket(page{seed: daysAgo(10)}.String())},
		{Name: "an undated log is skipped", Member: withMarket(replace1(base, `## Growth log\n\n[^\n]*\n`, "## Growth log\n\n- seeded at some point.\n")),
			Expect: []string{"finding product-wiki-growth-log " + market + ":24"}},
		{Name: "a stale page beside a fresh sibling", Member: scaffold(map[string]string{
			market:                         page{seed: daysAgo(60)}.String(),
			"product-wiki/Users/README.md": page{title: "Users"}.String(),
		}), Expect: []string{id}},
		{Name: "a far-future date cannot mark a stale page fresh", Member: withMarket(strings.Replace(page{seed: daysAgo(60)}.String(), "## Growth log\n", "## Growth log\n\n- **"+daysAgo(-30)+"** — typo'd future entry.\n", 1)), Expect: []string{id}},
		{Name: "a recent date inside an old entry does not reset the clock", Member: withMarket(replace1(base, `## Growth log\n\n[^\n]*\n`, "## Growth log\n\n- **"+daysAgo(80)+"** — noted; revisit the "+daysAgo(1)+" report before next pass.\n")), Expect: []string{id}},
		{Name: "45 days is inside the window", Member: withMarket(page{seed: daysAgo(45)}.String())},
		{Name: "46 days is past it", Member: withMarket(page{seed: daysAgo(46)}.String()), Expect: []string{id}},
	})
}

func TestIsolation(t *testing.T) {
	users := map[string]string{"product-wiki/Users/README.md": page{title: "Users"}.String()}
	merge := func(ms ...map[string]string) map[string]string {
		out := map[string]string{}
		for _, m := range ms {
			for k, v := range m {
				out[k] = v
			}
		}
		return scaffold(out)
	}
	fixture.Run(t, "product-wiki", []fixture.Case{
		{Name: "the crossing point, the subtree and the index are open", Member: merge(users, map[string]string{
			"product-wiki/sample-data/example.json": "{}\n",
			"src/x.js":                              "// distilled in product-wiki/product-requirements/README.md\n",
			"product-wiki/Market/notes.md":          "see product-wiki/Users/README.md and product-wiki/sample-data/example.json\n",
			"docs/map.md":                           "the research index is product-wiki/README.md\n",
		})},
		{Name: "an outside doc referencing a wiki page", Member: merge(users, map[string]string{"dev/notes.md": "see product-wiki/Users/README.md for the persona list\n"}),
			Expect: []string{"finding product-wiki-isolation dev/notes.md:1"}},
		{Name: "test files are never scanned", Member: merge(users, map[string]string{"dev/foo.test.mjs": "import x from '../product-wiki/Users/README.md';\n"})},
		{Name: "a bare wiki filename is not a barred name", Member: merge(map[string]string{
			"product-wiki/sample-data/example-event.json": "{}\n",
			"docs/note.md": "the shape mirrors example-event.json\n",
		})},
		{Name: "an explicit path into wiki space", Member: merge(map[string]string{
			"product-wiki/sample-data/example-event.json": "{}\n",
			"docs/deep.md": "see product-wiki/sample-data/example-event.json\n",
		}), Expect: []string{"finding product-wiki-isolation docs/deep.md:1"}},
	})
}

// The skill forces itself for edits under the tree, and the weekly worker
// loads it by name.
func TestWorkerLoadsTheSkill(t *testing.T) {
	skill, err := os.ReadFile("../skills/writing-wiki-pages/SKILL.md")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(skill), "force-load-on-file-edits-paths:\n    - \"product-wiki/**\"") {
		t.Error("writing-wiki-pages no longer forces itself for product-wiki/**")
	}
	worker, err := os.ReadFile("../tasks/wiki-growth/task.md")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(worker), "skill: `writing-wiki-pages`") {
		t.Error("the wiki-growth worker no longer loads writing-wiki-pages")
	}
}
