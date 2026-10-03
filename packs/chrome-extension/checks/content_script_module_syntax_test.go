package checks

import (
	"strings"
	"testing"
)

const csManifest = `{
  "manifest_version": 3,
  "name": "fixture",
  "version": "1.0",
  "content_scripts": [{ "matches": ["https://example.com/*"], "js": ["content/main.js"] }]
}`

func ext(files map[string]string) map[string]string {
	out := map[string]string{"manifest.json": csManifest}
	for k, v := range files {
		out[k] = v
	}
	return out
}

func TestContentScriptModuleSyntax(t *testing.T) {
	fs := run(t, contentScriptModuleSyntax, ext(map[string]string{
		"content/main.js": "import { greet } from './lib.js';\n\ngreet(document.title);\n",
		"content/lib.js":  "export const greet = (t) => console.log(t);\n",
	}), nil)
	expect(t, "a top-level import in a static content script; the imported module is not judged", fs, "content/main.js:1")
	if !strings.Contains(said(fs), "top-level `import`") {
		t.Errorf("sentence: %s", said(fs))
	}

	fs = run(t, contentScriptModuleSyntax, ext(map[string]string{"content/main.js": "const x = 1;\nexport default x;\n"}), nil)
	expect(t, "a top-level export", fs, "content/main.js:2")
	if !strings.Contains(said(fs), "top-level `export`") {
		t.Errorf("sentence: %s", said(fs))
	}

	fs = run(t, contentScriptModuleSyntax, map[string]string{
		"manifest.json":   `{"manifest_version":3,"name":"f","version":"1.0"}`,
		"content/main.js": "console.log(\"classic\");\n",
		"sw.js":           "chrome.scripting.registerContentScripts([{ id: 'x', matches: ['<all_urls>'], js: ['content/dyn.js'] }]);\n",
		"content/dyn.js":  "import './helper.js';\n",
	}, nil)
	expect(t, "a script registered through registerContentScripts", fs, "content/dyn.js:1")
	if !strings.Contains(said(fs), "declared in sw.js") {
		t.Errorf("sentence: %s", said(fs))
	}

	for name, files := range map[string]map[string]string{
		"the classic dynamic-import loader": ext(map[string]string{"content/main.js": "import(chrome.runtime.getURL('content/app.js'));\nimport ('./other.js');\nconsole.log(import.meta);\n"}),
		"module syntax only in a comment or a string": ext(map[string]string{"content/main.js": "// never write: import { a } from './a.js'\n/*\nexport default 1;\n*/\nconst src = `\nimport { b } from './b.js';\nexport default b;\n`;\ninject(src);\n"}),
		"non-injected extension source": ext(map[string]string{
			"content/main.js": "console.log(\"classic\");\n",
			"sw.js":           "import { handle } from './lib.js';\nchrome.runtime.onMessage.addListener(handle);\n",
			"panel/panel.js":  "export function render() {}\n",
		}),
		"no extension manifest":                  {"src/app.js": "import x from './x.js';\nexport default x;\n"},
		"an entry climbing out of the extension": {"ext/manifest.json": `{"manifest_version":3,"content_scripts":[{"js":["../outside.js"]}]}`, "outside.js": "import 'x';\n"},
	} {
		expect(t, name, run(t, contentScriptModuleSyntax, files, nil), "")
	}

	fs = run(t, contentScriptModuleSyntax, map[string]string{
		"ext/manifest.json": `{"manifest_version":3,"content_scripts":[{"js":["/c.js","./d.js"]}]}`,
		"ext/c.js":          "export {};\n",
		"ext/d.js":          "\n\n  import x from \"y\";\n",
	}, nil)
	expect(t, "a manifest one folder down resolves its entries from its own directory", fs, "ext/c.js:1 ext/d.js:3")
}
