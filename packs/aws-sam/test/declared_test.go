package test

import (
	"strings"
	"testing"

	"claudinitepacks.test/tools/checks/fixture"
)

func policy(headers ...string) string {
	return "Resources:\n  Pol:\n    Type: AWS::CloudFront::OriginRequestPolicy\n    Properties:\n      OriginRequestPolicyConfig:\n        HeadersConfig:\n          HeaderBehavior: whitelist\n          Headers:\n            - " + strings.Join(headers, "\n            - ") + "\n"
}

const esbuildTemplate = "Resources:\n  Fn:\n    Metadata:\n      BuildMethod: esbuild\n"

func TestDeclared(t *testing.T) {
	fixture.Run(t, "aws-sam", []fixture.Case{
		{Name: "cloudfront-authorization flags a policy forwarding Authorization", Member: map[string]string{"template.yaml": policy("Authorization", "Origin")},
			Expect: []string{"finding aws-sam/cloudfront-authorization template.yaml"}},
		{Name: "cloudfront-authorization: a policy without it", Member: map[string]string{"template.yaml": policy("Origin", "Host")}},
		{Name: "cloudfront-authorization: Authorization named by an authorizer", Member: map[string]string{"template.yaml": policy("Origin") +
			"  Api:\n    Type: AWS::Serverless::Api\n    Properties:\n      Auth:\n        Authorizers:\n          JwtAuth:\n            IdentitySource: Authorization\n"}},

		{Name: "esbuild-dependency flags a devDependency under a SAM esbuild build", Member: map[string]string{"template.yaml": esbuildTemplate, "package.json": `{"devDependencies":{"esbuild":"^0.20"}}`},
			Expect: []string{"finding aws-sam/esbuild-dependency package.json"}},
		{Name: "esbuild-dependency: a regular dependency", Member: map[string]string{"template.yaml": esbuildTemplate, "package.json": `{"dependencies":{"esbuild":"^0.20"}}`}},
		{Name: "esbuild-dependency: no SAM template", Member: map[string]string{"package.json": `{"devDependencies":{"esbuild":"^0.20"}}`}},
		{Name: "esbuild-dependency: a multi-package repo", Member: map[string]string{"template.yaml": esbuildTemplate, "package.json": `{"devDependencies":{"esbuild":"^0.20"}}`, "fn/package.json": `{"dependencies":{"esbuild":"^0.20"}}`}},
	})
}
