package test

import (
	"testing"

	"claudinitepacks.test/tools/checks/fixture"
)

func TestPack(t *testing.T) {
	fixture.Run(t, "leaflet", []fixture.Case{
		{Name: "a pinned, hashed, attributed map is clean", Member: map[string]string{
			"index.html": `<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" integrity="sha256-x" crossorigin=""></script>` + "\n",
			"map.js":     "L.tileLayer(url, { attribution: '© OSM' });\n",
		}},
		{Name: "each check fires on its trap", Member: map[string]string{
			"index.html": `<script src="https://unpkg.com/leaflet/dist/leaflet.js"></script>` + "\n",
			"map.js":     "L.tileLayer(url, { maxZoom: 19 });\n",
		}, Expect: []string{"finding asset-integrity index.html:1", "finding tile-attribution map.js:1"}},
	})
}
