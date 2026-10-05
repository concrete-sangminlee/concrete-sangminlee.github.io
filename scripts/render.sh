#!/usr/bin/env bash
# Post-build rendering with headless Chrome:
#   dist/render/pdf/<name>.html  ->  dist/cv/<name>.pdf          (CVs)
#   dist/render/png/<name>.html  ->  dist/static/og/<name>.png   (1200x630 social cards)
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
mkdir -p "$DIST/cv" "$DIST/static/og"
n=0
for src in "$DIST"/render/pdf/*.html; do
  out="$DIST/cv/$(basename "${src%.html}").pdf"
  "$CHROME" "${FLAGS[@]}" --no-pdf-header-footer --print-to-pdf="$out" "file://$src" 2>/dev/null
  [ -s "$out" ] || { echo "render: failed to write $out" >&2; exit 1; }
  echo "render: ${out#$DIST/} ($(wc -c < "$out") bytes)"; n=$((n + 1))
done
for src in "$DIST"/render/png/*.html; do
  out="$DIST/static/og/$(basename "${src%.html}").png"
  "$CHROME" "${FLAGS[@]}" --window-size=1200,630 --screenshot="$out" "file://$src" 2>/dev/null
  [ -s "$out" ] || { echo "render: failed to write $out" >&2; exit 1; }
  echo "render: ${out#$DIST/} ($(wc -c < "$out") bytes)"; n=$((n + 1))
done
[ "$n" -gt 0 ] || { echo "render: nothing to render" >&2; exit 1; }
rm -rf "$DIST/render"
