# Development keys

Development keys, trusted by no member. A stable Engine build refuses to embed the development
roots (`go test -tags stable ./license` in ClaudiniteEngine), so nothing signed here is accepted
outside a development build.

- `roots/root.pub`, `roots/standby.pub`: copies of the Engine's `license/roots/` development root
  (key id `4e445e16c1bb8d61`) and standby (`0d8e65ad8093ff2e`). The release program's self-check
  verifies against them.
- `packs.key`, `packs.pub`: the development pack-index signing key (key id `cd85241db41ab963`).
  This repository is public, so this private key is public; that is acceptable only because
  nothing trusts its root. The real key never enters this tree.
- `packs.cert.json`: its `packs`-use certificate, issued by the Engine's development root for 90
  days, until 2026-12-30T14:12:48Z.

Until ClaudiniteEngine#5 lands, renew the certificate before it expires (`dev-key-expiry.yml`
goes red 14 days ahead), from an Engine checkout, and commit the new file:

```
rm <packs repo>/keys/dev/packs.cert.json
go run ./cmd/cn-keys certify --root keys/dev/root.key --subject <packs repo>/keys/dev/packs.pub --use packs --days 90 --out <packs repo>/keys/dev/packs.cert.json
go run ./cmd/cn-keys verify --roots license/roots <packs repo>/keys/dev/packs.cert.json
```

This folder, the release program's fallback to it and `dev-key-expiry.yml` are removed in the
change that puts `CN_PACKS_KEY` and `CN_PACKS_CERT` into the `release` environment.
