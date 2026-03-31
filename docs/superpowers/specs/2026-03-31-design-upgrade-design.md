# Design Upgrade — Dark Tech / Terminal Green

**Date:** 2026-03-31  
**Repo:** concrete-sangminlee/concrete-sangminlee.github.io  
**Status:** Approved

---

## Overview

Full visual redesign of the academic portfolio site from a classic serif/navy scheme to a Dark Tech / Terminal aesthetic. The content pipeline (markdown files + config.yml) stays untouched. Only CSS is fully replaced and minimal vanilla JS is added.

---

## Design Decisions

| Dimension | Decision |
|---|---|
| Direction | Dark Tech / Terminal |
| Accent color | Terminal Green `#39d353` |
| Background | `#050505` (hero), `#0a0a0a` (alternating sections) |
| Header/UI font | JetBrains Mono (Google Fonts) |
| Body font | Inter (Google Fonts) |
| Hero | Matrix rain canvas + typing animation + glow |
| Section layout | Terminal window chrome (macOS-style dots) |
| Implementation | CSS full rewrite + targeted vanilla JS additions |

---

## Visual Language

### Color Palette

```
--green:        #39d353          /* primary accent */
--green-glow:   rgba(57,211,83,0.5)
--green-dim:    rgba(57,211,83,0.12)
--green-border: rgba(57,211,83,0.3)
--bg:           #050505          /* hero + odd sections */
--bg2:          #0a0a0a          /* even sections */
--bg3:          #0e0e0e          /* terminal window body */
--surface:      #141414          /* terminal titlebar */
--border:       #1f1f1f
--border2:      #2a2a2a
--text:         #c8c8c8
--text-dim:     #505050
--text-bright:  #eeeeee
```

### Typography

- **JetBrains Mono**: navbar brand, section headers, terminal chrome, badges, tags, metadata, prompts
- **Inter**: body copy (publications titles, education, project descriptions)
- Body size: 15px, line-height 1.7

---

## Component Specs

### Navbar

- `position: sticky`, `backdrop-filter: blur(12px)`, height 50px
- Brand: `~/sangmin` with dimmed `~/` prefix
- Nav links: monospace, 0.65rem, `#505050` default → `#39d353` on hover with underline slide-in
- Background: `rgba(5,5,5,0.92)`

### Hero Section

Three layered elements stacked via `position: absolute`:

1. **Matrix rain canvas** — full-bleed `<canvas>`, opacity 0.35. Columns of random alphanumeric + katakana characters falling at 0.5px/frame, restarting randomly. Brighter near bottom of each column trail.
2. **Radial gradient overlay** — `rgba(5,5,5,0.3)` center → `rgba(5,5,5,0.85)` edges. Keeps text readable.
3. **Scanline overlay** — CSS repeating gradient, 4px pitch, 6% opacity.
4. **Corner brackets** — four `::before`/`::after` corners with 2px green border, 16px × 16px, 60% opacity.

**Hero content (z-index above canvas):**
- Prompt line: `$ ./portfolio --init --user="sangmin" --field="AI"` in `#505050`
- Name: types out `SANG MIN LEE` letter by letter (80ms/char, starts at 600ms). `text-shadow: 0 0 30px rgba(57,211,83,0.5), 0 0 60px rgba(57,211,83,0.2)`. Blinking block cursor after last char.
- Subtitle: `Ph.D. Candidate · Seoul National University`
- Badges: `[GitHub]`, `[Google Scholar]`, `[LinkedIn]`, `[ORCID]` — bordered green pills linking to actual profiles
- Tags: `AI`, `Wind Engineering`, `Structural Health Monitoring`, `Machine Learning`, `Concrete NDT`
- All content elements fade in sequentially (0.2s → 0.5s → 0.9s → 1.1s → 1.3s delays)

### Section Headers

```
font-family: JetBrains Mono, 0.65rem, letter-spacing: 3px, color: #39d353
◈ SECTION NAME ────────────────────────
             (gradient line via ::after)
```

### Terminal Window

Every section's content is wrapped in a terminal window:

```
┌─────────────────────────────────────┐
│ ● ● ●  ~/section-name/              │  ← titlebar, bg #141414
├─────────────────────────────────────┤
│ $ ls command                        │  ← prompt line, dimmed
│                                     │
│  ▌ Item title                       │  ← left-border card
│    journal · year · [SCI] [1저자]   │
└─────────────────────────────────────┘
```

- Titlebar dots: `#ff5f57` / `#ffbd2e` / `#28c840` (macOS colors, decorative)
- Terminal body padding: `1.1rem 1.3rem`
- Items: `border-left: 2px solid #2a2a2a` → `#39d353` on hover, subtle green background wash on hover

### Home Section

Not in a terminal window — plain content with structured sub-sections:

- Education entries: left-border cards (same hover pattern)
- Degree label: monospace green, `0.7rem`
- Research interests: tag pills

### Footer

- Monospace, `0.62rem`, `#505050`
- Green links

---

## Implementation Approach

**CSS:** Replace `main.css` entirely. Keep `styles.css` (Bootstrap base) import but override aggressively.

**JS additions to `scripts.js`:**
1. Matrix rain canvas init (runs on `DOMContentLoaded`)
2. Typing animation for `#hero-name` (starts after 600ms delay)

**HTML changes (minimal):**
- Add `<canvas id="matrix-canvas">` inside `.hero`
- Add `id="hero-name"` span for the typed name
- Add Google Fonts `<link>` for JetBrains Mono + Inter
- Remove `background-image` inline style from hero `<section>` (no longer needed)
- Wrap each section's `.main-body` in a terminal window div structure via JS in `scripts.js` after markdown is rendered (keeps `index.html` clean and consistent with the existing dynamic content pattern)

**Content files:** No changes to any `.md` files or `config.yml`.

---

## Files Changed

| File | Change |
|---|---|
| `static/css/main.css` | Full rewrite |
| `static/js/scripts.js` | Add matrix rain + typing animation |
| `index.html` | Add canvas, Google Fonts link, minor structural tweaks |

---

## Out of Scope

- No changes to content (`.md` files, `config.yml`)
- No changes to `styles.css` (Bootstrap base — overridden by `main.css`)
- No new build tools or dependencies (vanilla JS only)
- No dark mode toggle (dark only)
