package test

import (
	"encoding/json"
	"testing"

	"claudinitepacks.test/tools/checks/fixture"
)

const wf = ".github/workflows/x.yml"

func one(text string) map[string]string { return map[string]string{wf: text} }

func with(base map[string]string, extra map[string]string) map[string]string {
	out := map[string]string{}
	for _, m := range []map[string]string{base, extra} {
		for k, v := range m {
			out[k] = v
		}
	}
	return out
}

func TestSecretsInJobIf(t *testing.T) {
	fixture.Run(t, "git-github", []fixture.Case{
		{Name: "a step-level if may read secrets; the job gates on vars", Member: one(`name: x
on: push
jobs:
  deploy:
    if: ${{ vars.DEPLOY_ARN != '' }}
    runs-on: ubuntu-latest
    steps:
      - run: echo hi
        if: ${{ secrets.TOKEN != '' }}
`)},
		{Name: "a job-level if reading secrets, before and after the steps", Member: one(`name: x
on: push
jobs:
  deploy:
    if: ${{ secrets.DEPLOY_ARN != '' }}
    runs-on: ubuntu-latest
    steps:
      - run: echo hi
  publish:
    runs-on: ubuntu-latest
    steps:
      - run: echo bye
    if: ${{ secrets.PUBLISH_ARN != '' }}
`), Expect: []string{"finding gha/secrets-in-job-if " + wf + ":5", "finding gha/secrets-in-job-if " + wf + ":13"}},
	})
}

func TestRunPipefail(t *testing.T) {
	fixture.Run(t, "git-github", []fixture.Case{
		{Name: "a bash shell default covers every piped step", Member: one(`name: x
on: push
defaults:
  run:
    shell: bash
jobs:
  t:
    runs-on: ubuntu-latest
    steps:
      - run: make test 2>&1 | tee log
      - run: try || fallback
`)},
		{Name: "the or-operator and a block that pipes nothing", Member: one(`name: x
on: push
jobs:
  t:
    runs-on: ubuntu-latest
    steps:
      - run: try || fallback
      - run: |
          make build
          make test
`)},
		{Name: "an inline piped run step", Member: one(`name: x
on: push
jobs:
  t:
    runs-on: ubuntu-latest
    steps:
      - run: make test 2>&1 | tee log
`), Expect: []string{"finding gha/run-pipefail " + wf + ":7"}},
		{Name: "a pipe inside a run block, anchored at the run line", Member: one(`name: x
on: push
jobs:
  t:
    runs-on: ubuntu-latest
    steps:
      - run: |
          make build

          make test 2>&1 | tee log
      - run: echo done
`), Expect: []string{"finding gha/run-pipefail " + wf + ":7"}},
	})
}

func TestCheckoutSubmodules(t *testing.T) {
	gitmodules := map[string]string{".gitmodules": "[submodule \"x\"]\n\tpath = x\n\turl = https://e.com/x.git\n"}
	fixture.Run(t, "git-github", []fixture.Case{
		{Name: "the checkout passes submodules", Member: with(gitmodules, one(`name: x
on: push
jobs:
  t:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          submodules: true
`))},
		{Name: "no gitmodules, nothing to fetch", Member: one(`name: x
on: push
jobs:
  t:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
`)},
		{Name: "a bare checkout, and one whose sibling carries the key", Member: with(gitmodules, one(`name: x
on: push
jobs:
  t:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: echo hi
  u:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/checkout@v4
        with:
          submodules: true
`)), Expect: []string{"finding gha/checkout-submodules " + wf + ":7", "finding gha/checkout-submodules " + wf + ":12"}},
	})
}

func TestScheduledFailureEscalation(t *testing.T) {
	const body = `jobs:
  t:
    runs-on: ubuntu-latest
    steps:
      - run: echo hi
`
	const report = `  report:
    if: ${{ failure() }}
    runs-on: ubuntu-latest
    steps:
      - run: echo escalate
`
	var cases []fixture.Case
	for _, trig := range []struct{ name, on string }{
		{"schedule", "on:\n  schedule:\n    - cron: '44 3 * * *'\n"},
		{"workflow_run", "on:\n  workflow_run:\n    workflows: ['build']\n    types: [completed]\n"},
		{"repository_dispatch", "on:\n  repository_dispatch:\n    types: [external-event]\n"},
	} {
		cases = append(cases,
			fixture.Case{Name: trig.name + " with no escalation", Member: one("name: n\n" + trig.on + body), Expect: []string{"advisory gha/scheduled-failure-escalation " + wf}},
			fixture.Case{Name: trig.name + " escalating its failure", Member: one("name: n\n" + trig.on + body + report)},
		)
	}
	fixture.Run(t, "git-github", cases)
}

func TestLabelCreateBeforeAdd(t *testing.T) {
	fixture.Run(t, "git-github", []fixture.Case{
		{Name: "add-label with no create", Member: one(`name: x
on: push
jobs:
  t:
    runs-on: ubuntu-latest
    steps:
      - run: gh issue edit 1 --add-label "triage"
`), Expect: []string{"advisory gha/label-create-before-add " + wf}},
		{Name: "an idempotent create first", Member: one(`name: x
on: push
jobs:
  t:
    runs-on: ubuntu-latest
    steps:
      - run: |
          gh label create "triage" 2>/dev/null || true
          gh issue edit 1 --add-label "triage"
`)},
	})
}

func TestUniqueAutomationBranch(t *testing.T) {
	fixture.Run(t, "git-github", []fixture.Case{
		{Name: "a date-keyed branch", Member: one(`name: x
on: push
jobs:
  t:
    runs-on: ubuntu-latest
    steps:
      - run: git checkout -b report-$(date +%F)
`), Expect: []string{"advisory gha/unique-automation-branch " + wf + ":7"}},
		{Name: "a per-run suffix", Member: one(`name: x
on: push
jobs:
  t:
    runs-on: ubuntu-latest
    steps:
      - run: git checkout -b report-$(date +%F)-${{ github.run_id }}
`)},
	})
}

func TestPagesArtifactSymlinks(t *testing.T) {
	skill := map[string]string{".claude/skills/some-skill": "symlink-placeholder\n"}
	deploy := func(steps, path string) string {
		return `name: Deploy to GitHub Pages
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
` + steps + `      - name: Upload artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: ` + path + "\n"
	}
	fixture.Run(t, "git-github", []fixture.Case{
		{Name: "the repo root uploaded beside tracked skill links", Member: with(skill, one(deploy("", "."))), Expect: []string{"finding gha/pages-artifact-symlinks " + wf}},
		{Name: "pruned before upload", Member: with(skill, one(deploy("      - run: rm -rf .claude .claudinite\n", ".")))},
		{Name: "a dedicated build dir", Member: with(skill, one(deploy("", "_site")))},
		{Name: "no skill links to dangle", Member: one(deploy("", "."))},
	})
}

func TestNoScheduledFleetExecutor(t *testing.T) {
	const executor = `jobs:
  release:
    uses: missingbulb/Claudinite/.github/workflows/chrome-extension-release.yml@main
`
	const own = `jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - run: echo hi
`
	const cron = "on:\n  schedule:\n    - cron: '44 3 * * *'\n"
	scheduler := map[string]string{".github/workflows/claudinite-scheduler.yml": `name: Claudinite scheduler
on:
  schedule:
    - cron: '24 * * * *'
  workflow_dispatch:
jobs:
  schedule:
    runs-on: ubuntu-latest
    steps:
      - run: .claudinite/bin/cn schedule run
`}
	id := "finding gha/no-scheduled-fleet-executor " + wf
	cases := []fixture.Case{
		{Name: "a scheduled canon reusable", Member: one("name: r\n" + cron + executor), Expect: []string{id}},
		{Name: "a dispatch-only executor", Member: one("name: r\non:\n  workflow_dispatch:\n" + executor)},
		{Name: "the member's own cron before the scheduler", Member: one("name: n\n" + cron + own + "  report:\n    if: ${{ failure() }}\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo escalate\n")},
		{Name: "a stray cron beside the scheduler", Member: with(scheduler, one("name: n\n"+cron+own+"  report:\n    if: ${{ failure() }}\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo escalate\n")), Expect: []string{id}},
		{Name: "only the scheduler crons", Member: with(scheduler, one("name: p\non:\n  workflow_dispatch:\n"+own))},
	}
	fixture.Run(t, "git-github", quiet(cases))
}

func TestCronMinuteOffTheHour(t *testing.T) {
	scheduled := func(lines string) string {
		return "name: Nightly\non:\n  schedule:\n" + lines + "\n  workflow_dispatch:\n\njobs:\n  run:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n"
	}
	at := func(expr string) string { return "    - cron: '" + expr + "'" }
	id := "advisory gha/cron-minute-off-the-hour " + wf
	var cases []fixture.Case
	for _, expr := range []string{"0 3 * * *", "*/15 * * * *", "5 4 * * *", "55 * * * *", "0,30 * * * *"} {
		cases = append(cases, fixture.Case{Name: "flags " + expr, Member: one(scheduled(at(expr))), Expect: []string{id + ":4"}})
	}
	cases = append(cases,
		fixture.Case{Name: "every entry judged, an unquoted scalar alike", Member: one(scheduled(at("44 * * * *") + "\n    - cron: 0 12 * * *   # midday sweep")), Expect: []string{id + ":5"}},
		fixture.Case{Name: "a fixed minute inside the band", Member: one(scheduled(at("44 3 * * *")))},
		fixture.Case{Name: "the band is inclusive", Member: map[string]string{
			".github/workflows/low.yml":  scheduled(at("10 * * * *")),
			".github/workflows/high.yml": scheduled(at("50 * * * *")),
		}},
		fixture.Case{Name: "a cron key outside a schedule block", Member: one("name: Manual\non:\n  workflow_dispatch:\n    inputs:\n      cron: '0 * * * *'\n\njobs:\n  run:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n")},
		fixture.Case{Name: "a cron item under a step input", Member: one("name: Nightly\non:\n  schedule:\n    - cron: '44 3 * * *'\n\njobs:\n  run:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: acme/mirror-schedule@v1\n        with:\n          schedules:\n            - cron: '0 * * * *'\n")},
		fixture.Case{Name: "a cron key in a step's schedule input", Member: one("name: Nightly\non:\n  workflow_dispatch:\n\njobs:\n  run:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: acme/scheduler@v1\n        with:\n          schedule:\n            cron: '0 * * * *'\n")},
		fixture.Case{Name: "a commented-out cron", Member: one(scheduled(at("44 3 * * *") + "\n    # - cron: '0 3 * * *'"))},
		fixture.Case{Name: "the vendored scheduler is out of scope", Member: map[string]string{".github/workflows/claudinite-scheduler.yml": scheduled(at("0 * * * *"))}},
		fixture.Case{Name: "a cron outside the workflows dir", Member: map[string]string{"deploy/cron.yml": scheduled(at("0 * * * *"))}},
	)
	fixture.Run(t, "git-github", quiet(cases))
}

// quiet turns off the escalation advisory every scheduled fixture would
// otherwise also raise.
func quiet(cases []fixture.Case) []fixture.Case {
	for i := range cases {
		cases[i].Rules = map[string]string{"gha/scheduled-failure-escalation": "off"}
	}
	return cases
}

type call struct {
	name  string
	input map[string]any
}

func session(calls ...call) []string {
	var out []string
	for _, c := range calls {
		b, _ := json.Marshal(map[string]any{"type": "assistant", "message": map[string]any{"content": []any{map[string]any{"type": "tool_use", "name": c.name, "input": c.input}}}})
		out = append(out, string(b))
	}
	return out
}

func bash(cmd string) call { return call{"Bash", map[string]any{"command": cmd}} }

// The offending calls flag and the clean ones beside them do not. The
// blocking guards read as advisories here: each is inside its first 14
// days, which grace demotes.
func TestActionGuards(t *testing.T) {
	change := map[string]string{"a.txt": "x\n"}
	guard := func(name string, expect []string, calls ...call) fixture.Case {
		return fixture.Case{Name: name, Change: change, Transcript: session(calls...), Expect: expect}
	}
	at := func(class, id string, calls ...string) []string {
		var out []string
		for _, c := range calls {
			out = append(out, class+" "+id+" (session) "+c)
		}
		return out
	}
	fixture.Run(t, "git-github", []fixture.Case{
		guard("issue-labels-overwrite", at("advisory", "issue-labels-overwrite", "mcp__github__issue_write call #1"),
			call{"mcp__github__issue_write", map[string]any{"method": "update", "issue_number": 3, "labels": []string{"done"}}},
			call{"mcp__github__issue_write", map[string]any{"method": "update", "issue_number": 3, "body": "labels: none"}},
			call{"mcp__github__add_issue_comment", map[string]any{"issue_number": 3, "body": "labels"}}),
		guard("pull-request-head-unqualified", at("advisory", "pull-request-head-unqualified", "mcp__github__list_pull_requests call #1"),
			call{"mcp__github__list_pull_requests", map[string]any{"owner": "o", "repo": "r", "head": "feature/x", "fields": []string{"number"}}},
			call{"mcp__github__list_pull_requests", map[string]any{"owner": "o", "repo": "r", "head": "o:feature/x", "fields": []string{"number"}}},
			call{"mcp__github__list_pull_requests", map[string]any{"owner": "o", "repo": "r", "fields": []string{"number"}}}),
		guard("codeload-tarball-fetch", at("advisory", "codeload-tarball-fetch", "Bash call #1"),
			bash("curl -sL https://codeload.github.com/o/r/tar.gz/main | tar -xz"),
			bash("git clone --depth 1 https://github.com/o/r")),
		guard("search-code-lower-bound", at("advisory", "search-code-lower-bound", "mcp__github__search_code call #1"),
			call{"mcp__github__search_code", map[string]any{"query": "claudinite-settings", "fields": []string{"path"}}},
			call{"mcp__github__search_issues", map[string]any{"query": "q", "fields": []string{"number"}}}),
		guard("branch-from-bare-main", at("advisory", "branch-from-bare-main", "Bash call #1", "Bash call #2"),
			bash("git checkout -b feature/x main"),
			bash("git branch feature/y main"),
			bash("git checkout -b feature/z origin/main"),
			bash("git branch -d main"),
			bash("git checkout -b feature/w")),
	})
}
