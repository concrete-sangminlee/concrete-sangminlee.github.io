
// Global error handlers — log to console without breaking the page
window.addEventListener('error', e => {
    console.warn('[scripts.js] runtime error:', e.message, 'at', e.filename + ':' + e.lineno);
});
window.addEventListener('unhandledrejection', e => {
    console.warn('[scripts.js] unhandled promise rejection:', e.reason);
});

// Single source of truth for section IDs (used by hero terminal, search, keyboard nav)
const section_names = ['home', 'education', 'experiences', 'research-interests', 'publications', 'projects', 'patents', 'awards', 'services'];
const all_section_ids = [...section_names, 'contact'];
// Friendly labels for display (e.g. in search results)
const section_labels = {
    'home': 'Home',
    'education': 'Education',
    'experiences': 'Experiences',
    'research-interests': 'Research',
    'publications': 'Publications',
    'projects': 'Projects',
    'patents': 'Patents',
    'awards': 'Awards',
    'services': 'Services',
    'contact': 'Contact',
};

// rAF throttling helper for scroll handlers
function rafThrottle(fn) {
    let queued = false;
    return function() {
        if (queued) return;
        queued = true;
        requestAnimationFrame(() => { queued = false; fn(); });
    };
}

function scrollToEl(el) {
    const top = el.getBoundingClientRect().top + window.scrollY - 60;
    window.scrollTo({ top, behavior: 'smooth' });
}

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

    let lastDraw = 0;
    let inView = true;
    let rafId = null;
    function loop(now) {
        if (now - lastDraw > 40) { draw(); lastDraw = now; }
        if (inView) rafId = requestAnimationFrame(loop);
    }
    rafId = requestAnimationFrame(loop);

    // Pause rain when canvas scrolls out of viewport (saves CPU/battery)
    const observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            inView = entry.isIntersecting;
            if (inView && rafId === null) {
                rafId = requestAnimationFrame(loop);
            } else if (!inView && rafId !== null) {
                cancelAnimationFrame(rafId);
                rafId = null;
            }
        });
    });
    observer.observe(canvas);
}


function initScrollAnimations() {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (!entry.isIntersecting) return;
            entry.target.classList.add('anim-visible');
            observer.unobserve(entry.target);
        });
    }, { threshold: 0.07 });

    document.querySelectorAll('.term, .featured-paper').forEach(el => {
        el.classList.add('anim-target');
        observer.observe(el);
    });

    // Section header underline animation
    const secObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('in-view');
                secObserver.unobserve(entry.target);
            }
        });
    }, { threshold: 0.1 });
    document.querySelectorAll('section').forEach(el => secObserver.observe(el));

    // Stagger list items within each section
    const liObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (!entry.isIntersecting) return;
            const items = entry.target.querySelectorAll('li');
            items.forEach((li, i) => {
                li.style.transitionDelay = (i * 0.025) + 's';
                li.classList.add('li-visible');
            });
            liObserver.unobserve(entry.target);
        });
    }, { threshold: 0.05 });

    document.querySelectorAll('.main-body').forEach(el => liObserver.observe(el));
}

function showToast(msg) {
    const t = document.createElement('div');
    t.className = 'toast-msg';
    t.textContent = msg;
    document.body.appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 1500);
}

function addCopyButtons() {
    const container = document.getElementById('publications-md');
    if (!container) return;
    container.querySelectorAll('li').forEach(li => {
        const citationText = li.textContent.trim();
        li.style.position = 'relative';
        const btn = document.createElement('button');
        btn.className = 'cite-copy-btn';
        btn.title = 'Copy citation';
        btn.setAttribute('aria-label', 'Copy citation');
        btn.textContent = '⎘';
        btn.addEventListener('click', () => {
            if (!navigator.clipboard) return;
            navigator.clipboard.writeText(citationText).then(() => {
                btn.textContent = '✓';
                btn.classList.add('copied');
                showToast('Citation copied');
                setTimeout(() => {
                    btn.textContent = '⎘';
                    btn.classList.remove('copied');
                }, 1500);
            }).catch(() => {});
        });
        li.appendChild(btn);
    });
}

function addShareButtons() {
    const container = document.getElementById('publications-md');
    if (!container) return;
    container.querySelectorAll('li').forEach(li => {
        // Exclude already-added cite-copy-btn so its '⎘' glyph doesn't end up in shared text
        const liClone = li.cloneNode(true);
        liClone.querySelectorAll('.cite-copy-btn, .share-btns').forEach(b => b.remove());
        const text = liClone.textContent.trim().replace(/\s+/g, ' ').substring(0, 200);
        const link = li.querySelector('a[href]');
        const url = link ? link.href : window.location.href;
        const wrap = document.createElement('span');
        wrap.className = 'share-btns';
        const twBtn = document.createElement('button');
        twBtn.className = 'share-btn';
        twBtn.title = 'Share on X';
        twBtn.setAttribute('aria-label', 'Share on X');
        twBtn.textContent = '𝕏';
        twBtn.addEventListener('click', () => {
            window.open(`https://x.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`, '_blank', 'noopener,width=550,height=420');
        });
        const liBtn = document.createElement('button');
        liBtn.className = 'share-btn';
        liBtn.title = 'Share on LinkedIn';
        liBtn.setAttribute('aria-label', 'Share on LinkedIn');
        liBtn.textContent = 'in';
        liBtn.addEventListener('click', () => {
            window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`, '_blank', 'noopener,width=550,height=420');
        });
        wrap.appendChild(twBtn);
        wrap.appendChild(liBtn);
        li.appendChild(wrap);
    });
}

function initPublicationFilter() {
    const md = document.getElementById('publications-md');
    if (!md) return;
    const termBody = md.querySelector('.term-body');
    if (!termBody) return;

    const children = Array.from(termBody.children);
    const sections = [];
    const hrEls = []; // tracked separately so they can be hidden when filtering
    let cur = null;
    children.forEach(el => {
        if (el.tagName === 'H3') {
            cur = { key: el.textContent.trim().split(' ')[0].toLowerCase(), els: [el] };
            sections.push(cur);
        } else if (el.tagName === 'HR') {
            hrEls.push(el);
        } else if (cur) {
            cur.els.push(el);
        }
    });
    if (!sections.length) return;

    const bar = document.createElement('div');
    bar.className = 'pub-filter-bar';
    function countItems(key) {
        if (key === 'all') return sections.reduce((n, s) => n + s.els.filter(e => e.tagName === 'LI').length, 0);
        const sec = sections.find(s => s.key === key);
        return sec ? sec.els.filter(e => e.tagName === 'LI').length : 0;
    }
    const filters = [
        { key: 'all', label: 'ALL' },
        ...sections.map(s => ({ key: s.key, label: s.key.toUpperCase() }))
    ];
    filters.forEach(f => {
        const btn = document.createElement('button');
        btn.className = 'pub-filter-btn' + (f.key === 'all' ? ' active' : '');
        const count = countItems(f.key);
        btn.textContent = count > 0 ? `${f.label} (${count})` : f.label;
        btn.addEventListener('click', () => {
            bar.querySelectorAll('.pub-filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            sections.forEach(s => {
                const show = f.key === 'all' || s.key === f.key;
                s.els.forEach(el => { el.style.display = show ? '' : 'none'; });
            });
            // Hide separators when filtering to a single section
            hrEls.forEach(el => { el.style.display = f.key === 'all' ? '' : 'none'; });
        });
        bar.appendChild(btn);
    });

    const term = md.querySelector('.term');
    if (term) md.insertBefore(bar, term);
}

function initStatsCounter() {
    // Stats values are pre-rendered in HTML for LCP. No JS animation.
    // (Previously animated 0 → target, but that made the stat-num the LCP
    // element and tanked Performance score. CSS handles any visual flourish.)
}

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

    const allSections = [...section_names, 'contact'];

    const commands = {
        help: () =>
            'available commands:\n' +
            '  help          — show this message\n' +
            '  ls            — list sections\n' +
            '  cd <section>  — navigate to section\n' +
            '  whoami        — who is this?\n' +
            '  cat bio.txt   — research bio\n' +
            '  pwd           — current page\n' +
            '  date          — current date/time\n' +
            '  stats         — publication stats\n' +
            '  contact       — contact info\n' +
            '  grep <word>   — search publications\n' +
            '  cite          — copy first publication to clipboard\n' +
            '  open <url>    — open link\n' +
            '  echo <text>   — print text\n' +
            '  tree          — site structure\n' +
            '  history       — command history\n' +
            '  neofetch      — system info\n' +
            '  skills        — tech stack\n' +
            '  clear         — clear output',
        ls: { rich: true, fn: () => {
            const active = document.querySelector('#mainNav .nav-link.active');
            const activeId = active ? active.getAttribute('href').replace('#', '') : '';
            return allSections.map(s => {
                const id = s === 'home' ? 'page-top' : s;
                return id === activeId
                    ? `  <span class="g">${escapeHtml(s)}/</span> <span class="dim">← here</span>`
                    : `  ${escapeHtml(s)}/`;
            }).join('\n');
        }},
        whoami: () => {
            const titleEl = document.getElementById('page-top-title');
            const subtitleEl = document.getElementById('top-section-bg-text');
            return `${titleEl ? titleEl.textContent : 'Sang Min Lee'}\n${subtitleEl ? subtitleEl.textContent : ''}`;
        },
        'cat bio.txt': () => {
            const paragraphs = document.querySelectorAll('#home-md p');
            for (const p of paragraphs) {
                const text = p.textContent.trim();
                if (text) return text;
            }
            return '';
        },
        pwd: () => window.location.href,
        date: () => new Date().toLocaleString(),
        stats: () => {
            const items = document.querySelectorAll('.stat-item');
            return Array.from(items).map(el => {
                const num = el.querySelector('.stat-num');
                const label = el.querySelector('.stat-label');
                return `  ${num ? num.dataset.target : '?'} ${label ? label.textContent : ''}`;
            }).join('\n');
        },
        contact: () => {
            const cards = document.querySelectorAll('.contact-card');
            return Array.from(cards).map(c => {
                const label = c.querySelector('.contact-label');
                const val = c.querySelector('.contact-val');
                return `  ${label ? label.textContent : ''}: ${val ? val.textContent : ''}`;
            }).join('\n');
        },
        neofetch: () =>
            '  ┌──────────────────────┐\n' +
            '  │  SANG MIN LEE        │\n' +
            '  ├──────────────────────┤\n' +
            '  │  OS:    SNU AI Ph.D. │\n' +
            '  │  Host:  Seoul, Korea │\n' +
            '  │  Shell: portfolio/zsh│\n' +
            '  │  Theme: matrix-dark  │\n' +
            '  │  Uptime: 13y research│\n' +
            '  └──────────────────────┘',
        skills: () =>
            'languages:\n  Python, MATLAB, JavaScript, C\n' +
            'frameworks:\n  PyTorch, TensorFlow, scikit-learn\n' +
            'domains:\n  SHM, Wind Eng, NDT, LLM/RAG',
        history: () => history.length
            ? history.slice(0, 10).map((c, i) => `  ${i + 1}  ${c}`).join('\n')
            : '  (empty)',
        cite: () => {
            const pubs = document.querySelectorAll('#publications-md li');
            if (!pubs.length) return 'No publications found';
            const first = pubs[0].textContent.trim().replace(/\s+/g, ' ').replace(/⎘.*$/, '').replace(/𝕏.*$/, '').trim();
            if (navigator.clipboard) {
                navigator.clipboard.writeText(first).catch(() => {});
            }
            return `Copied first publication to clipboard:\n  ${first.substring(0, 120)}...`;
        },
        tree: () => {
            // Build tree dynamically from current DOM so counts stay in sync
            const count = id => document.querySelectorAll(`#${id}-md li`).length;
            const pubs = document.querySelectorAll('#publications-md h3');
            const pubCounts = {};
            pubs.forEach(h3 => {
                const key = h3.textContent.trim().split(' ')[0].toLowerCase();
                let n = 0, sib = h3.nextElementSibling;
                while (sib && sib.tagName !== 'H3') {
                    if (sib.tagName === 'OL' || sib.tagName === 'UL') n += sib.querySelectorAll('li').length;
                    sib = sib.nextElementSibling;
                }
                pubCounts[key] = n;
            });
            return '.\n' +
                '├── home/\n' +
                '├── education/\n' +
                '├── experiences/\n' +
                '├── research-interests/\n' +
                '├── publications/\n' +
                Object.entries(pubCounts).map(([k, n]) => `│   ├── ${k}/ (${n})\n`).join('').replace(/├──([^├]*)$/, '└──$1') +
                `├── projects/ (${count('projects')})\n` +
                `├── patents/ (${count('patents')})\n` +
                `├── awards/ (${count('awards')})\n` +
                '├── services/\n' +
                '└── contact/';
        },
    };

    const cmdNames = [...Object.keys(commands), 'clear', 'cd', 'grep', 'open', 'echo'];
    const history = [];
    const HISTORY_MAX = 50;
    let histIdx = -1;

    function runCommand(raw) {
        const cmd = raw.trim();
        if (!cmd) return;

        let resultHtml;

        if (cmd === 'clear') {
            output.innerHTML = '';
            return;
        } else if (commands[cmd]) {
            const entry = commands[cmd];
            if (entry && entry.rich) {
                resultHtml = `<span class="g">$</span> ${escapeHtml(cmd)}\n${entry.fn()}`;
            } else {
                const result = typeof entry === 'function' ? entry() : entry;
                resultHtml = `<span class="g">$</span> ${escapeHtml(cmd)}\n${escapeHtml(result)}`;
            }
        } else if (cmd.startsWith('grep ')) {
            const keyword = cmd.slice(5).trim().toLowerCase();
            if (!keyword) {
                resultHtml = `<span class="g">$</span> ${escapeHtml(cmd)}\nUsage: grep &lt;keyword&gt;`;
            } else {
                const pubs = document.querySelectorAll('#publications-md li');
                const matches = Array.from(pubs).filter(li => li.textContent.toLowerCase().includes(keyword));
                const maxShow = 8;
                let out;
                if (!matches.length) {
                    out = `No results for "${keyword}"`;
                } else {
                    out = matches.slice(0, maxShow).map(li => '  ' + li.textContent.trim().replace(/\n/g, ' ').substring(0, 100) + '...').join('\n');
                    if (matches.length > maxShow) out += `\n  ...and ${matches.length - maxShow} more`;
                }
                resultHtml = `<span class="g">$</span> ${escapeHtml(cmd)}\n${escapeHtml(out)}`;
            }
        } else if (cmd.startsWith('open ')) {
            const url = cmd.slice(5).trim();
            if (url.startsWith('http://') || url.startsWith('https://')) {
                window.open(url, '_blank', 'noopener');
                resultHtml = `<span class="g">$</span> ${escapeHtml(cmd)}\nopened ${escapeHtml(url)}`;
            } else {
                resultHtml = `<span class="g">$</span> ${escapeHtml(cmd)}\n<span class="err">open: invalid URL — must start with http(s)://</span>`;
            }
        } else if (cmd.startsWith('echo ')) {
            const text = cmd.slice(5);
            resultHtml = `<span class="g">$</span> ${escapeHtml(cmd)}\n${escapeHtml(text)}`;
        } else if (cmd.startsWith('cd ') || cmd === 'cd') {
            const target = cmd.slice(2).trim().replace(/\/$/, '');
            if (!target) {
                // bare 'cd' → list available targets
                resultHtml = `<span class="g">$</span> ${escapeHtml(cmd)}\nusage: cd &lt;section&gt;\navailable: ${allSections.join(', ')}`;
            } else {
                const el = document.getElementById(target === 'home' ? 'page-top' : target);
                if (el) {
                    scrollToEl(el);
                    resultHtml = `<span class="g">$</span> ${escapeHtml(cmd)}\nnavigating to /${escapeHtml(target)}/`;
                } else {
                    resultHtml = `<span class="g">$</span> ${escapeHtml(cmd)}\n<span class="err">cd: ${escapeHtml(target)}: no such section</span>`;
                }
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
            const val = input.value.trim();
            if (val) {
                history.unshift(val);
                if (history.length > HISTORY_MAX) history.length = HISTORY_MAX;
                histIdx = -1;
            }
            runCommand(input.value);
            input.value = '';
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (histIdx < history.length - 1) { histIdx++; input.value = history[histIdx]; }
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (histIdx > 0) { histIdx--; input.value = history[histIdx]; }
            else { histIdx = -1; input.value = ''; }
        } else if (e.key === 'Tab') {
            e.preventDefault();
            const val = input.value;
            if (!val) return;
            if (val.startsWith('cd ')) {
                const partial = val.slice(3).trim();
                const match = allSections.find(s => s.startsWith(partial));
                if (match) input.value = 'cd ' + match;
            } else {
                const partial = val.trim();
                const match = cmdNames.find(c => c.startsWith(partial));
                if (match) input.value = (match === 'cd' || match === 'grep' || match === 'open') ? match + ' ' : match;
            }
        }
    });

    // Cycle placeholder text
    const hints = ['help', 'ls', 'cat bio.txt', 'cd education', 'whoami', 'grep wind', 'neofetch', 'skills', 'tree'];
    let hintIdx = 0;
    function cyclePlaceholder() {
        const h = hints[hintIdx++ % hints.length];
        let i = 0;
        input.placeholder = '';
        const t = setInterval(() => {
            input.placeholder = h.slice(0, ++i);
            if (i >= h.length) { clearInterval(t); setTimeout(cyclePlaceholder, 2500); }
        }, 60);
    }
    setTimeout(cyclePlaceholder, 3000);
}

// Vanilla ScrollSpy — highlights nav link for the visible section
function initScrollSpy() {
    const navLinks = document.querySelectorAll('#mainNav .nav-link');
    const sectionEls = [];

    navLinks.forEach(link => {
        const id = link.getAttribute('href').replace('#', '');
        const el = document.getElementById(id);
        if (el) {
            sectionEls.push({ el, link });
            link.addEventListener('click', e => {
                e.preventDefault();
                scrollToEl(el);
            });
        }
    });

    function update() {
        const scrollY = window.scrollY + 65;
        let current = sectionEls[0];
        for (const s of sectionEls) {
            if (s.el.offsetTop <= scrollY) current = s;
        }
        navLinks.forEach(l => { l.classList.remove('active'); l.removeAttribute('aria-current'); });
        if (current) { current.link.classList.add('active'); current.link.setAttribute('aria-current', 'true'); }
    }

    window.addEventListener('scroll', rafThrottle(update), { passive: true });
    update();
}

// Vanilla navbar collapse toggle
function initNavbarToggle() {
    const toggler = document.querySelector('.navbar-toggler');
    const collapse = document.getElementById('navbarResponsive');
    if (!toggler || !collapse) return;

    toggler.addEventListener('click', () => {
        collapse.classList.toggle('show');
        toggler.setAttribute('aria-expanded', collapse.classList.contains('show'));
    });

    // Close on nav link click (mobile)
    collapse.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', () => {
            if (collapse.classList.contains('show')) {
                collapse.classList.remove('show');
                toggler.setAttribute('aria-expanded', 'false');
            }
        });
    });
}

function initScrollProgress() {
    const bar = document.querySelector('.scroll-progress');
    const btn = document.querySelector('.back-to-top');
    const nav = document.getElementById('mainNav');
    if (!bar && !btn) return;
    function update() {
        const h = document.documentElement.scrollHeight - window.innerHeight;
        const pct = h > 0 ? (window.scrollY / h) * 100 : 0;
        if (bar) bar.style.width = pct + '%';
        if (btn) btn.classList.toggle('visible', window.scrollY > 400);
        if (nav) nav.classList.toggle('scrolled', window.scrollY > 60);
    }
    window.addEventListener('scroll', rafThrottle(update), { passive: true });
    if (btn) btn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
}

function initKeyboardNav() {
    // home → page-top, others → same id
    const ids = all_section_ids.map(s => s === 'home' ? 'page-top' : s);
    function currentIdx() {
        const y = window.scrollY + 65;
        for (let i = ids.length - 1; i >= 0; i--) {
            const el = document.getElementById(ids[i]);
            if (el && el.offsetTop <= y) return i;
        }
        return 0;
    }
    document.addEventListener('keydown', e => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        if (e.key === '?') {
            e.preventDefault();
            let overlay = document.getElementById('kbd-overlay');
            if (overlay) { overlay.remove(); return; }
            overlay = document.createElement('div');
            overlay.id = 'kbd-overlay';
            overlay.innerHTML =
                '<div class="kbd-box">' +
                '<h3>Keyboard Shortcuts</h3>' +
                '<div><kbd>j</kbd> / <kbd>k</kbd> — next / prev section</div>' +
                '<div><kbd>t</kbd> — toggle theme</div>' +
                '<div><kbd>?</kbd> — this help</div>' +
                '<div><kbd>Esc</kbd> — close</div>' +
                '</div>';
            overlay.addEventListener('click', () => overlay.remove());
            document.body.appendChild(overlay);
            return;
        }
        if (e.key === 'Escape') {
            const overlay = document.getElementById('kbd-overlay');
            if (overlay) overlay.remove();
            return;
        }
        if (e.key === 't') {
            document.querySelector('.theme-toggle')?.click();
            return;
        }
        if (e.key === '/') {
            e.preventDefault();
            document.querySelector('.search-toggle')?.click();
            return;
        }
        if (e.key === 'j') {
            const next = Math.min(currentIdx() + 1, ids.length - 1);
            const el = document.getElementById(ids[next]);
            if (el) scrollToEl(el);
        } else if (e.key === 'k') {
            const prev = Math.max(currentIdx() - 1, 0);
            const el = document.getElementById(ids[prev]);
            if (el) scrollToEl(el);
        }
    });
}

function initContactForm() {
    const form = document.getElementById('contactForm');
    const status = document.getElementById('formStatus');
    if (!form || !status) return;
    form.addEventListener('submit', async e => {
        e.preventDefault();
        status.textContent = 'Sending...';
        status.className = 'form-status';
        try {
            const res = await fetch(form.action, { method: 'POST', body: new FormData(form), headers: { Accept: 'application/json' } });
            if (res.ok) {
                status.textContent = 'Message sent. Thank you!';
                status.className = 'form-status success';
                form.reset();
            } else {
                status.textContent = 'Failed to send. Please try email instead.';
                status.className = 'form-status error';
            }
        } catch {
            status.textContent = 'Network error. Please try email instead.';
            status.className = 'form-status error';
        }
    });
}

function initSearch() {
    const toggle = document.querySelector('.search-toggle');
    const bar = document.getElementById('searchBar');
    const input = document.getElementById('searchInput');
    const results = document.getElementById('searchResults');
    if (!toggle || !bar || !input) return;

    // Build index from canonical section list
    const index = [];
    all_section_ids.forEach(name => {
        const el = document.getElementById(name === 'home' ? 'page-top' : name);
        const md = document.getElementById(name + '-md');
        if (!md) return;
        md.querySelectorAll('li, p').forEach(item => {
            const text = item.textContent.trim();
            if (text.length > 10) index.push({ text, section: name, el: el || md });
        });
    });

    toggle.addEventListener('click', () => {
        bar.classList.toggle('open');
        if (bar.classList.contains('open')) input.focus();
    });

    let searchTimer = null;
    input.addEventListener('input', () => {
        if (searchTimer) clearTimeout(searchTimer);
        searchTimer = setTimeout(() => doSearch(), 120);
    });
    function doSearch() {
        const q = input.value.trim().toLowerCase();
        results.innerHTML = '';
        if (q.length < 2) return;
        const matches = index.filter(i => i.text.toLowerCase().includes(q)).slice(0, 10);
        matches.forEach(m => {
            const div = document.createElement('div');
            div.className = 'search-result-item';
            // Use textContent to avoid HTML injection from publication titles
            const sectionSpan = document.createElement('span');
            sectionSpan.className = 'sr-section';
            sectionSpan.textContent = section_labels[m.section] || m.section;
            const textSpan = document.createElement('span');
            const snippet = m.text.length > 120 ? m.text.substring(0, 120) + '...' : m.text;
            textSpan.textContent = ' ' + snippet;
            div.appendChild(sectionSpan);
            div.appendChild(textSpan);
            div.addEventListener('click', () => {
                bar.classList.remove('open');
                input.value = '';
                results.innerHTML = '';
                scrollToEl(m.el);
            });
            results.appendChild(div);
        });
    }

    input.addEventListener('keydown', e => { if (e.key === 'Escape') { bar.classList.remove('open'); input.value = ''; results.innerHTML = ''; } });
}

function initThemeToggle() {
    const btn = document.querySelector('.theme-toggle');
    if (!btn) return;
    const saved = localStorage.getItem('theme');
    if (saved) {
        document.documentElement.setAttribute('data-theme', saved);
    } else if (window.matchMedia('(prefers-color-scheme: light)').matches) {
        document.documentElement.setAttribute('data-theme', 'light');
    }
    // React to system theme changes (only when user hasn't picked a manual override)
    window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', e => {
        if (localStorage.getItem('theme')) return; // user picked, don't override
        document.documentElement.setAttribute('data-theme', e.matches ? 'light' : 'dark');
        updateIcon();
    });
    function updateIcon() {
        const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
        btn.textContent = isDark ? '\u263D' : '\u2600';
        btn.setAttribute('aria-pressed', isDark ? 'false' : 'true');
        btn.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
    }
    updateIcon();
    btn.addEventListener('click', () => {
        const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
        const next = isDark ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('theme', next);
        updateIcon();
    });
}

window.addEventListener('DOMContentLoaded', () => {
    initMatrixRain();
    initHeroTerminal();
    initScrollSpy();
    initNavbarToggle();
    initScrollAnimations();
    initStatsCounter();
    addCopyButtons();
    addShareButtons();
    initPublicationFilter();
    initScrollProgress();
    initKeyboardNav();
    initThemeToggle();
    initSearch();
    initContactForm();

    // Auto-update copyright year
    const crEl = document.getElementById('copyright-text');
    if (crEl) crEl.innerHTML = crEl.innerHTML.replace(/\d{4}/, new Date().getFullYear());

    // Register service worker for repeat-visit cache + offline fallback
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/sw.js').then(reg => {
                // Notify when a new SW takes over (repeat visit after deploy)
                reg.addEventListener('updatefound', () => {
                    const newSw = reg.installing;
                    if (!newSw) return;
                    newSw.addEventListener('statechange', () => {
                        if (newSw.state === 'installed' && navigator.serviceWorker.controller) {
                            // There's an old controller — this is an update, not first install
                            showToast('New version available — refresh to update');
                        }
                    });
                });
            }).catch(err => {
                console.warn('[sw] registration failed:', err);
            });
        });
    }
});
