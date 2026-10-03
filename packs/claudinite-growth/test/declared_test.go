package test

import (
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
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

const migration = "packs/acme-pack-a/migrations/2026-01-01-demo/migration.mjs"

func TestInSessionGitHubAccess(t *testing.T) {
	id := func(path string, line int) string {
		return "finding in-session-github-access " + path + ":" + strconv.Itoa(line)
	}
	fixture.Run(t, "claudinite-growth", []fixture.Case{
		{Name: "injected MCP I/O", Member: map[string]string{migration: "export async function apply(io, r) { return io.commit(r, \"main\", [], \"m\"); }\n"}},
		{Name: "a GITHUB_TOKEN read in a migration", Member: map[string]string{migration: "const token = process.env.GITHUB_TOKEN;\nexport const t = token;\n"}, Expect: []string{id(migration, 1)}},
		{Name: "a REST client in a migration", Member: map[string]string{
			"packs/acme-pack-c/migrations/some-pass.mjs": "import { makeGh } from '../fleet-api.mjs';\nexport const gh = makeGh('t');\n",
		}, Expect: []string{id("packs/acme-pack-c/migrations/some-pass.mjs", 1), id("packs/acme-pack-c/migrations/some-pass.mjs", 2)}},
		{Name: "a raw api.github.com fetch in a migration", Member: map[string]string{migration: "const r = await fetch(`https://api.github.com/repos/${x}`);\nexport const y = r;\n"}, Expect: []string{id(migration, 1)}},
		{Name: "a run_daily path is not an in-session surface", Member: map[string]string{".claudinite/local/packs/x/run_daily/worker.mjs": "const t = process.env.GITHUB_TOKEN;\nexport const y = t;\n"}},
		{Name: "a task's code-work keeps its REST client", Member: map[string]string{
			"packs/acme-pack-b/tasks/acme-task-c/worker.mjs": "const t = process.env.GITHUB_TOKEN;\nconst r = await fetch('https://api.github.com/repos/x');\nexport const y = [t, r];\n",
		}},
		{Name: "a dispatch-only executor outside migrations", Member: map[string]string{"packs/acme-pack-c/tasks/acme-task-e/check-fleet-roster.mjs": "const token = process.env.FLEET_GITHUB_TOKEN;\nexport const t = token;\n"}},
		{Name: "a comment naming GITHUB_TOKEN", Member: map[string]string{migration: "// There is no GITHUB_TOKEN here and no fetch to api.github.com.\nexport const ok = true;\n"}},
	})
}

// The scope is live only while the tree still holds files it selects, and
// the real records it selects stay silent.
func TestInSessionGitHubAccessScopesTheRealRecords(t *testing.T) {
	scope := scanFiles(t, filepath.Join("..", "skills", "unattended-agents", "declared-checks.json"), "in-session-github-access")
	out, err := exec.Command("git", "-C", filepath.Join("..", "..", ".."), "ls-files", "packs").Output()
	if err != nil {
		t.Fatal(err)
	}
	member := map[string]string{}
	for _, p := range strings.Split(strings.TrimSpace(string(out)), "\n") {
		if !scope.MatchString(p) || strings.HasSuffix(p, ".test.mjs") {
			continue
		}
		b, err := os.ReadFile(filepath.Join("..", "..", "..", p))
		if err != nil {
			t.Fatal(err)
		}
		member[p] = string(b)
	}
	if len(member) < 20 {
		t.Fatalf("the migration records are the scope, matched %d", len(member))
	}
	fixture.Run(t, "claudinite-growth", []fixture.Case{{Name: "every real migration record", Member: member}})
}

// scanFiles is the declared check's own scope, read rather than restated.
func scanFiles(t *testing.T, decl, id string) *regexp.Regexp {
	raw, err := os.ReadFile(decl)
	if err != nil {
		t.Fatal(err)
	}
	var all []struct{ ID, ScanFiles string }
	if err := json.Unmarshal(raw, &all); err != nil {
		t.Fatal(err)
	}
	for _, c := range all {
		if c.ID == id {
			return regexp.MustCompile(strings.TrimSuffix(strings.TrimPrefix(c.ScanFiles, "/"), "/"))
		}
	}
	t.Fatalf("%s declares no %s", decl, id)
	return nil
}
