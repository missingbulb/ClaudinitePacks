# ClaudinitePacks

The sources of Claudinite's global, public packs: each pack lives under `packs/<id>/` with its
rules, skills, checks, tasks and tests, and this repository runs the pack release workflow.
Members do not read this tree directly. A released pack reaches them as a vendored archive (the
pack minus its `test/`, `docs/` and `provenance/`), published to the R2 pack store as
`packs/<id>/<version>.tar.gz` and mirrored on the `vendored` branch, as Claudinite's design
"Pack serving and publishing" describes. Until Claudinite's own `packs/` is frozen, `packs/` here
is a verified import of it (`docs/import.md`).

Check that `packs/` matches Claudinite at the recorded source commit, after running
`tools/import/import.sh` as `docs/import.md` shows:

```
node tools/import/verify.mjs --source "$SRC/src" --commit <source commit> --import . --ref HEAD --landed
```

Build the vendored archive of one pack, or of every pack with a table of sizes and SHA-256s:

```
node tools/vendor/vendor.mjs packs/<id> <out dir>
node tools/vendor/vendor.mjs --all packs <out dir>
```

`.github/workflows/release-packs.yml` publishes each new pack version to the `vendored` branch
with a signed pack index; `docs/release.md` describes the branch, the index format, the keys and
how to run a release locally.

Run the tools' tests with `node --test $(git ls-files 'tools/*.test.mjs')`.
