#!/usr/bin/env bash
# Downloads the bundled game data, verifies it, and writes gzip copies plus licence texts into
# public/ (research R-3). Raw Freedoom WADs exceed the bundle's 25 MiB per-file limit, so the
# bundle carries .wad.gz files that the shell decompresses with DecompressionStream.
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CACHE_DIR="$APP_DIR/engine/.build/data"
WADS_DIR="$APP_DIR/public/wads"
LICENSES_DIR="$APP_DIR/public/licenses"

FREEDOOM_URL="https://github.com/freedoom/freedoom/releases/download/v0.13.0/freedoom-0.13.0.zip"
FREEDOOM_ZIP_SHA256="3f9b264f3e3ce503b4fb7f6bdcb1f419d93c7b546f4df3e874dd878db9688f59"
# DOOM v1.9 shareware release; only DOOM1.WAD and id's README.TXT are taken from it.
SHAREWARE_URL="https://archive.org/download/DoomsharewareEpisode/doom.ZIP"
SHAREWARE_ZIP_SHA256="5560b3cf160b5729e2651a0c576e7898cb34ccbf46fc08a5cafc70e7e0736c60"
DOOM1_WAD_SHA1="5b2e249b9c5133ec987b3ea77596381dc0d6bc1d"

download() {
  local url="$1" target="$2" sha256="$3"
  if [[ ! -f "$target" ]] || ! echo "$sha256  $target" | sha256sum --check --status; then
    # archive.org answers with a 5xx now and then; curl retries those.
    curl --fail --location --silent --show-error --retry 5 --retry-delay 5 --retry-connrefused \
      --output "$target.part" "$url" || { echo "download failed: $url" >&2; exit 1; }
    echo "$sha256  $target.part" | sha256sum --check --quiet
    mv "$target.part" "$target"
  fi
}

# Extracts one archive member into the cache, without running anything from the archive.
extract() {
  local zip="$1" member="$2" target="$3"
  unzip -p "$zip" "$member" > "$target.part"
  mv "$target.part" "$target"
}

compress() {
  local source="$1" target="$2"
  if [[ ! -f "$target" || "$source" -nt "$target" ]]; then
    gzip -9 -n -c "$source" > "$target.part"
    mv "$target.part" "$target"
  fi
}

mkdir -p "$CACHE_DIR" "$WADS_DIR" "$LICENSES_DIR"

download "$FREEDOOM_URL" "$CACHE_DIR/freedoom.zip" "$FREEDOOM_ZIP_SHA256"
download "$SHAREWARE_URL" "$CACHE_DIR/shareware.zip" "$SHAREWARE_ZIP_SHA256"

if [[ ! -f "$CACHE_DIR/freedoom1.wad" || "$CACHE_DIR/freedoom.zip" -nt "$CACHE_DIR/freedoom1.wad" ]]; then
  extract "$CACHE_DIR/freedoom.zip" freedoom-0.13.0/freedoom1.wad "$CACHE_DIR/freedoom1.wad"
  extract "$CACHE_DIR/freedoom.zip" freedoom-0.13.0/freedoom2.wad "$CACHE_DIR/freedoom2.wad"
  extract "$CACHE_DIR/freedoom.zip" freedoom-0.13.0/COPYING.txt "$CACHE_DIR/freedoom-COPYING.txt"
  extract "$CACHE_DIR/shareware.zip" DOOM1.WAD "$CACHE_DIR/doom1.wad"
  extract "$CACHE_DIR/shareware.zip" README.TXT "$CACHE_DIR/doom1-README.TXT"
fi
echo "$DOOM1_WAD_SHA1  $CACHE_DIR/doom1.wad" | sha1sum --check --quiet

for wad in freedoom1 freedoom2 doom1; do
  compress "$CACHE_DIR/$wad.wad" "$WADS_DIR/$wad.wad.gz"
done

cp "$CACHE_DIR/freedoom-COPYING.txt" "$LICENSES_DIR/freedoom-COPYING.txt"
cp "$CACHE_DIR/doom1-README.TXT" "$LICENSES_DIR/doom-shareware-README.txt"
cp "$APP_DIR/engine/licenses/doom-shareware-NOTICE.txt" "$LICENSES_DIR/doom-shareware-NOTICE.txt"
cp "$APP_DIR/engine/licenses/anton-OFL.txt" "$LICENSES_DIR/anton-OFL.txt"
cp "$APP_DIR/LICENSE" "$LICENSES_DIR/haex-doom-LICENSE.txt"

# The fingerprints in app/lib/bundledGames.ts must match these.
(cd "$CACHE_DIR" && sha256sum freedoom1.wad freedoom2.wad doom1.wad)
