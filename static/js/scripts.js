
// Global error handlers - log to console without breaking the page
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
    // CSS html { scroll-behavior: smooth } handles smoothness; scroll-margin-top
    // handles the nav offset. We just delegate to the element's scrollIntoView.
    el.scrollIntoView({ block: 'start' });
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

    document.querySelectorAll('.term').forEach(el => {
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
            '  help          - show this message\n' +
            '  ls            - list sections\n' +
            '  cd <section>  - navigate to section\n' +
            '  clear         - clear output',
        ls: { rich: true, fn: () => {
            return allSections.map(s => `  ${escapeHtml(s)}/`).join('\n');
        }},
    };

    const cmdNames = [...Object.keys(commands), 'clear', 'cd'];
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
            resultHtml = `<span class="g">$</span> ${escapeHtml(cmd)}\n<span class="err">${escapeHtml(cmd)}: command not found - try 'help'</span>`;
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
        } else if (e.key.length === 1) {
            // Reset history index when user starts typing fresh
            histIdx = -1;
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
                if (match) input.value = match === 'cd' ? match + ' ' : match;
            }
        }
    });

    // Cycle placeholder text
    const hints = ['help', 'ls', 'cd education', 'clear'];
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

function initScrollProgress() {
    const bar = document.querySelector('.scroll-progress');
    const btn = document.querySelector('.back-to-top');
    if (!bar && !btn) return;
    function update() {
        const h = document.documentElement.scrollHeight - window.innerHeight;
        const pct = h > 0 ? (window.scrollY / h) * 100 : 0;
        if (bar) bar.style.width = pct + '%';
        if (btn) btn.classList.toggle('visible', window.scrollY > 400);
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
            if (overlay) { overlay.close(); overlay.remove(); return; }
            // Native <dialog> gives focus trap, ::backdrop, and Esc handling for free
            overlay = document.createElement('dialog');
            overlay.id = 'kbd-overlay';
            overlay.setAttribute('aria-label', 'Keyboard shortcuts');
            overlay.innerHTML =
                '<div class="kbd-box">' +
                '<h3>Keyboard Shortcuts</h3>' +
                '<div><kbd>j</kbd> / <kbd>k</kbd> - next / prev section</div>' +
                '<div><kbd>?</kbd> - this help</div>' +
                '<div><kbd>Esc</kbd> - close</div>' +
                '</div>';
            // Close only when clicking the backdrop (the dialog itself), not the inner box
            overlay.addEventListener('click', e => {
                if (e.target === overlay) { overlay.close(); overlay.remove(); }
            });
            // Also clean up the DOM after native Esc/close
            overlay.addEventListener('close', () => overlay.remove());
            document.body.appendChild(overlay);
            overlay.showModal();
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

window.addEventListener('DOMContentLoaded', () => {
    initMatrixRain();
    initHeroTerminal();
    initScrollAnimations();
    addCopyButtons();
    addShareButtons();
    initScrollProgress();
    initKeyboardNav();

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
                            // There's an old controller - this is an update, not first install
                            showToast('New version available - refresh to update');
                        }
                    });
                });
            }).catch(err => {
                console.warn('[sw] registration failed:', err);
            });
        });
    }
});
