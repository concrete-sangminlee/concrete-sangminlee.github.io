# Performance Optimization — Build Pipeline

## Context

The portfolio site (concrete-sangminlee.github.io) has no asset optimization in its build pipeline. The dist/ output is 656 KB, with 474 KB coming from an orphaned image (`leonard_round.png`). CSS, JS, and HTML are unminified. No WebP images are generated. This spec adds optimization to `build.js` to reduce dist size by ~77%.

## Tools

| Package | Purpose |
|---------|---------|
| `sharp` | Image WebP conversion + PNG re-compression |
| `esbuild` | CSS and JS minification (single tool, ~10ms) |
| `html-minifier-terser` | HTML minification (handles inline CSS/JS) |

## Changes

### 1. Remove orphaned `leonard_round.png` from dist

Add to `toRemove` list in build.js. Source file stays untouched.

### 2. Image optimization

- `photo.jfif` (10 KB): generate `photo.webp` (quality 80, ~5 KB) alongside original
- `favicon-32.png` (3.1 KB): re-compress with `sharp` PNG optimizer (compressionLevel 9)
- Update `<img>` tag in HTML to `<picture>` with WebP source + JFIF fallback
- Keep OG/JSON-LD image references as JFIF (social crawlers don't support WebP)

### 3. CSS minification

```js
const result = await esbuild.transform(css, { loader: 'css', minify: true });
```

`main.css`: 42 KB -> ~30 KB

### 4. JS minification

```js
const result = await esbuild.transform(js, { loader: 'js', minify: true, target: 'es2020' });
```

`scripts.js`: 29 KB -> ~14 KB

### 5. HTML minification

```js
output = await minifyHTML(output, {
    collapseWhitespace: true,
    removeComments: true,
    removeRedundantAttributes: true,
    removeEmptyAttributes: true,
    minifyCSS: true,
    minifyJS: true,
    collapseBooleanAttributes: true,
    removeScriptTypeAttributes: true,
    removeStyleLinkTypeAttributes: true,
});
```

`index.html`: 36 KB -> ~25 KB

### 6. Make build.js async

Use top-level `await` (ESM supports it). Run CSS and JS minification in parallel with `Promise.all`.

## Build order

```
1. Read config/markdown, generate HTML (existing)
2. Inject <picture> tag for WebP
3. Minify HTML with html-minifier-terser
4. Write index.html to dist/
5. Copy static/ to dist/static/
6. Optimize images with sharp (WebP + PNG re-compress)
7. Minify CSS + JS in parallel with esbuild
8. Remove unused files (existing + leonard_round.png)
9. Copy root files (existing)
```

## Expected results

| File | Before | After |
|------|--------|-------|
| leonard_round.png | 474 KB | removed |
| index.html | 36 KB | ~25 KB |
| main.css | 42 KB | ~30 KB |
| scripts.js | 29 KB | ~14 KB |
| photo.webp (new) | — | ~5 KB |
| **Total dist** | **~656 KB** | **~150 KB (~77% reduction)** |

## Files to modify

- `build.js` — add imports, async flow, optimization functions
- `package.json` — add sharp, esbuild, html-minifier-terser to devDependencies
- `index.html` — no direct edit needed (build.js handles `<picture>` injection)

## Verification

1. Run `npm run build` locally
2. Check dist/ file sizes match expectations
3. Open `dist/index.html` in browser — verify images load, layout intact, MathJax works
4. Verify `<picture>` tag renders WebP in Chrome, fallback in Safari
5. Push and confirm GitHub Actions deploy succeeds
