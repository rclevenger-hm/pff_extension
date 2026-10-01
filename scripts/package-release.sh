#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

manifest_version="$(node -p "JSON.parse(require('fs').readFileSync('manifest.json','utf8')).version")"
if [[ -z "$manifest_version" ]]; then
  echo "manifest version is missing" >&2
  exit 1
fi

dist="$root/dist"
rm -rf "$dist"
mkdir -p "$dist"

archive="$dist/pff-search-extension-${manifest_version}.zip"
zip -X -j "$archive" manifest.json background.js icon16.png icon48.png icon128.png >/dev/null
sha256sum "$archive" > "$archive.sha256"

unzip -t "$archive" >/dev/null
printf 'Built %s\n' "$archive"
cat "$archive.sha256"
