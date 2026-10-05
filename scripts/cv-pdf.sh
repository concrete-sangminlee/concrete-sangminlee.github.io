#!/usr/bin/env bash
# Print every dist/cv/print-<name>.html to dist/cv/<name>.pdf with headless
# Chrome, then remove the print-*.html sources.
set -euo pipefail
cd "$(dirname "$0")/../dist/cv"

CHROME="${CHROME:-}"
if [ -z "$CHROME" ]; then
  for c in google-chrome google-chrome-stable chromium chromium-browser chrome; do
    if command -v "$c" >/dev/null 2>&1; then CHROME="$(command -v "$c")"; break; fi
  done
fi
[ -n "$CHROME" ] || { echo "cv-pdf: Chrome/Chromium not found (set CHROME=/path/to/chrome)" >&2; exit 1; }

shopt -s nullglob
sources=(print-*.html)
[ ${#sources[@]} -gt 0 ] || { echo "cv-pdf: no print-*.html in dist/cv (run npm run build first)" >&2; exit 1; }

for src in "${sources[@]}"; do
  out="${src#print-}"; out="${out%.html}.pdf"
  "$CHROME" --headless=new --no-sandbox --disable-gpu --hide-scrollbars \
    --no-pdf-header-footer --run-all-compositor-stages-before-draw \
    --virtual-time-budget=5000 \
    --print-to-pdf="$PWD/$out" "file://$PWD/$src" 2>/dev/null
  [ -s "$out" ] || { echo "cv-pdf: failed to write $out" >&2; exit 1; }
  echo "cv-pdf: $out ($(wc -c < "$out") bytes)"
  rm -f "$src"
done
