# packs/

Each `packs/<id>/` is one pack. Members receive a released version of it as a vendored archive;
the root [README](../README.md) says how a version is built and published. The catalog a member
session reads when choosing packs is [`directory.GENERATED.md`](directory.GENERATED.md), rendered
from the manifests by `node tools/directory/render.mjs`.

## What a pack holds

The Engine's design (ClaudiniteEngine `docs/design.md`, "Packs") defines the contract. In short:

| Content | Files |
|---|---|
| Manifest | `pack.json` (or `.yaml`/`.toml`): `version`, `minEngineVersion`, `requires`, `ruleRoutingGuidance` and the rest of what the engine validates |
| Rules | `RULES.md`, injected into a session where the pack is declared |
| Skills | `skills/<name>/SKILL.md` |
| Declared checks | `declared-checks.json`, run natively by `cn` |
| Coded checks | `checks/*.go`, against the public Go check SDK only |
| Tasks | `tasks/<name>/task.json`, with an optional `worker.mjs` that imports only `@claudinite/sdk` |
| Provenance | `provenance/`: why each rule, check, skill and task is what it is |
| Tests | `test/`: Go fixture tests for the checks, `node --test` tests for the scripts |

`test/`, `docs/`, `provenance/` and `checks/*_test.go` are left out of the vendored archive.

A pack is active in a member only where `.claudinite/settings.*` declares it; `cn init` and
`cn adopt` also write each declared pack's `requires`.

## Running the tests

```
node --test $(git ls-files '*.test.mjs')
CLAUDINITE_CN=<path to cn> sh tools/checks/test.sh
```

The second runs every pack's Go checks and fixture tests against the check SDK of that `cn`.

## The packs

- [android](android/README.md)
- [aws-sam](aws-sam/README.md)
- [basics](basics/README.md)
- [chrome-extension](chrome-extension/README.md)
- [claude-code-web-users-support](claude-code-web-users-support/README.md)
- [claudinite-canon-curation](claudinite-canon-curation/README.md) (hidden from the catalog)
- [claudinite-dashboard](claudinite-dashboard/README.md)
- [claudinite-fleet-sheepdog](claudinite-fleet-sheepdog/README.md)
- [claudinite-growth](claudinite-growth/README.md)
- [claudinite-lifecycle](claudinite-lifecycle/README.md)
- [claudinite-tasks](claudinite-tasks/README.md)
- [cloudflare-site](cloudflare-site/README.md)
- [cloudflare-workers](cloudflare-workers/README.md)
- [executable-requirements](executable-requirements/README.md)
- [firebase](firebase/README.md)
- [flutter](flutter/README.md)
- [git-github](git-github/README.md)
- [github-pages](github-pages/README.md)
- [google-identity](google-identity/README.md)
- [headless-browser](headless-browser/README.md)
- [host-page](host-page/README.md)
- [html](html/README.md)
- [ios](ios/README.md)
- [jwt](jwt/README.md)
- [leaflet](leaflet/README.md)
- [macos](macos/README.md)
- [node](node/README.md)
- [numpy-image-processing](numpy-image-processing/README.md)
- [product-wiki](product-wiki/README.md)
- [public-website](public-website/README.md)
- [python](python/README.md)
- [research-project](research-project/README.md)
- [spec-driven-product](spec-driven-product/README.md)
- [task-flow](task-flow/README.md)
- [web-scraping](web-scraping/README.md)
- [web-speech](web-speech/README.md)
