package test

import (
	"os"
	"strings"
	"testing"

	"claudinitepacks.test/tools/checks/fixture"
)

const (
	configPath = ".github/site.config"
	deployPath = ".github/workflows/github-pages-deploy.yml"
)

func TestPack(t *testing.T) {
	raw, err := os.ReadFile("../stubs/workflows/github-pages-deploy.yml")
	if err != nil {
		t.Fatal(err)
	}
	site := func(over map[string]string, drop ...string) map[string]string {
		files := map[string]string{configPath: "publish_root=.\npublish_paths=index.html\nbuild_command=\n", deployPath: string(raw), "index.html": "<!doctype html>\n"}
		for k, v := range over {
			files[k] = v
		}
		for _, k := range drop {
			delete(files, k)
		}
		return files
	}
	fixture.Run(t, "github-pages", []fixture.Case{
		{Name: "a Pages repo carrying the config and the vendored workflow is clean", Member: site(nil), Also: []string{"public-website"}},
		{Name: "a repo with neither signal carries no finding", Member: map[string]string{"index.html": "x\n"}, Also: []string{"public-website"}},
		{Name: "site-config demands the config beside the workflow", Member: site(nil, configPath), Also: []string{"public-website"},
			Expect: []string{"finding site-config " + configPath}},
		{Name: "deploy-workflow refuses a push trigger", Also: []string{"public-website"},
			Member: site(map[string]string{deployPath: strings.Replace(string(raw), "on:\n  workflow_dispatch:", "on:\n  push:\n  workflow_dispatch:", 1)}),
			Expect: []string{"finding deploy-workflow " + deployPath}},
	})
}
