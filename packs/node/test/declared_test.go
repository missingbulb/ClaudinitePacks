package test

import (
	"testing"

	"claudinitepacks.test/tools/checks/fixture"
)

func TestBtoaAtobOnText(t *testing.T) {
	fixture.Run(t, "node", []fixture.Case{
		{Name: "a btoa or atob call in any script extension", Member: map[string]string{
			"src/token.mjs": "export const t = (s) => btoa(s);\n",
			"lib/decode.ts": "export const d = (s: string) => atob(s);\n",
		}, Expect: []string{"advisory node/btoa-atob-on-text lib/decode.ts:1", "advisory node/btoa-atob-on-text src/token.mjs:1"}},
		{Name: "a Buffer bridge, a comment naming the call, and prose", Member: map[string]string{
			"src/token.mjs": "// never btoa(s) here\nexport const t = (s) => Buffer.from(s, 'utf8').toString('base64');\n",
			"README.md":     "Do not call btoa(text).\n",
		}},
	})
}
