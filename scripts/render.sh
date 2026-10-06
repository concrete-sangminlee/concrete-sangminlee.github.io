#!/usr/bin/env bash
# Post-build rendering with headless Chrome:
#   dist/render/pdf/<name>.html  ->  dist/cv/<name>.pdf          (CVs)
#   dist/render/png/<dir>/<name>[@WxH].html  ->  dist/static/<dir>/<name>.png
#     (social cards in og/ at the default 1200x630, app icons in assets/)
# then removes dist/render/.
set -euo pipefail
DIST="$(cd "$(dirname "$0")/.." && pwd)/dist"
[ -d "$DIST/render" ] || { echo "render: $DIST/render not found (run npm run build first)" >&2; exit 1; }

CHROME="${CHROME:-}"
if [ -z "$CHROME" ]; then
  for c in google-chrome google-chrome-stable chromium chromium-browser chrome; do
    if command -v "$c" >/dev/null 2>&1; then CHROME="$(command -v "$c")"; break; fi
  done
fi
[ -n "$CHROME" ] || { echo "render: Chrome/Chromium not found (set CHROME=/path/to/chrome)" >&2; exit 1; }
FLAGS=(--headless=new --no-sandbox --disable-gpu --hide-scrollbars --run-all-compositor-stages-before-draw --virtual-time-budget=5000)

shopt -s nullglob
mkdir -p "$DIST/cv"
n=0
for src in "$DIST"/render/pdf/*.html; do
  out="$DIST/cv/$(basename "${src%.html}").pdf"
  "$CHROME" "${FLAGS[@]}" --no-pdf-header-footer --print-to-pdf="$out" "file://$src" 2>/dev/null
  [ -s "$out" ] || { echo "render: failed to write $out" >&2; exit 1; }
  echo "render: ${out#$DIST/} ($(wc -c < "$out") bytes)"; n=$((n + 1))
done
for src in "$DIST"/render/png/*/*.html; do
  name="$(basename "${src%.html}")"
  size="1200x630"
  if [[ "$name" == *@*x* ]]; then size="${name##*@}"; name="${name%@*}"; fi
  dir="$DIST/static/$(basename "$(dirname "$src")")"
  mkdir -p "$dir"
  out="$dir/$name.png"
  "$CHROME" "${FLAGS[@]}" --window-size="${size/x/,}" --screenshot="$out" "file://$src" 2>/dev/null
  [ -s "$out" ] || { echo "render: failed to write $out" >&2; exit 1; }
  echo "render: ${out#$DIST/} ($(wc -c < "$out") bytes)"; n=$((n + 1))
done
[ "$n" -gt 0 ] || { echo "render: nothing to render" >&2; exit 1; }
rm -rf "$DIST/render"
