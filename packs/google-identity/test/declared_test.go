package test

import (
	"testing"

	"claudinitepacks.test/tools/checks/fixture"
)

const issuer = "https://accounts.google.com"

func TestTokenAudiencePinned(t *testing.T) {
	fixture.Run(t, "google-identity", []fixture.Case{
		{Name: "an issuer with a pinned audience", Member: map[string]string{"server/template.yaml": "Auth:\n  Authorizers:\n    GoogleAuth:\n      JwtConfiguration:\n        Issuer: " + issuer + "\n        Audience:\n          - 123-abc.apps.googleusercontent.com\n"}},
		{Name: "an issuer with no audience", Member: map[string]string{"server/template.yaml": "Auth:\n  Authorizers:\n    GoogleAuth:\n      JwtConfiguration:\n        Issuer: " + issuer + "\n"},
			Expect: []string{"finding google-token-audience-pinned server/template.yaml:5"}},
		{Name: "an empty audience list", Member: map[string]string{"infra/gateway.tf": "resource \"aws_apigatewayv2_authorizer\" \"g\" {\n  jwt_configuration {\n    audience = []\n    issuer   = \"" + issuer + "\"\n  }\n}\n"},
			Expect: []string{"finding google-token-audience-pinned infra/gateway.tf:4"}},
		{Name: "a client-side OAuth URL", Member: map[string]string{"client/config.json": "{ \"authUrl\": \"" + issuer + "/o/oauth2/v2/auth\" }\n"}},
		{Name: "a code file", Member: map[string]string{"server/verify.mjs": "await jwtVerify(token, jwks, { issuer: '" + issuer + "' });\n"}},
	})
}

var marker = map[string]string{"server/template.yaml": "Issuer: " + issuer + "\nAudience: [x]\n"}

func withMarker(path, text string) map[string]string {
	return map[string]string{"server/template.yaml": marker["server/template.yaml"], path: text}
}

func TestTokenEmailVerified(t *testing.T) {
	fixture.Run(t, "google-identity", []fixture.Case{
		{Name: "email_verified gated as a string", Member: withMarker("server/handler.mjs", "const claims = event.requestContext.authorizer.jwt.claims;\nif (claims.email_verified !== 'true') return deny();\npost(claims.email);\n")},
		{Name: "the email claim read with no email_verified check", Member: withMarker("server/handler.mjs", "const claims = event.requestContext.authorizer.jwt.claims;\npost(claims.email);\n"),
			Expect: []string{"finding google-token-email-verified server/handler.mjs:2"}},
		{Name: "a strict boolean compare behind an API Gateway authorizer", Member: withMarker("server/handler.mjs", "const claims = event.requestContext.authorizer.jwt.claims;\nif (claims.email_verified === true) post(claims.email);\n"),
			Expect: []string{"finding google-token-email-verified server/handler.mjs:2"}},
		{Name: "no Google-identity marker", Member: map[string]string{"server/handler.mjs": "const claims = event.requestContext.authorizer.jwt.claims;\npost(claims.email);\n"}},
		{Name: "a test file", Member: withMarker("server/handler.test.mjs", "const claims = event.requestContext.authorizer.jwt.claims;\npost(claims.email);\n")},
	})
}
