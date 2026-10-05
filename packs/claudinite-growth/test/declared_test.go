package test

import (
	"strconv"
	"strings"
	"testing"

	"claudinitepacks.test/tools/checks/fixture"
)

// The precondition-is-the-only-gate hunt: task.md instructions and
// code-work workers that decide to skip the run in a later phase. The
// cases are the shapes the audit found, plus the legal shapes it must not
// flag.
func TestTaskPhaseDiscipline(t *testing.T) {
	const md = "packs/demo/tasks/demo-task/task.md"
	const worker = "packs/demo/tasks/demo-task/worker.mjs"
	id := func(path string, line int) string {
		return "advisory task-phase-discipline " + path + ":" + strconv.Itoa(line)
	}
	lines := func(l ...string) string { return strings.Join(l, "\n") + "\n" }
	// The demo task carries no provenance file, which provenance-integrity
	// would ask for.
	quiet := map[string]string{"provenance-integrity": "off"}
	cases := []fixture.Case{
		{Name: "a repo without tasks", Member: map[string]string{"src/app.js": "skip if already done\n"}},
		{Name: "a state gate that aborts the run", Member: map[string]string{md: lines(
			"# task",
			"Before researching, list open PRs carrying the label.",
			"If one is open, do **not** stack a second round on it — add one dated nudge comment and stop.",
		)}, Expect: []string{id(md, 3)}},
		{Name: "already ⇒ skip language", Member: map[string]string{md: "Already pointing at them ⇒ skip. Absent ⇒ skip; never create it.\n"}, Expect: []string{id(md, 1)}},
		{Name: "an empty outcome, or a scope the precondition's Context carves", Member: map[string]string{md: lines(
			"Neither mode yields citable material → nothing to write. No commit, no log entry, no PR.",
			"A run that finds nothing and opens nothing is fine — and common.",
			"Skip this half entirely when Context says the activity half is not in scope.",
		)}},
		{Name: "stopping on a missing required input converges to needs-human", Member: map[string]string{md: lines(
			"**That number is a required input.** A dispatch that does not carry it is a failed run: converge to `needs-human` naming the missing input.",
			"If the dispatch names no branch, stop and converge to needs-human — never fall back to the newest branch.",
		)}},
		{Name: "a discretionary skip in a doc that also mentions needs-human", Member: map[string]string{md: lines(
			"A failed run converges to needs-human.",
			"If a PR is already open, do not run this cycle — stop and leave it.",
		)}, Expect: []string{id(md, 2)}},
		{Name: "a code-work worker logging a discretionary cycle skip", Member: map[string]string{worker: lines(
			"export function deliver() {",
			"  console.log(`baselining: PR still stands — leaving this cycle's converge undelivered`);",
			"  console.log('baselining: skipping this cycle');",
			"}",
		)}, Expect: []string{id(worker, 2), id(worker, 3)}},
		{Name: "task.json itself, where skip logic belongs", Member: map[string]string{
			"packs/demo/tasks/demo-task/task.json": "{\n  \"id\": \"demo-task\"\n  // skip this cycle if nothing changed\n}\n",
		}},
	}
	for i := range cases {
		cases[i].Rules = quiet
	}
	fixture.Run(t, "claudinite-growth", cases)
}
