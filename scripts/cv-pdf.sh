#!/usr/bin/env bash
# Print dist/cv/print-{en,ko}.html to PDF with headless Chrome, then remove them.
set -euo pipefail
cd "$(dirname "$0")/../dist/cv"

CHROME="${CHROME:-}"
if [ -z "$CHROME" ]; then
  for c in google-chrome google-chrome-stable chromium chromium-browser chrome; do
    if command -v "$c" >/dev/null 2>&1; then CHROME="$(command -v "$c")"; break; fi
  done
fi
[ -n "$CHROME" ] || { echo "cv-pdf: Chrome/Chromium not found (set CHROME=/path/to/chrome)" >&2; exit 1; }

render() {
  local src="$1" out="$2"
  "$CHROME" --headless=new --no-sandbox --disable-gpu --hide-scrollbars \
    --no-pdf-header-footer --run-all-compositor-stages-before-draw \
    --virtual-time-budget=5000 \
    --print-to-pdf="$PWD/$out" "file://$PWD/$src" 2>/dev/null
  [ -s "$out" ] || { echo "cv-pdf: failed to write $out" >&2; exit 1; }
  echo "cv-pdf: $out ($(wc -c < "$out") bytes)"
}

render print-en.html Sang-Min-Lee-CV.pdf
render print-ko.html Sang-Min-Lee-CV-ko.pdf
rm -f print-en.html print-ko.html
