

const content_dir = 'contents/'
const config_file = 'config.yml'
const section_names = ['home', 'publications', 'projects', 'patents', 'awards', 'services']


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

window.addEventListener('DOMContentLoaded', event => {
    initMatrixRain();
    initTypingAnimation();

    // Activate Bootstrap scrollspy on the main nav element
    const mainNav = document.body.querySelector('#mainNav');
    if (mainNav) {
        new bootstrap.ScrollSpy(document.body, {
            target: '#mainNav',
            offset: 74,
        });
    };

    // Collapse responsive navbar when toggler is visible
    const navbarToggler = document.body.querySelector('.navbar-toggler');
    const responsiveNavItems = [].slice.call(
        document.querySelectorAll('#navbarResponsive .nav-link')
    );
    responsiveNavItems.map(function (responsiveNavItem) {
        responsiveNavItem.addEventListener('click', () => {
            if (window.getComputedStyle(navbarToggler).display !== 'none') {
                navbarToggler.click();
            }
        });
    });


    // Yaml
    fetch(content_dir + config_file)
        .then(response => response.text())
        .then(text => {
            const yml = jsyaml.load(text);
            Object.keys(yml).forEach(key => {
                try {
                    document.getElementById(key).innerHTML = yml[key];
                } catch {
                    console.log("Unknown id and value: " + key + "," + yml[key].toString())
                }

            })
        })
        .catch(error => console.log(error));


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
    }).catch(error => console.log('Post-load init failed:', error));

});
