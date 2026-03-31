# Portfolio Enhancements (A→C→D→B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add scroll animations, academic copy-citation + publication filter, contact section + stats counter + featured paper, and an interactive hero terminal to the dark-tech academic portfolio.

**Architecture:** Pure vanilla JS + CSS additions layered on top of the existing Bootstrap + marked.js + js-yaml static site. No new libraries. All four features are independent and can be implemented in sequence. Dynamic content (publications) is fetched and rendered before feature JS hooks are called by chaining `.then()` calls.

**Tech Stack:** Vanilla JS (IntersectionObserver, Clipboard API, fetch), CSS custom properties already in `main.css`, Bootstrap grid (existing), no new dependencies.

---

## File Map

| File | Changes |
|------|---------|
| `index.html` | Add stats bar, contact section, featured paper card, hero terminal input, navbar CONTACT link |
| `static/css/main.css` | Add animation classes, copy-btn styles, filter-bar styles, contact grid styles, stats bar styles, featured paper styles, hero terminal styles |
| `static/js/scripts.js` | Add `initScrollAnimations()`, `addCopyButtons()`, `initPublicationFilter()`, `initStatsCounter()`, `initHeroTerminal()`, `escapeHtml()` helper; wire up in DOMContentLoaded |

---

## Task 1: Scroll-Triggered Entrance Animations (A)

**Files:**
- Modify: `static/css/main.css`
- Modify: `static/js/scripts.js`

The `.term` terminal windows should fade up into view as the user scrolls. Individual `li` items inside each terminal stagger in after the terminal itself is visible.

- [ ] **Step 1: Add animation CSS to `main.css`**

Append to the end of `static/css/main.css`:

```css
/* ── SCROLL ANIMATIONS ── */
.anim-target {
  opacity: 0;
  transform: translateY(18px);
  transition: opacity 0.5s ease, transform 0.5s ease;
}
.anim-target.anim-visible {
  opacity: 1;
  transform: translateY(0);
}
```

- [ ] **Step 2: Add `initScrollAnimations()` to `scripts.js`**

Add this function before the `window.addEventListener('DOMContentLoaded', ...)` block:

```js
function initScrollAnimations() {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (!entry.isIntersecting) return;
            const el = entry.target;
            el.classList.add('anim-visible');
            // Stagger li items inside this terminal
            el.querySelectorAll('li').forEach((li, i) => {
                li.classList.add('anim-target');
                setTimeout(() => li.classList.add('anim-visible'), 60 + i * 50);
            });
            observer.unobserve(el);
        });
    }, { threshold: 0.07 });

    document.querySelectorAll('.term').forEach(el => {
        el.classList.add('anim-target');
        observer.observe(el);
    });
}
```

- [ ] **Step 3: Wire `initScrollAnimations()` after all sections load**

In `scripts.js`, inside `DOMContentLoaded`, find the `section_names.forEach(...)` block. Change it from `forEach` to collect promises and call `initScrollAnimations` when all resolve:

Replace:
```js
    // Marked
    marked.use({ mangle: false, headerIds: false })
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

With:
```js
    // Marked
    marked.use({ mangle: false, headerIds: false })
    const sectionPromises = section_names.map((name) => {
        return fetch(content_dir + name + '.md')
            .then(response => response.text())
            .then(markdown => {
                const html = marked.parse(markdown);
                document.getElementById(name + '-md').innerHTML = html;
                if (name !== 'home') {
                    wrapInTerminal(name);
                }
            }).then(() => {
                MathJax.typeset();
                if (name === 'publications') {
                    if (typeof addCopyButtons === 'function') addCopyButtons();
                    if (typeof initPublicationFilter === 'function') initPublicationFilter();
                }
            })
            .catch(error => console.log(error));
    });
    Promise.all(sectionPromises).then(() => {
        initScrollAnimations();
        if (typeof initStatsCounter === 'function') initStatsCounter();
    });
```

- [ ] **Step 4: Verify in browser**

Open `index.html` via a local server (e.g., `python3 -m http.server 8080` in the repo root).  
Scroll down — each terminal window should fade and slide up as it enters the viewport. List items inside each terminal should appear with a slight stagger.  
If `.term` elements are already visible on load, they should appear immediately (threshold 0.07 means even a tiny intersection triggers it).

- [ ] **Step 5: Commit**

```bash
git add static/css/main.css static/js/scripts.js
git commit -m "feat: add scroll-triggered entrance animations for terminal windows"
```

---

## Task 2: Copy Citation Button + Publication Type Filter (C)

**Files:**
- Modify: `static/css/main.css`
- Modify: `static/js/scripts.js`

After the publications markdown renders, add:
1. A small `⎘` copy button on each `li` that copies the citation text to clipboard.
2. A filter bar above the publications terminal (ALL / JOURNAL / CONFERENCE / THESES / EARLY) that shows/hides publication groups.

Note: `addCopyButtons()` and `initPublicationFilter()` are already called in Task 1's wiring. This task implements those two functions.

- [ ] **Step 1: Add `addCopyButtons()` to `scripts.js`**

Add before the `window.addEventListener('DOMContentLoaded', ...)` block:

```js
function addCopyButtons() {
    const container = document.getElementById('publications-md');
    if (!container) return;
    container.querySelectorAll('li').forEach(li => {
        const citationText = li.textContent.trim();
        li.style.position = 'relative';
        const btn = document.createElement('button');
        btn.className = 'cite-copy-btn';
        btn.title = 'Copy citation';
        btn.textContent = '⎘';
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            navigator.clipboard.writeText(citationText).then(() => {
                btn.textContent = '✓';
                btn.classList.add('copied');
                setTimeout(() => {
                    btn.textContent = '⎘';
                    btn.classList.remove('copied');
                }, 1500);
            });
        });
        li.appendChild(btn);
    });
}
```

- [ ] **Step 2: Add copy button CSS to `main.css`**

Append to `static/css/main.css`:

```css
/* ── COPY CITATION BUTTON ── */
.cite-copy-btn {
  position: absolute;
  top: 0.4rem;
  right: 0.4rem;
  background: transparent;
  border: 1px solid var(--border2);
  color: var(--text-dim);
  font-size: 0.72rem;
  padding: 1px 6px;
  border-radius: 3px;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.2s, color 0.2s, border-color 0.2s;
  font-family: var(--mono);
  line-height: 1.6;
}
.main-body li:hover .cite-copy-btn { opacity: 1; }
.cite-copy-btn:hover,
.cite-copy-btn.copied { color: var(--green); border-color: var(--green); opacity: 1; }
```

- [ ] **Step 3: Add `initPublicationFilter()` to `scripts.js`**

Add before the `window.addEventListener('DOMContentLoaded', ...)` block:

```js
function initPublicationFilter() {
    const md = document.getElementById('publications-md');
    if (!md) return;
    const termBody = md.querySelector('.term-body');
    if (!termBody) return;

    // Group elements by their preceding h4 heading
    const children = Array.from(termBody.children);
    const sections = [];
    let cur = null;
    children.forEach(el => {
        if (el.tagName === 'H4') {
            cur = { key: el.textContent.trim().split(' ')[0].toLowerCase(), els: [el] };
            sections.push(cur);
        } else if (cur) {
            cur.els.push(el);
        }
    });
    if (!sections.length) return;

    // Build filter bar
    const bar = document.createElement('div');
    bar.className = 'pub-filter-bar';
    const filters = [
        { key: 'all', label: 'ALL' },
        ...sections.map(s => ({ key: s.key, label: s.key.toUpperCase() }))
    ];
    filters.forEach(f => {
        const btn = document.createElement('button');
        btn.className = 'pub-filter-btn' + (f.key === 'all' ? ' active' : '');
        btn.textContent = f.label;
        btn.addEventListener('click', () => {
            bar.querySelectorAll('.pub-filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            sections.forEach(s => {
                const show = f.key === 'all' || s.key === f.key;
                s.els.forEach(el => { el.style.display = show ? '' : 'none'; });
            });
        });
        bar.appendChild(btn);
    });

    // Insert filter bar before the .term element
    const term = md.querySelector('.term');
    if (term) md.insertBefore(bar, term);
}
```

- [ ] **Step 4: Add filter bar CSS to `main.css`**

Append to `static/css/main.css`:

```css
/* ── PUBLICATION FILTER BAR ── */
.pub-filter-bar {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 0.8rem;
  flex-wrap: wrap;
}
.pub-filter-btn {
  font-family: var(--mono);
  font-size: 0.62rem;
  color: var(--text-dim);
  background: transparent;
  border: 1px solid var(--border2);
  padding: 0.25rem 0.65rem;
  border-radius: 3px;
  cursor: pointer;
  letter-spacing: 1px;
  transition: color 0.2s, border-color 0.2s, background 0.2s;
}
.pub-filter-btn:hover,
.pub-filter-btn.active {
  color: var(--green);
  border-color: var(--green);
  background: var(--green-dim);
}
```

- [ ] **Step 5: Verify in browser**

1. Hover over any publication list item — a small `⎘` button should appear in the top-right. Click it — citation text should be copied and button shows `✓` briefly.
2. Above the publications terminal, filter buttons ALL / JOURNAL / CONFERENCE / THESES / EARLY should appear. Clicking each shows only that group.

- [ ] **Step 6: Commit**

```bash
git add static/css/main.css static/js/scripts.js
git commit -m "feat: add copy citation buttons and publication type filter"
```

---

## Task 3: Contact Section (D1)

**Files:**
- Modify: `index.html`
- Modify: `static/css/main.css`

Add a new `#contact` section before the footer with five contact cards (Email, GitHub, Google Scholar, LinkedIn, ORCID). Add CONTACT to the navbar.

- [ ] **Step 1: Add contact section HTML to `index.html`**

In `index.html`, find the `<!-- Footer-->` comment and insert the contact section immediately before it:

```html
    <!-- Contact -->
    <section id="contact">
        <div class="container px-5">
            <header>
                <h2>CONTACT</h2>
            </header>
            <div class="contact-grid">
                <a class="contact-card" href="mailto:201612445@snu.ac.kr">
                    <span class="contact-icon">[✉]</span>
                    <span class="contact-label">EMAIL</span>
                    <span class="contact-val">201612445@snu.ac.kr</span>
                </a>
                <a class="contact-card" href="https://github.com/concrete-sangminlee" target="_blank" rel="noopener">
                    <span class="contact-icon">[GH]</span>
                    <span class="contact-label">GITHUB</span>
                    <span class="contact-val">concrete-sangminlee</span>
                </a>
                <a class="contact-card" href="https://scholar.google.com/citations?user=ogvd_LsAAAAJ&amp;hl=en" target="_blank" rel="noopener">
                    <span class="contact-icon">[GS]</span>
                    <span class="contact-label">GOOGLE SCHOLAR</span>
                    <span class="contact-val">Sang Min Lee</span>
                </a>
                <a class="contact-card" href="https://www.linkedin.com/in/sang-min-lee-3a2568174/" target="_blank" rel="noopener">
                    <span class="contact-icon">[IN]</span>
                    <span class="contact-label">LINKEDIN</span>
                    <span class="contact-val">Sang Min Lee</span>
                </a>
                <a class="contact-card" href="https://orcid.org/0000-0002-6822-5252" target="_blank" rel="noopener">
                    <span class="contact-icon">[ID]</span>
                    <span class="contact-label">ORCID</span>
                    <span class="contact-val">0000-0002-6822-5252</span>
                </a>
            </div>
        </div>
    </section>
    <!-- Contact -->
```

- [ ] **Step 2: Add CONTACT nav link to navbar**

In `index.html`, find the last `<li class="nav-item">` in `#navbarResponsive` (the SERVICES link) and add after it:

```html
                    <li class="nav-item">
                        <a class="nav-link me-lg-3" href="#contact">CONTACT</a>
                    </li>
```

- [ ] **Step 3: Add contact section and card CSS to `main.css`**

Append to `static/css/main.css`:

```css
/* ── CONTACT SECTION ── */
#contact { background: var(--bg) !important; }

.contact-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
  gap: 1rem;
}

.contact-card {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  padding: 1rem 1.2rem;
  background: var(--surface);
  border: 1px solid var(--border2);
  border-radius: 6px;
  text-decoration: none !important;
  transition: border-color 0.2s, background 0.2s, transform 0.2s;
}
.contact-card:hover {
  border-color: var(--green) !important;
  background: var(--green-dim);
  transform: translateY(-2px);
}
.contact-icon {
  font-family: var(--mono);
  font-size: 0.85rem;
  color: var(--green);
}
.contact-label {
  font-family: var(--mono);
  font-size: 0.56rem;
  color: var(--text-dim);
  letter-spacing: 2px;
}
.contact-val {
  font-family: var(--mono);
  font-size: 0.72rem;
  color: var(--text-bright);
  word-break: break-all;
}

@media (max-width: 576px) {
  .contact-grid { grid-template-columns: 1fr 1fr; }
}
```

- [ ] **Step 4: Update ScrollSpy section_names in `scripts.js`**

The Bootstrap ScrollSpy already targets `#mainNav`. No change needed — it automatically picks up the new nav link.

- [ ] **Step 5: Verify in browser**

Scroll to the bottom — a CONTACT section should appear with 5 cards. Hovering cards shows green border + lift. CONTACT appears in the navbar and clicking it smooth-scrolls there.

- [ ] **Step 6: Commit**

```bash
git add index.html static/css/main.css
git commit -m "feat: add contact section with cards for all social/academic links"
```

---

## Task 4: Research Stats Counter (D2)

**Files:**
- Modify: `index.html`
- Modify: `static/css/main.css`
- Modify: `static/js/scripts.js`

A stats bar between the hero section and the home section showing animated counters: Journal Papers (6), Conference Papers (14), Years in Research (5), Awards (6).

- [ ] **Step 1: Add stats bar HTML to `index.html`**

In `index.html`, find `<!-- Home -->` and insert the stats bar immediately before it:

```html
    <!-- Stats -->
    <div class="stats-bar">
        <div class="container px-5">
            <div class="stats-grid">
                <div class="stat-item">
                    <span class="stat-num" data-target="6">0</span>
                    <span class="stat-label">JOURNAL PAPERS</span>
                </div>
                <div class="stat-item">
                    <span class="stat-num" data-target="14">0</span>
                    <span class="stat-label">CONFERENCE PAPERS</span>
                </div>
                <div class="stat-item">
                    <span class="stat-num" data-target="5">0</span>
                    <span class="stat-label">YEARS IN RESEARCH</span>
                </div>
                <div class="stat-item">
                    <span class="stat-num" data-target="6">0</span>
                    <span class="stat-label">AWARDS</span>
                </div>
            </div>
        </div>
    </div>
    <!-- Stats -->
```

- [ ] **Step 2: Add stats bar CSS to `main.css`**

Append to `static/css/main.css`:

```css
/* ── RESEARCH STATS BAR ── */
.stats-bar {
  background: var(--bg2);
  border-bottom: 1px solid var(--border);
  padding: 1.8rem 0;
}
.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1rem;
  text-align: center;
}
.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.4rem;
}
.stat-num {
  font-family: var(--mono);
  font-size: 2.2rem;
  font-weight: 700;
  color: var(--green);
  text-shadow: 0 0 20px var(--green-glow);
  line-height: 1;
}
.stat-label {
  font-family: var(--mono);
  font-size: 0.54rem;
  color: var(--text-dim);
  letter-spacing: 2px;
}
@media (max-width: 576px) {
  .stats-grid { grid-template-columns: repeat(2, 1fr); }
  .stat-num { font-size: 1.8rem; }
}
```

- [ ] **Step 3: Add `initStatsCounter()` to `scripts.js`**

Add before the `window.addEventListener('DOMContentLoaded', ...)` block:

```js
function initStatsCounter() {
    const bar = document.querySelector('.stats-bar');
    if (!bar) return;
    const observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            if (!entry.isIntersecting) return;
            entry.target.querySelectorAll('.stat-num').forEach(el => {
                const target = parseInt(el.dataset.target, 10);
                const duration = 900;
                const stepTime = 16;
                const steps = duration / stepTime;
                const increment = target / steps;
                let current = 0;
                const timer = setInterval(() => {
                    current = Math.min(current + increment, target);
                    el.textContent = Math.floor(current);
                    if (current >= target) clearInterval(timer);
                }, stepTime);
            });
            observer.unobserve(entry.target);
        });
    }, { threshold: 0.3 });
    observer.observe(bar);
}
```

Note: `initStatsCounter()` is already called in the `Promise.all(...).then(...)` added in Task 1. No additional wiring needed.

- [ ] **Step 4: Verify in browser**

Scroll down past the hero — the stats bar should appear with four numbers counting up from 0 to their targets over ~900ms. Numbers should only animate once (observer unobserved after first trigger).

- [ ] **Step 5: Commit**

```bash
git add index.html static/css/main.css static/js/scripts.js
git commit -m "feat: add animated research stats counter bar"
```

---

## Task 5: Featured Paper Spotlight (D3)

**Files:**
- Modify: `index.html`
- Modify: `static/css/main.css`

A highlighted card below the home section markdown showing the most recent journal paper.

- [ ] **Step 1: Add featured paper HTML to `index.html`**

In `index.html`, inside the `#home` section, find `<div class="main-body" id="home-md"></div>` and add the featured paper card immediately after it:

```html
            <div class="featured-paper">
                <div class="featured-label">// FEATURED PAPER</div>
                <div class="featured-venue">Journal of Nondestructive Evaluation &middot; 2025</div>
                <div class="featured-title">Machine Learning Assisted Method for Automated Impact-Echo Testing of Concrete Structures</div>
                <div class="featured-authors">Lee, S. M., Hong, J., Choi, H., &amp; Kang, T. H.-K.</div>
            </div>
```

- [ ] **Step 2: Add featured paper CSS to `main.css`**

Append to `static/css/main.css`:

```css
/* ── FEATURED PAPER ── */
.featured-paper {
  margin-top: 2rem;
  padding: 1.2rem 1.5rem;
  border-left: 3px solid var(--green);
  border: 1px solid var(--green-border);
  border-left-width: 3px;
  border-radius: 0 6px 6px 0;
  background: var(--green-dim);
  transition: background 0.2s, border-color 0.2s;
}
.featured-paper:hover {
  background: rgba(57, 211, 83, 0.07);
}
.featured-label {
  font-family: var(--mono);
  font-size: 0.58rem;
  color: var(--green);
  letter-spacing: 2px;
  margin-bottom: 0.7rem;
}
.featured-venue {
  font-family: var(--mono);
  font-size: 0.65rem;
  color: var(--text-dim);
  margin-bottom: 0.35rem;
}
.featured-title {
  font-size: 0.92rem;
  color: var(--text-bright);
  font-weight: 500;
  margin-bottom: 0.35rem;
  line-height: 1.5;
}
.featured-authors {
  font-size: 0.78rem;
  color: var(--text);
}
```

- [ ] **Step 3: Verify in browser**

The home section should show the bio content followed by the featured paper card with a green left border and subtle green background. Hover darkens the green background slightly.

- [ ] **Step 4: Commit**

```bash
git add index.html static/css/main.css
git commit -m "feat: add featured paper spotlight card to home section"
```

---

## Task 6: Interactive Hero Terminal (B)

**Files:**
- Modify: `index.html`
- Modify: `static/css/main.css`
- Modify: `static/js/scripts.js`

A functional terminal input at the bottom of the hero section. Supports commands: `help`, `ls`, `whoami`, `cat bio.txt`, `cd [section]`, `clear`.

- [ ] **Step 1: Add terminal input HTML to hero in `index.html`**

In `index.html`, inside `.top-section-content > .container.px-5 > .row`, find the left column (`col-lg-8`) and add the terminal input after the `<h2 id="top-section-bg-text">` element:

```html
                        <div class="hero-terminal-input">
                            <span class="g">$</span>
                            <input type="text" id="hero-cmd-input" class="hero-cmd-field"
                                   placeholder="type 'help' for commands..."
                                   autocomplete="off" spellcheck="false" aria-label="Terminal command input">
                        </div>
                        <div id="hero-cmd-output" class="hero-cmd-output" aria-live="polite"></div>
```

- [ ] **Step 2: Add terminal input CSS to `main.css`**

Append to `static/css/main.css`:

```css
/* ── HERO INTERACTIVE TERMINAL ── */
.hero-terminal-input {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  margin-top: 1.4rem;
  border: 1px solid var(--border2);
  border-radius: 4px;
  padding: 0.4rem 0.9rem;
  background: rgba(5, 5, 5, 0.65);
  max-width: 480px;
  opacity: 0;
  animation: fadein 0.4s 1.6s forwards;
  transition: border-color 0.2s;
}
.hero-terminal-input:focus-within {
  border-color: var(--green-border);
}
.hero-terminal-input .g {
  color: var(--green);
  font-family: var(--mono);
  font-size: 0.82rem;
  flex-shrink: 0;
}
.hero-cmd-field {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  color: var(--text-bright);
  font-family: var(--mono);
  font-size: 0.78rem;
  caret-color: var(--green);
  min-width: 0;
}
.hero-cmd-field::placeholder {
  color: var(--text-dim);
  font-size: 0.7rem;
}
.hero-cmd-output {
  margin-top: 0.5rem;
  max-width: 480px;
  max-height: 140px;
  overflow-y: auto;
  font-family: var(--mono);
  font-size: 0.7rem;
  line-height: 1.6;
  color: var(--text);
}
.hero-cmd-output::-webkit-scrollbar { width: 4px; }
.hero-cmd-output::-webkit-scrollbar-track { background: transparent; }
.hero-cmd-output::-webkit-scrollbar-thumb { background: var(--border2); border-radius: 2px; }
.hero-cmd-line {
  white-space: pre-wrap;
  margin-bottom: 0.4rem;
  padding-bottom: 0.4rem;
  border-bottom: 1px solid var(--border);
}
.hero-cmd-line:last-child { border-bottom: none; margin-bottom: 0; }
.hero-cmd-line .g { color: var(--green); }
.hero-cmd-line .err { color: #ff5f57; }
```

- [ ] **Step 3: Add `escapeHtml()` helper and `initHeroTerminal()` to `scripts.js`**

Add both functions before the `window.addEventListener('DOMContentLoaded', ...)` block:

```js
function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function initHeroTerminal() {
    const input = document.getElementById('hero-cmd-input');
    const output = document.getElementById('hero-cmd-output');
    if (!input || !output) return;

    const navSections = ['home', 'publications', 'projects', 'patents', 'awards', 'services', 'contact'];

    const commands = {
        help: () =>
            'available commands:\n' +
            '  help          — show this message\n' +
            '  ls            — list sections\n' +
            '  cd <section>  — navigate to section\n' +
            '  whoami        — who is this?\n' +
            '  cat bio.txt   — research bio\n' +
            '  clear         — clear output',
        ls: () => navSections.map(s => `  ${s}/`).join('\n'),
        whoami: () =>
            'Sang Min Lee\n' +
            'Ph.D. Candidate in AI @ Seoul National University\n' +
            'Research: AI for Resilient Infrastructure',
        'cat bio.txt': () =>
            'Ph.D. Candidate in Artificial Intelligence\n' +
            'at Seoul National University.\n' +
            'Research focuses on machine learning for\n' +
            'structural health monitoring and wind engineering.',
    };

    function runCommand(raw) {
        const cmd = raw.trim();
        if (!cmd) return;

        let resultHtml;

        if (cmd === 'clear') {
            output.innerHTML = '';
            return;
        } else if (commands[cmd]) {
            resultHtml = `<span class="g">$</span> ${escapeHtml(cmd)}\n${escapeHtml(commands[cmd]())}`;
        } else if (cmd.startsWith('cd ')) {
            const target = cmd.slice(3).trim().replace(/\/$/, '');
            const el = document.getElementById(target === 'home' ? 'page-top' : target);
            if (el) {
                el.scrollIntoView({ behavior: 'smooth' });
                resultHtml = `<span class="g">$</span> ${escapeHtml(cmd)}\nnavigating to /${escapeHtml(target)}/`;
            } else {
                resultHtml = `<span class="g">$</span> ${escapeHtml(cmd)}\n<span class="err">cd: ${escapeHtml(target)}: no such section</span>`;
            }
        } else {
            resultHtml = `<span class="g">$</span> ${escapeHtml(cmd)}\n<span class="err">${escapeHtml(cmd)}: command not found — try 'help'</span>`;
        }

        const line = document.createElement('div');
        line.className = 'hero-cmd-line';
        line.innerHTML = resultHtml;
        output.appendChild(line);
        output.scrollTop = output.scrollHeight;
    }

    input.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
            runCommand(input.value);
            input.value = '';
        }
    });
}
```

- [ ] **Step 4: Call `initHeroTerminal()` inside `DOMContentLoaded`**

In `scripts.js`, inside the `DOMContentLoaded` listener, add `initHeroTerminal();` right after the existing `initTypingAnimation();` call:

```js
    initMatrixRain();
    initTypingAnimation();
    initHeroTerminal();
```

- [ ] **Step 5: Verify in browser**

In the hero section, below the name/subtitle, a terminal input box should appear (fades in after 1.6s). Type `help` and press Enter — a list of commands appears below. Type `cd publications` — page smooth-scrolls to publications. Type `clear` — output clears. Type `garbage` — shows "command not found" in red.

- [ ] **Step 6: Commit**

```bash
git add index.html static/css/main.css static/js/scripts.js
git commit -m "feat: add interactive hero terminal with navigation commands"
```

---

## Final: Push and Merge

- [ ] **Push branch and open PR**

```bash
git push origin feature/portfolio-enhancements
gh pr create --title "feat: portfolio enhancements (scroll animations, citation copy, filter, contact, stats, featured paper, interactive terminal)" --body "Implements A→C→D→B enhancement roadmap: scroll animations on terminal windows, copy citation buttons and publication type filter, contact section + research stats bar + featured paper spotlight, and interactive hero terminal."
```

- [ ] **After merge: clean up worktree**

```bash
cd /Users/isangmin/concrete-sangminlee.github.io
git worktree remove .worktrees/portfolio-enhancements
git branch -d feature/portfolio-enhancements
```
