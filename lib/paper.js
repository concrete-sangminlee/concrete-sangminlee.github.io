// One page per paper, with Google Scholar (Highwire Press) citation meta tags.
//
// The page is in the paper's language, so the visible title matches citation_title
// as Google Scholar expects: English papers at /publications/<key>/, Korean-language
// papers at /ko/publications/<key>/. Early work is not included.
import { esc, hasHangul, dashes, renderAuthors, splitAuthors } from './format.js';
import { parseDetails, citeVenue } from './data.js';
import { FONTS_SLOT } from './fonts.js';
import { SELF } from './format.js';

export const PAPER_TYPES = ['journal', 'conference', 'thesis'];

const S = {
    en: {
        back: 'Sang Min Lee', backTitle: 'Back to the homepage', other: 'Ko', otherTitle: 'View the homepage in Korean',
        types: { journal: 'Journal article', conference: 'Conference paper', thesis: 'Thesis' },
        links: { paper: 'Paper', doi: 'DOI', pdf: 'PDF', code: 'Code', slides: 'Slides', poster: 'Poster', video: 'Video' },
        abstract: 'Abstract', cite: 'Cite', apa: 'APA', bib: 'BibTeX', allPubs: 'All publications',
    },
    ko: {
        back: '이상민', backTitle: '홈페이지로', other: 'En', otherTitle: '영어 홈페이지로',
        types: { journal: '학술지 논문', conference: '학술대회 논문', thesis: '학위논문' },
        links: { paper: '논문', doi: 'DOI', pdf: 'PDF', code: '코드', slides: '발표자료', poster: '포스터', video: '영상' },
        abstract: '초록', cite: '인용', apa: 'APA', bib: 'BibTeX', allPubs: '전체 논문',
    },
};

/** Language of the paper itself, which is also the language of its page. */
export const paperLang = p => (hasHangul(p.title) ? 'ko' : 'en');
export const paperPath = p => `${paperLang(p) === 'ko' ? 'ko/' : ''}publications/${p.bibKey}/`;
export const hasPage = p => PAPER_TYPES.includes(p.type);

/**
 * schema.org ScholarlyArticle (theses: Thesis). The site owner is a reference to
 * the Person node on the homepage (`<site>#person`). Used by the homepage graph
 * and, with `@context`, by each paper page.
 */
export function articleLd(p, siteUrl) {
    const d = parseDetails(p.details);
    const me = { '@id': `${siteUrl}#person` };
    const o = {
        '@type': p.type === 'thesis' ? 'Thesis' : 'ScholarlyArticle',
        url: `${siteUrl}${paperPath(p)}`,
        headline: p.title,
        ...(p.title_en && hasHangul(p.title) && { alternativeHeadline: p.title_en }),
        author: splitAuthors(p.authors).map(a => {
            const [last, first] = a.split(',').map(s => s.trim());
            return a === SELF ? me : { '@type': 'Person', name: first ? `${first} ${last}` : last };
        }),
        datePublished: p.date ? String(p.date instanceof Date ? p.date.toISOString() : p.date).slice(0, 10) : String(p.year),
        ...(p.abstract && { abstract: p.abstract }),
        inLanguage: hasHangul(p.title) ? 'ko' : 'en',
        isPartOf: p.venue && p.type !== 'thesis' ? { '@type': p.type === 'journal' ? 'Periodical' : 'Event', name: p.venue, ...(d.volume && { volumeNumber: d.volume }), ...(d.number && { issueNumber: d.number }) } : undefined,
        ...(p.type === 'thesis' && { sourceOrganization: { '@type': 'CollegeOrUniversity', name: p.venue }, ...(p.note && { genre: p.note }) }),
    };
    if (p.doi) {
        o.identifier = { '@type': 'PropertyValue', propertyID: 'DOI', value: p.doi };
        o.sameAs = `https://doi.org/${p.doi}`;
    } else if (p.links?.paper) o.sameAs = p.links.paper;
    return o;
}

/** JSON-LD for a paper page: the article, the page, and the author it belongs to. */
function pageLd(p, data, siteUrl, url) {
    const article = { ...articleLd(p, siteUrl), mainEntityOfPage: url };
    const person = { '@type': 'Person', '@id': `${siteUrl}#person`, name: data.config.name, alternateName: data.config['name-ko'], url: siteUrl };
    const crumbs = {
        '@type': 'BreadcrumbList',
        itemListElement: [
            { '@type': 'ListItem', position: 1, name: data.config.name, item: siteUrl },
            { '@type': 'ListItem', position: 2, name: paperLang(p) === 'ko' ? '논문' : 'Publications', item: `${siteUrl}${paperLang(p) === 'ko' ? 'ko/' : ''}#publications` },
            { '@type': 'ListItem', position: 3, name: p.title, item: url },
        ],
    };
    return JSON.stringify({ '@context': 'https://schema.org', '@graph': [article, person, crumbs] }).replace(/</g, '\\u003c');
}

/** Highwire Press tags: https://scholar.google.com/intl/en/scholar/inclusion.html#indexing */
function citationMeta(p, lang, url) {
    const ko = lang === 'ko';
    const tags = [];
    const add = (name, content) => content && tags.push(`<meta name="${name}" content="${esc(content)}">`);
    add('citation_title', p.title);
    for (const a of splitAuthors(ko ? p.authors_ko || p.authors : p.authors)) add('citation_author', a);
    const date = p.date ? String(p.date instanceof Date ? p.date.toISOString() : p.date).slice(0, 10).replace(/-/g, '/') : String(p.year);
    add('citation_publication_date', date);
    const venue = ko ? p.venue_ko || p.venue : citeVenue(p);
    const d = parseDetails(p.details);
    if (p.type === 'journal') add('citation_journal_title', venue);
    if (p.type === 'conference') add('citation_conference_title', venue);
    if (p.type === 'thesis') add('citation_dissertation_institution', ko ? p.venue_ko || p.venue : p.venue);
    add('citation_volume', d.volume);
    add('citation_issue', d.number);
    if (d.pages) {
        const [first, last] = d.pages.split(/-+/);
        add('citation_firstpage', first);
        add('citation_lastpage', last);
    }
    add('citation_doi', p.doi);
    add('citation_pdf_url', p.links?.pdf);
    add('citation_abstract_html_url', url);
    add('citation_language', lang);
    return tags.join('\n');
}

export function renderPaper(p, data, { css, siteUrl }) {
    const lang = paperLang(p);
    const ko = lang === 'ko';
    const t = S[lang];
    const url = `${siteUrl}${paperPath(p)}`;
    const home = ko ? '/ko/' : '/';
    const authors = ko ? p.authors_ko || p.authors : p.authors;
    const venue = ko ? p.venue_ko || p.venue : citeVenue(p);
    const note = ko ? p.note_ko || p.note : p.note;
    const title = p.title.replace(/[.?!]$/, '');
    const cite = data.bibData[p.bibKey] || {};

    const venueLine = [
        venue && `<em>${esc(venue)}</em>`,
        p.details && esc(dashes(p.details)),
        String(p.year),
    ].filter(Boolean).join(', ');
    const links = Object.entries(p.links || {}).map(([k, href]) => {
        const u = k === 'doi' && !/^https?:/.test(href) ? `https://doi.org/${href}` : href;
        return `<a class="link" href="${esc(u)}" target="_blank" rel="noopener">${esc(t.links[k] || k)}</a>`;
    });
    if (p.doi && !p.links?.doi) links.push(`<a class="link" href="https://doi.org/${esc(p.doi)}" target="_blank" rel="noopener">DOI</a>`);

    const description = `${authors} (${p.year}). ${title}. ${venue || ''}`.trim();
    return `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)} · ${esc(ko ? data.config['name-ko'] : data.config.name)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${url}">
${citationMeta(p, lang, url)}
<script type="application/ld+json">${pageLd(p, data, siteUrl, url)}</script>
<meta property="og:type" content="article">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${siteUrl}static/og/og-${lang}.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#111214" media="(prefers-color-scheme: dark)">
<meta name="color-scheme" content="light dark">
<link rel="icon" type="image/png" sizes="32x32" href="/static/assets/favicon-32.png">
${FONTS_SLOT}
<script>(function(){var d=document.documentElement,t=null;try{t=localStorage.getItem('theme')}catch(e){}if(t==='light'||t==='dark')d.setAttribute('data-theme',t)})();</script>
<style>${css}</style>
</head>
<body class="paper-page">
<header class="site-header">
    <div class="wrap header-inner">
        <a class="brand" href="${home}" title="${esc(t.backTitle)}">${esc(t.back)}</a>
        <div class="header-actions"><a class="lang-link" href="${ko ? '/' : '/ko/'}" hreflang="${ko ? 'en' : 'ko'}" title="${esc(t.otherTitle)}">${esc(t.other)}</a></div>
    </div>
</header>
<main id="main" class="wrap paper">
    <p class="paper-type">${esc(note || t.types[p.type])}</p>
    <h1 class="paper-title">${esc(title)}</h1>
    <p class="paper-authors">${renderAuthors(authors)}</p>
    <p class="paper-venue">${venueLine}</p>
    ${links.length ? `<p class="paper-links">${links.join('')}</p>` : ''}
    ${p.abstract ? `<section class="paper-sec" lang="en"><h2>${esc(t.abstract)}</h2><p class="paper-abs">${esc(p.abstract)}</p></section>` : ''}
    <section class="paper-sec">
        <h2>${esc(t.cite)}</h2>
        ${cite.apa ? `<h3>${t.apa}</h3><p class="bib is-apa">${esc(cite.apa)}</p>` : ''}
        ${cite.bib ? `<h3>${t.bib}</h3><pre class="bib">${esc(cite.bib)}</pre>` : ''}
    </section>
    <p class="paper-foot"><a class="link" href="${home}#${esc(p.bibKey)}">← ${esc(t.allPubs)}</a></p>
</main>
</body>
</html>`;
}
