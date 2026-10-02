package checks

import "testing"

func TestVersionStampMatchesPackage(t *testing.T) {
	pkg := `{"version": "61002.1.0"}`
	expect(t, "a stale stamp", run(t, versionStampMatchesPackage, map[string]string{"package.json": pkg, "site/index.html": "<p>\n<span title=\"version 61001.3.0\">v</span>\n"}, nil), "site/index.html:2")
	expect(t, "a current stamp, and a page with none", run(t, versionStampMatchesPackage, map[string]string{"package.json": pkg, "index.html": `<span title="version 61002.1.0">`, "about.html": "<p>no stamp</p>"}, nil), "")
	expect(t, "no version record", run(t, versionStampMatchesPackage, map[string]string{"index.html": `<span title="version 1">`}, nil), "")
	expect(t, "a record with no version", run(t, versionStampMatchesPackage, map[string]string{"package.json": `{"name": "x"}`, "index.html": `<span title="version 1">`}, nil), "")
	expect(t, "two stamps on one line", run(t, versionStampMatchesPackage, map[string]string{"package.json": pkg, "a.html": `<a title="version 1"></a><b title="version 2"></b>`}, nil), "a.html:1 a.html:1")
}
