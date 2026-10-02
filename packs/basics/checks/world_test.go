package checks

import (
	"strings"
	"testing"

	"claudinite.com/checksdk"
)

func TestClaudeMDLength(t *testing.T) {
	big := strings.Repeat("word ", 18000)
	expect(t, "an import tree over budget", run(t, claudeMDLength, map[string]string{"CLAUDE.md": "@rules.md\n", "rules.md": big + "\n@more.md\n", "more.md": big}, nil), "CLAUDE.md:1")
	expect(t, "the same text in the root alone, under budget", run(t, claudeMDLength, map[string]string{"CLAUDE.md": big}, nil), "")
	expect(t, "an import cycle is followed once", run(t, claudeMDLength, map[string]string{"CLAUDE.md": "@a.md\n", "a.md": "@CLAUDE.md\n@a.md\n"}, nil), "")
	expect(t, "an import resolving to nothing is skipped", run(t, claudeMDLength, map[string]string{"CLAUDE.md": "@gone.md\n@../outside.md\n"}, nil), "")
	expect(t, "a long non-root CLAUDE.md", run(t, claudeMDLength, map[string]string{"sub/CLAUDE.md": big + big}, nil), "")
	fs := run(t, claudeMDLength, map[string]string{"CLAUDE.md": "@rules.md\n", "rules.md": big + "\n@more.md\n", "more.md": big}, nil)
	if len(fs) != 1 || !strings.Contains(fs[0].Sentence, "tokens (budget 24,000)") {
		t.Errorf("the sentence names the budget with en-US grouping: %+v", fs)
	}
}

func TestMarkdownLinkLabels(t *testing.T) {
	expect(t, "a path label contradicting its target", run(t, markdownLinkLabels, map[string]string{"docs/a.md": "see [docs/old/x.md](new/x.md)\n"}, nil), "docs/a.md:1")
	expect(t, "a label read from the file's folder or the root agrees", run(t, markdownLinkLabels, map[string]string{"docs/a.md": "[new/x.md](new/x.md) and [docs/new/x.md](new/x.md#top) and [x.md](y.md)\n"}, nil), "")
}

const declaredHead = "[\n"

func TestDeclaredCheckMessages(t *testing.T) {
	long := strings.Repeat("word ", 33)
	files := map[string]string{"packs/p/declared-checks.json": `[
  {"id": "over-cap", "what": "` + long + `"},
  {"id": "repeats", "matchLines": [{"pattern": "a", "fix": "do it"}, {"pattern": "b", "fix": "do it"}]},
  {"id": "rule-level", "fix": "shared", "matchLines": [{"pattern": "a"}, {"pattern": "b"}]}
]
`, "packs/q/declared-checks.json": "not json\n"}
	expect(t, "an over-cap field and a repeated fix", run(t, declaredCheckMessages, files, nil), "packs/p/declared-checks.json:2 packs/p/declared-checks.json:3")
}

func TestDeclaredCheckSince(t *testing.T) {
	files := map[string]string{"packs/p/declared-checks.json": `[
  {"id": "undated", "scope": "action", "on_fail": "block"},
  {"id": "misdated", "scope": "action", "on_fail": "block", "since": "2026-9-1"},
  {"id": "dated", "scope": "action", "on_fail": "block", "since": "2026-09-01"},
  {"id": "advising", "scope": "action", "on_fail": "advise"},
  {"id": "no-on-fail", "scope": "action"},
  {"id": "world", "on_fail": "block"}
]
`, "packs/q/declared-checks.json": "{"}
	expect(t, "blocking action checks without a readable since", run(t, declaredCheckSince, files, nil), "packs/p/declared-checks.json:2 packs/p/declared-checks.json:3")
}

func TestRunnableDocCommands(t *testing.T) {
	files := map[string]string{
		"packs/tasks/README.md":           "run `node <engine>/scheduler/run.mjs` then `node <x>/tasks/queue/run.mjs`\n",
		"packs/tasks/queue/run.mjs":       "",
		"packs/tasks/MOUNT.md":            "node .claudinite/shared/packs/tasks/queue/run.mjs and node .claudinite/shared/packs/tasks/gone.mjs\n",
		"packs/tasks/CONSUMER.md":         "node tools/build.mjs and node worker.mjs\n",
		"packs/tasks/docs/notes.md":       "node <engine>/gone.mjs\n",
		".claudinite/shared/packs/x/A.md": "node <engine>/gone.mjs\n",
		"README.md":                       "node <engine>/gone.mjs\n",
	}
	fs := run(t, runnableDocCommands, files, &checksdk.Fake{})
	expect(t, "a placeholder suffix and a mount path naming nothing", fs, "packs/tasks/MOUNT.md packs/tasks/README.md")
}

func TestSchemaConformance(t *testing.T) {
	files := map[string]string{
		"schemas/thing.schema.json":  `{"type": "object", "required": ["name"], "properties": {"$schema": {"type": "string"}, "name": {"type": "string"}, "n": {"type": "integer", "minimum": 1}}, "additionalProperties": false}`,
		"good.json":                  `{"$schema": "schemas/thing.schema.json", "name": "x"}`,
		"bad.json":                   "{\n  \"$schema\": \"schemas/thing.schema.json\",\n  \"n\": 0,\n  \"extra\": true\n}\n",
		"lost.json":                  "{\n  \"$schema\": \"nowhere.json\"\n}\n",
		"remote.json":                `{"$schema": "https://json-schema.org/draft/2020-12/schema"}`,
		"broken.json":                `{"$schema": "schemas/broken.schema.json"}`,
		"schemas/broken.schema.json": "{",
	}
	expect(t, "violations, a missing schema and an unparsable one", run(t, schemaConformance, files, nil), "bad.json bad.json bad.json:3 lost.json:2 schemas/broken.schema.json")
}

func TestValidatorKeywords(t *testing.T) {
	schema := map[string]any{
		"$defs": map[string]any{"pos": map[string]any{"type": "number", "exclusiveMinimum": 0.0}},
		"type":  "object",
		"properties": map[string]any{
			"a": map[string]any{"$ref": "#/$defs/pos"},
			"b": map[string]any{"enum": []any{"x", "y"}},
			"c": map[string]any{"type": "array", "items": map[string]any{"type": "string"}, "uniqueItems": true, "maxItems": 2.0},
			"d": map[string]any{"oneOf": []any{map[string]any{"type": "string"}, map[string]any{"type": "string", "minLength": 1.0}}},
			"e": map[string]any{"pattern": "^[a-z]+$"},
		},
		"patternProperties": map[string]any{"^x-": map[string]any{"type": "boolean"}},
	}
	doc := map[string]any{"a": -1.0, "b": "z", "c": []any{"q", "q", "r"}, "d": "s", "e": "A", "x-on": "yes"}
	errs, err := validate(doc, schema)
	if err != nil {
		t.Fatal(err)
	}
	var paths []string
	for _, e := range errs {
		paths = append(paths, e.Path)
	}
	if got := strings.Join(paths, " "); got != "/a /b /c /c /d /e /x-on" {
		t.Errorf("paths %q: %+v", got, errs)
	}
	if _, err := validate(doc, map[string]any{"$ref": "https://x/y"}); err == nil {
		t.Error("a remote $ref applied")
	}
}

func TestSharedConstants(t *testing.T) {
	cfg := func(entries ...any) *checksdk.Fake {
		return &checksdk.Fake{PackConfig: map[string]any{"basics": map[string]any{"sharedConstants": entries}}}
	}
	files := map[string]string{".claudinite/settings.yaml": "", "a.yml": "label: ship-it\n", "b.mjs": "const L = 'ship-it';\n", "c.mjs": "x\n", "v.json": `{"v": "1.2.3"}`, "v.yml": "v: 1.2.4\n"}
	entry := func(value string, counts map[string]any) map[string]any {
		return map[string]any{"what": "the label the workflow and the module share", "value": value, "counts": counts}
	}
	expect(t, "every count matches", run(t, sharedConstants, files, cfg(entry("ship-it", map[string]any{"a.yml": 1.0, "b.mjs": 1.0}))), "")
	expect(t, "a count mismatch", run(t, sharedConstants, files, cfg(entry("ship-it", map[string]any{"a.yml": 2.0, "b.mjs": 1.0}))), "a.yml")
	expect(t, "a watched file gone", run(t, sharedConstants, files, cfg(entry("ship-it", map[string]any{"gone.yml": 1.0, "b.mjs": 1.0}))), ".claudinite/settings.yaml")
	expect(t, "an entry with no what", run(t, sharedConstants, files, cfg(map[string]any{"value": "ship-it", "counts": map[string]any{"a.yml": 1.0}})), ".claudinite/settings.yaml")
	expect(t, "only importable files", run(t, sharedConstants, files, cfg(entry("ship-it", map[string]any{"b.mjs": 1.0, "c.mjs": 0.0}))), ".claudinite/settings.yaml")
	expect(t, "none declared", run(t, sharedConstants, files, &checksdk.Fake{}), "")
	regex := func(counts map[string]any) map[string]any {
		e := entry(`\d+\.\d+\.\d+`, counts)
		e["regex"] = true
		return e
	}
	expect(t, "regex mode, differing values", run(t, sharedConstants, files, cfg(regex(map[string]any{"v.json": 1.0, "v.yml": 1.0}))), ".claudinite/settings.yaml")
	expect(t, "regex mode, a count off", run(t, sharedConstants, files, cfg(regex(map[string]any{"v.json": 2.0}))), "v.json")
	bad := entry("(", map[string]any{"a.yml": 1.0})
	bad["regex"] = true
	expect(t, "an invalid pattern", run(t, sharedConstants, files, cfg(bad)), ".claudinite/settings.yaml")
}
