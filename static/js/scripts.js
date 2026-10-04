/* Sang Min Lee — homepage interactions (progressive enhancement only;
   every section is fully readable without this file). */

(function () {
    'use strict';

    const $ = (sel, root = document) => root.querySelector(sel);
    const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
    const root = document.documentElement;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // ------------------------------------------------------------------ toast
    let toastTimer;
    function toast(msg) {
        let el = $('.toast');
        if (!el) {
            el = document.createElement('div');
            el.className = 'toast';
            el.setAttribute('role', 'status');
            document.body.appendChild(el);
        }
        el.textContent = msg;
        requestAnimationFrame(() => el.classList.add('is-visible'));
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => el.classList.remove('is-visible'), 1800);
    }

    async function copyText(text) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (e) {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.setAttribute('readonly', '');
            ta.style.cssText = 'position:fixed;opacity:0';
            document.body.appendChild(ta);
            ta.select();
            let ok = false;
            try { ok = document.execCommand('copy'); } catch (_) { /* ignore */ }
            ta.remove();
            return ok;
        }
    }

    // ------------------------------------------------------------------ theme
    function initTheme() {
        const btn = $('.theme-toggle');
        const media = window.matchMedia('(prefers-color-scheme: dark)');
        const stored = () => { try { return localStorage.getItem('theme'); } catch (e) { return null; } };
        const apply = t => {
            root.setAttribute('data-theme', t);
            if (btn) btn.setAttribute('aria-label', t === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
        };
        apply(root.getAttribute('data-theme') || (media.matches ? 'dark' : 'light'));
        if (btn) btn.addEventListener('click', () => {
            const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
            apply(next);
            try { localStorage.setItem('theme', next); } catch (e) { /* private mode */ }
        });
        // Follow the OS until the visitor makes an explicit choice
        const onChange = e => { if (!stored()) apply(e.matches ? 'dark' : 'light'); };
        if (media.addEventListener) media.addEventListener('change', onChange);
    }

    // ------------------------------------------------------------------ nav
    function initNav() {
        const nav = $('#nav');
        const menuBtn = $('.menu-btn');
        const menu = $('#mobile-menu');
        const toTop = $('.to-top');
        if (!nav) return;

        let ticking = false;
        const onScroll = () => {
            if (ticking) return;
            ticking = true;
            requestAnimationFrame(() => {
                ticking = false;
                const y = window.scrollY;
                nav.classList.toggle('is-scrolled', y > 8);
                if (toTop) toTop.classList.toggle('is-visible', y > 700);
            });
        };
        window.addEventListener('scroll', onScroll, { passive: true });
        onScroll();

        if (toTop) toTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: reducedMotion ? 'auto' : 'smooth' }));

        function setMenu(open) {
            if (!menu || !menuBtn) return;
            menu.hidden = !open;
            nav.classList.toggle('is-open', open);
            menuBtn.setAttribute('aria-expanded', String(open));
            menuBtn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
        }
        if (menuBtn) menuBtn.addEventListener('click', () => setMenu(menu.hidden));
        if (menu) menu.addEventListener('click', e => { if (e.target.closest('a')) setMenu(false); });
        document.addEventListener('keydown', e => { if (e.key === 'Escape' && menu && !menu.hidden) { setMenu(false); menuBtn.focus(); } });
        window.addEventListener('resize', () => { if (window.innerWidth > 1080) setMenu(false); });

        // Scroll-spy: highlight the section currently under the nav
        const links = $$('[data-nav]');
        const sections = [...new Set(links.map(a => a.dataset.nav))].map(id => document.getElementById(id)).filter(Boolean);
        if (!('IntersectionObserver' in window) || !sections.length) return;
        const visible = new Map();
        const mark = () => {
            const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
            const current = atBottom ? sections[sections.length - 1] : sections.find(s => visible.get(s.id));
            links.forEach(a => {
                if (current && a.dataset.nav === current.id) a.setAttribute('aria-current', 'true');
                else a.removeAttribute('aria-current');
            });
        };
        const spy = new IntersectionObserver(entries => {
            entries.forEach(en => visible.set(en.target.id, en.isIntersecting));
            mark();
        }, { rootMargin: '-35% 0px -60% 0px' });
        sections.forEach(s => spy.observe(s));
        window.addEventListener('scroll', () => requestAnimationFrame(mark), { passive: true });
    }

    // ------------------------------------------------------------------ reveal
    function initReveal() {
        const els = $$('.reveal');
        if (reducedMotion || !('IntersectionObserver' in window)) {
            els.forEach(el => el.classList.add('is-in'));
            return;
        }
        const io = new IntersectionObserver(entries => {
            entries.forEach(en => {
                if (!en.isIntersecting) return;
                en.target.classList.add('is-in');
                io.unobserve(en.target);
            });
        }, { rootMargin: '0px 0px -6% 0px', threshold: 0.01 });
        // Stagger siblings that enter together
        els.forEach(el => {
            const sibs = el.parentElement ? Array.from(el.parentElement.children).filter(c => c.classList.contains('reveal')) : [];
            const i = sibs.indexOf(el);
            if (i > 0) el.style.transitionDelay = Math.min(i * 60, 360) + 'ms';
            io.observe(el);
        });
    }

    // ------------------------------------------------------------------ publications
    function initPublications() {
        const list = $('#pub-list');
        if (!list) return;
        const pubs = $$('.pub', list);
        const groups = $$('.pub-year-group', list);
        const buttons = $$('.seg-btn');
        const search = $('#pub-search');
        const status = $('#pub-status');
        const empty = $('#pub-empty');
        let filter = 'all';
        let query = '';

        function apply() {
            const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
            let shown = 0;
            pubs.forEach(p => {
                const typeOk = filter === 'all' ? p.dataset.type !== 'early' : p.dataset.type === filter;
                const text = p.dataset.search || '';
                const ok = typeOk && terms.every(t => text.includes(t));
                p.hidden = !ok;
                if (ok) shown++;
            });
            groups.forEach(g => { g.hidden = !g.querySelector('.pub:not([hidden])'); });
            if (empty) empty.hidden = shown > 0;
            if (status) {
                const label = filter === 'all' ? 'publications' : (buttons.find(b => b.dataset.filter === filter)?.firstChild?.textContent || '').toLowerCase();
                status.textContent = query
                    ? `${shown} result${shown === 1 ? '' : 's'} for “${query}”`
                    : filter === 'all'
                        ? `Showing ${shown} ${label} · early work is under its own tab`
                        : `Showing ${shown} ${label}`;
            }
        }

        function setFilter(f) {
            filter = f;
            buttons.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.filter === f)));
            apply();
        }

        buttons.forEach(b => b.addEventListener('click', () => setFilter(b.dataset.filter)));
        if (search) {
            search.addEventListener('input', () => { query = search.value.trim(); apply(); });
            search.addEventListener('keydown', e => { if (e.key === 'Escape') { search.value = ''; query = ''; apply(); search.blur(); } });
        }
        document.addEventListener('keydown', e => {
            if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
            const t = e.target;
            if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
            if (!search) return;
            e.preventDefault();
            document.getElementById('publications').scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth' });
            search.focus({ preventScroll: true });
        });

        // Hero stats jump straight to a filtered view
        $$('[data-goto-filter]').forEach(a => a.addEventListener('click', () => setFilter(a.dataset.gotoFilter)));

        apply();
    }

    // ------------------------------------------------------------------ cite dialog
    function initCite() {
        const dialog = $('#cite-modal');
        const dataEl = $('#bib-data');
        if (!dialog || !dataEl) return;
        let bib = {};
        try { bib = JSON.parse(dataEl.textContent || '{}'); } catch (e) { return; }
        const pre = $('#cite-bib');
        const sub = $('#cite-sub');
        const copyBtn = $('#cite-copy');
        let opener = null;

        document.addEventListener('click', e => {
            const btn = e.target.closest('[data-cite]');
            if (!btn) return;
            const text = bib[btn.dataset.cite];
            if (!text) return;
            opener = btn;
            const title = btn.closest('.pub')?.querySelector('.pub-title')?.textContent || '';
            pre.textContent = text;
            sub.textContent = title;
            if (typeof dialog.showModal === 'function') dialog.showModal();
            else copyText(text).then(ok => toast(ok ? 'BibTeX copied' : 'Copy failed'));
        });
        dialog.addEventListener('click', e => {
            if (e.target === dialog || e.target.closest('[data-close]')) dialog.close();
        });
        dialog.addEventListener('close', () => { if (opener) opener.focus(); });
        copyBtn.addEventListener('click', async () => {
            const ok = await copyText(pre.textContent);
            toast(ok ? 'BibTeX copied to clipboard' : 'Copy failed — select the text manually');
            if (ok) dialog.close();
        });
    }

    // ------------------------------------------------------------------ misc
    function initMisc() {
        const cr = $('#copyright-text');
        if (cr) cr.innerHTML = cr.innerHTML.replace(/\d{4}/, String(new Date().getFullYear()));

        if ('serviceWorker' in navigator && location.protocol === 'https:') {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('/sw.js').then(reg => {
                    reg.addEventListener('updatefound', () => {
                        const sw = reg.installing;
                        if (!sw) return;
                        sw.addEventListener('statechange', () => {
                            if (sw.state === 'installed' && navigator.serviceWorker.controller) toast('New version available — refresh to update');
                        });
                    });
                }).catch(err => console.warn('[sw] registration failed:', err));
            });
        }
    }

    function init() {
        initTheme();
        initNav();
        initReveal();
        initPublications();
        initCite();
        initMisc();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
