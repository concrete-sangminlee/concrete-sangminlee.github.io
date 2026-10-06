// Homepage sections for English (/) and Korean (/ko/).
import { marked } from 'marked';
import * as F from './format.js';
import { UI } from './i18n.js';
import { parseDetails } from './data.js';

const { esc, md, hasHangul, langAttr, isExternal, L, renderAuthors, splitAuthors } = F;
const icon = name => `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const linkAttrs = url => (isExternal(url) ? ' target="_blank" rel="noopener"' : '');
const webOnly = x => x && x.web !== false;
const TYPE_ORDER = ['journal', 'conference', 'thesis', 'early'];

export function renderHome(lang, data, { root, now, siteUrl }) {
    const ko = lang === 'ko';
    const t = UI[lang];
    const { config, research, profile, news, home, pubs, counts, topicCounts } = data;
    const contacts = config.contact;
    const tag = s => `<span class="tag">${esc(s)}</span>`;
    const sentence = parts => {
        const s = parts.filter(Boolean).join(ko ? ' · ' : '. ');
        return s ? esc(ko || /[.!?]$/.test(s) ? s : `${s}.`) : '';
    };

    // ------------------------------------------------------------ publications
    function pubFields(p) {
        // English page: English only. Korean-language papers show their English
        // title, marked "(in Korean)", and the English venue name.
        if (!ko) {
            const translated = hasHangul(p.title) && !!p.title_en;
            return { title: translated ? p.title_en : p.title, inKorean: translated, authors: p.authors, venue: p.venue_en || p.venue, note: p.note };
        }
        const koreanPaper = hasHangul(p.title) || hasHangul(p.venue) || p.title_ko || p.type === 'thesis';
        return {
            title: p.title_ko || p.title,
            inKorean: false,
            authors: koreanPaper ? p.authors_ko || p.authors : p.authors,
            venue: p.venue_ko || p.venue,
            note: p.note_ko || (p.type === 'thesis' || p.type === 'early' ? '' : p.note),
        };
    }

    function renderPub(p) {
        const f = pubFields(p);
        const venue = [];
        if (f.venue) venue.push(`<em${langAttr(f.venue)}>${esc(f.venue)}</em>`);
        if (p.details) venue.push(`, <span class="nowrap">${esc(F.dashes(p.details))}</span>`);
        const typeLabel = f.note || t.types[p.type].label;

        const links = [];
        for (const [k, url] of Object.entries(p.links || {})) {
            const href = k === 'doi' && !isExternal(url) ? `https://doi.org/${url}` : url;
            links.push(`<a class="link" href="${esc(href)}" target="_blank" rel="noopener">${esc(t.links[k] || k)}</a>`);
        }
        links.push(`<button class="link js-only" type="button" data-cite="${esc(p.bibKey)}">${esc(t.cite)}</button>`);
        const absId = `abs-${p.bibKey}`;
        if (p.abstract) links.unshift(`<button class="link js-only" type="button" data-abstract="${absId}" aria-expanded="false" aria-controls="${absId}">${esc(t.abstract)}</button>`);

        const search = [p.title, p.title_en, p.title_ko, p.authors, p.authors_ko, p.venue, p.venue_en, p.venue_ko, p.details, p.note, p.note_ko, p.year]
            .filter(Boolean).join(' ').toLowerCase();
        return `<li class="pub" id="${esc(p.bibKey)}" data-type="${p.type}"${p.topic ? ` data-topic="${p.topic}"` : ''} data-search="${esc(search)}">
            <h4 class="pub-title"${langAttr(f.title)}>${esc(f.title)}${f.inKorean ? ` <span class="pub-lang">(${esc(t.inKorean)})</span>` : ''}</h4>
            <p class="pub-authors">${renderAuthors(f.authors)}</p>
            <p class="pub-venue">${venue.join('')}<span class="sep" aria-hidden="true">·</span><span class="pub-type${p.type === 'journal' ? ' is-journal' : ''}"${langAttr(typeLabel)}>${esc(typeLabel)}</span><span class="pub-links">${links.join('')}</span></p>
            ${p.abstract ? `<div class="pub-abs" id="${absId}" lang="en"><p>${esc(p.abstract)}</p></div>` : ''}
        </li>`;
    }

    function renderPublications() {
        const sorted = [...pubs].sort((a, b) => b.year - a.year || TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type) || a.index - b.index);
        const years = [...new Set(sorted.map(p => p.year))];
        const groups = years.map(y => `<div class="pub-group" data-year="${y}">
            <h3 class="pub-year"><time datetime="${y}">${y}</time></h3>
            <ol class="pub-list">${sorted.filter(p => p.year === y).map(renderPub).join('')}</ol>
        </div>`).join('');
        const tabs = [['all', t.all, pubs.length - counts.early], ...TYPE_ORDER.map(k => [k, t.types[k].tab, counts[k]])]
            .filter(x => x[2] > 0)
            .map(([k, label, n], i) => `<button class="tab" type="button" data-filter="${k}" aria-pressed="${i === 0}">${esc(label)}<span class="n">${n}</span></button>`)
            .join('');
        const topics = JSON.stringify(Object.fromEntries(research.map(r => [r.id, L(r, 'title', lang)]))).replace(/</g, '\\u003c');
        return `<div class="pub-controls js-only">
                <div class="tabs" role="group" aria-label="${esc(t.filterByType)}">${tabs}</div>
                <label class="search">
                    <span class="sr-only">${esc(t.searchLabel)}</span>
                    ${icon('search')}
                    <input type="search" id="pub-search" placeholder="${esc(t.search)}" autocomplete="off" spellcheck="false">
                    <kbd aria-hidden="true">/</kbd>
                </label>
            </div>
            <div class="pub-state js-only" id="pub-state" aria-live="polite" data-topics="${esc(topics)}"></div>
            <div id="pub-groups">${groups}</div>
            <p class="pub-empty" id="pub-empty" hidden>${esc(t.empty)} <button class="link" type="button" data-reset>${esc(t.clear)}</button></p>
            <p class="pub-foot">
                <a class="link" href="${root}publications.bib" download>${esc(t.allBib)}</a>
                ${config['scholar-url'] ? `<a class="link" href="${esc(config['scholar-url'])}" target="_blank" rel="noopener">Google Scholar</a>` : ''}
            </p>`;
    }

    // ------------------------------------------------------------ CV-style rows
    const cvItem = (when, titleHtml, subs = [], notes = []) => `<li>
        <p class="cv-when">${esc(when)}</p>
        <div class="cv-what">
            <p class="cv-title">${titleHtml}</p>
            ${subs.filter(Boolean).map(h => `<p class="cv-sub"${langAttr(h)}>${h}</p>`).join('')}
            ${notes && notes.length ? `<ul class="cv-notes">${notes.map(n => `<li${langAttr(n)}>${F.noteHtml(n)}</li>`).join('')}</ul>` : ''}
        </div>
    </li>`;
    const cvList = (items, cls = '') => `<ol class="cv${cls}">${items.join('')}</ol>`;
    const T = (x, k) => esc(L(x, k, lang));
    const groupHead = (title, first) => `<h3 class="cv-group${first ? ' is-first' : ''}">${esc(title)}</h3>`;

    const renderEducation = () => cvList((profile.education || []).filter(webOnly).map(e => cvItem(
        F.period(e, lang, { yearOnly: true, expectedSuffix: false }),
        `${T(e, 'degree')}${e.expected ? tag(t.tagExpected) : ''}`,
        [T(e, 'org')], L(e, 'notes', lang))));

    const renderExperience = () => cvList([...(profile.experience || [])].filter(webOnly).sort((a, b) => F.recency(b) - F.recency(a)).map(e => cvItem(
        F.period(e, lang),
        `${T(e, 'title')}${String(e.end) === 'present' ? tag(t.tagCurrent) : ''}`,
        [T(e, 'org')], L(e, 'notes', lang))));

    const renderTeaching = () => cvList((profile.teaching || []).filter(webOnly).map(c => cvItem(
        F.period(c, lang, { yearOnly: true }), T(c, 'course'), [T(c, 'terms')], L(c, 'note', lang) ? [L(c, 'note', lang)] : [])));

    const renderProjects = () => cvList((profile.projects || []).filter(webOnly).map(p => cvItem(
        F.period(p, lang, { yearOnly: true }), T(p, 'title'), [T(p, 'funder')])));

    const renderPatents = () => cvList((profile.patents || []).filter(webOnly).map(p => cvItem(
        String(p.year), T(p, 'title'), [renderAuthors(L(p, 'inventors', lang)), t.patentNo(esc(p.number))])));

    function renderAwards() {
        const all = (profile.awards || []).filter(webOnly);
        const row = a => cvItem(F.period(a, lang, { yearOnly: !ko }), T(a, 'title'), [sentence([L(a, 'by', lang), L(a, 'note', lang)])]);
        const out = [];
        const honors = all.filter(a => !a.earlier);
        if (honors.length) out.push(groupHead(t.groups.honors, true) + cvList(honors.map(row)));
        const certs = (profile.certifications || []).filter(webOnly);
        if (certs.length) out.push(groupHead(t.groups.certifications) + cvList(certs.map(c => cvItem(
            F.period(c, lang, { yearOnly: !ko }),
            T(c, 'title'),
            [sentence([L(c, 'by', lang), ko ? '' : F.fmtDate(F.ym(c.start), 'en')])]))));
        const early = all.filter(a => a.earlier);
        if (early.length) {
            const years = early.map(a => F.ym(a.start)?.y).filter(Boolean);
            out.push(`<details class="cv-more"><summary>${esc(t.groups.earlier)} (${Math.min(...years)}–${Math.max(...years)})</summary>${cvList(early.map(row))}</details>`);
        }
        return out.join('');
    }

    function renderService() {
        const sv = profile.service || {};
        const out = [];
        const push = (title, html) => out.push(groupHead(title, !out.length) + html);
        const basic = list => cvList(list.filter(webOnly).map(x => cvItem(
            F.period(x, lang, { yearOnly: !ko }), T(x, 'title'), [sentence([L(x, 'role', lang), L(x, 'note', lang)])])));
        if (sv.reviewing?.length) push(t.groups.reviewing, basic(sv.reviewing));
        if (sv.organizing?.length) push(t.groups.organizing, basic(sv.organizing));
        if (sv.memberships?.length) push(t.groups.memberships, cvList(sv.memberships.filter(webOnly).map(x => {
            const role = L(x, 'role', lang) || '';
            return `<li><p class="cv-when">${esc(t.since(ko ? F.fmtDate(F.ym(x.start), 'ko') : F.ym(x.start).y))}</p><div class="cv-what"><p><span class="cv-title"${langAttr(L(x, 'title', lang))}>${T(x, 'title')}</span>${role ? `<span class="cv-sub">, ${esc(ko ? role : role.toLowerCase())}</span>` : ''}</p></div></li>`;
        }), ' cv-compact'));
        if (sv.outreach?.length) push(t.groups.outreach, cvList(sv.outreach.filter(webOnly).map(x => cvItem(
            F.period(x, lang, { yearOnly: !ko }), `<span${langAttr(L(x, 'title', lang))}>${T(x, 'title')}</span>`, [sentence([L(x, 'note', lang), L(x, 'role', lang)])]))));
        return out.join('');
    }

    // ------------------------------------------------------------ other sections
    function renderNews() {
        return `<ul class="news">${news.map(n => {
            const d = F.ym(n.date);
            const iso = d.m ? `${d.y}-${String(d.m).padStart(2, '0')}` : String(d.y);
            return `<li><time datetime="${iso}">${esc(F.fmtDate(d, lang))}</time><span>${md(L(n, 'text', lang))}</span></li>`;
        }).join('')}</ul>`;
    }

    const renderResearch = () => `<div class="areas">${research.map(r => {
        const n = topicCounts[r.id] || 0;
        return `<div class="area">
            <h3>${T(r, 'title')}</h3>
            <p>${md(L(r, 'summary', lang))}</p>
            ${n ? `<a class="link area-link" href="#publications" data-topic="${esc(r.id)}"><span class="t">${esc(t.papers(n))}</span> <span class="arr" aria-hidden="true">→</span></a>` : ''}
        </div>`;
    }).join('')}</div>`;

    const renderContact = () => `<dl class="contact-list">${contacts.map(c => {
        const isMail = c.url.startsWith('mailto:');
        return `<div><dt>${T(c, 'label')}</dt><dd><a class="link" href="${esc(c.url)}"${linkAttrs(c.url)}>${esc(c.value)}</a>${isMail ? `<button class="copy-btn js-only" type="button" data-copy="${esc(c.value)}">${esc(t.copy)}</button>` : ''}</dd></div>`;
    }).join('')}</dl>`;

    function renderIntro() {
        const links = contacts.filter(c => c.intro).map(c => {
            const text = c.url.startsWith('mailto:') ? c.value : L(c, 'label', lang);
            return `<li><a href="${esc(c.url)}"${linkAttrs(c.url)}>${icon(c.icon || 'mail')}${esc(text)}</a></li>`;
        });
        const cvFirst = ko ? 'Sang-Min-Lee-CV-ko.pdf' : 'Sang-Min-Lee-CV.pdf';
        const cvSecond = ko ? 'Sang-Min-Lee-CV.pdf' : 'Sang-Min-Lee-CV-ko.pdf';
        links.push(`<li><a href="${root}cv/${cvFirst}">${icon('file')}${esc(t.cv)}</a></li>`);
        links.push(`<li><a href="${root}cv/${cvSecond}"${ko ? ' lang="en"' : ' lang="ko"'}>${icon('file')}${esc(t.cvOther)}</a></li>`);
        const name = ko ? config['name-ko'] : config.name;
        const alt = ko ? config.name : config['name-ko'];
        const role = ko ? esc(config['role-ko'] || config.role) : `${esc(config.role)}<br>${esc(config.affiliation)}`;
        return `<section class="intro" aria-label="${esc(t.about)}">
            <div class="wrap">
                <div class="row">
                    <div class="portrait">
                        <picture>
                            <source srcset="${root}static/assets/img/photo.webp" type="image/webp">
                            <img src="${root}static/assets/img/photo.jfif" alt="${esc(ko ? `${name} 사진` : `Portrait of ${name}`)}" width="200" height="200" fetchpriority="high">
                        </picture>
                    </div>
                    <div class="intro-main">
                        <div class="intro-head">
                            <h1 class="name">${esc(name)}${alt ? `<span class="name-ko"${ko ? ' lang="en"' : ' lang="ko"'}>${esc(alt)}</span>` : ''}</h1>
                            <p class="role">${role}</p>
                        </div>
                        <div class="intro-body">
                            <div class="bio prose">${marked.parse(home[lang])}</div>
                            <ul class="intro-links">${links.join('')}</ul>
                        </div>
                    </div>
                </div>
            </div>
        </section>`;
    }

    const S = t.sections;
    const SECTIONS = [
        { id: 'news', render: renderNews },
        { id: 'research', nav: true, render: renderResearch },
        { id: 'publications', nav: true, render: renderPublications, meta: t.pubMeta(counts) },
        { id: 'patents', render: renderPatents },
        { id: 'experience', nav: true, render: renderExperience },
        { id: 'projects', render: renderProjects },
        { id: 'teaching', nav: true, render: renderTeaching, meta: t.teachingMeta },
        { id: 'education', nav: true, render: renderEducation },
        { id: 'awards', nav: true, render: renderAwards },
        { id: 'service', render: renderService },
        { id: 'contact', nav: true, render: renderContact },
    ];

    const sections = SECTIONS.map(s => `<section class="section" id="${s.id}" aria-labelledby="${s.id}-title">
        <div class="wrap">
            <div class="row">
                <header>
                    <h2 class="section-title" id="${s.id}-title"><a href="#${s.id}" class="anchor">${esc(S[s.id])}</a></h2>
                    ${s.meta ? `<p class="section-meta">${s.meta}</p>` : ''}
                </header>
                <div class="section-body">${s.render()}</div>
            </div>
        </div>
    </section>`).join('\n');

    const nav = SECTIONS.filter(s => s.nav).map(s => `<li><a href="#${s.id}" data-nav="${s.id}">${esc(S[s.id])}</a></li>`).join('');

    return { nav, intro: renderIntro(), sections, jsonLd: jsonLd(data, siteUrl, lang) };
}

// ------------------------------------------------------------ structured data
function jsonLd({ config, research, profile, pubs }, siteUrl, lang) {
    const contacts = config.contact;
    const me = { '@id': `${siteUrl}#person` };
    const person = {
        '@type': 'Person',
        '@id': `${siteUrl}#person`,
        name: config.name,
        alternateName: config['name-ko'],
        url: siteUrl,
        image: `${siteUrl}static/assets/img/photo.jfif`,
        jobTitle: config.role,
        affiliation: { '@type': 'CollegeOrUniversity', name: config.affiliation, sameAs: 'https://www.snu.ac.kr/' },
        alumniOf: { '@type': 'CollegeOrUniversity', name: config.affiliation },
        email: (contacts.find(c => c.url.startsWith('mailto:')) || {}).url,
        sameAs: contacts.filter(c => isExternal(c.url)).map(c => c.url),
        knowsAbout: research.map(r => L(r, 'title', lang)),
        award: (profile.awards || []).filter(a => !a.earlier).map(a => `${L(a, 'title', lang)} (${F.period(a, 'en', { yearOnly: true })})`),
    };
    const works = pubs.filter(p => p.type === 'journal' || p.type === 'conference').map(p => {
        const d = parseDetails(p.details);
        const o = {
            '@type': 'ScholarlyArticle',
            headline: p.title,
            ...(p.title_en && hasHangul(p.title) && { alternativeHeadline: p.title_en }),
            author: splitAuthors(p.authors).map(a => {
                const [last, first] = a.split(',').map(s => s.trim());
                return a === F.SELF ? me : { '@type': 'Person', name: first ? `${first} ${last}` : last };
            }),
            datePublished: p.date ? String(p.date instanceof Date ? p.date.toISOString() : p.date).slice(0, 10) : String(p.year),
            ...(p.abstract && { abstract: p.abstract }),
            inLanguage: hasHangul(p.title) ? 'ko' : 'en',
            isPartOf: p.venue ? { '@type': p.type === 'journal' ? 'Periodical' : 'Event', name: p.venue, ...(d.volume && { volumeNumber: d.volume }), ...(d.number && { issueNumber: d.number }) } : undefined,
        };
        if (p.doi) {
            o.identifier = { '@type': 'PropertyValue', propertyID: 'DOI', value: p.doi };
            o.sameAs = `https://doi.org/${p.doi}`;
        } else if (p.links?.paper) o.sameAs = p.links.paper;
        return o;
    });
    const pats = (profile.patents || []).map(p => ({
        '@type': 'CreativeWork',
        additionalType: 'Patent',
        name: p.title,
        ...(p.title_ko && { alternateName: p.title_ko }),
        datePublished: String(p.year),
        author: splitAuthors(p.inventors).map(a => (a === F.SELF ? me : { '@type': 'Person', name: a })),
        identifier: { '@type': 'PropertyValue', propertyID: 'KR patent registration', value: String(p.number) },
    }));
    return JSON.stringify({ '@context': 'https://schema.org', '@graph': [person, ...works, ...pats] }).replace(/</g, '\\u003c');
}
