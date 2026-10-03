package test

import (
	"testing"

	"claudinitepacks.test/tools/checks/fixture"
)

const jsonwebtoken = "const jwt = require('jsonwebtoken');\n"

func file(path, text string) map[string]string { return map[string]string{path: text} }

// Each case is one of the skills' declared checks on its own subject; a
// sibling check that fires on the same tree is named beside it.
func TestPack(t *testing.T) {
	fixture.Run(t, "jwt", []fixture.Case{
		{Name: "jwt-hardcoded-secret: a literal secret to jsonwebtoken sign",
			Member: file("server/mint.js", jsonwebtoken+"const t = jwt.sign(payload, 'my-secret', { algorithm: 'HS256', expiresIn: '5m' });\n"),
			Expect: []string{"finding jwt-hardcoded-secret server/mint.js:2"}},
		{Name: "jwt-hardcoded-secret: a literal key to PyJWT encode",
			Member: file("api/token.py", "import jwt\n\ntok = jwt.encode({\"exp\": e}, \"hunter2\", algorithm=\"HS256\")\n"),
			Expect: []string{"finding jwt-hardcoded-secret api/token.py:3"}},
		{Name: "jwt-hardcoded-secret: a secret from the environment, an interpolated template, a test file",
			Member: map[string]string{
				"server/a.js":         jsonwebtoken + "const t = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '5m' });\n",
				"server/b.js":         jsonwebtoken + "const t = jwt.sign(payload, `${config.secret}`, { expiresIn: '5m' });\n",
				"server/auth.test.js": jsonwebtoken + "const t = jwt.sign({ sub: 'x' }, 'test-secret', { expiresIn: 1 });\n",
			}},
		{Name: "jwt-sign-sets-expiry: a sign and a PyJWT encode with no expiry",
			Member: map[string]string{
				"server/mint.js": jsonwebtoken + "const t = jwt.sign(payload, key, { algorithm: 'RS256' });\n",
				"api/token.py":   "import jwt\n\ntok = jwt.encode(claims, key, algorithm=\"HS256\")\n",
			},
			Expect: []string{"advisory jwt-sign-sets-expiry server/mint.js:2", "advisory jwt-sign-sets-expiry api/token.py:3"}},
		{Name: "jwt-sign-sets-expiry: expiresIn, an exp claim in the file, a sign with no jsonwebtoken",
			Member: map[string]string{
				"server/mint.js":   jsonwebtoken + "const t = jwt.sign(payload, key, { expiresIn: '5m' });\n",
				"api/token.py":     "import jwt\nimport time\n\nclaims = {\"sub\": sub, \"exp\": int(time.time()) + 300}\ntok = jwt.encode(claims, key)\n",
				"server/crypto.js": "const sig = signer.sign(privateKey, data);\n",
			}},
		{Name: "jwt-none-not-accepted: none in a jsonwebtoken allowlist and in PyJWT's",
			Member: map[string]string{
				"server/verify.js": jsonwebtoken + "jwt.verify(t, secret, { algorithms: ['HS256', 'none'], audience: 'a' });\n",
				"api/auth.py":      "import jwt\n\nclaims = jwt.decode(tok, key, algorithms=[\"none\"])\n",
			},
			Expect: []string{"finding jwt-none-not-accepted server/verify.js:2", "finding jwt-none-not-accepted api/auth.py:3"}},
		{Name: "jwt-none-not-accepted: a pinned algorithm, and a test exercising the hazard",
			Member: map[string]string{
				"server/verify.js":           jsonwebtoken + "jwt.verify(t, secret, { algorithms: ['HS256'], audience: 'a' });\n",
				"tests/reject-none.test.js": jsonwebtoken + "assert.throws(() => jwt.verify(t, s, { algorithms: ['none'] }));\n",
			}},
		{Name: "jwt-verify-pins-algorithms: no allowlist, the callback form too",
			Member: map[string]string{
				"server/a.js": jsonwebtoken + "const decoded = jwt.verify(token, secret, { audience: 'a' });\n",
				"server/b.js": jsonwebtoken + "jwt.verify(token, secret, function (err, decoded) {\n  cb(decoded, 'audience');\n});\n",
			},
			Expect: []string{"finding jwt-verify-pins-algorithms server/a.js:2", "finding jwt-verify-pins-algorithms server/b.js:2"}},
		{Name: "jwt-verify-pins-algorithms: an inline option, options built above, a verify with no jsonwebtoken",
			Member: map[string]string{
				"server/a.js":      jsonwebtoken + "jwt.verify(token, secret, { algorithms: ['RS256'], audience: 'a' });\n",
				"server/b.js":      jsonwebtoken + "const opts = { algorithms: ['HS256'], maxAge: '5m', issuer: 'i' };\njwt.verify(token, secret, opts);\n",
				"server/crypto.js": "const ok = verifier.verify(publicKey, signature);\n",
			}},
		{Name: "jwt-verify-binds-audience: a verify binding no recipient, jose's jwtVerify too",
			Member: map[string]string{
				"server/auth.js":  jsonwebtoken + "jwt.verify(token, secret, { algorithms: ['RS256'] });\n",
				"server/auth.mjs": "import { jwtVerify } from 'jose';\nconst { payload } = await jwtVerify(token, key);\n",
			},
			Expect: []string{"advisory jwt-verify-binds-audience server/auth.js:2", "advisory jwt-verify-binds-audience server/auth.mjs:2"}},
		{Name: "jwt-verify-binds-audience: an audience or issuer bound, inline or built above",
			Member: map[string]string{
				"server/a.js":    jsonwebtoken + "jwt.verify(token, secret, { algorithms: ['RS256'], audience: 'api://orders' });\n",
				"server/b.mjs":   "import { jwtVerify } from 'jose';\nawait jwtVerify(token, key, { issuer: 'https://issuer.example', audience: 'api://orders' });\n",
				"server/auth.js": jsonwebtoken + "const opts = { audience: AUD, issuer: ISS, algorithms: ['RS256'] };\njwt.verify(token, secret, opts);\n",
			}},
	})
}
