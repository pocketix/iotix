#!/usr/bin/env bash
# Builds iotix-<tag>-full.zip: the umbrella repository at a tag together with
# the contents of every submodule, which GitHub's own source zip leaves empty.
#
# Usage: scripts/build-full-zip.sh [tag] [repository] [output directory]
#   tag         defaults to v<version> from CITATION.cff
#   repository  defaults to https://github.com/pocketix/iotix.git
#   output      defaults to the current directory
#
# The zip is made from a fresh clone of the published repository, with
# `git archive` for every repository, so it holds exactly the committed files
# (no .git, no node_modules, no build output) under a top-level iotix/ folder.

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
citation="$script_dir/../CITATION.cff"

tag="${1:-}"
if [[ -z "$tag" ]]; then
    version="$(sed -n 's/^version: *//p' "$citation" 2>/dev/null | tr -d '"' || true)"
    [[ -n "$version" ]] || { echo "No tag given and no version in $citation" >&2; exit 1; }
    tag="v$version"
fi
repository="${2:-https://github.com/pocketix/iotix.git}"
output_dir="$(mkdir -p "${3:-.}" && cd "${3:-.}" && pwd)"
zip_path="$output_dir/iotix-$tag-full.zip"

for tool in git zip sha256sum; do
    command -v "$tool" >/dev/null || { echo "Missing required tool: $tool" >&2; exit 1; }
done

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

echo "Cloning $repository at $tag"
git -c advice.detachedHead=false clone --quiet --branch "$tag" --recurse-submodules \
    "$repository" "$work/clone"

staging="$work/staging/iotix"
mkdir -p "$staging"

git -C "$work/clone" archive HEAD | tar -x -C "$staging"

# One archive per submodule, nested ones included, each at its own path.
git -C "$work/clone" submodule --quiet foreach --recursive \
    'echo "$displaypath $(git rev-parse HEAD)"' | while read -r path commit; do
    echo "  $path @ ${commit:0:7}"
    mkdir -p "$staging/$path"
    git -C "$work/clone/$path" archive HEAD | tar -x -C "$staging/$path"
done

# A submodule folder left empty means its contents are missing from the zip.
while read -r path _; do
    if [[ -z "$(ls -A "$staging/$path")" ]]; then
        echo "Submodule $path is empty in the staging folder" >&2
        exit 1
    fi
done < <(git -C "$work/clone" submodule --quiet foreach --recursive 'echo "$displaypath"')

rm -f "$zip_path"
(cd "$work/staging" && zip -q -r -X "$zip_path" iotix)

files="$(find "$staging" -type f | wc -l | tr -d ' ')"
echo "Wrote $zip_path ($files files)"
sha256sum "$zip_path"
