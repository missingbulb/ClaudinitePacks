#!/bin/sh
# Vets and tests every pack's Go checks against the check SDK of the cn
# named by CLAUDINITE_CN, and runs every pack's test/ cases through that
# cn: `cn check sdk --out` writes the SDK and the go.mod stanza that
# replaces it, and a go.mod generated for this run only makes the packs
# one test module. Offline: the SDK is standard library only. Prints `ok`
# per package and exits non-zero on any failure.
set -eu

: "${CLAUDINITE_CN:?set CLAUDINITE_CN to a cn binary}"
CLAUDINITE_CN=$(cd "$(dirname "$CLAUDINITE_CN")" && pwd)/$(basename "$CLAUDINITE_CN")
export CLAUDINITE_CN
root=$(cd "$(dirname "$0")/../.." && pwd)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"; rm -f "$root/go.mod" "$root/go.sum"' EXIT INT TERM
# Every temporary directory the run makes, the fixture cache included, lands
# under $tmp and goes with it.
mkdir "$tmp/run"
export TMPDIR="$tmp/run"

if [ -e "$root/go.mod" ]; then
  echo "test.sh: $root/go.mod exists; this script writes its own and removes it" >&2
  exit 2
fi
"$CLAUDINITE_CN" check sdk --out "$tmp/sdk" >/dev/null
{
  printf 'module claudinitepacks.test\n\ngo 1.24\n\n'
  cat "$tmp/sdk/go.mod.stanza"
} >"$root/go.mod"

pkgs=$(cd "$root" && for d in packs/*/checks packs/*/test tools/checks/fixture; do ls "$d"/*.go >/dev/null 2>&1 && printf './%s ' "$d"; done)
if [ -z "$pkgs" ]; then
  echo "test.sh: no packs/*/checks to test" >&2
  exit 1
fi
cd "$root"
# shellcheck disable=SC2086 # one word per package directory, none with spaces
GOFLAGS=-mod=mod GOPROXY=off go vet $pkgs
# shellcheck disable=SC2086 # as above
GOFLAGS=-mod=mod GOPROXY=off go test $pkgs
