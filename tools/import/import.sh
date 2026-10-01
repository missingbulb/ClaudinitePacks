#!/usr/bin/env bash
# Builds the `import` branch: Claudinite's packs/ and its pack-content ancestors (paths.txt),
# full history, from a fresh clone of Claudinite. Same source commit in, same tip SHA out.
#
#   tools/import/import.sh <source-commit> <workdir> [--push]
#
# <workdir>/src is the source clone (made here when absent), <workdir>/out the filtered repo with
# branch `import`. --push force-pushes `import` to ClaudinitePacks with a lease on the value it
# read just before. IMPORT_SOURCE_URL and IMPORT_PUSH_URL override the two repositories.
set -euo pipefail

SOURCE_URL="${IMPORT_SOURCE_URL:-https://github.com/missingbulb/Claudinite}"
PUSH_URL="${IMPORT_PUSH_URL:-https://github.com/missingbulb/ClaudinitePacks}"
PATHS_FILE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/paths.txt"

die() { echo "import.sh: $*" >&2; exit 1; }

push=0
args=()
for a in "$@"; do
  case "$a" in
    --push) push=1 ;;
    -*) die "unknown option $a" ;;
    *) args+=("$a") ;;
  esac
done
[ "${#args[@]}" -eq 2 ] || die "usage: import.sh <source-commit> <workdir> [--push]"
commit_arg="${args[0]}"
mkdir -p "${args[1]}"
workdir="$(cd "${args[1]}" && pwd)"
src="$workdir/src"
out="$workdir/out"

command -v git-filter-repo >/dev/null || die "git-filter-repo is not installed (pip install git-filter-repo==2.47.0)"

if [ ! -e "$src" ]; then
  git clone -q --no-local "$SOURCE_URL" "$src"
  git -C "$src" fetch -q --depth=6000 origin main
fi

strip() { local u="${1%/}"; echo "${u%.git}"; }
[ "$(strip "$(git -C "$src" remote get-url origin 2>/dev/null || true)")" = "$(strip "$SOURCE_URL")" ] \
  || die "$src is not a fresh clone of $SOURCE_URL (origin differs)"
[ -z "$(git -C "$src" status --porcelain --untracked-files=all)" ] \
  || die "$src is not a fresh clone: its working tree has changes"
[ -z "$(git -C "$src" stash list)" ] || die "$src is not a fresh clone: it has stashes"
while read -r ref; do
  git -C "$src" merge-base --is-ancestor "$ref" refs/remotes/origin/main \
    || die "$src is not a fresh clone: $ref carries commits origin/main does not"
done < <(git -C "$src" for-each-ref --format='%(refname)' refs/heads/)
[ "$(git -C "$src" rev-parse --is-shallow-repository)" = "false" ] \
  || die "$src is shallow; a shallow source silently truncates history (fetch --depth=6000 origin main)"

commit="$(git -C "$src" rev-parse --verify -q "$commit_arg^{commit}")" \
  || die "$commit_arg is not a commit in $src, so not reachable from origin/main"
git -C "$src" merge-base --is-ancestor "$commit" refs/remotes/origin/main \
  || die "$commit is not reachable from origin/main of $SOURCE_URL"

rm -rf "$workdir/stage" "$out"
git init -q --bare "$workdir/stage"
git -C "$workdir/stage" fetch -q --no-tags "$src" "$commit:refs/heads/import"
git clone -q --no-local --no-tags --branch import "$workdir/stage" "$out"
rm -rf "$workdir/stage"

# Hashes cited in messages stay as Claudinite wrote them: historical records are not rewritten.
(cd "$out" && git filter-repo --quiet --preserve-commit-hashes --preserve-commit-encoding \
  --paths-from-file "$PATHS_FILE") >/dev/null

tip="$(git -C "$out" rev-parse refs/heads/import)"
outside="$(git -C "$out" ls-tree --name-only "$tip" | grep -vx packs || true)"
[ -z "$outside" ] || die "the tip holds paths outside packs/: $outside"

echo "source commit: $commit"
echo "import tip: $tip"

if [ "$push" -eq 1 ]; then
  lease="$(git ls-remote "$PUSH_URL" refs/heads/import | cut -f1)"
  git -C "$out" push -q --force-with-lease="refs/heads/import:$lease" "$PUSH_URL" "refs/heads/import:refs/heads/import"
  echo "pushed import to $PUSH_URL"
fi
