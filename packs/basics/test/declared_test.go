package test

import (
	"encoding/json"
	"fmt"
	"strings"
	"testing"

	"claudinitepacks.test/tools/checks/fixture"
)

// The markers are assembled rather than written out: a marker at the start
// of a line in this file would be a real violation of the check it tests.
var (
	ours   = strings.Repeat("<", 7) + " HEAD"
	base   = strings.Repeat("|", 7) + " merged common ancestors"
	theirs = strings.Repeat(">", 7) + " branch"
)

func words(n int) string {
	w := make([]string, n)
	for i := range w {
		w[i] = fmt.Sprintf("w%d", i)
	}
	return strings.Join(w, " ")
}

func skill(name string, desc, body int) string {
	return fmt.Sprintf("---\nname: %s\ndescription: %s\n---\n\n# %s\n\n%s\n", name, words(desc), name, words(body))
}

// The catalog cases link packs whose READMEs they do not hold.
var catalogRules = map[string]string{"reference-integrity": "off"}

var corpus = map[string]string{"engine/pack_loader/pack-registry.mjs": "// corpus marker\n"}

func with(a, b map[string]string) map[string]string {
	out := map[string]string{}
	for k, v := range a {
		out[k] = v
	}
	for k, v := range b {
		out[k] = v
	}
	return out
}

func TestRepoChecks(t *testing.T) {
	fixture.Run(t, "basics", []fixture.Case{
		{Name: "warning-suppression flags an added marker", Change: map[string]string{"a.js": "x();\n// eslint-disable-next-line no-undef\ny();\n"},
			Expect: []string{"finding warning-suppression a.js:2"}},
		{Name: "warning-suppression flags a marker the change never touched", Member: map[string]string{"a.js": "// eslint-disable-next-line no-undef\ny();\n"}, Change: map[string]string{"b.js": "clean();\n"},
			Expect: []string{"finding warning-suppression a.js:1"}},
		{Name: "warning-suppression: a doc discussing markers", Change: map[string]string{"notes.md": "we detect `eslint-disable` markers\n"}},
		{Name: "warning-suppression: a local pack's check layer spells markers as patterns", Member: map[string]string{
			".claudinite/local/packs/proj/no-mute.mjs":         "// detect: /eslint-disable/\nexport default {};\n",
			".claudinite/local/packs/proj/skills/x/checks.mjs": "const p = /@ts-ignore/;\nexport default [];\n",
			".claudinite/local/packs/proj/tasks/job/worker.js": "// eslint-disable-next-line no-undef\ny();\n",
		}, Expect: []string{"finding warning-suppression .claudinite/local/packs/proj/tasks/job/worker.js:1"}},
		{Name: "warning-suppression skips vendored and generated files", Member: map[string]string{
			".gitattributes":   "vendor/** linguist-vendored\ngen/** linguist-generated\n",
			"vendor/page.html": "<script>/* eslint-disable */\n</script>\n",
			"gen/out.js":       "// @ts-nocheck\nx();\n",
			"src/mine.js":      "// eslint-disable-next-line no-undef\ny();\n",
		}, Expect: []string{"finding warning-suppression src/mine.js:1"}},
		{Name: "warning-suppression passes an inline reason", Member: map[string]string{
			"a.js": "// eslint-disable-next-line no-undef -- injected by the loader, not in scope here\ny();\n",
			"b.py": "except Exception:  # noqa: BLE001 a bad frame must never crash the listen loop\n    pass\n",
			"c.py": "value = untyped()  # type: ignore[assignment]  # third-party stub is wrong\n",
		}},
		{Name: "warning-suppression passes a reason on the line above", Member: map[string]string{
			"a.js": "// the loader injects this symbol at runtime; the linter can't see it\n// eslint-disable-next-line no-undef\ny();\n",
		}},
		{Name: "warning-suppression flags a bare rule code", Member: map[string]string{
			"a.py": "except Exception:  # noqa: BLE001\n    pass\n",
			"b.js": "\n// eslint-disable-next-line no-undef\ny();\n",
			"c.js": "// eslint-disable-next-line no-shadow\n// eslint-disable-next-line no-undef\ny();\n",
		}, Expect: []string{"finding warning-suppression a.py:1", "finding warning-suppression b.js:2", "finding warning-suppression c.js:1", "finding warning-suppression c.js:2"}},

		{Name: "no-conflict-markers flags each marker", Member: map[string]string{"notes.md": strings.Join([]string{ours, "- ours", "=======", "- theirs", theirs, ""}, "\n")},
			Expect: []string{"finding no-conflict-markers notes.md:1", "finding no-conflict-markers notes.md:5"}},
		{Name: "no-conflict-markers fires on the diff3 base marker", Member: map[string]string{"src/gen.js": strings.Join([]string{ours, "const a = 1;", base, "const a = 2;", "=======", "const a = 3;", theirs, ""}, "\n")},
			Expect: []string{"finding no-conflict-markers src/gen.js:1", "finding no-conflict-markers src/gen.js:3", "finding no-conflict-markers src/gen.js:7"}},
		{Name: "no-conflict-markers: a setext heading and prose", Member: map[string]string{"notes.md": strings.Join([]string{"Rules", "=======", "", "Delete the `" + ours + "` line before staging.", ""}, "\n")}},

		{Name: "rules-line-length: one advisory per RULES.md", Member: map[string]string{
			"packs/demo/RULES.md": "- short rule\n- " + strings.Repeat("x", 120) + "\n",
			"docs/notes.md":       strings.Repeat("x", 120) + "\n",
		}, Expect: []string{"advisory rules-line-length packs/demo/RULES.md:2"}},

		{Name: "skill-description-length reads only the description", Member: map[string]string{
			"packs/acme-pack/skills/acme-skill/SKILL.md": skill("acme-skill", 31, 10),
			"packs/acme-pack/skills/acme-other/SKILL.md": skill("acme-other", 20, 400),
		}, Expect: []string{"advisory skill-description-length packs/acme-pack/skills/acme-skill/SKILL.md:3"}},
		{Name: "skill-description-length: 30 words is inside the cap", Member: map[string]string{
			"packs/acme-pack/skills/acme-at-cap/SKILL.md": skill("acme-at-cap", 30, 5),
		}},

		{Name: "generated-merge-driver flags a GENERATED file without merge=ours", Member: map[string]string{"foo.GENERATED.json": "{}\n", "src/a.mjs": "export const x=1;\n"},
			Expect: []string{"advisory generated-merge-driver foo.GENERATED.json"}},
		{Name: "generated-merge-driver passes an exact entry", Member: map[string]string{"foo.GENERATED.json": "{}\n", ".gitattributes": "foo.GENERATED.json merge=ours\n"}},
		{Name: "generated-merge-driver passes a glob", Member: map[string]string{"a.GENERATED.md": "x\n", ".gitattributes": "*.GENERATED.md merge=ours\n"}},
		{Name: "generated-merge-driver reads a linguist-generated file too", Member: map[string]string{"foo.GENERATED.json": "{}\n", ".gitattributes": "foo.GENERATED.json linguist-generated\n"},
			Expect: []string{"advisory generated-merge-driver foo.GENERATED.json"}},

		{Name: "catalog-completeness flags a pack missing from the catalog", Rules: catalogRules, Member: with(corpus, map[string]string{
			"packs/README.md":                       "# packs\n\n[basics](basics/README.md)\n",
			"packs/newpack/pack.mjs":                "export default { id: \"newpack\" };\n",
			"packs/basics/skills/newskill/SKILL.md": "---\nname: newskill\n---\nbody\n",
		}), Expect: []string{"finding catalog-completeness packs/README.md"}},
		{Name: "catalog-completeness: every pack listed", Rules: catalogRules, Member: with(corpus, map[string]string{
			"packs/README.md":                            "# packs\n\n[basics](basics/README.md) [acme-pack](acme-pack/README.md)\n",
			"packs/basics/pack.mjs":                      "export default { id: \"basics\" };\n",
			"packs/acme-pack/pack.mjs":                   "export default { id: \"acme-pack\" };\n",
			"packs/basics/skills/writing-tests/SKILL.md": "---\nname: writing-tests\n---\nbody\n",
		})},
		{Name: "catalog-completeness: outside the corpus", Member: map[string]string{
			"packs/README.md":        "# packs\n",
			"packs/newpack/pack.mjs": "export default { id: \"newpack\" };\n",
		}},
	})
}

func TestUntrackedTestFile(t *testing.T) {
	fixture.Run(t, "basics", []fixture.Case{
		{Name: "tracked tests and an untracked non-test", Member: map[string]string{"a.test.mjs": "t\n"}, Untracked: map[string]string{"scratch.md": "n\n"}},
		{Name: "an untracked test in each common spelling", Untracked: map[string]string{"b.test.mjs": "t\n", "src/c.spec.ts": "t\n", "tests/test_d.py": "t\n", "e_test.go": "t\n"},
			Expect: []string{"advisory untracked-test-file b.test.mjs", "advisory untracked-test-file e_test.go", "advisory untracked-test-file src/c.spec.ts", "advisory untracked-test-file tests/test_d.py"}},
	})
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

// The blocking guards read as advisories here: each is inside its first 14
// days, which grace demotes.
func TestActionGuards(t *testing.T) {
	change := map[string]string{"a.txt": "x\n"}
	guard := func(name string, expect []string, calls ...call) fixture.Case {
		return fixture.Case{Name: name, Change: change, Transcript: session(calls...), Expect: expect}
	}
	fixture.Run(t, "basics", []fixture.Case{
		guard("grep-context-without-content", []string{"advisory grep-context-without-content (session) Grep call #1"},
			call{"Grep", map[string]any{"pattern": "x", "-A": 2}},
			call{"Grep", map[string]any{"pattern": "x", "context": 1, "output_mode": "content"}},
			call{"Grep", map[string]any{"pattern": "x"}}),
		guard("generated-file-hand-edit", []string{"advisory generated-file-hand-edit (session) Edit call #1"},
			call{"Edit", map[string]any{"file_path": "/r/packs/directory.GENERATED.md", "old_string": "a", "new_string": "b"}},
			call{"Write", map[string]any{"file_path": "/r/docs/notes.md", "content": "x"}},
			bash("node gen.mjs > out.GENERATED.md")),
		guard("wakeup-without-prompt", []string{"advisory wakeup-without-prompt (session) ScheduleWakeup call #1"},
			call{"ScheduleWakeup", map[string]any{"delaySeconds": 60, "noop": true, "reason": "r"}},
			call{"ScheduleWakeup", map[string]any{"delaySeconds": 60, "prompt": "p", "reason": "r"}},
			call{"ScheduleWakeup", map[string]any{"stop": true}}),
		guard("pipe-tail-hides-exit and pkill-pattern-self-match", []string{"advisory pipe-tail-hides-exit (session) Bash call #1", "advisory pkill-pattern-self-match (session) Bash call #4"},
			bash(`node --test $(git ls-files "*.test.mjs") 2>&1 | tail -20`),
			bash("node --test x.test.mjs > out.txt; tail -3 out.txt"),
			bash("grep -n needle file.txt | head -5"),
			bash("pkill -f http.server"),
			bash("pkill -f '[h]ttp.server'")),
		guard("github-list-without-fields", []string{"advisory github-list-without-fields (session) mcp__github__list_issues call #1"},
			call{"mcp__github__list_issues", map[string]any{"owner": "o", "repo": "r"}},
			call{"mcp__github__search_issues", map[string]any{"query": "q", "fields": []string{"number"}}},
			call{"mcp__github__get_me", map[string]any{}}),
		guard("ask-user-question-already-decided", []string{"advisory ask-user-question-already-decided (session) AskUserQuestion call #1"},
			call{"AskUserQuestion", map[string]any{"questions": []any{map[string]any{"question": "Merge?", "header": "Merge", "options": []any{map[string]any{"label": "a", "description": "b"}, map[string]any{"label": "c", "description": "d"}}, "multiSelect": false}}}},
			bash("echo AskUserQuestion")),
		guard("bare-wait-in-fresh-shell", []string{"advisory bare-wait-in-fresh-shell (session) Bash call #1", "advisory bare-wait-in-fresh-shell (session) Bash call #2"},
			bash("wait"),
			bash("sleep 30; wait $!"),
			bash("node build.mjs & wait"),
			bash("node build.mjs > out.txt 2>&1 &\nwait\ncat out.txt"),
			bash(`git commit -m "wait for CI" && git push`),
			bash("awaited=1; echo $awaited")),
		guard("manufactured-no-op-call", []string{"advisory manufactured-no-op-call (session) Bash call #1", "advisory manufactured-no-op-call (session) Bash call #2", "advisory manufactured-no-op-call (session) Bash call #3"},
			bash("sleep 1; echo waiting"),
			bash("true"),
			bash(`echo "still waiting for the subagent"`),
			bash("echo done > status.txt"),
			bash("sleep 5; cat out.txt")),
		guard("sub-issue-without-parent", []string{"advisory sub-issue-without-parent (session) mcp__github__issue_write call #1"},
			call{"mcp__github__issue_write", map[string]any{"method": "create", "title": "v", "body": "Original-issue: #12\nVerify: it works"}},
			call{"mcp__github__issue_write", map[string]any{"method": "create", "title": "p", "body": "Phase 2 of #12, the cutover.", "parent_issue_number": 12}},
			call{"mcp__github__issue_write", map[string]any{"method": "update", "issue_number": 5, "body": "follow-up to #12"}},
			call{"mcp__github__issue_write", map[string]any{"method": "create", "title": "x", "body": "a plain issue mentioning #12 in passing"}}),
	})
}

// Stop runs the work checks over the whole tree, as the Node engine's work
// sweep did, so a dangling link the change never touched is found too.
func TestReferenceIntegrityScope(t *testing.T) {
	fixture.Run(t, "basics", []fixture.Case{
		{Name: "a dangling link the change never touched", Member: map[string]string{"legacy.md": "[dangling](nowhere.md)\n"}, Change: map[string]string{"fresh.md": "[ok](README.md)\n", "README.md": "x\n"},
			Expect: []string{"finding reference-integrity legacy.md:1"}},
	})
}
