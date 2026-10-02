package test

import (
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
