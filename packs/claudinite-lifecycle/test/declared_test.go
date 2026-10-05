package test

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"claudinitepacks.test/tools/checks/fixture"
)

const schedulerWorkflow = ".github/workflows/claudinite-scheduler.yml"

// The scheduler cn init writes: two daily ticks on one cron, a dispatch
// trigger, a concurrency group, read-only, running cn schedule run.
const goodScheduler = `name: claudinite-scheduler
on:
  schedule:
    - cron: "25 4,16 * * *"
  workflow_dispatch:
concurrency:
  group: claudinite-scheduler-run
permissions: {}
jobs:
  scheduler-run:
    runs-on: ubuntu-24.04
    permissions:
      contents: read
      issues: write
      pull-requests: read
    steps:
      - run: .claudinite/bin/cn schedule run
`

func TestSchedulerWorkflowShape(t *testing.T) {
	const id = "finding scheduler-workflow-shape " + schedulerWorkflow
	// The pack's flat-declarations-current would ask for the member's flat
	// task file, which these members have no reason to carry.
	quiet := map[string]string{"flat-declarations-current": "off"}
	fixture.Run(t, "claudinite-lifecycle", []fixture.Case{
		{Name: "the scheduler cn init writes, read-only", Rules: quiet, Member: map[string]string{schedulerWorkflow: goodScheduler}},
		{Name: "no scheduler at all", Rules: quiet, Member: map[string]string{".github/workflows/ci.yml": "name: CI\non: push\n"}},
		{Name: "the retired Node scheduler entry", Rules: quiet, Member: map[string]string{
			schedulerWorkflow: strings.Replace(goodScheduler, ".claudinite/bin/cn schedule run", "node .claudinite/shared/packs/claudinite-tasks/src/schedule/run.mjs", 1),
		}, Expect: []string{id}},
		{Name: "a single daily hour", Rules: quiet, Member: map[string]string{
			schedulerWorkflow: strings.Replace(goodScheduler, `"25 4,16 * * *"`, `"25 4 * * *"`, 1),
		}, Expect: []string{id + ":4"}},
	})
}

// claudinite-lifecycle-declared runs only where the pack is declared, so
// the cases carry its declaration in a local pack of the member's own to
// see it fire on settings that lack the entry, in each format.
func TestLifecycleDeclaredReadsEverySettingsFormat(t *testing.T) {
	const id = "claudinite-lifecycle-declared"
	raw, err := os.ReadFile(filepath.Join("..", "declared-checks.json"))
	if err != nil {
		t.Fatal(err)
	}
	var all []map[string]any
	if err := json.Unmarshal(raw, &all); err != nil {
		t.Fatal(err)
	}
	var own []byte
	for _, c := range all {
		if c["id"] == id {
			own, _ = json.Marshal([]any{c})
		}
	}
	if own == nil {
		t.Fatalf("declared-checks.json has no %s", id)
	}
	member := map[string]string{
		".claudinite/local/packs/acme-pack/pack.json":            "{}\n",
		".claudinite/local/packs/acme-pack/declared-checks.json": string(own) + "\n",
	}
	var cases []fixture.Case
	for _, f := range []string{"yaml", "toml", "json"} {
		cases = append(cases,
			fixture.Case{Name: f + " settings lacking it", Format: f, Member: member, Expect: []string{"finding " + id + " .claudinite/settings." + f}},
			fixture.Case{Name: f + " settings declaring it", Format: f, Member: member, Also: []string{"claudinite-lifecycle"}, Rules: map[string]string{"flat-declarations-current": "off"}},
		)
	}
	fixture.Run(t, "local/acme-pack", cases)
}

// claudinite-isolation fires on a consumer file reaching into the vendored
// mount and stays open for the wiring files and the member's own packs.
func TestClaudiniteIsolation(t *testing.T) {
	const id = "finding claudinite-isolation src/tool.mjs"
	quiet := map[string]string{"flat-declarations-current": "off"}
	violating := map[string]string{
		"src/tool.mjs": "const p = \".claudinite/shared/engine/checks/check_the_world.mjs\";\n",
	}
	shared := map[string]string{
		".claudinite/shared/engine/checks/check_the_world.mjs": "engine\n",
		".claudinite/shared/engine/hooks/stop-command.mjs":     "engine\n",
	}
	wiring := map[string]string{
		".claude/settings.json": "{ \"hooks\": { \"Stop\": [ { \"hooks\": [ { \"type\": \"command\", \"command\": \"node $CLAUDE_PROJECT_DIR/.claudinite/shared/engine/hooks/stop-command.mjs\" } ] } ] } }\n",
		".gitignore":            "/.claudinite/*\n!/.claudinite/shared/\n",
		".github/workflows/claudinite-checks-ci.yml": "run: node .claudinite/shared/engine/checks/check_the_world.mjs\n",
		".claudinite/local/packs/mine/check.mjs":     "import { run } from \"../../shared/engine/check_the_world.mjs\";\n",
		"CLAUDE.md":                                  "@.claudinite/flat/claudinite-rules.GENERATED.md\n",
	}
	merge := func(ms ...map[string]string) map[string]string {
		out := map[string]string{}
		for _, m := range ms {
			for k, v := range m {
				out[k] = v
			}
		}
		return out
	}
	fixture.Run(t, "claudinite-lifecycle", []fixture.Case{
		{Name: "a consumer file referencing the mount", Rules: quiet, Member: merge(violating, shared), Expect: []string{id + ":1"}},
		{Name: "the wiring files and local packs stay open", Rules: quiet, Member: merge(wiring, shared)},
		{Name: "a consumer file linking the member's own local pack", Rules: quiet, Member: merge(shared, map[string]string{
			"README.md":                             "See [the rules](.claudinite/local/packs/mine/RULES.md).\n",
			"docs/guide.md":                         "See [the rules](../.claudinite/local/packs/mine/RULES.md).\n",
			".claudinite/local/packs/mine/RULES.md": "# mine\n",
		})},
		{Name: "an import reaching the mount", Rules: quiet, Member: map[string]string{
			"src/tool.mjs": "import x from \"../.claudinite/shared/engine/checks/helpers/findings.mjs\";\n",
			".claudinite/shared/engine/checks/helpers/findings.mjs": "engine\n",
		}, Expect: []string{id + ":1"}},
	})
}
