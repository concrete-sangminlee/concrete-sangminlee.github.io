/* Progressive enhancement only: the page is complete without this file. */
(function () {
    'use strict';

    var $ = function (sel, root) { return (root || document).querySelector(sel); };
    var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
    var root = document.documentElement;
    var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // ---------------------------------------------------------------- toast
    var toastTimer;
    function toast(msg) {
        var el = $('.toast');
        if (!el) {
            el = document.createElement('div');
            el.className = 'toast';
            el.setAttribute('role', 'status');
            document.body.appendChild(el);
        }
        el.textContent = msg;
        requestAnimationFrame(function () { el.classList.add('is-visible'); });
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function () { el.classList.remove('is-visible'); }, 1600);
    }

    function copyText(text) {
        if (navigator.clipboard && window.isSecureContext) {
            return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return legacyCopy(text); });
        }
        return Promise.resolve(legacyCopy(text));
    }
    function legacyCopy(text) {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.cssText = 'position:fixed;top:0;opacity:0';
        document.body.appendChild(ta);
        ta.select();
        var ok = false;
        try { ok = document.execCommand('copy'); } catch (e) { /* ignore */ }
        ta.remove();
        return ok;
    }

    // ---------------------------------------------------------------- theme
    function initTheme() {
        var btn = $('.theme-toggle');
        var media = window.matchMedia('(prefers-color-scheme: dark)');
        function stored() { try { return localStorage.getItem('theme'); } catch (e) { return null; } }
        function apply(t) {
            root.setAttribute('data-theme', t);
            if (btn) btn.setAttribute('aria-label', t === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
        }
        apply(root.getAttribute('data-theme') || (media.matches ? 'dark' : 'light'));
        if (btn) btn.addEventListener('click', function () {
            var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
            apply(next);
            try { localStorage.setItem('theme', next); } catch (e) { /* private mode */ }
        });
        var onChange = function (e) { if (!stored()) apply(e.matches ? 'dark' : 'light'); };
        if (media.addEventListener) media.addEventListener('change', onChange);
        else if (media.addListener) media.addListener(onChange);
    }

    // ---------------------------------------------------------------- header
    function initHeader() {
        var header = $('#site-header');
        var btn = $('.menu-btn');
        var menu = $('#mobile-nav');
        if (!header) return;

        var ticking = false;
        function onScroll() {
            if (ticking) return;
            ticking = true;
            requestAnimationFrame(function () {
                ticking = false;
                header.classList.toggle('is-scrolled', window.scrollY > 4);
                markCurrent();
            });
        }
        window.addEventListener('scroll', onScroll, { passive: true });

        function setMenu(open) {
            if (!menu || !btn) return;
            menu.hidden = !open;
            header.classList.toggle('is-open', open);
            btn.setAttribute('aria-expanded', String(open));
            btn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
        }
        if (btn) btn.addEventListener('click', function () { setMenu(menu.hidden); });
        if (menu) menu.addEventListener('click', function (e) { if (e.target.closest('a')) setMenu(false); });
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && menu && !menu.hidden) { setMenu(false); btn.focus(); }
        });
        window.addEventListener('resize', function () { if (window.innerWidth > 960) setMenu(false); });

        // Scroll-spy: the last nav section whose top has passed 40% of the viewport
        var links = $$('[data-nav]');
        var ids = links.map(function (a) { return a.getAttribute('data-nav'); }).filter(function (v, i, a) { return a.indexOf(v) === i; });
        var sections = ids.map(function (id) { return document.getElementById(id); }).filter(Boolean);
        function markCurrent() {
            var line = window.innerHeight * 0.4;
            var current = null;
            var atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
            if (atBottom) current = sections[sections.length - 1];
            else sections.forEach(function (s) { if (s.getBoundingClientRect().top <= line) current = s; });
            links.forEach(function (a) {
                if (current && a.getAttribute('data-nav') === current.id) a.setAttribute('aria-current', 'true');
                else a.removeAttribute('aria-current');
            });
        }
        onScroll();
    }

    // ---------------------------------------------------------------- publications
    function escapeRe(t) { return t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

    /** Wrap matches of `terms` in <mark> inside el's text nodes. */
    function highlight(el, terms) {
        if (!terms.length) return;
        var re = new RegExp('(' + terms.map(escapeRe).join('|') + ')', 'gi');
        var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
        var nodes = [];
        while (walker.nextNode()) nodes.push(walker.currentNode);
        nodes.forEach(function (node) {
            var text = node.nodeValue;
            re.lastIndex = 0;
            if (!re.test(text)) return;
            var frag = document.createDocumentFragment();
            text.split(re).forEach(function (part, k) {
                if (!part) return;
                if (k % 2 === 1) {
                    var m = document.createElement('mark');
                    m.className = 'hl';
                    m.textContent = part;
                    frag.appendChild(m);
                } else frag.appendChild(document.createTextNode(part));
            });
            node.parentNode.replaceChild(frag, node);
        });
    }

    function initPublications() {
        var groupsEl = $('#pub-groups');
        if (!groupsEl) return;
        var pubs = $$('.pub', groupsEl);
        var groups = $$('.pub-group', groupsEl);
        var tabs = $$('.tab[data-filter]');
        var search = $('#pub-search');
        var state = $('#pub-state');
        var empty = $('#pub-empty');
        var topicNames = {};
        try { topicNames = JSON.parse(state.getAttribute('data-topics') || '{}'); } catch (e) { /* ignore */ }
        var validFilters = tabs.map(function (b) { return b.getAttribute('data-filter'); });

        // Original markup of the fields we highlight, so each search starts clean
        var targets = [];
        pubs.forEach(function (p) {
            $$('.pub-title, .pub-authors, .pub-venue em', p).forEach(function (el) {
                targets.push({ el: el, pub: p, html: el.innerHTML });
            });
        });

        var filter = 'all', topic = null, query = '';

        function syncUrl() {
            if (!window.history || !history.replaceState) return;
            var params = new URLSearchParams(location.search);
            ['type', 'topic', 'q'].forEach(function (k) { params.delete(k); });
            if (filter !== 'all') params.set('type', filter);
            if (topic) params.set('topic', topic);
            if (query) params.set('q', query);
            var qs = params.toString();
            history.replaceState(history.state, '', location.pathname + (qs ? '?' + qs : '') + location.hash);
        }

        function apply(opts) {
            var terms = query.toLowerCase().split(/\s+/).filter(Boolean);
            var shown = 0;
            pubs.forEach(function (p) {
                var type = p.getAttribute('data-type');
                var ok = (filter === 'all' ? type !== 'early' : type === filter) &&
                    (!topic || p.getAttribute('data-topic') === topic) &&
                    terms.every(function (t) { return (p.getAttribute('data-search') || '').indexOf(t) !== -1; });
                p.hidden = !ok;
                if (ok) shown++;
            });
            groups.forEach(function (g) { g.hidden = !g.querySelector('.pub:not([hidden])'); });
            empty.hidden = shown > 0;

            targets.forEach(function (t) {
                t.el.innerHTML = t.html;
                if (terms.length && !t.pub.hidden) highlight(t.el, terms);
            });

            state.textContent = '';
            if (topic || query) {
                var count = document.createElement('span');
                count.textContent = shown + (shown === 1 ? ' paper' : ' papers');
                state.appendChild(count);
            }
            if (topic) state.appendChild(makeToken(topicNames[topic] || topic, function () { setTopic(null); }));
            if (!opts || !opts.silent) syncUrl();
        }

        function makeToken(label, onClear) {
            var t = document.createElement('span');
            t.className = 'token';
            t.appendChild(document.createTextNode(label));
            var b = document.createElement('button');
            b.type = 'button';
            b.setAttribute('aria-label', 'Remove filter: ' + label);
            b.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#i-close"/></svg>';
            b.addEventListener('click', onClear);
            t.appendChild(b);
            return t;
        }

        function setFilter(f, opts) {
            filter = validFilters.indexOf(f) !== -1 ? f : 'all';
            tabs.forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-filter') === filter)); });
            apply(opts);
        }
        function setTopic(t) {
            topic = t && topicNames[t] ? t : null;
            if (topic && filter === 'early') setFilter('all');
            else apply();
        }
        function reset(opts) {
            if (search) search.value = '';
            query = ''; topic = null;
            setFilter('all', opts);
        }

        tabs.forEach(function (b) { b.addEventListener('click', function () { setFilter(b.getAttribute('data-filter')); }); });

        if (search) {
            var timer;
            search.addEventListener('input', function () {
                clearTimeout(timer);
                timer = setTimeout(function () { query = search.value.trim(); apply(); }, 80);
            });
            search.addEventListener('keydown', function (e) {
                if (e.key === 'Escape') { search.value = ''; query = ''; apply(); search.blur(); }
            });
        }

        document.addEventListener('keydown', function (e) {
            if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey || !search) return;
            var t = e.target;
            if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
            e.preventDefault();
            document.getElementById('publications').scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' });
            search.focus({ preventScroll: true });
        });

        document.addEventListener('click', function (e) {
            var a = e.target.closest('a[data-topic]');
            if (a) { setTopic(a.getAttribute('data-topic')); return; }
            if (e.target.closest('[data-reset]')) reset();
        });

        // Permalinks (#bibkey): make sure the target is visible, then scroll to it
        function revealHash() {
            var id = decodeURIComponent(location.hash.slice(1));
            var el = id && document.getElementById(id);
            if (!el || !el.classList.contains('pub')) return;
            if (el.hidden) {
                if (search) search.value = '';
                query = ''; topic = null;
                setFilter(el.getAttribute('data-type') === 'early' ? 'early' : 'all');
            }
            requestAnimationFrame(function () { el.scrollIntoView({ block: 'center' }); });
        }
        window.addEventListener('hashchange', revealHash);

        // Initial state from the URL (?type=journal&topic=ndt&q=impact)
        var params = new URLSearchParams(location.search);
        if (params.get('q') && search) { search.value = params.get('q'); query = search.value.trim(); }
        if (params.get('topic') && topicNames[params.get('topic')]) topic = params.get('topic');
        setFilter(params.get('type') || 'all', { silent: true });
        revealHash();

    }

    // ---------------------------------------------------------------- cite dialog
    function initCite() {
        var dialog = $('#cite-modal');
        var dataEl = $('#bib-data');
        if (!dialog || !dataEl) return;
        var data = {};
        try { data = JSON.parse(dataEl.textContent || '{}'); } catch (e) { return; }
        var pre = $('#cite-bib');
        var sub = $('#cite-sub');
        var copyBtn = $('#cite-copy');
        var fmtBtns = $$('[data-format]', dialog);
        var LABEL = { bib: 'BibTeX', apa: 'APA' };
        var format = 'bib';
        try { if (localStorage.getItem('citeFormat') === 'apa') format = 'apa'; } catch (e) { /* ignore */ }
        var current = null, opener = null;

        function render() {
            if (!current) return;
            pre.textContent = current[format];
            pre.classList.toggle('is-apa', format === 'apa');
            copyBtn.textContent = 'Copy ' + LABEL[format];
            fmtBtns.forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-format') === format)); });
        }

        if (typeof dialog.showModal !== 'function') {
            document.addEventListener('click', function (e) {
                var b = e.target.closest('[data-cite]');
                var entry = b && data[b.getAttribute('data-cite')];
                if (entry) copyText(entry.bib).then(function (ok) { toast(ok ? 'BibTeX copied' : 'Copy failed'); });
            });
            return;
        }

        document.addEventListener('click', function (e) {
            var b = e.target.closest('[data-cite]');
            if (!b) return;
            current = data[b.getAttribute('data-cite')];
            if (!current) return;
            opener = b;
            var item = b.closest('.pub');
            var title = item && $('.pub-title', item);
            sub.textContent = title ? title.textContent : '';
            if (title && title.getAttribute('lang')) sub.setAttribute('lang', title.getAttribute('lang'));
            else sub.removeAttribute('lang');
            render();
            dialog.showModal();
        });
        fmtBtns.forEach(function (b) {
            b.addEventListener('click', function () {
                format = b.getAttribute('data-format');
                try { localStorage.setItem('citeFormat', format); } catch (e) { /* ignore */ }
                render();
            });
        });
        dialog.addEventListener('click', function (e) {
            if (e.target === dialog || e.target.closest('[data-close]')) dialog.close();
        });
        dialog.addEventListener('close', function () { if (opener) opener.focus({ preventScroll: true }); });
        copyBtn.addEventListener('click', function () {
            copyText(pre.textContent).then(function (ok) {
                toast(ok ? LABEL[format] + ' copied' : 'Copy failed. Select the text instead.');
                if (ok) dialog.close();
            });
        });
    }

    // ---------------------------------------------------------------- print
    function initPrint() {
        var opened = [];
        window.addEventListener('beforeprint', function () {
            opened = $$('details.cv-more:not([open])');
            opened.forEach(function (d) { d.open = true; });
        });
        window.addEventListener('afterprint', function () {
            opened.forEach(function (d) { d.open = false; });
            opened = [];
        });
        document.addEventListener('click', function (e) {
            if (e.target.closest('[data-print]')) window.print();
        });
    }

    // ---------------------------------------------------------------- abstracts
    function initAbstracts() {
        document.addEventListener('click', function (e) {
            var b = e.target.closest('[data-abstract]');
            if (!b) return;
            var panel = document.getElementById(b.getAttribute('data-abstract'));
            if (!panel) return;
            var open = !panel.classList.contains('is-open');
            panel.classList.toggle('is-open', open);
            b.setAttribute('aria-expanded', String(open));
        });
    }

    // ---------------------------------------------------------------- misc
    function initCopy() {
        document.addEventListener('click', function (e) {
            var b = e.target.closest('[data-copy]');
            if (!b) return;
            copyText(b.getAttribute('data-copy')).then(function (ok) { toast(ok ? 'Email address copied' : 'Copy failed'); });
        });
    }

    function initMisc() {
        var cr = $('#copyright-text');
        if (cr) cr.innerHTML = cr.innerHTML.replace(/\d{4}/, String(new Date().getFullYear()));

        if ('serviceWorker' in navigator && location.protocol === 'https:') {
            window.addEventListener('load', function () {
                navigator.serviceWorker.register('/sw.js').catch(function (err) { console.warn('[sw]', err); });
            });
        }
    }

    function init() {
        initTheme();
        initHeader();
        initPublications();
        initCite();
        initAbstracts();
        initPrint();
        initCopy();
        initMisc();
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
