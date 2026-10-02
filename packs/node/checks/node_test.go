package checks

import (
	"testing"

	"claudinite.com/checksdk"
)

func pkgJSON(deps string) string { return "{\n  " + deps + "\n}\n" }

func TestEarnEachDependency(t *testing.T) {
	change := func(file, base, head string) (map[string]string, *checksdk.Fake) {
		return map[string]string{file: head}, &checksdk.Fake{ChangedFiles: []string{file}, Base: map[string]string{file: base}}
	}
	files, f := change("package.json", pkgJSON(`"dependencies": {"left": "^1.0.0"}`), pkgJSON(`"dependencies": {"left": "^1.0.0", "chalk": "^5.0.0"}`))
	fs := run(t, earnEachDependency, files, f)
	expect(t, "a dependency the base did not carry", fs, "package.json")
	if len(fs) == 1 && fs[0].Sentence != `"chalk" added to dependencies` {
		t.Errorf("sentence %q", fs[0].Sentence)
	}
	files, f = change("server/package.json", pkgJSON(`"dependencies": {}`), pkgJSON(`"devDependencies": {"esbuild": "^0.20.0"}`))
	expect(t, "one folder down", run(t, earnEachDependency, files, f), "server/package.json")
	files, f = change("package.json", pkgJSON(`"dependencies": {"left": "^1.0.0"}`), pkgJSON(`"dependencies": {"left": "^2.0.0"}`))
	expect(t, "a version bump", run(t, earnEachDependency, files, f), "")
	files, f = change("package.json", pkgJSON(`"devDependencies": {"esbuild": "^0.20.0"}`), pkgJSON(`"dependencies": {"esbuild": "^0.20.0"}`))
	expect(t, "a group move", run(t, earnEachDependency, files, f), "")
	expect(t, "an unchanged manifest", run(t, earnEachDependency, map[string]string{"package.json": pkgJSON(`"dependencies": {"left": "1"}`)}, &checksdk.Fake{}), "")
	files, f = change("a/b/package.json", pkgJSON(`"dependencies": {}`), pkgJSON(`"dependencies": {"x": "1"}`))
	expect(t, "a nested fixture manifest", run(t, earnEachDependency, files, f), "")
	files, f = change("package.json", "", pkgJSON(`"dependencies": {"x": "1"}`))
	delete(f.Base, "package.json")
	expect(t, "a new manifest carries nothing before", run(t, earnEachDependency, files, f), "package.json")
}

func TestResolvesToFiles(t *testing.T) {
	paths := []string{"test/foo.test.mjs", "dev/requirements/a.test.mjs"}
	for arg, want := range map[string]bool{"test/foo.test.mjs": true, "test/**/*.test.mjs": true, "**/a.test.mjs": true, "dev/requirements": true, "dev/requirements/": true, "test/gone.test.mjs": false, "": false, "test/*.mjs": true, "*.mjs": false} {
		if got := resolvesToFiles(arg, paths); got != want {
			t.Errorf("resolvesToFiles(%q) = %v", arg, got)
		}
	}
	for _, c := range []string{"npm ci", "node --test $GLOB", "node --test `echo test`", "node script.mjs"} {
		if judged, _ := judgeCommand(c, paths); judged {
			t.Errorf("%q was judged", c)
		}
	}
}

func TestTestDiscoveryResolves(t *testing.T) {
	expect(t, "a script naming a dot-path that holds nothing", run(t, testDiscoveryResolves, map[string]string{"package.json": "{\n  \"scripts\": {\n    \"test\": \"node --test .hidden/**/*.test.mjs\"\n  }\n}\n"}, nil), "package.json:3")
	expect(t, "a script naming a tracked test", run(t, testDiscoveryResolves, map[string]string{"package.json": `{"scripts": {"test": "npm ci && node --test test/**/*.test.mjs"}}`, "test/a.test.mjs": ""}, nil), "")
	expect(t, "a workflow step whose glob holds nothing", run(t, testDiscoveryResolves, map[string]string{".github/workflows/ci.yml": "on: push\njobs:\n  test:\n    steps:\n      - run: node --test .gone/**/*.test.mjs\n"}, nil), ".github/workflows/ci.yml:5")
	expect(t, "a bare node --test", run(t, testDiscoveryResolves, map[string]string{"package.json": `{"scripts": {"test": "node --test"}}`}, nil), "package.json:1")
	expect(t, "a test only the vendored mount holds", run(t, testDiscoveryResolves, map[string]string{"package.json": `{"scripts": {"t": "node --test .claudinite/shared/x.test.mjs"}}`, ".claudinite/shared/x.test.mjs": ""}, nil), "package.json:1")
}
