# Lighthouse Report — 2026-04-10

URL: https://concrete-sangminlee.github.io/
Run: `npx lighthouse` (mobile, headless Chrome)
Context: After build optimization (656KB → 128KB dist) and MathJax removal.

## Score Progression

| Category | Initial | After MathJax Removal | Δ |
|----------|---------|------------------------|---|
| Performance | 61 | **78** | +17 |
| Accessibility | 100 | **100** | — |
| Best Practices | 100 | **100** | — |
| SEO | 100 | **100** | — |

## Final Core Web Vitals (after MathJax removal)

| Metric | Before | After | Δ |
|--------|--------|-------|---|
| FCP | 3.5 s | 3.6 s | ~ |
| LCP | 6.5 s | **3.6 s** | -2.9 s |
| TBT | 160 ms | **0 ms** | -160 |
| CLS | 0 | 0 | — |
| Speed Index | 8.1 s | 5.8 s | -2.3 s |
| TTI | 6.6 s | **3.6 s** | -3.0 s |
| Network bytes | 745 KB | **128 KB** | -617 KB |
| Network reqs | 14 | 13 | -1 |

## Initial Scores (before MathJax removal)

| Category | Score |
|----------|-------|
| Performance | 61 |
| Accessibility | 100 |
| Best Practices | 100 |
| SEO | 100 |

## Core Web Vitals

| Metric | Value | Notes |
|--------|-------|-------|
| FCP | 3.5 s | Slow — render-blocking CSS/fonts |
| LCP | 6.5 s | **Critical** — element is `.stat-num` "16" with 5.7s render delay |
| TBT | 160 ms | OK |
| CLS | 0 | Perfect |
| Speed Index | 8.1 s | Slow |
| TTI | 6.6 s | Slow |

## Top Performance Issues

### 1. MathJax loaded but never used (165 KB wasted)
`https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-svg.js` (164,865 bytes)

Site has **no math content** anywhere in `contents/`. MathJax CDN loads on every page view but `MathJax.typeset()` only runs if `$$`/`\[` markers exist (never).

**Fix:** Remove MathJax script tag + inline config from `index.html`. Re-add later if math is needed.

**Impact:** -165 KB network, faster TTI, higher Performance score.

### 2. Render-blocking Google Fonts (1124 ms blocking)
`https://fonts.googleapis.com/css2?family=JetBrains+Mono...&family=Inter...` (1124ms)

The CSS request for Inter + JetBrains Mono blocks rendering for over a second.

**Fix options:**
- Use `<link rel="preload" href="..." as="style" onload="this.rel='stylesheet'">` pattern
- Self-host the WOFF2 files in `static/fonts/`
- Reduce font weights loaded (currently 7 weights total)

### 3. Render-blocking main.css (164 ms)
`/static/css/main.css` (164ms)

Smaller blocker but still measurable.

**Fix:** Inline critical CSS for above-fold (hero, nav, stats) or load main.css async after critical content.

### 4. LCP element is stats-grid counter
The `<span class="stat-num">16</span>` is the LCP element. Stats counter starts at 0 and animates up via JS — Lighthouse waits for the final value to appear (~6.5s).

**Fix options:**
- Pre-render stats values in HTML (no animation delay for first paint)
- Disable counter animation on first paint, animate on intersection only
- Reduce animation duration (currently 1200ms)

### 5. Image dimensions missing
Hero photo `<img>` lacks `width`/`height` attributes — causes minor layout shift risk.

**Fix:** Add `width="200" height="200"` to `<img>` tag.

## What's Already Good

- Accessibility 100 (no issues found)
- Best Practices 100 (HTTPS, no console errors, etc.)
- SEO 100 (meta tags, structured data, canonical URL)
- CLS = 0 (no layout shifts)
- TBT only 160ms (low JS blocking)

## Recommended Follow-up Actions (Priority Order)

1. ~~**[CRITICAL] Remove MathJax**~~ — ✅ DONE (commit `bd5391b`), Performance 61→78
2. **[HIGH] Defer/preload Google Fonts** — still ~1s of FCP blocking remaining
3. **[MEDIUM] Pre-render stats values** — animate-from-zero counter still causes some delay
4. **[LOW] Add image dimensions** — minor CLS prevention
5. **[LOW] Inline critical CSS** — recover ~150ms FCP

## Network Summary

- 14 total requests
- 745 KB total transferred (mostly MathJax CDN)
- After fixes: expected ~80 KB total transferred
