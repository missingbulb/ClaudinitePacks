package test

import (
	"testing"

	"claudinitepacks.test/tools/checks/fixture"
)

const wrangler = `{"assets": {"directory": "./site"}, "compatibility_date": "2026-09-08"}`

func site(more map[string]string) map[string]string {
	out := map[string]string{"wrangler.json": wrangler, "site/index.html": "<p>x</p>\n"}
	for k, v := range more {
		out[k] = v
	}
	return out
}

func TestPack(t *testing.T) {
	fixture.Run(t, "cloudflare-site", []fixture.Case{
		{Name: "a site published from its own directory is clean", Member: site(nil)},
		{Name: "publishes-a-site-directory flags a root publish",
			Member: site(map[string]string{"wrangler.json": `{"assets": {"directory": "."}, "compatibility_date": "2026-09-08"}`}),
			Expect: []string{"finding publishes-a-site-directory wrangler.json"}},
		{Name: "no-second-publisher flags a Pages deploy and a CNAME",
			Member: site(map[string]string{"site/CNAME": "example.com\n", ".github/workflows/pages.yml": "on: push\njobs:\n  a:\n    steps:\n      - uses: actions/deploy-pages@v4\n"}),
			Expect: []string{"finding no-second-publisher site/CNAME", "finding no-second-publisher .github/workflows/pages.yml:5"}},
		{Name: "beacon-token-is-not-committed flags a real token",
			Member: site(map[string]string{"site/a.js": `var b = {"token": "4f8b21ce9a7d4e0fb3c65a1d2e7f9081"};` + "\n"}),
			Expect: []string{"finding beacon-token-is-not-committed site/a.js:1"}},
	})
}
