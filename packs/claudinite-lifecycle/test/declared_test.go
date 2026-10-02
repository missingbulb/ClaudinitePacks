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
