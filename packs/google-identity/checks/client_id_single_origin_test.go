package checks

import (
	"testing"

	"claudinite.com/checksdk"
)

const id = "1234-abc.apps.googleusercontent.com"

func TestClientIDSingleOrigin(t *testing.T) {
	changed := func(files ...string) *checksdk.Fake {
		return &checksdk.Fake{ChangedFiles: files, Base: map[string]string{}}
	}
	expect(t, "a literal with no other copy", run(t, clientIDSingleOrigin, map[string]string{"web/login.js": "const ID = '" + id + "';\n"}, changed("web/login.js")), "")
	expect(t, "a copy of a literal another file holds", run(t, clientIDSingleOrigin, map[string]string{"web/login.js": "const ID = '" + id + "';\n", "api/verify.py": "AUDIENCE = '" + id + "'\n"}, changed("api/verify.py")), "api/verify.py:1")
	base := &checksdk.Fake{ChangedFiles: []string{"README.md"}, Base: map[string]string{"README.md": "x\n"}, Added: []checksdk.Line{{Path: "README.md", Line: 2, Text: "unrelated"}}}
	expect(t, "legacy duplicates the change never touched", run(t, clientIDSingleOrigin, map[string]string{"a.js": id, "b.py": id, "README.md": "x\nunrelated\n"}, base), "")
	expect(t, "repeated uses in one added file", run(t, clientIDSingleOrigin, map[string]string{"web/login.js": "'" + id + "' '" + id + "'\nalso " + id + "\n"}, changed("web/login.js")), "")
	expect(t, "two copies added together", run(t, clientIDSingleOrigin, map[string]string{"web/login.js": id + "\n", "api/verify.py": id + "\n"}, changed("web/login.js", "api/verify.py")), "api/verify.py:1 web/login.js:1")
	expect(t, "the skill's own fixtures", run(t, clientIDSingleOrigin, map[string]string{"skills/google-id-token-validation/x.js": id + "\n", "web/login.js": id + "\n"}, changed("web/login.js")), "")
}
