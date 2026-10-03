package checks

import (
	"encoding/json"
	"os"
	"os/exec"
	"reflect"
	"strings"
	"testing"
)

const config = "publish_root=.\npublish_paths=index.html assets\nbuild_command=\n"

func deployStub(t *testing.T) string {
	raw, err := os.ReadFile("../stubs/workflows/" + deployWorkflowFile)
	if err != nil {
		t.Fatal(err)
	}
	return string(raw)
}

func pagesRepo(t *testing.T, over map[string]string, drop ...string) map[string]string {
	files := map[string]string{configPath: config, deployWorkflowPath: deployStub(t), "index.html": "<!doctype html>\n", "assets/style.css": "body{}\n"}
	for k, v := range over {
		files[k] = v
	}
	for _, k := range drop {
		delete(files, k)
	}
	return files
}

func TestSiteConfig(t *testing.T) {
	expect(t, "a fully declared config", run(t, siteConfig, pagesRepo(t, nil), nil), "")
	expect(t, "a repo that never adopted Pages", run(t, siteConfig, map[string]string{"index.html": "x"}, nil), "")
	fs := run(t, siteConfig, pagesRepo(t, nil, configPath), nil)
	expect(t, "the workflow alone demands the config", fs, configPath)
	if !strings.Contains(said(fs), "missing — the deploy reads every repo value from it (publish_root, publish_paths, build_command)") {
		t.Errorf("said %q", said(fs))
	}
	for name, c := range map[string]struct{ config, want string }{
		"unknown, missing and unmatched": {"publish_root=.\npublish_paths=index.html missing-dir\nversion_files=package.json\n",
			"line 3: unknown key 'version_files'|required key 'build_command' is missing|\"missing-dir\" matches nothing tracked"},
		"a tooling directory":   {"publish_root=.\npublish_paths=index.html .claudinite\nbuild_command=\n", `publishes ".claudinite"`},
		"the whole repo root":   {"publish_root=.\npublish_paths=.\nbuild_command=\n", "whole repo root"},
		"no index.html":         {"publish_root=.\npublish_paths=assets\nbuild_command=\n", "no publish path carries an index.html"},
		"not KEY=value":         {config + "=x\nbuild_vars=FOO=bar\n", "line 4: '=x' is not KEY=value|build_vars entry 'FOO=bar' is not a variable name"},
		"twice and empty":       {config + "publish_root=\n", "line 4: 'publish_root' is set twice|'publish_root' is empty"},
	} {
		got := said(run(t, siteConfig, pagesRepo(t, map[string]string{configPath: c.config}), nil))
		for _, w := range strings.Split(c.want, "|") {
			if !strings.Contains(got, w) {
				t.Errorf("%s: said %q, want %q", name, got, w)
			}
		}
	}
	expect(t, "a subdirectory root published whole", run(t, siteConfig, pagesRepo(t, map[string]string{
		configPath: "publish_root=site\npublish_paths=.\nbuild_command=\n", "site/index.html": "x"}), nil), "")
}

func TestDeployWorkflow(t *testing.T) {
	stub := deployStub(t)
	expect(t, "the vendored workflow", run(t, deployWorkflow, pagesRepo(t, nil), nil), "")
	fs := run(t, deployWorkflow, pagesRepo(t, nil, deployWorkflowPath), nil)
	expect(t, "missing", fs, deployWorkflowPath)
	if !strings.Contains(said(fs), "stubs/workflows/github-pages-deploy.yml") {
		t.Errorf("said %q", said(fs))
	}
	pushed := strings.Replace(stub, "on:\n  workflow_dispatch:", "on:\n  push:\n    branches: [main]\n  workflow_dispatch:", 1)
	if !strings.Contains(said(run(t, deployWorkflow, pagesRepo(t, map[string]string{deployWorkflowPath: pushed}), nil)), "has a push: trigger") {
		t.Error("a push trigger is not refused")
	}
	if !strings.Contains(said(run(t, deployWorkflow, pagesRepo(t, map[string]string{deployWorkflowPath: "name: Something else\non:\n  workflow_dispatch:\njobs: {}\n"}), nil)), "is not the pack's deploy workflow") {
		t.Error("a foreign workflow is not refused")
	}
	expect(t, "a second publisher", run(t, deployWorkflow, pagesRepo(t, map[string]string{
		".github/workflows/old-release.yml": "name: old\non:\n  push:\njobs:\n  d:\n    steps:\n      # - uses: actions/deploy-pages@v4\n      - uses: actions/deploy-pages@v4\n"}), nil),
		".github/workflows/old-release.yml:8")
}

// The reading is lib.mjs's, which the deploy's build step and the release
// read: node holds the two equal over inputs selecting each branch.
func TestReadingMatchesTheDeploy(t *testing.T) {
	node, err := exec.LookPath("node")
	if err != nil {
		t.Skip("node is not on PATH; the deploy reads the config in JavaScript")
	}
	texts := []string{
		config, "publish_root=./site/\npublish_paths=  a  b/c \nbuild_command='  x '\nbuild_vars=A B_1 1C\n",
		"# c\n\n=x\nfoo\nk = \"v\"\npublish_root=\npublish_root=.\n", "publish_paths=.\nbuild_command=\"\n", "",
		"publish_root=site\npublish_paths=. index.html\nbuild_command=make\n",
	}
	script := `
import { parseConfig, publishSet } from './lib.mjs';
const out = JSON.parse(process.argv[1]).map((t) => {
  const { values, errors } = parseConfig(t);
  const s = publishSet(values);
  return { values: Object.fromEntries(values), errors, root: s.root, siteRoot: s.siteRoot, full: s.paths.map(s.fullOf) };
});
console.log(JSON.stringify(out));
`
	in, _ := json.Marshal(texts)
	cmd := exec.Command(node, "--input-type=module", "-e", script, string(in))
	cmd.Dir = ".."
	raw, err := cmd.Output()
	if err != nil {
		t.Fatalf("node: %v", err)
	}
	type reading struct {
		Values   map[string]string `json:"values"`
		Errors   []string          `json:"errors"`
		Root     string            `json:"root"`
		SiteRoot string            `json:"siteRoot"`
		Full     []string          `json:"full"`
	}
	var want []reading
	if err := json.Unmarshal(raw, &want); err != nil {
		t.Fatal(err)
	}
	for i, text := range texts {
		values, errs := parseConfig(text)
		s := newPublishSet(values)
		got := reading{Values: values, Errors: errs, Root: s.root, SiteRoot: s.siteRoot}
		for _, p := range s.paths {
			got.Full = append(got.Full, s.fullOf(p))
		}
		w := want[i]
		if len(got.Errors) == 0 {
			got.Errors = nil
		}
		if len(w.Errors) == 0 {
			w.Errors = nil
		}
		if len(w.Full) == 0 {
			w.Full = nil
		}
		if !reflect.DeepEqual(got, w) {
			t.Errorf("config %q:\n  cn   %+v\n  node %+v", text, got, w)
		}
	}
}
