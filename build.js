#!/usr/bin/env node
/**
 * Static site builder for concrete-sangminlee.github.io
 *
 *   contents/*  ──►  dist/index.html (+ assets, publications.bib, sitemap, sw)
 *
 * Markdown files are parsed into structured rows (CV entries, news, etc.).
 * If a file doesn't match the expected shape, it falls back to plain
 * rendered Markdown, so a content edit never breaks the build.
 */

import fs from 'fs';
import path from 'path';
import { marked } from 'marked';
import { load as parseYaml } from 'js-yaml';
import sharp from 'sharp';
import esbuild from 'esbuild';
import { minify as minifyHTML } from 'html-minifier-terser';
import * as F from './lib/format.js';
import { renderCV } from './lib/cv.js';

const buildStart = Date.now();
const CONTENT_DIR = 'contents';
const DIST_DIR = 'dist';
const SITE_URL = 'https://concrete-sangminlee.github.io/';
const SELF = 'Lee, S. M.';

// ==========================================================================
// Helpers
// ==========================================================================
function fail(msg) {
    console.error(`build.js: ${msg}`);
    process.exit(1);
}
function readContent(file) {
    const p = path.join(CONTENT_DIR, file);
    if (!fs.existsSync(p)) fail(`missing content file ${p}`);
    return fs.readFileSync(p, 'utf8');
}
function loadYaml(file) {
    try {
        return parseYaml(readContent(file));
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
const icon = name => `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const isExternal = url => /^https?:\/\//.test(url);
const linkAttrs = url => (isExternal(url) ? ' target="_blank" rel="noopener"' : '');
/** Typographic range: "2021-2027" -> "2021–2027" */
const range = s => String(s).replace(/\s*-\s*/g, '–');

function mdBlocks(src) {
    return src.replace(/\r/g, '').split(/\n\s*\n/).map(b => b.trim()).filter(Boolean);
}
function mdListItems(src) {
    return src.replace(/\r/g, '').split('\n').map(l => l.match(/^\s*[-*]\s+(.+)$/)).filter(Boolean).map(m => m[1].trim());
}
const fallback = src => `<div class="prose">${marked.parse(src)}</div>`;

// ==========================================================================
// Config
// ==========================================================================
if (!fs.existsSync(CONTENT_DIR)) fail(`content directory not found: ${CONTENT_DIR}/`);
const config = loadYaml('config.yml');
if (!config || typeof config !== 'object') fail('config.yml is empty or not an object');
const REQUIRED = ['title', 'name', 'role', 'affiliation', 'description', 'copyright-text'];
const missing = REQUIRED.filter(k => typeof config[k] !== 'string');
if (missing.length) fail(`config.yml missing required string keys: ${missing.join(', ')}`);
const contacts = Array.isArray(config.contact) ? config.contact : [];

// ==========================================================================
// Publications
// ==========================================================================
const PUB_TYPES = {
    journal: { label: 'Journal', tab: 'Journal', bib: 'article' },
    conference: { label: 'Conference', tab: 'Conference', bib: 'inproceedings' },
    thesis: { label: 'Thesis', tab: 'Thesis', bib: 'thesis' },
    early: { label: 'Early work', tab: 'Early work', bib: 'misc' },
};

const research = loadYaml('research.yml') || [];
const profile = loadYaml('profile.yml') || {};
const topicIds = new Set(research.map(r => r.id));

const pubs = loadYaml('publications.yml');
if (!Array.isArray(pubs)) fail('publications.yml must be a list');
pubs.forEach((p, i) => {
    for (const k of ['type', 'year', 'authors', 'title']) {
        if (p[k] === undefined || p[k] === null || p[k] === '') fail(`publications.yml entry #${i + 1} is missing "${k}"`);
    }
    if (!PUB_TYPES[p.type]) fail(`publications.yml entry #${i + 1} has unknown type "${p.type}"`);
    if (p.topic && !topicIds.has(p.topic)) fail(`publications.yml entry #${i + 1} has unknown topic "${p.topic}"`);
    p.year = Number(p.year);
    p.index = i;
});

const { splitAuthors, renderAuthors } = F;

// --- BibTeX: curated entries from publications.bib, generated for the rest
const bibSrcPath = path.join(CONTENT_DIR, 'publications.bib');
const curatedBib = fs.existsSync(bibSrcPath) ? fs.readFileSync(bibSrcPath, 'utf8') : '';
const bibByKey = {};
for (const m of curatedBib.matchAll(/@\w+\{([^,\s]+),[\s\S]*?\n\}/g)) bibByKey[m[1]] = m[0].trim();

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
        ['author', splitAuthors(p.authors).join(' and ')],
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
    if (p.links?.doi) fields.push(['doi', p.links.doi]);
    if (p.links?.paper) fields.push(['url', p.links.paper]);
    const key = makeKey(p);
    const w = Math.max(...fields.map(f => f[0].length));
    const tex = (k, v) => (k === 'url' || k === 'doi' ? v : v.replace(/(^|[^\\])([&%#])/g, '$1\\$2'));
    const body = fields.filter(f => f[1]).map(([k, v]) => `  ${k.padEnd(w)} = {${tex(k, v)}}`).join(',\n');
    return { key, text: `@${type}{${key},\n${body}\n}` };
}

/** APA 7 reference as plain text (no italics in clipboard text). */
function apa(p) {
    const doi = ((bibByKey[p.bib] || '').match(/doi\s*=\s*\{([^}]+)\}/) || [])[1] || p.links?.doi;
    const title = String(p.title).replace(/[.?!]$/, '');
    const details = p.details ? String(p.details).replace(/(\d)-(\d)/g, '$1–$2') : '';
    let ref = `${p.authors} (${p.year}). `;
    if (p.type === 'thesis') {
        ref += `${title} [${p.note || 'Thesis'}, ${p.venue}].`;
    } else if (p.type === 'journal') {
        ref += `${title}. ${p.venue}${details ? `, ${details}` : ''}.`;
    } else {
        ref += `${title}${p.note ? ` [${p.note}]` : ''}. ${p.venue}${details ? `, ${details}` : ''}.`;
    }
    if (doi) ref += ` https://doi.org/${doi}`;
    else if (p.links?.paper) ref += ` ${p.links.paper}`;
    return ref;
}

const bibData = {};
const generatedBib = [];
for (const p of pubs) {
    if (p.bib && bibByKey[p.bib]) {
        p.bibKey = p.bib;
        bibData[p.bib] = { bib: bibByKey[p.bib], apa: apa(p) };
    } else {
        if (p.bib) console.warn(`build.js: bib key "${p.bib}" not found in publications.bib, generating one`);
        const g = generateBib(p);
        p.bibKey = g.key;
        bibData[g.key] = { bib: g.text, apa: apa(p) };
        generatedBib.push(g.text);
    }
}

for (const p of pubs) p.doi = ((bibByKey[p.bib] || '').match(/doi\s*=\s*\{([^}]+)\}/) || [])[1] || p.links?.doi;

const counts = Object.fromEntries(Object.keys(PUB_TYPES).map(t => [t, pubs.filter(p => p.type === t).length]));
const topicCounts = Object.fromEntries(research.map(r => [r.id, pubs.filter(p => p.topic === r.id).length]));

const LINK_LABELS = { paper: 'Paper', doi: 'DOI', pdf: 'PDF', code: 'Code', slides: 'Slides', poster: 'Poster', video: 'Video' };

function renderPub(p) {
    const venue = [];
    if (p.venue) venue.push(`<em${langAttr(p.venue)}>${esc(p.venue)}</em>`);
    if (p.details) venue.push(`, <span class="nowrap">${esc(String(p.details).replace(/(\d)-(\d)/g, '$1–$2'))}</span>`);
    const typeLabel = p.note || PUB_TYPES[p.type].label;

    const links = [];
    for (const [k, url] of Object.entries(p.links || {})) {
        const href = k === 'doi' && !isExternal(url) ? `https://doi.org/${url}` : url;
        links.push(`<a class="link" href="${esc(href)}" target="_blank" rel="noopener">${esc(LINK_LABELS[k] || k)}</a>`);
    }
    links.push(`<button class="link js-only" type="button" data-cite="${esc(p.bibKey)}">Cite</button>`);

    const absId = `abs-${p.bibKey}`;
    if (p.abstract) links.unshift(`<button class="link js-only" type="button" data-abstract="${absId}" aria-expanded="false" aria-controls="${absId}">Abstract</button>`);

    const search = [p.title, p.title_en, p.authors, p.authors_ko, p.venue, p.venue_en, p.details, p.note, p.year].filter(Boolean).join(' ').toLowerCase();
    return `<li class="pub" id="${esc(p.bibKey)}" data-type="${p.type}"${p.topic ? ` data-topic="${p.topic}"` : ''} data-search="${esc(search)}">
        <h4 class="pub-title"${langAttr(p.title)}>${esc(p.title)}</h4>
        ${p.title_en && hasHangul(p.title) ? `<p class="pub-trans" lang="en">${esc(p.title_en)}</p>` : ''}
        <p class="pub-authors">${renderAuthors(p.authors)}</p>
        <p class="pub-venue">${venue.join('')}<span class="sep" aria-hidden="true">·</span><span class="pub-type${p.type === 'journal' ? ' is-journal' : ''}">${esc(typeLabel)}</span><span class="pub-links">${links.join('')}</span></p>
        ${p.abstract ? `<div class="pub-abs" id="${absId}"><p>${esc(p.abstract)}</p></div>` : ''}
    </li>`;
}

function renderPublications() {
    const order = Object.keys(PUB_TYPES);
    const sorted = [...pubs].sort((a, b) => b.year - a.year || order.indexOf(a.type) - order.indexOf(b.type) || a.index - b.index);
    const years = [...new Set(sorted.map(p => p.year))];
    const groups = years.map(y => `<div class="pub-group" data-year="${y}">
        <h3 class="pub-year"><time datetime="${y}">${y}</time></h3>
        <ol class="pub-list">${sorted.filter(p => p.year === y).map(renderPub).join('')}</ol>
    </div>`).join('');

    const nonEarly = pubs.length - counts.early;
    const tabs = [['all', 'All', nonEarly], ...order.map(t => [t, PUB_TYPES[t].tab, counts[t]])]
        .filter(t => t[2] > 0)
        .map(([k, label, n], i) => `<button class="tab" type="button" data-filter="${k}" aria-pressed="${i === 0}">${esc(label)}<span class="n">${n}</span></button>`)
        .join('');
    const topics = JSON.stringify(Object.fromEntries(research.map(r => [r.id, r.title]))).replace(/</g, '\\u003c');

    return `<div class="pub-controls js-only">
            <div class="tabs" role="group" aria-label="Filter by type">${tabs}</div>
            <label class="search">
                <span class="sr-only">Search publications</span>
                ${icon('search')}
                <input type="search" id="pub-search" placeholder="Search" autocomplete="off" spellcheck="false">
                <kbd aria-hidden="true">/</kbd>
            </label>
        </div>
        <div class="pub-state js-only" id="pub-state" aria-live="polite" data-topics="${esc(topics)}"></div>
        <div id="pub-groups">${groups}</div>
        <p class="pub-empty" id="pub-empty" hidden>Nothing matches. <button class="link" type="button" data-reset>Clear filters</button></p>
        <p class="pub-foot">
            <a class="link" href="publications.bib" download>All entries as BibTeX</a>
            ${config['scholar-url'] ? `<a class="link" href="${esc(config['scholar-url'])}" target="_blank" rel="noopener">Google Scholar</a>` : ''}
        </p>`;
}

// ==========================================================================
// Sections
// ==========================================================================
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Homepage rows rendered from profile.yml (the CVs use the same data; see lib/cv.js)
const webOnly = x => x && x.web !== false;
const tag = t => `<span class="tag">${t}</span>`;
function cvItem(when, titleHtml, subs = [], notes = []) {
    return `<li>
        <p class="cv-when">${esc(when)}</p>
        <div class="cv-what">
            <p class="cv-title">${titleHtml}</p>
            ${subs.filter(Boolean).map(h => `<p class="cv-sub"${langAttr(h)}>${h}</p>`).join('')}
            ${notes && notes.length ? `<ul class="cv-notes">${notes.map(n => `<li${langAttr(n)}>${F.noteHtml(n)}</li>`).join('')}</ul>` : ''}
        </div>
    </li>`;
}
const cvList = (items, cls = '') => `<ol class="cv${cls}">${items.join('')}</ol>`;

function renderEducation() {
    return cvList((profile.education || []).filter(webOnly).map(e => cvItem(
        F.period(e, 'en', { yearOnly: true, expectedSuffix: false }),
        `${esc(e.degree)}${e.expected ? tag('Expected') : ''}`,
        [esc(e.org)], e.notes)));
}
function renderExperience() {
    return cvList([...(profile.experience || [])].filter(webOnly).sort((a, b) => F.recency(b) - F.recency(a)).map(e => cvItem(
        F.period(e, 'en'),
        `${esc(e.title)}${String(e.end) === 'present' ? tag('Current') : ''}`,
        [esc(e.org)], e.notes)));
}
function renderTeaching() {
    return cvList((profile.teaching || []).filter(webOnly).map(c => cvItem(
        F.period(c, 'en', { yearOnly: true }), esc(c.course), [esc(c.terms)], c.note ? [c.note] : [])));
}

/** - **2026** Text */
function renderNews(src) {
    const items = mdListItems(src).map(l => l.match(/^\*\*(\d{4}(?:\.\d{1,2})?)\*\*\s*[-–—:]?\s*(.+)$/)).filter(Boolean);
    if (!items.length) return fallback(src);
    return `<ul class="news">${items.map(([, d, text]) => {
        const iso = d.replace('.', '-').replace(/-(\d)$/, '-0$1');
        const label = d.includes('.') ? `${MONTHS[Number(d.split('.')[1]) - 1]} ${d.split('.')[0]}` : d;
        return `<li><time datetime="${iso}">${esc(label)}</time><span>${md(text)}</span></li>`;
    }).join('')}</ul>`;
}

function renderResearch() {
    return `<div class="areas">${research.map(r => {
        const n = topicCounts[r.id] || 0;
        return `<div class="area">
            <h3>${esc(r.title)}</h3>
            <p>${md(r.summary)}</p>
            ${n ? `<a class="link area-link" href="#publications" data-topic="${esc(r.id)}"><span class="t">${n} paper${n === 1 ? '' : 's'}</span> <span class="arr" aria-hidden="true">→</span></a>` : ''}
        </div>`;
    }).join('')}</div>`;
}

function renderProjects() {
    return cvList((profile.projects || []).filter(webOnly).map(p => cvItem(
        F.period(p, 'en', { yearOnly: true }), esc(p.title), [esc(p.funder)])));
}

function renderPatents() {
    return cvList((profile.patents || []).filter(webOnly).map(p => cvItem(
        String(p.year), esc(p.title),
        [renderAuthors(p.inventors), `Korean Patent <span class="num">${esc(p.number)}</span>, registered`])));
}

const sentence = parts => {
    const t = parts.filter(Boolean).join('. ');
    return t ? esc(/[.!?]$/.test(t) ? t : `${t}.`) : '';
};
const groupHead = (title, first) => `<h3 class="cv-group${first ? ' is-first' : ''}">${esc(title)}</h3>`;
function earlier(title, items) {
    const years = items.map(it => F.ym(it.start)?.y).filter(Boolean);
    const span = years.length ? ` (${Math.min(...years)}–${Math.max(...years)})` : '';
    return `<details class="cv-more"><summary>${esc(title)}${span}</summary>${cvList(items.map(it => it.html))}</details>`;
}

function renderAwards() {
    const all = (profile.awards || []).filter(webOnly);
    const row = a => cvItem(F.period(a, 'en', { yearOnly: true }), esc(a.title), [sentence([a.by, a.note])]);
    const out = [];
    const honors = all.filter(a => !a.earlier);
    if (honors.length) out.push(groupHead('Honors', true) + cvList(honors.map(row)));
    const certs = (profile.certifications || []).filter(webOnly);
    if (certs.length) out.push(groupHead('Certifications') + cvList(certs.map(c => cvItem(
        F.period(c, 'en', { yearOnly: true }),
        `${esc(c.title)}${c.title_ko ? ` <span class="cv-ko" lang="ko">${esc(c.title_ko)}</span>` : ''}`,
        [sentence([c.by, F.fmtDate(F.ym(c.start), 'en')])]))));
    const early = all.filter(a => a.earlier);
    if (early.length) out.push(earlier('Earlier', early.map(a => ({ start: a.start, html: row(a) }))));
    return out.join('');
}

function renderService() {
    const sv = profile.service || {};
    const out = [];
    const push = (title, html) => out.push(groupHead(title, !out.length) + html);
    if (sv.reviewing?.length) push('Reviewing', cvList(sv.reviewing.filter(webOnly).map(x => cvItem(
        F.period(x, 'en', { yearOnly: true }), esc(x.title), [sentence([x.role, x.note])]))));
    if (sv.organizing?.length) push('Organizing', cvList(sv.organizing.filter(webOnly).map(x => cvItem(
        F.period(x, 'en', { yearOnly: true }), esc(x.title), [sentence([x.role, x.note])]))));
    if (sv.memberships?.length) push('Memberships', cvList(sv.memberships.filter(webOnly).map(x =>
        `<li><p class="cv-when">Since ${F.ym(x.start).y}</p><div class="cv-what"><p><span class="cv-title">${esc(x.title)}</span>${x.role ? `<span class="cv-sub">, ${esc(x.role.toLowerCase())}</span>` : ''}</p></div></li>`), ' cv-compact'));
    if (sv.outreach?.length) push('Outreach', cvList(sv.outreach.filter(webOnly).map(x => cvItem(
        F.period(x, 'en', { yearOnly: true }), `<span lang="ko">${esc(x.title)}</span>`, [sentence([x.note, x.role])]))));
    return out.join('');
}

function renderContact() {
    return `<dl class="contact-list">${contacts.map(c => {
        const isMail = c.url.startsWith('mailto:');
        return `<div><dt>${esc(c.label)}</dt><dd><a class="link" href="${esc(c.url)}"${linkAttrs(c.url)}>${esc(c.value)}</a>${isMail ? `<button class="copy-btn js-only" type="button" data-copy="${esc(c.value)}">Copy</button>` : ''}</dd></div>`;
    }).join('')}</dl>`;
}

function renderIntro() {
    const links = contacts.filter(c => c.intro).map(c => {
        const text = c.url.startsWith('mailto:') ? c.value : c.label;
        return `<li><a href="${esc(c.url)}"${linkAttrs(c.url)}>${icon(c.icon || 'mail')}${esc(text)}</a></li>`;
    }).join('');
    return `<section class="intro" aria-label="About">
        <div class="wrap">
            <div class="row">
                <div class="portrait">
                    <picture>
                        <source srcset="static/assets/img/photo.webp" type="image/webp">
                        <img src="static/assets/img/photo.jfif" alt="Portrait of ${esc(config.name)}" width="200" height="200" fetchpriority="high">
                    </picture>
                </div>
                <div class="intro-main">
                    <div class="intro-head">
                        <h1 class="name">${esc(config.name)}${config['name-ko'] ? `<span class="name-ko" lang="ko">${esc(config['name-ko'])}</span>` : ''}</h1>
                        <p class="role">${esc(config.role)}<br>${esc(config.affiliation)}</p>
                    </div>
                    <div class="intro-body">
                        <div class="bio prose">${marked.parse(readContent('home.md'))}</div>
                        ${links ? `<ul class="intro-links">${links}<li><a href="cv/Sang-Min-Lee-CV.pdf">${icon('file')}CV</a></li><li><a href="cv/Sang-Min-Lee-CV-ko.pdf" lang="ko">${icon('file')}국문 CV</a></li></ul>` : ''}
                    </div>
                </div>
            </div>
        </div>
    </section>`;
}

const SECTIONS = [
    { id: 'news', title: 'News', render: () => renderNews(readContent('news.md')) },
    { id: 'research', title: 'Research', nav: true, render: renderResearch },
    {
        id: 'publications', title: 'Publications', nav: true, render: renderPublications,
        meta: `${counts.journal} journal articles<br>${counts.conference} conference papers`,
    },
    { id: 'patents', title: 'Patents', render: renderPatents },
    { id: 'experience', title: 'Experience', nav: true, render: renderExperience },
    { id: 'projects', title: 'Research projects', render: renderProjects },
    { id: 'teaching', title: 'Teaching', nav: true, render: renderTeaching, meta: 'Teaching assistant<br>Seoul National University' },
    { id: 'education', title: 'Education', nav: true, render: renderEducation },
    { id: 'awards', title: 'Awards', nav: true, render: renderAwards },
    { id: 'service', title: 'Service', render: renderService },
    { id: 'contact', title: 'Contact', nav: true, render: renderContact },
];

const sectionsHtml = SECTIONS.map(s => `<section class="section" id="${s.id}" aria-labelledby="${s.id}-title">
        <div class="wrap">
            <div class="row">
                <header>
                    <h2 class="section-title" id="${s.id}-title"><a href="#${s.id}" class="anchor">${esc(s.title)}</a></h2>
                    ${s.meta ? `<p class="section-meta">${s.meta}</p>` : ''}
                </header>
                <div class="section-body">${s.render()}</div>
            </div>
        </div>
    </section>`).join('\n');

const navHtml = SECTIONS.filter(s => s.nav).map(s => `<li><a href="#${s.id}" data-nav="${s.id}">${esc(s.title)}</a></li>`).join('');

// ==========================================================================
// Structured data
// ==========================================================================
function jsonLd() {
    const person = {
        '@type': 'Person',
        '@id': SITE_URL + '#person',
        name: config.name,
        alternateName: config['name-ko'],
        url: SITE_URL,
        image: SITE_URL + 'static/assets/img/photo.jfif',
        jobTitle: config.role,
        affiliation: { '@type': 'CollegeOrUniversity', name: config.affiliation, sameAs: 'https://www.snu.ac.kr/' },
        alumniOf: { '@type': 'CollegeOrUniversity', name: config.affiliation },
        email: (contacts.find(c => c.url.startsWith('mailto:')) || {}).url,
        sameAs: contacts.filter(c => isExternal(c.url)).map(c => c.url),
        knowsAbout: research.map(r => r.title),
        award: (profile.awards || []).filter(a => !a.earlier).map(a => `${a.title} (${F.period(a, 'en', { yearOnly: true })})`),
    };
    const works = pubs.filter(p => p.type === 'journal' || p.type === 'conference').map(p => {
        const doi = p.doi;
        const d = parseDetails(p.details);
        const o = {
            '@type': 'ScholarlyArticle',
            headline: p.title,
            author: splitAuthors(p.authors).map(a => {
                const [last, first] = a.split(',').map(s => s.trim());
                return a === SELF ? { '@id': SITE_URL + '#person' } : { '@type': 'Person', name: first ? `${first} ${last}` : last };
            }),
            datePublished: p.date ? (p.date instanceof Date ? p.date.toISOString() : String(p.date)).slice(0, 10) : String(p.year),
            ...(p.abstract && { abstract: p.abstract }),
            inLanguage: hasHangul(p.title) ? 'ko' : 'en',
            isPartOf: p.venue ? { '@type': p.type === 'journal' ? 'Periodical' : 'Event', name: p.venue, ...(d.volume && { volumeNumber: d.volume }), ...(d.number && { issueNumber: d.number }) } : undefined,
        };
        if (doi) {
            o.identifier = { '@type': 'PropertyValue', propertyID: 'DOI', value: doi };
            o.sameAs = `https://doi.org/${doi}`;
        } else if (p.links?.paper) o.sameAs = p.links.paper;
        return o;
    });
    const pats = (profile.patents || []).map(p => ({
        '@type': 'CreativeWork',
        additionalType: 'Patent',
        name: p.title,
        datePublished: String(p.year),
        author: splitAuthors(p.inventors).map(a => (a === SELF ? { '@id': SITE_URL + '#person' } : { '@type': 'Person', name: a })),
        identifier: { '@type': 'PropertyValue', propertyID: 'KR patent registration', value: String(p.number) },
    }));
    return JSON.stringify({ '@context': 'https://schema.org', '@graph': [person, ...works, ...pats] }).replace(/</g, '\\u003c');
}

// ==========================================================================
// Assemble
// ==========================================================================
const now = new Date();
const buildDate = now.toISOString().slice(0, 10);
const buildDateLabel = now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });

let output = fs.readFileSync('index.html', 'utf8');
const slot = (name, html) => {
    if (!output.includes(`<!-- @SLOT:${name} -->`)) fail(`index.html is missing <!-- @SLOT:${name} -->`);
    output = output.split(`<!-- @SLOT:${name} -->`).join(html);
};
slot('nav', navHtml);
slot('intro', renderIntro());
slot('sections', sectionsHtml);

const vars = { ...config, 'build-date': buildDate, 'build-date-label': buildDateLabel };
output = output.replace(/\{\{([\w-]+)\}\}/g, (m, k) => {
    if (typeof vars[k] !== 'string') fail(`index.html references unknown placeholder {{${k}}}`);
    return k === 'copyright-text' ? vars[k] : esc(vars[k]);
});

output = output.replace('<script type="application/ld+json" id="json-ld">{}</script>', () => `<script type="application/ld+json">${jsonLd()}</script>`);
output = output.replace('<script type="application/json" id="bib-data">{}</script>', () => `<script type="application/json" id="bib-data">${JSON.stringify(bibData).replace(/</g, '\\u003c')}</script>`);

{
    const css = (await esbuild.transform(fs.readFileSync('static/css/main.css', 'utf8'), { loader: 'css', minify: true })).code;
    const re = /\s*<!-- INLINE_CSS_HERE:[\s\S]*?-->\s*<link rel="stylesheet" href="static\/css\/main\.css" \/>/;
    if (!re.test(output)) fail('INLINE_CSS_HERE marker not found in index.html');
    output = output.replace(re, () => `\n<style>${css}</style>`);
}

output = await minifyHTML(output, {
    collapseWhitespace: true,
    conservativeCollapse: true,
    removeComments: true,
    removeRedundantAttributes: true,
    minifyCSS: true,
    minifyJS: true,
    collapseBooleanAttributes: true,
    removeScriptTypeAttributes: true,
    removeStyleLinkTypeAttributes: true,
});

fs.rmSync(DIST_DIR, { recursive: true, force: true });
fs.mkdirSync(DIST_DIR, { recursive: true });
fs.writeFileSync(path.join(DIST_DIR, 'index.html'), output);

// ==========================================================================
// Assets
// ==========================================================================
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
await sharp(photoSrc).webp({ quality: 90 }).toFile(path.join(DIST_DIR, 'static/assets/img/photo.webp'));

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

fs.rmSync(path.join(DIST_DIR, 'static/css'), { recursive: true, force: true });

{
    const jsPath = path.join(DIST_DIR, 'static/js/scripts.js');
    const result = await esbuild.transform(fs.readFileSync(jsPath, 'utf8'), { loader: 'js', minify: true, target: 'es2019' });
    fs.writeFileSync(jsPath, result.code);
}

for (const f of ['robots.txt', '404.html', 'manifest.json']) {
    if (fs.existsSync(f)) fs.copyFileSync(f, path.join(DIST_DIR, f));
}

copyRecursive('apps/sequence-arena', path.join(DIST_DIR, 'sequence-arena'));

if (fs.existsSync('sitemap.xml')) {
    const sitemap = fs.readFileSync('sitemap.xml', 'utf8').replace(/<lastmod>[^<]*<\/lastmod>/g, `<lastmod>${buildDate}</lastmod>`);
    fs.writeFileSync(path.join(DIST_DIR, 'sitemap.xml'), sitemap);
}

if (fs.existsSync('sw.js')) {
    const sw = fs.readFileSync('sw.js', 'utf8').replace('__CACHE_VERSION__', 'sml-' + Date.now());
    fs.writeFileSync(path.join(DIST_DIR, 'sw.js'), (await esbuild.transform(sw, { loader: 'js', minify: true, target: 'es2019' })).code);
}

fs.writeFileSync(
    path.join(DIST_DIR, 'publications.bib'),
    curatedBib.trim() + '\n\n' + (generatedBib.length ? '% Generated from contents/publications.yml\n\n' + generatedBib.join('\n\n') + '\n' : '')
);

// CVs: /cv/ (English) and /cv/ko/ (Korean). The print-*.html variants have no
// web-font link or toolbar; scripts/cv-pdf.sh turns them into PDFs and deletes them.
{
    const cvCss = (await esbuild.transform(fs.readFileSync('static/css/cv.css', 'utf8'), { loader: 'css', minify: true })).code;
    const photo = 'data:image/jpeg;base64,' + fs.readFileSync('static/assets/img/photo.jfif').toString('base64');
    const ctx = { config, profile, pubs, research, buildDate: now, css: cvCss, photo };
    fs.mkdirSync(path.join(DIST_DIR, 'cv/ko'), { recursive: true });
    const write = async (file, html) => fs.writeFileSync(path.join(DIST_DIR, file),
        await minifyHTML(html, { collapseWhitespace: true, conservativeCollapse: true, removeComments: true }));
    await write('cv/index.html', renderCV('en', { ...ctx, mode: 'web' }));
    await write('cv/ko/index.html', renderCV('ko', { ...ctx, mode: 'web' }));
    await write('cv/print-en.html', renderCV('en', { ...ctx, mode: 'print' }));
    await write('cv/print-ko.html', renderCV('ko', { ...ctx, mode: 'print' }));
}

if (fs.existsSync('.well-known/security.txt')) fs.copyFileSync('.well-known/security.txt', path.join(DIST_DIR, 'security.txt'));

// ==========================================================================
function dirSize(dir) {
    let total = 0;
    for (const entry of fs.readdirSync(dir)) {
        const p = path.join(dir, entry);
        const st = fs.statSync(p);
        total += st.isDirectory() ? dirSize(p) : st.size;
    }
    return total;
}
console.log(`Publications: ${counts.journal} journal, ${counts.conference} conference, ${counts.thesis} thesis, ${counts.early} early`);
console.log(`Build complete: dist/ (${(dirSize(DIST_DIR) / 1024).toFixed(1)} KB in ${((Date.now() - buildStart) / 1000).toFixed(2)}s)`);
