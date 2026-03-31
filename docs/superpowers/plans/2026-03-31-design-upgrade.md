# Design Upgrade: Dark Tech / Terminal Green Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the existing serif/navy academic portfolio design with a Dark Tech / Terminal Green aesthetic using matrix rain hero, terminal window section wrappers, JetBrains Mono + Inter fonts, and `#39d353` accent color.

**Architecture:** Full CSS rewrite in `main.css`, targeted JS additions in `scripts.js` (matrix rain canvas, typing animation, terminal window wrapper), and minimal HTML structure additions to `index.html`. Content `.md` files and `config.yml` are untouched.

**Tech Stack:** Vanilla HTML/CSS/JS, Bootstrap 5 (base `styles.css` kept), Google Fonts (JetBrains Mono + Inter), marked.js (existing), js-yaml (existing).

---

## Dev Server

All tasks require the local server running (fetch() needs HTTP, not file://):

```bash
cd /Users/isangmin/concrete-sangminlee.github.io
python3 -m http.server 8080
```

Open http://localhost:8080 to verify each step.

---

## Task 1: HTML — Google Fonts, Hero Restructure

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Add Google Fonts preconnect + stylesheet in `<head>` after the favicon link**

In `index.html`, after line 13 (`<link rel="icon" ...>`), add:

```html
    <!-- Google Fonts -->
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;600;700&family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet">
```

- [ ] **Step 2: Restructure the hero `<section>`**

Replace the entire hero section block (lines 111–117):

```html
    <!-- Top Section -->
    <section class="top-section" style="background-image: url('static/assets/img/background.jpeg');">
        <div class="top-section-content">
            <div class="container px-5">
                <h2 id="top-section-bg-text" class="text-white display-3 lh-1 font-alt"></h2>
            </div>
        </div>
    </section>
    <!-- Top Section -->
```

With:

```html
    <!-- Top Section -->
    <section class="top-section">
        <canvas id="matrix-canvas"></canvas>
        <div class="hero-overlay"></div>
        <div class="hero-scanlines"></div>
        <div class="hero-corners">
            <span class="corner tl"></span>
            <span class="corner tr"></span>
            <span class="corner bl"></span>
            <span class="corner br"></span>
        </div>
        <div class="top-section-content">
            <div class="container px-5">
                <p class="hero-prompt">$ ./portfolio --init --user="sangmin"</p>
                <div class="hero-name"><span id="hero-typed-name"></span><span class="hero-cursor"></span></div>
                <h2 id="top-section-bg-text"></h2>
            </div>
        </div>
    </section>
    <!-- Top Section -->
```

- [ ] **Step 3: Start dev server and verify no JS errors in console**

```bash
cd /Users/isangmin/concrete-sangminlee.github.io && python3 -m http.server 8080
```

Open http://localhost:8080, open DevTools Console — should be no errors. Page will look broken (CSS not updated yet) — that's expected.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat: restructure hero HTML for matrix rain + typing animation"
```

---

## Task 2: CSS — Foundation (Variables, Reset, Navbar)

**Files:**
- Modify: `static/css/main.css` (full rewrite — replace entire file content)

- [ ] **Step 1: Replace `main.css` with foundation styles**

Write the following as the complete content of `static/css/main.css`:

```css
@import "./styles.css";

/* ── VARIABLES ── */
:root {
  --green:        #39d353;
  --green-glow:   rgba(57, 211, 83, 0.5);
  --green-dim:    rgba(57, 211, 83, 0.12);
  --green-border: rgba(57, 211, 83, 0.3);
  --bg:           #050505;
  --bg2:          #0a0a0a;
  --bg3:          #0e0e0e;
  --surface:      #141414;
  --border:       #1f1f1f;
  --border2:      #2a2a2a;
  --text:         #c8c8c8;
  --text-dim:     #505050;
  --text-bright:  #eeeeee;
  --mono: 'JetBrains Mono', 'Courier New', monospace;
  --sans: 'Inter', system-ui, -apple-system, sans-serif;
}

/* ── GLOBAL RESET ── */
html { scroll-behavior: smooth; }

body, html {
  font-family: var(--sans) !important;
  background: var(--bg) !important;
  color: var(--text) !important;
  font-size: 15px;
  line-height: 1.7;
}

h1, h2, h3, h4, h5, h6 {
  font-family: var(--mono) !important;
  color: var(--text-bright);
}

p, li, td, th, span, a, div {
  font-family: inherit !important;
}

/* Hide avatar — no longer used */
#avatar { display: none !important; }

/* Hide home-subtitle — name is shown in hero */
#home-subtitle { display: none !important; }

/* ── NAVBAR ── */
.header {
  height: 50px;
  background: rgba(5, 5, 5, 0.92) !important;
  border-bottom: 1px solid var(--border) !important;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  z-index: 1000;
}

.navbar-brand,
#page-top-title {
  font-family: var(--mono) !important;
  font-size: 0.8rem !important;
  color: var(--green) !important;
  letter-spacing: 1px;
  font-weight: 400 !important;
}

#page-top-title::before {
  content: '~/';
  color: var(--text-dim);
}

.nav-link {
  font-family: var(--mono) !important;
  font-size: 0.65rem !important;
  color: var(--text-dim) !important;
  letter-spacing: 1.5px;
  transition: color 0.2s !important;
  position: relative;
}

.nav-link::after {
  content: '';
  position: absolute;
  bottom: -4px; left: 0; right: 0;
  height: 1px;
  background: var(--green);
  transform: scaleX(0);
  transition: transform 0.2s;
}

.nav-link:hover { color: var(--green) !important; }
.nav-link:hover::after { transform: scaleX(1); }

.navbar-toggler {
  border: 1px solid var(--border2) !important;
  color: var(--text-dim) !important;
  font-family: var(--mono) !important;
  font-size: 0.7rem !important;
}
```

- [ ] **Step 2: Verify in browser**

http://localhost:8080 — navbar should show dark background, green brand name with `~/` prefix, dimmed nav links turning green on hover. Body should be dark.

- [ ] **Step 3: Commit**

```bash
git add static/css/main.css
git commit -m "feat: add CSS foundation — variables, reset, navbar"
```

---

## Task 3: CSS — Hero Section

**Files:**
- Modify: `static/css/main.css` (append to end of file)

- [ ] **Step 1: Append hero styles to `main.css`**

Add to the end of `static/css/main.css`:

```css
/* ── HERO SECTION ── */
.top-section {
  position: relative;
  min-height: 420px;
  height: auto;
  padding: 0 !important;
  display: flex;
  align-items: center;
  overflow: hidden;
  border-bottom: 1px solid var(--border);
  background: var(--bg) !important;
}

#matrix-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0.35;
}

.hero-overlay {
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse at 30% 50%, rgba(5,5,5,0.3) 0%, rgba(5,5,5,0.85) 70%);
  pointer-events: none;
}

.hero-scanlines {
  position: absolute;
  inset: 0;
  background: repeating-linear-gradient(
    0deg,
    transparent,
    transparent 3px,
    rgba(0, 0, 0, 0.06) 3px,
    rgba(0, 0, 0, 0.06) 4px
  );
  pointer-events: none;
}

.hero-corners {
  position: absolute;
  inset: 12px;
  border: 1px solid rgba(57, 211, 83, 0.12);
  pointer-events: none;
}

.corner {
  position: absolute;
  width: 16px;
  height: 16px;
  border-color: var(--green);
  border-style: solid;
  opacity: 0.6;
}
.corner.tl { top: -1px; left: -1px;   border-width: 2px 0 0 2px; }
.corner.tr { top: -1px; right: -1px;  border-width: 2px 2px 0 0; }
.corner.bl { bottom: -1px; left: -1px;  border-width: 0 0 2px 2px; }
.corner.br { bottom: -1px; right: -1px; border-width: 0 2px 2px 0; }

.top-section-content {
  position: relative;
  z-index: 1;
  width: 100%;
  padding: 3.5rem 0;
}

.hero-prompt {
  font-family: var(--mono) !important;
  font-size: 0.72rem;
  color: var(--text-dim);
  margin-bottom: 1.2rem;
  opacity: 0;
  animation: fadein 0.4s 0.2s forwards;
}

.hero-name {
  font-family: var(--mono) !important;
  font-size: clamp(2rem, 5vw, 3.2rem);
  font-weight: 700;
  color: var(--green);
  letter-spacing: 4px;
  line-height: 1;
  margin-bottom: 0.6rem;
  text-shadow: 0 0 30px var(--green-glow), 0 0 60px rgba(57, 211, 83, 0.2);
  opacity: 0;
  animation: fadein 0.4s 0.5s forwards;
}

.hero-cursor {
  display: inline-block;
  width: 3px;
  height: 0.85em;
  background: var(--green);
  margin-left: 6px;
  vertical-align: middle;
  box-shadow: 0 0 8px var(--green-glow);
  animation: blink 1s step-end infinite;
}

#top-section-bg-text {
  font-family: var(--mono) !important;
  font-size: 0.8rem !important;
  color: rgba(200, 200, 200, 0.6) !important;
  letter-spacing: 1px;
  font-weight: 400 !important;
  text-transform: none !important;
  border: none !important;
  opacity: 0;
  animation: fadein 0.4s 0.9s forwards;
}

@keyframes blink {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0; }
}

@keyframes fadein {
  to { opacity: 1; }
}
```

- [ ] **Step 2: Verify in browser**

http://localhost:8080 — hero section should be full-height dark area with green corner brackets visible, hero text area present. Matrix rain canvas is black (JS not added yet — that's fine). Blinking cursor visible.

- [ ] **Step 3: Commit**

```bash
git add static/css/main.css
git commit -m "feat: add CSS hero section — canvas layers, name glow, cursor animation"
```

---

## Task 4: CSS — Section Structure + Terminal Windows

**Files:**
- Modify: `static/css/main.css` (append to end of file)

- [ ] **Step 1: Append section + terminal window styles**

Add to the end of `static/css/main.css`:

```css
/* ── SECTION WRAPPERS ── */
section {
  padding: 2.8rem 0 !important;
  border-bottom: 1px solid var(--border);
}

.bg-gradient-primary-to-secondary-light,
.bg-gradient-primary-to-secondary-gray {
  background: transparent !important;
}

/* Alternate section backgrounds */
#home       { background: var(--bg)  !important; }
#projects   { background: var(--bg)  !important; }
#awards     { background: var(--bg)  !important; }
#publications { background: var(--bg2) !important; }
#patents      { background: var(--bg2) !important; }
#services     { background: var(--bg2) !important; }

/* ── SECTION HEADER (h2 override) ── */
section header h2 {
  font-family: var(--mono) !important;
  font-size: 0.65rem !important;
  color: var(--green) !important;
  letter-spacing: 3px !important;
  font-weight: 400 !important;
  border-bottom: none !important;
  padding-bottom: 0 !important;
  line-height: 1.4 !important;
  margin-bottom: 1.4rem !important;
  display: flex;
  align-items: center;
  gap: 0.8rem;
}

section header h2::after {
  content: '';
  flex: 1;
  height: 1px;
  background: linear-gradient(to right, var(--green-border), transparent);
  display: block;
}

/* Hide Bootstrap icons in section headers */
section header h2 i { display: none; }

/* ── TERMINAL WINDOW ── */
.term {
  background: var(--bg3);
  border: 1px solid var(--border2);
  border-radius: 6px;
  overflow: hidden;
}

.term-bar {
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  padding: 0.45rem 0.9rem;
  display: flex;
  align-items: center;
  gap: 6px;
}

.dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  display: inline-block;
  flex-shrink: 0;
}
.dot-r { background: #ff5f57; }
.dot-y { background: #ffbd2e; }
.dot-g { background: #28c840; }

.term-title {
  font-family: var(--mono) !important;
  font-size: 0.6rem;
  color: var(--text-dim);
  margin-left: 6px;
  letter-spacing: 1px;
}

.term-body {
  padding: 1.1rem 1.3rem;
}

.term-cmd {
  font-family: var(--mono) !important;
  font-size: 0.68rem;
  color: var(--text-dim);
  margin-bottom: 1rem;
}

.term-cmd .g { color: var(--green); }
```

- [ ] **Step 2: Verify in browser**

http://localhost:8080 — sections should now have dark alternating backgrounds with green section headers. Markdown content is raw (no terminal chrome yet — that comes from JS in Task 7). Section headers show green monospace text with a fading gradient line.

- [ ] **Step 3: Commit**

```bash
git add static/css/main.css
git commit -m "feat: add CSS section wrappers and terminal window chrome"
```

---

## Task 5: CSS — Content Items, Home Section, Footer, Responsive

**Files:**
- Modify: `static/css/main.css` (append to end of file)

- [ ] **Step 1: Append content item, home, footer, and responsive styles**

Add to the end of `static/css/main.css`:

```css
/* ── CONTENT ITEMS (inside terminal windows + home) ── */
.main-body {
  font-size: 0.9rem;
  line-height: 1.8;
  color: var(--text);
}

.main-body p {
  color: var(--text);
  margin-bottom: 0.6rem;
}

.main-body strong {
  color: var(--text-bright) !important;
  font-weight: 500;
}

.main-body a {
  color: var(--green) !important;
  text-decoration: none !important;
  border-bottom: 1px solid transparent;
  transition: border-color 0.2s;
}

.main-body a:hover {
  border-bottom-color: var(--green) !important;
}

/* Left-border items — applied to li inside terminal sections */
.main-body ul {
  padding-left: 0 !important;
  list-style: none !important;
}

.main-body li {
  border-left: 2px solid var(--border2) !important;
  padding: 0.55rem 0.9rem !important;
  margin-bottom: 0.6rem !important;
  border-radius: 0 3px 3px 0;
  transition: border-left-color 0.2s, background 0.2s;
  list-style: none !important;
}

.main-body li:hover {
  border-left-color: var(--green) !important;
  background: rgba(57, 211, 83, 0.03);
}

/* Tables */
.main-body table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
  margin: 1rem 0;
}

.main-body th {
  font-family: var(--mono) !important;
  font-size: 0.62rem;
  color: var(--green) !important;
  letter-spacing: 1px;
  background: var(--surface) !important;
  border-bottom: 1px solid var(--border2) !important;
  padding: 0.6rem 0.8rem !important;
  font-weight: 400;
}

.main-body td {
  border-bottom: 1px solid var(--border) !important;
  padding: 0.6rem 0.8rem !important;
  color: var(--text);
}

.main-body tr:hover td {
  background: rgba(57, 211, 83, 0.02);
}

.main-body hr {
  border-color: var(--border2) !important;
  margin: 1.5rem 0;
}

/* shields.io badge images */
.main-body img[src*="shields.io"] {
  height: 20px;
  border-radius: 2px;
  margin-right: 0.3rem;
  filter: brightness(0.9) contrast(1.1);
  transition: opacity 0.2s;
  vertical-align: middle;
}

.main-body img[src*="shields.io"]:hover { opacity: 0.8; }

/* ── HOME SECTION (no terminal window) ── */
#home .main-body h4 {
  font-family: var(--mono) !important;
  font-size: 0.68rem !important;
  color: var(--green) !important;
  letter-spacing: 2px !important;
  border-bottom: 1px solid var(--border2) !important;
  border-left: none !important;
  padding: 0 0 0.4rem 0 !important;
  margin: 1.8rem 0 0.9rem !important;
  font-weight: 400 !important;
  display: block;
}

#home .main-body h4::after { display: none; }

#home .main-body ul { padding-left: 0 !important; }

#home .main-body li {
  border-left: 2px solid var(--border2) !important;
  list-style: none;
  padding: 0.4rem 0.8rem !important;
  margin-bottom: 0.4rem !important;
  font-size: 0.88rem;
  transition: border-left-color 0.2s, background 0.2s;
}

#home .main-body li:hover {
  border-left-color: var(--green) !important;
  background: rgba(57, 211, 83, 0.03);
}

/* ── FOOTER ── */
footer.bg-bottom {
  background: var(--bg) !important;
  border-top: 1px solid var(--border);
  padding: 1.8rem 0 !important;
}

footer .text-white-50 {
  color: var(--text-dim) !important;
  font-family: var(--mono) !important;
  font-size: 0.62rem;
}

#copyright-text {
  font-family: var(--mono) !important;
  font-size: 0.62rem;
  margin-bottom: 0.4rem;
}

footer a {
  color: var(--green) !important;
  font-family: var(--mono) !important;
  font-size: 0.62rem;
  text-decoration: none !important;
  transition: opacity 0.2s;
}

footer a:hover {
  opacity: 0.7 !important;
  color: var(--green) !important;
}

/* ── RESPONSIVE ── */
@media screen and (max-width: 991px) {
  .top-section { min-height: 340px; }
  .hero-name { font-size: 2.2rem; }

  section header h2 {
    font-size: 0.6rem !important;
    letter-spacing: 2px !important;
  }
}

@media screen and (max-width: 576px) {
  .top-section { min-height: 260px; }

  .hero-name {
    font-size: 1.6rem;
    letter-spacing: 2px;
  }

  .hero-prompt { font-size: 0.62rem; }

  .top-section-content { padding: 2.5rem 0; }

  .hero-corners { inset: 6px; }

  section { padding: 2rem 0 !important; }

  section header h2 {
    font-size: 0.58rem !important;
    letter-spacing: 2px !important;
  }

  .term-body { padding: 0.8rem 0.9rem; }

  .main-body table {
    display: block;
    overflow-x: auto;
    white-space: nowrap;
  }

  .navbar-collapse {
    background: rgba(5, 5, 5, 0.96);
    border-top: 1px solid var(--border);
    padding: 0.5rem 0;
  }
}
```

- [ ] **Step 2: Verify in browser**

http://localhost:8080 — full page should now look cohesive dark theme. Home section shows styled headers and left-border list items. Footer is dark with green links. Check mobile at 375px width too.

- [ ] **Step 3: Commit**

```bash
git add static/css/main.css
git commit -m "feat: add CSS content items, home section, footer, responsive"
```

---

## Task 6: JS — Matrix Rain Canvas

**Files:**
- Modify: `static/js/scripts.js`

- [ ] **Step 1: Add `initMatrixRain()` function before the `window.addEventListener` block**

In `static/js/scripts.js`, add this function before the existing `window.addEventListener('DOMContentLoaded', ...)` line:

```js
function initMatrixRain() {
    const canvas = document.getElementById('matrix-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    function resize() {
        canvas.width = canvas.offsetWidth;
        canvas.height = canvas.offsetHeight;
    }
    resize();

    const fontSize = 13;
    let drops = [];

    function initDrops() {
        const cols = Math.floor(canvas.width / fontSize);
        drops = Array(cols).fill(0).map(() => Math.random() * -50);
    }
    initDrops();

    window.addEventListener('resize', () => { resize(); initDrops(); });

    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%アイウエオカキクケコサシスセソ'.split('');

    function draw() {
        ctx.fillStyle = 'rgba(5, 5, 5, 0.055)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.font = `${fontSize}px 'JetBrains Mono', monospace`;
        for (let i = 0; i < drops.length; i++) {
            const y = drops[i] * fontSize;
            if (y > 0) {
                const bright = y > canvas.height * 0.6;
                ctx.fillStyle = bright ? 'rgba(57,211,83,0.85)' : 'rgba(57,211,83,0.45)';
                ctx.fillText(chars[Math.floor(Math.random() * chars.length)], i * fontSize, y);
            }
            if (y > canvas.height && Math.random() > 0.975) drops[i] = 0;
            drops[i] += 0.5;
        }
    }

    setInterval(draw, 40);
}
```

- [ ] **Step 2: Call `initMatrixRain()` at the top of the `DOMContentLoaded` listener**

Inside the existing `window.addEventListener('DOMContentLoaded', event => {` block, add as the first line:

```js
    initMatrixRain();
```

- [ ] **Step 3: Verify in browser**

http://localhost:8080 — hero section should show green characters falling. Refresh to confirm it resets. Resize window to confirm canvas resizes.

- [ ] **Step 4: Commit**

```bash
git add static/js/scripts.js
git commit -m "feat: add matrix rain canvas animation to hero"
```

---

## Task 7: JS — Typing Animation + Terminal Window Wrapper

**Files:**
- Modify: `static/js/scripts.js`

- [ ] **Step 1: Add `initTypingAnimation()` function after `initMatrixRain()`**

```js
function initTypingAnimation() {
    const el = document.getElementById('hero-typed-name');
    if (!el) return;
    const name = 'SANG MIN LEE';
    let i = 0;
    setTimeout(() => {
        const interval = setInterval(() => {
            el.textContent = name.slice(0, ++i);
            if (i >= name.length) clearInterval(interval);
        }, 80);
    }, 600);
}
```

- [ ] **Step 2: Add `wrapInTerminal()` function after `initTypingAnimation()`**

```js
function wrapInTerminal(name) {
    const body = document.getElementById(name + '-md');
    if (!body) return;
    const originalContent = body.innerHTML;
    body.innerHTML = `
        <div class="term">
            <div class="term-bar">
                <span class="dot dot-r"></span>
                <span class="dot dot-y"></span>
                <span class="dot dot-g"></span>
                <span class="term-title">~/${name}/</span>
            </div>
            <div class="term-body">
                <div class="term-cmd"><span class="g">$</span> ls ./${name}/</div>
                ${originalContent}
            </div>
        </div>`;
}
```

- [ ] **Step 3: Call `initTypingAnimation()` in `DOMContentLoaded` after `initMatrixRain()`**

```js
    initMatrixRain();
    initTypingAnimation();
```

- [ ] **Step 4: Integrate `wrapInTerminal()` into the markdown render loop**

Find the existing `section_names.forEach` block in `scripts.js`:

```js
    section_names.forEach((name, idx) => {
        fetch(content_dir + name + '.md')
            .then(response => response.text())
            .then(markdown => {
                const html = marked.parse(markdown);
                document.getElementById(name + '-md').innerHTML = html;
            }).then(() => {
                // MathJax
                MathJax.typeset();
            })
            .catch(error => console.log(error));
    })
```

Replace with:

```js
    section_names.forEach((name, idx) => {
        fetch(content_dir + name + '.md')
            .then(response => response.text())
            .then(markdown => {
                const html = marked.parse(markdown);
                document.getElementById(name + '-md').innerHTML = html;
                if (name !== 'home') {
                    wrapInTerminal(name);
                }
            }).then(() => {
                MathJax.typeset();
            })
            .catch(error => console.log(error));
    })
```

- [ ] **Step 5: Verify in browser**

http://localhost:8080:
- Hero: name types out letter by letter starting at ~600ms, cursor blinks after
- All sections except Home have terminal window chrome (macOS dots + `~/section/` title + `$ ls` prompt)
- Home section has plain styled content with green section headers

- [ ] **Step 6: Commit**

```bash
git add static/js/scripts.js
git commit -m "feat: add typing animation and terminal window wrappers to sections"
```

---

## Task 8: Final QA + Polish

**Files:**
- Modify: `static/css/main.css` (any fixes found during QA)

- [ ] **Step 1: Full visual QA checklist**

Open http://localhost:8080 and verify each item:

| Check | Expected |
|---|---|
| Navbar brand | Shows `~/sangmin` with dimmed `~/` and green name |
| Navbar links | Dimmed monospace, turn green on hover with underline slide |
| Hero background | Matrix rain falling characters visible |
| Hero overlay | Text readable over matrix rain |
| Hero corners | Four green corner brackets visible |
| Hero prompt | `$ ./portfolio --init --user="sangmin"` in dimmed text |
| Hero name | Types out `SANG MIN LEE` with green glow, cursor blinks after |
| Hero subtitle | `AI for Resilient Infrastructure` fades in below name |
| Section headers | Green monospace with fading gradient line |
| Terminal windows | All sections except Home have macOS dots chrome |
| List items | Left-border items, border turns green on hover |
| Home h4 headers | Green monospace underlined headers |
| Footer | Dark with green links |
| Mobile 375px | Hero text readable, no overflow, navbar toggler works |

- [ ] **Step 2: Fix any QA issues found**

Common issues to look for:
- Bootstrap classes overriding dark backgrounds — add `!important` to relevant CSS rules
- Canvas not filling hero height — check `canvas { width: 100%; height: 100%; }`  
- Terminal wrapper content appearing before fonts load — acceptable (FOUT), no fix needed
- Mobile navbar dropdown has wrong background — covered by `.navbar-collapse` responsive rule

- [ ] **Step 3: Final commit**

```bash
git add static/css/main.css static/js/scripts.js index.html
git commit -m "feat: complete Dark Tech / Terminal Green design upgrade"
```

- [ ] **Step 4: Push to GitHub Pages**

```bash
git push origin master
```

Wait ~60 seconds, then verify at https://concrete-sangminlee.github.io

---

## Self-Review Notes

- **Spec coverage:** All components covered — navbar ✓, hero (matrix + typing + glow + corners) ✓, terminal windows ✓, home section ✓, footer ✓, responsive ✓
- **No placeholders:** All steps contain complete code
- **Type consistency:** `wrapInTerminal(name)` called with same `name` string used throughout, `hero-typed-name` id matches between HTML (Task 1) and JS (Task 7), CSS class `.term` / `.term-bar` / `.term-body` / `.term-cmd` / `.dot-r` / `.dot-y` / `.dot-g` defined in Task 4 and generated by JS in Task 7
- **Bootstrap conflicts:** Addressed with `!important` overrides on background, font-family, and color properties
