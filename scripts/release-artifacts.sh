#!/usr/bin/env bash
# Build release downloads from a clean, committed source tree.
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ -n "$(git status --porcelain --untracked-files=normal)" ]]; then
    echo 'Commit release changes before building artifacts.' >&2
    exit 1
fi
version=$(python3 -c 'import json; print(json.load(open("extension/metadata.json"))["version-name"])')
if [[ ! "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo 'Invalid release version.' >&2
    exit 1
fi
scripts/dev.sh pack
git archive --format=tar --prefix="lovycairn-$version/" HEAD | gzip -n > "dist/lovycairn-$version.tar.gz"
(cd dist && sha256sum lovycairn@bitfarmy.github.io.shell-extension.zip "lovycairn-$version.tar.gz" > SHA256SUMS)
