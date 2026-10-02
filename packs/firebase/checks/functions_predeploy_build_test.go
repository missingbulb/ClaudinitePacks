package checks

import "testing"

func TestFunctionsPredeployBuild(t *testing.T) {
	build := `{"scripts": {"build": "tsc"}}`
	cases := []struct {
		name  string
		files map[string]string
		want  string
	}{
		{"a build script with no predeploy hook", map[string]string{"firebase.json": `{"functions": {"source": "functions"}}`, "functions/package.json": build}, "firebase.json"},
		{"the build wired as predeploy", map[string]string{"firebase.json": `{"functions": {"predeploy": ["npm --prefix functions run build"]}}`, "functions/package.json": build}, ""},
		{"a string predeploy", map[string]string{"firebase.json": `{"functions": {"predeploy": "npm run build"}}`, "functions/package.json": build}, ""},
		{"an empty predeploy list", map[string]string{"firebase.json": `{"functions": {"predeploy": []}}`, "functions/package.json": build}, "firebase.json"},
		{"a plain-JS codebase with no build", map[string]string{"firebase.json": `{"functions": {}}`, "functions/package.json": `{"scripts": {}}`}, ""},
		{"each codebase on its own entry", map[string]string{"firebase.json": `{"functions": [{"source": "a", "predeploy": ["x"]}, {"source": "b"}]}`, "a/package.json": build, "b/package.json": build}, "firebase.json"},
		{"a project one folder down", map[string]string{"app/firebase.json": `{"functions": {"source": "fns"}}`, "app/fns/package.json": build}, "app/firebase.json"},
		{"a nested example out of scope", map[string]string{"a/b/firebase.json": `{"functions": {}}`, "a/b/functions/package.json": build}, ""},
		{"a codebase this checkout lacks", map[string]string{"firebase.json": `{"functions": {"source": "elsewhere"}}`}, ""},
	}
	for _, c := range cases {
		expect(t, c.name, run(t, functionsPredeployBuild, c.files, nil), c.want)
	}
}
