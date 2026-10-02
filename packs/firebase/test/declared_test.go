package test

import (
	"encoding/json"
	"testing"

	"claudinitepacks.test/tools/checks/fixture"
)

func js(v any) string {
	b, _ := json.MarshalIndent(v, "", "  ")
	return string(b)
}

type obj = map[string]any

func project(pkg obj) map[string]string {
	p := obj{"name": "fns"}
	for k, v := range pkg {
		p[k] = v
	}
	return map[string]string{"firebase.json": js(obj{"functions": obj{"source": "functions"}}), "functions/package.json": js(p)}
}

func TestFunctionsNodePin(t *testing.T) {
	fixture.Run(t, "firebase", []fixture.Case{
		{Name: "a deployed functions package with no engines.node", Member: project(nil), Expect: []string{"finding firebase/functions-node-pin functions/package.json"}},
		{Name: "a pinned Node major", Member: project(obj{"engines": obj{"node": "22"}})},
		{Name: "an empty engines.node", Member: project(obj{"engines": obj{"node": "  "}}), Expect: []string{"finding firebase/functions-node-pin functions/package.json"}},
		{Name: "a project deploying no functions", Member: map[string]string{"firebase.json": js(obj{"hosting": obj{"public": "public"}}), "functions/package.json": js(obj{"name": "not-deployed"})}},
		{Name: "a codebase outside this checkout", Member: map[string]string{"firebase.json": js(obj{"functions": obj{"source": "functions"}})}},
		{Name: "a nested example firebase.json", Member: map[string]string{"examples/demo/firebase.json": js(obj{"functions": obj{"source": "functions"}}), "examples/demo/functions/package.json": js(obj{"name": "demo"})}},
		{Name: "a project root one directory down", Member: map[string]string{"firebase/firebase.json": js(obj{"functions": []any{obj{"source": "fns", "codebase": "default"}}}), "firebase/fns/package.json": js(obj{"name": "fns"})},
			Expect: []string{"finding firebase/functions-node-pin firebase/fns/package.json"}},
	})
}
