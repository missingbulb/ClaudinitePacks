package test

import (
	"testing"

	"claudinitepacks.test/tools/checks/fixture"
)

func TestPack(t *testing.T) {
	fixture.Run(t, "host-page", []fixture.Case{
		{Name: "an adapter that bubbles, targets the app and disconnects is clean", Member: map[string]string{
			"src/adapter.js": "const o = new MutationObserver(f);\no.observe(root, {});\no.disconnect();\ncell.dispatchEvent(new MouseEvent('click', { bubbles: true }));\n",
		}},
		{Name: "each check fires on its trap", Member: map[string]string{
			"src/watch.js": "const o = new MutationObserver(f);\no.observe(root, {});\n",
			"src/type.js":  "document.dispatchEvent(new KeyboardEvent('keydown'));\n",
		}, Expect: []string{
			"finding page-observers-disconnected src/watch.js:1",
			"finding synthetic-input-events-bubble src/type.js:1",
			"finding synthetic-input-events-target-app-node src/type.js:1",
		}},
	})
}
