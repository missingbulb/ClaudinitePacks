package test

import (
	"encoding/json"
	"testing"

	"claudinitepacks.test/tools/checks/fixture"
)

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

func labels(method string, names ...string) call {
	in := map[string]any{"method": method, "owner": "o", "repo": "r", "labels": names}
	if method == "create" {
		in["title"] = "t"
	} else {
		in["issue_number"] = 7
	}
	return call{"mcp__github__issue_write", in}
}

// Every finding a recorded call earns reads as an advisory at Stop; the
// PreToolUse hook is where the same guard blocks.
func TestIssueLabelOutsideTheQueueVocabulary(t *testing.T) {
	const id = "issue-label-outside-the-queue-vocabulary"
	change := map[string]string{"a.txt": "x\n"}
	at := func(n string) string { return "advisory " + id + " (session) mcp__github__issue_write call #" + n }
	fixture.Run(t, "claudinite-tasks", []fixture.Case{
		{Name: "a project's own labels, swapped on its own issue", Change: change, Transcript: session(
			labels("update", "extractor-request", "needs-human"),
			labels("update", "extractor-request", "agent-running"),
			labels("create", "bug"),
		)},
		{Name: "the queue's own vocabulary", Change: change, Transcript: session(
			labels("create", "task:origin:ad-hoc"),
			labels("update", "task:status:done", "outcome:done"),
		)},
		{Name: "a label invented beside the queue mark", Change: change, Transcript: session(
			labels("create", "task:origin:ad-hoc", "conformance-backlog"),
		), Expect: []string{at("1")}},
		{Name: "a queue-named label in place of the mark", Change: change, Transcript: session(
			labels("create", "claudinite-queue"),
			labels("update", "conformance-backlog"),
			labels("create", "claude-queued"),
		), Expect: []string{at("1"), at("2")}},
	})
}
