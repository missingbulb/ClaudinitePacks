package checks

import (
	"testing"

	"claudinite.com/checksdk"
)

func fn(handler string, bp map[string]any) map[string]any {
	return map[string]any{"Resources": map[string]any{"Fn": map[string]any{
		"Type":       "AWS::Serverless::Function",
		"Properties": map[string]any{"Handler": handler},
		"Metadata":   map[string]any{"BuildMethod": "esbuild", "BuildProperties": bp},
	}}}
}

func TestHandlerPath(t *testing.T) {
	files := map[string]string{"template.yaml": "x\n", "infra/template.yml": "x\n"}
	single := map[string]any{"EntryPoints": []any{"src/handler.ts"}}
	cases := []struct {
		name string
		doc  map[string]any
		want string
	}{
		{"a subdir Handler under single-entry esbuild", fn("src/handler.handler", single), "template.yaml"},
		{"the Handler drops the subdir", fn("handler.handler", single), ""},
		{"OutBase is set", fn("src/handler.handler", map[string]any{"EntryPoints": []any{"src/handler.ts"}, "OutBase": "."}), ""},
		{"more than one entry point", fn("src/handler.handler", map[string]any{"EntryPoints": []any{"src/a.ts", "src/b.ts"}}), ""},
		{"an entry at the root", fn("src/handler.handler", map[string]any{"EntryPoints": []any{"handler.ts"}}), ""},
	}
	for _, c := range cases {
		f := &checksdk.Fake{Tracked: []string{"template.yaml"}, Parsed: map[string]any{"template.yaml": c.doc}}
		expect(t, c.name, run(t, handlerPath, files, f), c.want)
	}
	f := &checksdk.Fake{Tracked: []string{"infra/template.yml", "x/template.yaml.bak"}, Parsed: map[string]any{"infra/template.yml": fn("src/handler.handler", single)}}
	expect(t, "a template one folder down", run(t, handlerPath, files, f), "infra/template.yml")
}
