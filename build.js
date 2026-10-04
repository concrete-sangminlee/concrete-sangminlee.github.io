#!/usr/bin/env node
/**
 * Static site builder for concrete-sangminlee.github.io
 *
 *   contents/*.md, config.yml, publications.yml  ──►  dist/index.html (+ assets)
 *
 * Markdown sections are parsed into structured components (timeline, cards,
 * lists). If a file doesn't match the expected shape, it falls back to plain
 * rendered Markdown, so content edits never break the build.
 */

import fs from 'fs';
import path from 'path';
import { marked } from 'marked';
import yaml from 'js-yaml';
import sharp from 'sharp';
import esbuild from 'esbuild';
import { minify as minifyHTML } from 'html-minifier-terser';

const buildStart = Date.now();
const CONTENT_DIR = 'contents';
const DIST_DIR = 'dist';
const SELF = 'Lee, S. M.';

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------
function fail(msg) {
    console.error(`build.js: ${msg}`);
    process.exit(1);
}

function readContent(file, { optional = false } = {}) {
    const p = path.join(CONTENT_DIR, file);
    if (!fs.existsSync(p)) {
        if (optional) return '';
        fail(`missing content file ${p}`);
    }
    return fs.readFileSync(p, 'utf8');
}

function loadYaml(file) {
    try {
        return yaml.load(readContent(file));
    } catch (err) {
        fail(`failed to parse ${path.join(CONTENT_DIR, file)}: ${err.message}`);
    }
}

const esc = s => String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const md = s => marked.parseInline(String(s ?? '')).trim();
const hasHangul = s => /[\u3131-\uD79D]/.test(String(s));
const langAttr = s => (hasHangul(s) ? ' lang="ko"' : '');
const icon = (name, cls = 'icon') => `<svg class="${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const isExternal = url => /^https?:\/\//.test(url);
const linkAttrs = url => (isExternal(url) ? ' target="_blank" rel="noopener noreferrer"' : '');
const pad2 = n => String(n).padStart(2, '0');

/** Split a markdown file into blocks of non-empty lines. */
function mdBlocks(src) {
    return src.replace(/\r/g, '').split(/\n\s*\n/).map(b => b.trim()).filter(Boolean);
}
/** `- item` lines in a block/file. */
function mdListItems(src) {
    return src.replace(/\r/g, '').split('\n').map(l => l.match(/^\s*[-*]\s+(.+)$/)).filter(Boolean).map(m => m[1].trim());
}

// --------------------------------------------------------------------------
// Config
// --------------------------------------------------------------------------
if (!fs.existsSync(CONTENT_DIR)) fail(`content directory not found: ${CONTENT_DIR}/`);
const config = loadYaml('config.yml');
if (!config || typeof config !== 'object') fail('config.yml is empty or not an object');
const REQUIRED = ['title', 'name', 'role', 'tagline', 'description', 'copyright-text'];
const missing = REQUIRED.filter(k => typeof config[k] !== 'string');
if (missing.length) fail(`config.yml missing required string keys: ${missing.join(', ')}`);

// --------------------------------------------------------------------------
// Publications
// --------------------------------------------------------------------------
const PUB_TYPES = {
    journal: { label: 'Journal', plural: 'Journal articles', bib: 'article' },
    conference: { label: 'Conference', plural: 'Conference papers', bib: 'inproceedings' },
    thesis: { label: 'Thesis', plural: 'Theses', bib: 'thesis' },
    early: { label: 'Early work', plural: 'Early work', bib: 'misc' },
};

const pubs = loadYaml('publications.yml');
if (!Array.isArray(pubs)) fail('publications.yml must be a list');
pubs.forEach((p, i) => {
    for (const k of ['type', 'year', 'authors', 'title']) {
        if (p[k] === undefined || p[k] === null || p[k] === '') fail(`publications.yml entry #${i + 1} is missing "${k}"`);
    }
    if (!PUB_TYPES[p.type]) fail(`publications.yml entry #${i + 1} has unknown type "${p.type}"`);
    p.year = Number(p.year);
    p.index = i;
});

/** "Lee, S. M., Hong, J., & Kang, T. H.-K." -> ["Lee, S. M.", "Hong, J.", "Kang, T. H.-K."] */
function splitAuthors(str) {
    return String(str).split(/,\s*(?:&\s*)?(?=[A-Z][A-Za-z'\-]+,\s)/).map(s => s.replace(/^&\s*/, '').trim()).filter(Boolean);
}

function renderAuthors(str) {
    const list = splitAuthors(str).map(a => (a === SELF ? `<strong class="me">${esc(a)}</strong>` : esc(a)));
    if (list.length <= 1) return list.join('');
    return list.slice(0, -1).join(', ') + ', &amp; ' + list[list.length - 1];
}

// --- BibTeX: curated entries from publications.bib + generated for the rest
const bibSrcPath = path.join(CONTENT_DIR, 'publications.bib');
const curatedBib = fs.existsSync(bibSrcPath) ? fs.readFileSync(bibSrcPath, 'utf8') : '';
const bibByKey = {};
for (const m of curatedBib.matchAll(/@\w+\{([^,\s]+),[\s\S]*?\n\}/g)) bibByKey[m[1]] = m[0].trim();

function bibAuthor(a) {
    // APA "Lee, S. M." is already "Last, First" for BibTeX
    return a;
}
function parseDetails(d) {
    if (!d) return {};
    const m = String(d).match(/^(\d+)\((\d+)\)(?:,\s*(.+))?$/);
    if (m) return { volume: m[1], number: m[2], pages: m[3] ? m[3].replace(/-/g, '--') : undefined };
    return { address: String(d) };
}
const usedKeys = new Set(Object.keys(bibByKey));
function makeKey(p) {
    const first = splitAuthors(p.authors)[0] || 'anon';
    const surname = first.split(',')[0].toLowerCase().replace(/[^a-z]/g, '') || 'anon';
    const word = (String(p.title).match(/[A-Za-z]{4,}/g) || [])
        .map(w => w.toLowerCase())
        .find(w => !['with', 'from', 'using', 'based', 'study', 'toward', 'towards'].includes(w));
    let key = `${surname}${p.year}${word || ''}`;
    let n = 2;
    while (usedKeys.has(key)) key = `${surname}${p.year}${word || ''}${String.fromCharCode(96 + n++)}`;
    usedKeys.add(key);
    return key;
}
function generateBib(p) {
    const t = PUB_TYPES[p.type].bib;
    const d = parseDetails(p.details);
    let type = t;
    const fields = [
        ['author', splitAuthors(p.authors).map(bibAuthor).join(' and ')],
        ['title', `{${p.title}}`],
    ];
    if (t === 'article') fields.push(['journal', p.venue]);
    else if (t === 'inproceedings') fields.push(['booktitle', p.venue]);
    else if (t === 'thesis') {
        type = /master/i.test(p.note || '') ? 'mastersthesis' : 'misc';
        fields.push([type === 'mastersthesis' ? 'school' : 'howpublished', p.venue]);
        if (type === 'misc' && p.note) fields.push(['note', p.note]);
    } else {
        fields.push(['howpublished', p.venue]);
        if (p.note) fields.push(['note', p.note]);
    }
    for (const k of ['volume', 'number', 'pages', 'address']) if (d[k]) fields.push([k, d[k]]);
    fields.push(['year', String(p.year)]);
    if (p.links && p.links.doi) fields.push(['doi', p.links.doi]);
    if (p.links && p.links.paper) fields.push(['url', p.links.paper]);
    const key = makeKey(p);
    const w = Math.max(...fields.map(f => f[0].length));
    const texEsc = v => (k => (k === 'url' || k === 'doi' ? v : v.replace(/(^|[^\\])([&%#])/g, '$1\\$2')));
    const body = fields.filter(f => f[1]).map(([k, v]) => `  ${k.padEnd(w)} = {${texEsc(v)(k)}}`).join(',\n');
    return { key, text: `@${type}{${key},\n${body}\n}` };
}

const bibData = {};
const generatedBib = [];
for (const p of pubs) {
    if (p.bib && bibByKey[p.bib]) {
        p.bibKey = p.bib;
        bibData[p.bib] = bibByKey[p.bib];
    } else {
        if (p.bib) console.warn(`build.js: bib key "${p.bib}" not found in publications.bib — generating one`);
        const g = generateBib(p);
        p.bibKey = g.key;
        bibData[g.key] = g.text;
        generatedBib.push(g.text);
    }
}

// --- Counts
const counts = Object.fromEntries(Object.keys(PUB_TYPES).map(t => [t, pubs.filter(p => p.type === t).length]));

// --- HTML
const LINK_LABELS = { paper: 'Paper', doi: 'DOI', pdf: 'PDF', code: 'Code', slides: 'Slides', poster: 'Poster', video: 'Video' };
function renderPub(p) {
    const T = PUB_TYPES[p.type];
    const venueBits = [];
    if (p.venue) venueBits.push(`<em${langAttr(p.venue)}>${esc(p.venue)}</em>`);
    if (p.details) venueBits.push(`<span>${esc(p.details)}</span>`);
    if (p.note) venueBits.push(`<span class="pub-note">${esc(p.note)}</span>`);

    const actions = [];
    for (const [k, url] of Object.entries(p.links || {})) {
        const href = k === 'doi' && !isExternal(url) ? `https://doi.org/${url}` : url;
        actions.push(`<a class="pub-link" href="${esc(href)}" target="_blank" rel="noopener noreferrer">${icon(k === 'code' ? 'github' : 'file')}${esc(LINK_LABELS[k] || k)}</a>`);
    }
    actions.push(`<button class="pub-link js-only" type="button" data-cite="${esc(p.bibKey)}" aria-label="Cite: ${esc(p.title)}">${icon('braces')}Cite</button>`);

    const search = [p.title, p.authors, p.venue, p.details, p.note, p.year].filter(Boolean).join(' ').toLowerCase();
    return `<article class="pub" data-type="${p.type}" data-search="${esc(search)}">
        <div class="pub-main">
            <h4 class="pub-title"${langAttr(p.title)}>${esc(p.title)}</h4>
            <p class="pub-authors">${renderAuthors(p.authors)}</p>
            <p class="pub-venue"><span class="badge badge-${p.type}">${T.label}</span>${venueBits.join('')}</p>
        </div>
        <div class="pub-actions">${actions.join('')}</div>
    </article>`;
}

function renderPublications() {
    const typeOrder = Object.keys(PUB_TYPES);
    const sorted = [...pubs].sort((a, b) => b.year - a.year || typeOrder.indexOf(a.type) - typeOrder.indexOf(b.type) || a.index - b.index);
    const years = [...new Set(sorted.map(p => p.year))];
    const groups = years.map(y => `<div class="pub-year-group" data-year="${y}">
        <h3 class="pub-year"><time datetime="${y}">${y}</time></h3>
        <div class="pub-items">${sorted.filter(p => p.year === y).map(renderPub).join('')}</div>
    </div>`).join('');

    const nonEarly = pubs.length - counts.early;
    const segs = [
        ['all', 'All', nonEarly],
        ...typeOrder.map(t => [t, PUB_TYPES[t].plural.replace(' articles', 's').replace(' papers', 's'), counts[t]]),
    ].filter(s => s[2] > 0);
    const seg = segs.map(([k, label, n], i) =>
        `<button class="seg-btn" type="button" data-filter="${k}" aria-pressed="${i === 0}">${esc(label)}<span class="seg-count">${n}</span></button>`
    ).join('');

    return `<div class="pub-toolbar js-only" role="search">
            <div class="seg" role="group" aria-label="Filter by type">${seg}</div>
            <label class="search">
                <span class="sr-only">Search publications</span>
                ${icon('search')}
                <input type="search" id="pub-search" placeholder="Search title, venue, author…" autocomplete="off" spellcheck="false">
                <kbd aria-hidden="true">/</kbd>
            </label>
        </div>
        <p class="pub-status js-only" id="pub-status" aria-live="polite"></p>
        <div class="pub-list" id="pub-list">${groups}</div>
        <p class="pub-empty" id="pub-empty" hidden>No publications match your search.</p>
        <div class="pub-footer">
            <a class="btn btn-sm" href="publications.bib" download>${icon('download')}Download BibTeX</a>
            ${config.scholar?.url ? `<a class="btn btn-sm" href="${esc(config.scholar.url)}" target="_blank" rel="noopener noreferrer">${icon('scholar')}Google Scholar${icon('arrow-ur')}</a>` : ''}
        </div>`;
}

// JSON-LD for scholarly works (journals + conference papers)
function pubsJsonLd() {
    const graph = pubs.filter(p => p.type === 'journal' || p.type === 'conference').map(p => {
        const bib = bibByKey[p.bib] || '';
        const doi = (bib.match(/doi\s*=\s*\{([^}]+)\}/) || [])[1] || p.links?.doi;
        const authors = splitAuthors(p.authors).map(a => {
            const [last, first] = a.split(',').map(s => s.trim());
            return { '@type': 'Person', name: first ? `${first} ${last}` : last };
        });
        const d = parseDetails(p.details);
        const o = {
            '@type': 'ScholarlyArticle',
            headline: p.title,
            author: authors,
            datePublished: String(p.year),
            isPartOf: p.venue ? { '@type': p.type === 'journal' ? 'Periodical' : 'Event', name: p.venue, ...(d.volume && { volumeNumber: d.volume }), ...(d.number && { issueNumber: d.number }) } : undefined,
            inLanguage: hasHangul(p.title) ? 'ko' : 'en',
        };
        if (doi) {
            o.identifier = { '@type': 'PropertyValue', propertyID: 'DOI', value: doi };
            o.sameAs = `https://doi.org/${doi}`;
        } else if (p.links?.paper) o.sameAs = p.links.paper;
        Object.keys(o).forEach(k => o[k] === undefined && delete o[k]);
        return o;
    });
    return JSON.stringify({ '@context': 'https://schema.org', '@graph': graph });
}

// --------------------------------------------------------------------------
// Markdown sections → components
// --------------------------------------------------------------------------
const fallback = src => `<div class="prose">${marked.parse(src)}</div>`;

/** Blocks of: **Title** [date]\n- org\n- detail… */
function renderTimeline(src) {
    const items = [];
    for (const block of mdBlocks(src)) {
        const lines = block.split('\n');
        const head = lines[0].match(/^\*\*(.+?)\*\*\s*\[(.+?)\]\s*$/);
        if (!head) continue;
        const bullets = mdListItems(lines.slice(1).join('\n'));
        items.push({ title: head[1], date: head[2], org: bullets[0], details: bullets.slice(1) });
    }
    if (!items.length) return fallback(src);
    const nowYear = new Date().getFullYear();
    return `<ol class="timeline">${items.map(it => {
        const expected = /expected|present|current/i.test(it.date);
        const endYear = Math.max(...(it.date.match(/\d{4}/g) || [0]).map(Number));
        const current = expected || endYear > nowYear;
        const date = it.date
            .replace(/\((?:expected|present)\)/i, '')
            .replace(/(\d{4})\.(\d{2})\./g, '$1.$2')
            .replace(/\s*-\s*/, ' — ')
            .trim();
        const details = it.details.map(d => {
            const kv = d.match(/^([A-Z][A-Za-z ]{2,24}):\s+(.+)$/);
            return kv
                ? `<li${langAttr(d)}><span class="tl-k">${esc(kv[1])}:</span> ${md(kv[2])}</li>`
                : `<li${langAttr(d)}>${md(d)}</li>`;
        }).join('');
        return `<li class="tl-item reveal${current ? ' is-current' : ''}">
            <div class="tl-date">${esc(date)}${expected ? '<br><span class="tl-badge">In progress</span>' : ''}</div>
            <div class="tl-body">
                <h3 class="tl-title">${md(it.title)}</h3>
                ${it.org ? `<p class="tl-org"${langAttr(it.org)}>${md(it.org)}</p>` : ''}
                ${details ? `<ul class="tl-details">${details}</ul>` : ''}
            </div>
        </li>`;
    }).join('')}</ol>`;
}

/** - **Name** (2021-2027) - Funder */
function renderProjects(src) {
    const items = mdListItems(src).map(l => l.match(/^\*\*(.+?)\*\*\s*\(([^)]+)\)\s*[-–—]\s*(.+)$/)).filter(Boolean);
    if (!items.length) return fallback(src);
    return `<div class="card-grid">${items.map(([, name, period, funder]) => `<article class="card reveal">
        <div class="card-top"><span class="card-icon">${icon('layers')}</span><span class="mono-label">${esc(period.replace('-', ' — '))}</span></div>
        <h3 class="card-title">${md(name)}</h3>
        <p class="card-foot">${md(funder)}</p>
    </article>`).join('')}</div>`;
}

/** - **Lee, S. M.**, & Kang, T. H.-K. (2023). Title. *KR Patent 1,2,3*. */
function renderPatents(src) {
    const items = mdListItems(src).map(l => l.match(/^(.+?)\s*\((\d{4})\)\.\s*(.+?)\.\s*\*(.+?)\*\.?$/)).filter(Boolean);
    if (!items.length) return fallback(src);
    return `<div class="card-grid">${items.map(([, authors, year, title, number]) => `<article class="card reveal">
        <div class="card-top"><span class="card-icon">${icon('bulb')}</span><span class="mono-label"><time datetime="${year}">${year}</time> · Registered</span></div>
        <h3 class="card-title">${esc(title)}</h3>
        <p class="card-sub">${renderAuthors(authors.replace(/\*\*/g, ''))}</p>
        <p class="card-foot"><span class="patent-no">${esc(number)}</span></p>
    </article>`).join('')}</div>`;
}

/** - **Award name (Korean)** - 2025, 2026 */
function renderAwards(src) {
    const items = mdListItems(src).map(l => l.match(/^\*\*(.+?)\*\*\s*[-–—]\s*(.+)$/)).filter(Boolean);
    if (!items.length) return fallback(src);
    return `<ul class="award-list reveal">${items.map(([, name, years]) => {
        const sub = name.match(/^(.*?)\s*\(([^)]+)\)$/);
        const title = sub ? sub[1] : name;
        return `<li class="award">
            <span class="card-icon">${icon('award')}</span>
            <span class="award-name">${esc(title)}${sub ? `<span class="award-sub"${langAttr(sub[2])}>${esc(sub[2])}</span>` : ''}</span>
            <span class="award-years">${esc(years).replace(/(\d{4})/g, '<time datetime="$1">$1</time>')}</span>
        </li>`;
    }).join('')}</ul>`;
}

/** ### Memberships\n- ABBR (Full name)\n---\n### Conference Organization\n- **Name** (2025) - Role */
function renderServices(src) {
    const parts = src.split(/^###\s+/m).map(s => s.trim()).filter(Boolean);
    const out = [];
    for (const part of parts) {
        const [heading, ...rest] = part.split('\n');
        const body = rest.join('\n').replace(/^-{3,}\s*$/m, '');
        const items = mdListItems(body);
        if (/member/i.test(heading)) {
            out.push(`<div><h3 class="sub-head">${esc(heading)}</h3><ul class="member-list">${items.map(i => {
                const m = i.match(/^([A-Z][A-Za-z&]+)\s*\((.+)\)$/);
                return m
                    ? `<li class="member reveal"><span class="member-abbr">${esc(m[1])}</span><span class="member-name">${esc(m[2])}</span></li>`
                    : `<li class="member reveal"><span class="member-name">${md(i)}</span></li>`;
            }).join('')}</ul></div>`);
        } else {
            out.push(`<div><h3 class="sub-head">${esc(heading)}</h3>${items.map(i => {
                const m = i.match(/^\*\*(.+?)\*\*\s*\(([^)]+)\)\s*[-–—]\s*(.+)$/);
                return m
                    ? `<div class="service-item reveal"><strong>${esc(m[1])}</strong><span class="mono-label"><time datetime="${esc(m[2])}">${esc(m[2])}</time></span><span>${md(m[3])}</span></div>`
                    : `<div class="service-item reveal"><span>${md(i)}</span></div>`;
            }).join('')}</div>`);
        }
    }
    return out.length ? `<div class="service-grid">${out.join('')}</div>` : fallback(src);
}

const CONTACT_ICONS = { EM: 'mail', GH: 'github', GS: 'scholar', ID: 'orcid', BL: 'pen', TM: 'sparkles' };
function renderContact() {
    const cards = (config.contact || []).map(c => `<a class="contact-card reveal" href="${esc(c.url)}"${linkAttrs(c.url)}>
            <span class="card-icon">${icon(CONTACT_ICONS[c.code] || 'arrow-ur')}</span>
            <span><span class="contact-label">${esc(c.label)}</span><span class="contact-val">${esc(c.value)}</span></span>
            ${icon('arrow-ur', 'icon contact-arrow')}
        </a>`).join('');
    return `<address class="contact-grid">${cards}</address>`;
}

// --------------------------------------------------------------------------
// Hero
// --------------------------------------------------------------------------
const interests = mdListItems(readContent('research-interests.md'));
const contactBy = code => (config.contact || []).find(c => c.code === code);

function renderHero() {
    const email = contactBy('EM');
    const scholar = contactBy('GS');
    const github = contactBy('GH');
    const facts = (config.profile || []).map(f => `<div class="fact">
            <dt>${icon(f.icon || 'pin')}<span class="sr-only">${esc(f.sub || '')}</span></dt>
            <dd>${esc(f.label)}${f.sub ? `<span>${esc(f.sub)}</span>` : ''}</dd>
        </div>`).join('');
    const quick = ['EM', 'GS', 'ID', 'GH', 'BL'].map(contactBy).filter(Boolean).map(c =>
        `<a class="icon-btn" href="${esc(c.url)}"${linkAttrs(c.url)} aria-label="${esc(c.label)}" title="${esc(c.label)}">${icon(CONTACT_ICONS[c.code])}</a>`
    ).join('');

    const sch = config.scholar || {};
    const stats = [
        { n: counts.journal, label: 'Journal articles', href: '#publications', filter: 'journal' },
        { n: counts.conference, label: 'Conference papers', href: '#publications', filter: 'conference' },
        { n: (readContent('patents.md').match(/^\s*[-*]\s+/gm) || []).length, label: 'Registered patents', href: '#patents' },
        sch.citations !== undefined && { n: sch.citations, label: 'Citations', small: `h-index ${sch['h-index'] ?? '–'} · Google Scholar`, href: sch.url, external: true },
    ].filter(Boolean);

    return `<section class="hero" aria-labelledby="hero-name">
        <div class="wrap">
            <div class="hero-grid">
                <div class="hero-copy">
                    <p class="eyebrow reveal"><span class="pulse" aria-hidden="true"></span>${esc(config.role)}</p>
                    <h1 class="hero-name reveal" id="hero-name">${esc(config.name)}${config['name-ko'] ? `<span class="hero-name-ko" lang="ko">${esc(config['name-ko'])}</span>` : ''}</h1>
                    <p class="hero-tagline reveal">${md(config.tagline)}</p>
                    <div class="hero-bio reveal">${marked.parse(readContent('home.md'))}</div>
                    ${interests.length ? `<ul class="chips reveal" aria-label="Research interests">${interests.map(i => `<li class="chip">${esc(i)}</li>`).join('')}</ul>` : ''}
                    <div class="hero-cta reveal">
                        ${email ? `<a class="btn btn-primary" href="${esc(email.url)}">${icon('mail')}Get in touch</a>` : ''}
                        <a class="btn" href="#publications">${icon('file')}Publications</a>
                        ${scholar ? `<a class="btn" href="${esc(scholar.url)}"${linkAttrs(scholar.url)}>${icon('scholar')}Scholar</a>` : ''}
                        ${github ? `<a class="btn" href="${esc(github.url)}"${linkAttrs(github.url)}>${icon('github')}GitHub</a>` : ''}
                    </div>
                </div>
                <aside class="profile-card reveal" aria-label="Profile">
                    <div class="portrait">
                        <picture>
                            <source srcset="static/assets/img/photo.webp" type="image/webp">
                            <img src="static/assets/img/photo.jfif" alt="Portrait of ${esc(config.name)}" width="200" height="200" loading="eager" fetchpriority="high" decoding="async">
                        </picture>
                    </div>
                    <dl class="facts">${facts}</dl>
                    <div class="profile-links">${quick}</div>
                </aside>
            </div>
            <div class="stats reveal">${stats.map(s => {
                const tag = s.href ? 'a' : 'div';
                const attrs = s.href ? ` href="${esc(s.href)}"${s.external ? ' target="_blank" rel="noopener noreferrer"' : ''}${s.filter ? ` data-goto-filter="${s.filter}"` : ''}` : '';
                return `<${tag} class="stat"${attrs}><span class="stat-n">${s.n}</span><span class="stat-l">${esc(s.label)}${s.small ? `<small>${esc(s.small)}</small>` : ''}</span></${tag}>`;
            }).join('')}</div>
        </div>
    </section>`;
}

// --------------------------------------------------------------------------
// Sections
// --------------------------------------------------------------------------
const scholarLink = config.scholar?.url ? ` <a href="${esc(config.scholar.url)}" target="_blank" rel="noopener noreferrer">Google Scholar</a>` : '';
const SECTIONS = [
    { id: 'education', nav: 'Education', title: 'Education', render: () => renderTimeline(readContent('education.md')) },
    { id: 'experience', nav: 'Experience', title: 'Experience', render: () => renderTimeline(readContent('experiences.md')) },
    {
        id: 'publications', nav: 'Publications', title: 'Publications', render: renderPublications,
        desc: `${counts.journal} journal articles and ${counts.conference} conference papers on machine learning for concrete, wind, and structural engineering. Also on${scholarLink}.`,
    },
    { id: 'projects', nav: 'Projects', title: 'Research Projects', render: () => renderProjects(readContent('projects.md')), desc: 'Funded research programs I have contributed to.' },
    { id: 'patents', nav: 'Patents', title: 'Patents', render: () => renderPatents(readContent('patents.md')) },
    { id: 'awards', nav: 'Awards', title: 'Awards &amp; Honors', render: () => renderAwards(readContent('awards.md')) },
    { id: 'service', nav: 'Service', title: 'Service', render: () => renderServices(readContent('services.md')), desc: 'Professional memberships and academic service.' },
    { id: 'contact', nav: 'Contact', title: 'Contact', render: renderContact, desc: 'Happy to talk about research collaborations, AI for infrastructure, or anything on this page.' },
];

const sectionsHtml = SECTIONS.map((s, i) => `<section class="section" id="${s.id}" aria-labelledby="${s.id}-title">
        <div class="wrap section-grid">
            <header class="section-head reveal">
                <span class="section-num">${pad2(i + 1)}</span>
                <h2 class="section-title" id="${s.id}-title">${s.title}</h2>
                ${s.desc ? `<p class="section-desc">${s.desc}</p>` : ''}
            </header>
            <div class="section-body">${s.render()}</div>
        </div>
    </section>`).join('\n');

const navHtml = SECTIONS.map(s => `<li><a href="#${s.id}" data-nav="${s.id}">${esc(s.nav)}</a></li>`).join('');

// --------------------------------------------------------------------------
// Assemble
// --------------------------------------------------------------------------
const now = new Date();
const buildDate = now.toISOString().slice(0, 10);
const buildDateLabel = now.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });

let output = fs.readFileSync('index.html', 'utf8');
const slot = (name, html) => { output = output.split(`<!-- @SLOT:${name} -->`).join(html); };
slot('nav', navHtml);
slot('hero', renderHero());
slot('sections', sectionsHtml);

const vars = { ...config, 'build-date': buildDate, 'build-date-label': buildDateLabel };
output = output.replace(/\{\{([\w-]+)\}\}/g, (m, k) => {
    if (typeof vars[k] !== 'string') fail(`index.html references unknown placeholder {{${k}}}`);
    // copyright-text may contain entities on purpose; everything else is escaped
    return k === 'copyright-text' ? vars[k] : esc(vars[k]);
});

output = output.replace(
    /<script type="application\/ld\+json" id="json-ld-articles">.*?<\/script>/,
    () => `<script type="application/ld+json" id="json-ld-articles">${pubsJsonLd()}</script>`
);
output = output.replace(
    '<script type="application/json" id="bib-data">{}</script>',
    () => `<script type="application/json" id="bib-data">${JSON.stringify(bibData).replace(/</g, '\\u003c')}</script>`
);

// Inline CSS (removes one render-blocking request)
{
    const rawCss = fs.readFileSync('static/css/main.css', 'utf8');
    const css = (await esbuild.transform(rawCss, { loader: 'css', minify: true })).code;
    const re = /\s*<!-- INLINE_CSS_HERE:[\s\S]*?-->\s*<link rel="stylesheet" href="static\/css\/main\.css" \/>/;
    if (!re.test(output)) fail('INLINE_CSS_HERE marker not found in index.html');
    output = output.replace(re, () => `\n<style>${css}</style>`);
}

output = await minifyHTML(output, {
    collapseWhitespace: true,
    conservativeCollapse: false,
    removeComments: true,
    removeRedundantAttributes: true,
    removeEmptyAttributes: true,
    minifyCSS: true,
    minifyJS: true,
    collapseBooleanAttributes: true,
    removeScriptTypeAttributes: true,
    removeStyleLinkTypeAttributes: true,
});

fs.rmSync(DIST_DIR, { recursive: true, force: true });
fs.mkdirSync(DIST_DIR, { recursive: true });
fs.writeFileSync(path.join(DIST_DIR, 'index.html'), output);

// --------------------------------------------------------------------------
// Assets
// --------------------------------------------------------------------------
function copyRecursive(src, dest) {
    if (!fs.existsSync(src)) return;
    if (fs.statSync(src).isDirectory()) {
        fs.mkdirSync(dest, { recursive: true });
        for (const entry of fs.readdirSync(src)) {
            if (entry === '.DS_Store') continue;
            copyRecursive(path.join(src, entry), path.join(dest, entry));
        }
    } else {
        fs.copyFileSync(src, dest);
    }
}
copyRecursive('static', path.join(DIST_DIR, 'static'));

const photoSrc = path.join(DIST_DIR, 'static/assets/img/photo.jfif');
await sharp(photoSrc).webp({ quality: 82 }).toFile(path.join(DIST_DIR, 'static/assets/img/photo.webp'));

const faviconPath = path.join(DIST_DIR, 'static/assets/favicon-32.png');
await sharp(faviconPath).png({ compressionLevel: 9 }).toFile(faviconPath + '.tmp');
fs.renameSync(faviconPath + '.tmp', faviconPath);

await Promise.all([
    { size: 192, name: 'icon-192.png' },
    { size: 512, name: 'icon-512.png' },
    { size: 180, name: 'apple-touch-icon.png' },
].map(({ size, name }) => sharp(photoSrc)
    .resize(size, size, { kernel: sharp.kernel.lanczos3 })
    .png({ compressionLevel: 9, palette: true, quality: 80 })
    .toFile(path.join(DIST_DIR, 'static/assets', name))));

// CSS is inlined; drop the standalone file
fs.rmSync(path.join(DIST_DIR, 'static/css'), { recursive: true, force: true });

{
    const jsPath = path.join(DIST_DIR, 'static/js/scripts.js');
    const result = await esbuild.transform(fs.readFileSync(jsPath, 'utf8'), { loader: 'js', minify: true, target: 'es2019' });
    fs.writeFileSync(jsPath, result.code);
}

for (const f of ['robots.txt', '404.html', 'manifest.json']) {
    if (fs.existsSync(f)) fs.copyFileSync(f, path.join(DIST_DIR, f));
}

// Standalone static apps published under stable subpaths
copyRecursive('apps/sequence-arena', path.join(DIST_DIR, 'sequence-arena'));

if (fs.existsSync('sitemap.xml')) {
    const sitemap = fs.readFileSync('sitemap.xml', 'utf8').replace(/<lastmod>[^<]*<\/lastmod>/g, `<lastmod>${buildDate}</lastmod>`);
    fs.writeFileSync(path.join(DIST_DIR, 'sitemap.xml'), sitemap);
}

// Service worker: versioned cache name so old caches are evicted per deploy
if (fs.existsSync('sw.js')) {
    const sw = fs.readFileSync('sw.js', 'utf8').replace('__CACHE_VERSION__', 'sml-' + Date.now());
    fs.writeFileSync(path.join(DIST_DIR, 'sw.js'), (await esbuild.transform(sw, { loader: 'js', minify: true, target: 'es2019' })).code);
}

// publications.bib: curated entries + generated entries for everything else
fs.writeFileSync(
    path.join(DIST_DIR, 'publications.bib'),
    curatedBib.trim() + '\n\n' + (generatedBib.length ? '% ---- generated from contents/publications.yml ----\n\n' + generatedBib.join('\n\n') + '\n' : '')
);

// security.txt at the RFC 9116 legacy location (.well-known/ is stripped by upload-pages-artifact)
if (fs.existsSync('.well-known/security.txt')) fs.copyFileSync('.well-known/security.txt', path.join(DIST_DIR, 'security.txt'));

// --------------------------------------------------------------------------
function dirSize(dir) {
    let total = 0;
    for (const entry of fs.readdirSync(dir)) {
        const p = path.join(dir, entry);
        const st = fs.statSync(p);
        total += st.isDirectory() ? dirSize(p) : st.size;
    }
    return total;
}
console.log(`Publications: ${counts.journal} journal · ${counts.conference} conference · ${counts.thesis} thesis · ${counts.early} early`);
console.log(`Build complete → dist/ (${(dirSize(DIST_DIR) / 1024).toFixed(1)} KB in ${((Date.now() - buildStart) / 1000).toFixed(2)}s)`);
