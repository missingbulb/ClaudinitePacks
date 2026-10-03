package checks

import (
	"strings"
	"testing"
)

const (
	coreJS  = `<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""></script>`
	coreCSS = `<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin="" />`
	osm     = `'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'`
)

func page(body string) map[string]string { return map[string]string{"index.html": body} }

func TestAssetIntegrity(t *testing.T) {
	fs := run(t, assetIntegrity, page("<head>\n"+coreCSS+"\n"+coreJS+"\n<script src=\"https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js\"></script>\n</head>\n"), nil)
	expect(t, "a bare plugin beside a wired core", fs, "index.html:4")
	if s := said(fs); !strings.Contains(s, "leaflet.markercluster") || !strings.Contains(s, "integrity") || !strings.Contains(s, "crossorigin") || strings.Contains(s, "version pin") {
		t.Errorf("said %q", s)
	}
	fs = run(t, assetIntegrity, page(`<script src="https://unpkg.com/leaflet@latest/dist/leaflet.js" integrity="sha256-abc" crossorigin=""></script>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/leaflet/dist/leaflet.css" integrity="sha512-abc" crossorigin>
`), nil)
	expect(t, "unpinned URLs", fs, "index.html:1 index.html:2")
	if strings.Count(said(fs), "version pin") != 2 {
		t.Errorf("said %q", said(fs))
	}
	for name, body := range map[string]string{
		"core and plugin wired": "<head>\n" + coreCSS + "\n" + coreJS + "\n<script src=\"https://unpkg.com/leaflet.markercluster@1.5.3/dist/x.js\" integrity=\"sha256-W=\" crossorigin=\"\"></script>\n<script src=\"https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js\" integrity=\"sha512-abc\" crossorigin=\"anonymous\"></script>\n</head>\n",
		"locally vendored":      "<link rel=\"stylesheet\" href=\"vendor/leaflet.css\">\n<script src=\"/js/leaflet.js\"></script>\n<link rel=\"preconnect\" href=\"https://unpkg.com\">\n",
		"not Leaflet, or text":  "<script src=\"https://cdn.jsdelivr.net/npm/chart.js\"></script>\n<p>We load Leaflet from https://unpkg.com/leaflet/dist/leaflet.js.</p>\n<script>const CORE = 'https://unpkg.com/leaflet/dist/leaflet.js';</script>\n",
		"inside a comment":      "<!-- never write this:\n<script src=\"https://unpkg.com/leaflet/dist/leaflet.js\"></script>\n-->\n" + coreJS + "\n",
	} {
		expect(t, name, run(t, assetIntegrity, page(body), nil), "")
	}
}

func TestTileAttribution(t *testing.T) {
	cases := []struct{ name, file, src, want, says string }{
		{"a literal without attribution", "js/app.js", "const map = L.map('map');\nL.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {\n  maxZoom: 19,\n}).addTo(map);\n", "js/app.js:2", "literal options object"},
		{"no options", "js/app.js", "L.tileLayer('https://tile.example/{z}/{x}/{y}.png').addTo(map);\n", "js/app.js:1", "no options at all"},
		{"the bare one beside an attributed one", "js/app.js", "const base = L.tileLayer('https://a/{z}.png', {\n  maxZoom: 19,\n  attribution: " + osm + ",\n});\nconst overlay = L.tileLayer('https://b/{z}.png', {\n  opacity: 0.5,\n  maxZoom: 19,\n});\n", "js/app.js:5", ""},
		{"an inline script", "index.html", "<!doctype html>\n<div id=\"map\"></div>\n<script>\n  const map = L.map('map').setView([51.5, -0.1], 13);\n  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);\n</script>\n", "index.html:5", ""},
		{"attributed", "js/app.js", "L.tileLayer('https://t/{z}.png', {\n  maxZoom: 19,\n  attribution: " + osm + ",\n}).addTo(map);\n", "", ""},
		{"a quoted key", "js/app.js", "L.tileLayer(url, { 'attribution': '© OSM', maxZoom: 19 });\n", "", ""},
		{"a variable or a spread", "js/app.js", "const O = { attribution: " + osm + " };\nL.tileLayer('https://a/{z}.png', O);\nL.tileLayer('https://b/{z}.png', { ...O, opacity: 0.5 });\n", "", ""},
		{"out of band", "js/app.js", "L.tileLayer('https://t/{z}.png', { maxZoom: 19 }).addTo(map);\nmap.attributionControl.addAttribution(" + osm + ");\n", "", ""},
		{"wms", "js/app.js", "L.tileLayer.wms('https://wms.example/service', { layers: 'base', maxZoom: 19 });\n", "", ""},
		{"comments", "js/app.js", "// Never write L.tileLayer(url, { maxZoom: 19 }) without attribution.\n/* L.tileLayer(url, {}) is the bad shape. */\n", "", ""},
		{"page text", "docs.html", "<!-- L.tileLayer(url, { maxZoom: 19 }) -->\n<pre>L.tileLayer(url, { maxZoom: 19 })</pre>\n", "", ""},
		{"a comma in the URL, a nested option", "js/app.js", "L.tileLayer('https://t/{z}.png?k=a,b', {\n  bounds: [[1, 2], [3, 4]],\n  attribution: " + osm + ",\n});\n", "", ""},
		{"a double-quoted key and a multibyte URL", "js/app.js", "L.tileLayer('https://t/é/{z}.png',   {\"attribution\": 'x'});\nL.tileLayer('https://t/é/{z}.png',\t{ maxZoom: 1 });\n", "js/app.js:2", ""},
	}
	for _, c := range cases {
		fs := run(t, tileAttribution, map[string]string{c.file: c.src}, nil)
		expect(t, c.name, fs, c.want)
		if !strings.Contains(said(fs), c.says) {
			t.Errorf("%s: said %q", c.name, said(fs))
		}
	}
}
