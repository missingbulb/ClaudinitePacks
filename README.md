# ClaudinitePacks

The sources of Claudinite's global, public packs: each pack lives under `packs/<id>/` with its
rules, skills, checks, tasks and tests, and this repository runs the pack release workflow.
Members do not read this tree directly. A released pack reaches them as a vendored archive (the
pack minus its `test/`, `docs/`, `provenance/` and `checks/*_test.go`), published to the R2 pack
store as `packs/<id>/<version>.tar.gz` and mirrored on the `vendored` branch, as the Engine's design
"Pack serving and publishing" describes. [`packs/README.md`](packs/README.md) describes what a pack holds.

Build the vendored archive of one pack, or of every pack with a table of sizes and SHA-256s:

```
node tools/vendor/vendor.mjs packs/<id> <out dir>
node tools/vendor/vendor.mjs --all packs <out dir>
```

`.github/workflows/release-packs.yml` publishes each new pack version to the `vendored` branch
with a signed pack index and uploads it to R2, and `promote-packs.yml` moves a version from
`canary` to `stable`; `docs/release.md` describes the branch, the index format, the keys and how
to run a release locally. A pack's version, `version` in its `pack.json`, is `<major>.<day>.<n>`
as the Engine's is (`1.61004.1`), raised by the pull request that changes what the pack ships.
Members read a pack's index at
`https://packs.claudinite.com/packs/<id>/index.json`.

Run the Node tests, the release tools' and every pack's, with
`node --test $(git ls-files '*.test.mjs')`, and the packs' Go checks with
`CLAUDINITE_CN=<path to cn> sh tools/checks/test.sh`.

The packs are released under the [MIT License](LICENSE).
