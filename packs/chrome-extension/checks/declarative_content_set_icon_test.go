package checks

import "testing"

func TestDeclarativeContentSetIcon(t *testing.T) {
	worker := func(body string) map[string]string { return map[string]string{"sw.js": body} }
	expect(t, "a SetIcon built from a path", run(t, declarativeContentSetIcon, worker(`chrome.declarativeContent.onPageChanged.addRules([{
  conditions: [new chrome.declarativeContent.PageStateMatcher({})],
  actions: [new chrome.declarativeContent.SetIcon({ path: 'icons/on-16.png' })],
}]);
`), nil), "sw.js:3")
	expect(t, "a per-size path map and a quoted key", run(t, declarativeContentSetIcon, worker("const a = new chrome.declarativeContent.SetIcon({ path: { 16: 'a.png', 32: 'b.png' } });\nconst b = new chrome.declarativeContent.SetIcon({ 'path': 'c.png' });\n"), nil), "sw.js:1 sw.js:2")
	for name, body := range map[string]string{
		"imageData":                    "const icon = new chrome.declarativeContent.SetIcon({ imageData: bitmap });\n",
		"chrome.action.setIcon":        "chrome.action.setIcon({ path: 'icons/on-16.png' });\nchrome.browserAction.setIcon({ path: { 16: 'a.png' } });\n",
		"a nested or neighbouring path": "new chrome.declarativeContent.SetIcon({ imageData: await decode({ path: 'a.png' }) });\nfetch(chrome.runtime.getURL(manifest.icons.path));\n",
		"inside a comment":             "// never write new chrome.declarativeContent.SetIcon({ path: 'x.png' })\n/* nor here: chrome.declarativeContent.SetIcon({ path: 'y.png' }) */\n",
		"an unbalanced argument":       "new chrome.declarativeContent.SetIcon({ path: 'a.png'\n",
		"a path inside a string value": "new chrome.declarativeContent.SetIcon({ imageData: 'path: x', \"a{b\": 1 });\n",
	} {
		expect(t, name, run(t, declarativeContentSetIcon, worker(body), nil), "")
	}
}
