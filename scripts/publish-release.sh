#!/usr/bin/env bash
# Reconcile release uploads after transient errors, then verify downloaded bytes.
set -euo pipefail
cd "$(dirname "$0")/.."
tag=${1:?Usage: scripts/publish-release.sh vX.Y.Z}
version=$(python3 -c 'import json; print(json.load(open("extension/metadata.json"))["version-name"])')
[[ "$tag" == "v$version" ]] || { echo 'Tag does not match metadata' >&2; exit 1; }
verify_dir=$(mktemp -d)
trap 'rm -rf "$verify_dir"' EXIT
if ! gh release view "$tag" >/dev/null 2>&1; then
    # Creation can return an error after the server has created the draft.
    gh release create "$tag" --verify-tag --draft --title "LovyCairn $version" --generate-notes || gh release view "$tag" >/dev/null
fi
for asset in dist/*.zip "dist/lovycairn-$version.tar.gz" dist/SHA256SUMS; do
    name=$(basename "$asset")
    verified=false
    for attempt in 1 2 3; do
        rm -f "$verify_dir/$name"
        if gh release download "$tag" --pattern "$name" --dir "$verify_dir" && cmp -s "$asset" "$verify_dir/$name"; then
            verified=true
            break
        fi
        gh release upload "$tag" "$asset" --clobber || echo "Upload returned an error; checking server state ($name, attempt $attempt)." >&2
        rm -f "$verify_dir/$name"
        if gh release download "$tag" --pattern "$name" --dir "$verify_dir" && cmp -s "$asset" "$verify_dir/$name"; then
            verified=true
            break
        fi
        sleep 2
    done
    "$verified" || { echo "Release asset verification failed: $name" >&2; exit 1; }
    echo "Verified release asset: $name"
done
(cd "$verify_dir" && sha256sum --check SHA256SUMS)
gh release edit "$tag" --draft=false || echo 'Publish returned an error; checking server state.' >&2
[[ "$(gh release view "$tag" --json isDraft --jq .isDraft)" == false ]]
echo "Release $tag published and verified."
