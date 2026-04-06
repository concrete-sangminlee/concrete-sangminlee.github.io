
const section_names = ['home', 'education', 'research-interests', 'publications', 'projects', 'patents', 'awards', 'services'];

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

    document.querySelectorAll('.term').forEach(el => {
        el.classList.add('anim-target');
        observer.observe(el);
    });
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
        if (el.tagName === 'H4') {
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
                    if (current >= target) {
                        el.textContent = target;
                        clearInterval(timer);
                    }
                }, stepTime);
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
            '  clear         — clear output',
        ls: () => allSections.map(s => `  ${s}/`).join('\n'),
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
    };

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
        const scrollY = window.scrollY + 80;
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

    // MathJax — typeset pre-rendered content
    if (typeof MathJax !== 'undefined' && MathJax.typeset) {
        MathJax.typeset();
    }
});
