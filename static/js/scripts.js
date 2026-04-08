
const section_names = ['home', 'education', 'research-interests', 'publications', 'projects', 'patents', 'awards', 'services'];

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

    setInterval(draw, 40);
}

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

function initPublicationFilter() {
    const md = document.getElementById('publications-md');
    if (!md) return;
    const termBody = md.querySelector('.term-body');
    if (!termBody) return;

    const children = Array.from(termBody.children);
    const sections = [];
    let cur = null;
    children.forEach(el => {
        if (el.tagName === 'H3') {
            cur = { key: el.textContent.trim().split(' ')[0].toLowerCase(), els: [el] };
            sections.push(cur);
        } else if (cur) {
            cur.els.push(el);
        }
    });
    if (!sections.length) return;

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

    const term = md.querySelector('.term');
    if (term) md.insertBefore(bar, term);
}

function initStatsCounter() {
    const bar = document.querySelector('.stats-bar');
    if (!bar) return;
    function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
    const observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            if (!entry.isIntersecting) return;
            entry.target.querySelectorAll('.stat-num').forEach(el => {
                const target = parseInt(el.dataset.target, 10);
                const suffix = el.dataset.suffix || '';
                const duration = 1200;
                const start = performance.now();
                function tick(now) {
                    const elapsed = now - start;
                    const progress = Math.min(elapsed / duration, 1);
                    el.textContent = Math.floor(target * easeOutCubic(progress)) + suffix;
                    if (progress < 1) requestAnimationFrame(tick);
                    else el.textContent = target + suffix;
                }
                requestAnimationFrame(tick);
            });
            observer.unobserve(entry.target);
        });
    }, { threshold: 0.3 });
    observer.observe(bar);
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
            '  clear         — clear output',
        ls: () => {
            const active = document.querySelector('#mainNav .nav-link.active');
            const activeId = active ? active.getAttribute('href').replace('#', '') : '';
            return allSections.map(s => {
                const id = s === 'home' ? 'page-top' : s;
                return id === activeId ? `  ${s}/ ← here` : `  ${s}/`;
            }).join('\n');
        },
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
    };

    const cmdNames = [...Object.keys(commands), 'clear', 'cd', 'grep'];
    const history = [];
    let histIdx = -1;

    function runCommand(raw) {
        const cmd = raw.trim();
        if (!cmd) return;

        let resultHtml;

        if (cmd === 'clear') {
            output.innerHTML = '';
            return;
        } else if (commands[cmd]) {
            const result = typeof commands[cmd] === 'function' ? commands[cmd]() : commands[cmd];
            resultHtml = `<span class="g">$</span> ${escapeHtml(cmd)}\n${escapeHtml(result)}`;
        } else if (cmd.startsWith('grep ')) {
            const keyword = cmd.slice(5).trim().toLowerCase();
            if (!keyword) {
                resultHtml = `<span class="g">$</span> ${escapeHtml(cmd)}\nUsage: grep &lt;keyword&gt;`;
            } else {
                const pubs = document.querySelectorAll('#publications-md li');
                const matches = Array.from(pubs).filter(li => li.textContent.toLowerCase().includes(keyword));
                const out = matches.length
                    ? matches.map(li => '  ' + li.textContent.trim().replace(/\n/g, ' ').substring(0, 100) + '...').join('\n')
                    : `No results for "${escapeHtml(keyword)}"`;
                resultHtml = `<span class="g">$</span> ${escapeHtml(cmd)}\n${escapeHtml(out)}`;
            }
        } else if (cmd.startsWith('cd ')) {
            const target = cmd.slice(3).trim().replace(/\/$/, '');
            const el = document.getElementById(target === 'home' ? 'page-top' : target);
            if (el) {
                scrollToEl(el);
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
            const val = input.value.trim();
            if (val) { history.unshift(val); histIdx = -1; }
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
                if (match) input.value = (match === 'cd' || match === 'grep') ? match + ' ' : match;
            }
        }
    });

    // Cycle placeholder text
    const hints = ['help', 'ls', 'cat bio.txt', 'cd education', 'whoami', 'grep wind', 'neofetch'];
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
        if (el) sectionEls.push({ el, link });
    });

    function update() {
        const scrollY = window.scrollY + 65;
        let current = sectionEls[0];
        for (const s of sectionEls) {
            if (s.el.offsetTop <= scrollY) current = s;
        }
        navLinks.forEach(l => l.classList.remove('active'));
        if (current) current.link.classList.add('active');
    }

    window.addEventListener('scroll', update, { passive: true });
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
    window.addEventListener('scroll', () => {
        const h = document.documentElement.scrollHeight - window.innerHeight;
        const pct = h > 0 ? (window.scrollY / h) * 100 : 0;
        if (bar) bar.style.width = pct + '%';
        if (btn) btn.classList.toggle('visible', window.scrollY > 400);
        if (nav) nav.classList.toggle('scrolled', window.scrollY > 60);
    }, { passive: true });
    if (btn) btn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
}

function initKeyboardNav() {
    const ids = ['page-top', 'education', 'research-interests', 'publications', 'projects', 'patents', 'awards', 'services', 'contact'];
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

window.addEventListener('DOMContentLoaded', () => {
    initMatrixRain();
    initTypingAnimation();
    initHeroTerminal();
    initScrollSpy();
    initNavbarToggle();
    initScrollAnimations();
    initStatsCounter();
    addCopyButtons();
    initPublicationFilter();
    initScrollProgress();
    initKeyboardNav();

    // Auto-update copyright year
    const crEl = document.getElementById('copyright-text');
    if (crEl) crEl.innerHTML = crEl.innerHTML.replace(/\d{4}/, new Date().getFullYear());

    // MathJax — typeset pre-rendered content
    if (typeof MathJax !== 'undefined' && MathJax.typeset) {
        MathJax.typeset();
    }
});
