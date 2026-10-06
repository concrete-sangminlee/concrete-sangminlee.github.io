// Research and teaching statements: A4 documents in the CV style, from
// contents/statements/*.md. Unlisted (noindex, not in the sitemap, not linked
// from the homepage); share the page or the PDF.
import { marked } from 'marked';
import { esc } from './format.js';
import { renderHead } from './cv.js';
import { FONTS_SLOT } from './fonts.js';

const SITE = 'concrete-sangminlee.github.io';

export const STATEMENTS = [
    { id: 'research', file: 'research-statement.md', title: 'Research Statement', path: 'statements/research/', pdf: 'Sang-Min-Lee-Research-Statement.pdf' },
    { id: 'teaching', file: 'teaching-statement.md', title: 'Teaching Statement', path: 'statements/teaching/', pdf: 'Sang-Min-Lee-Teaching-Statement.pdf' },
];

/** Markdown body without the leading "# Title" and byline paragraph (the page header replaces them). */
function bodyHtml(md) {
    const text = md.replace(/^#\s+.*\n+/, '').replace(/^(?!#)[^\n]+\n+/, '');
    return marked.parse(text);
}

export function renderStatement(s, markdown, { config, css, buildDate, mode }) {
    const url = `https://${SITE}/${s.path}`;
    const others = STATEMENTS.filter(x => x.id !== s.id);
    const footer = `${config.name} · ${s.title}`;
    const pageCss = `@page { size: A4; margin: 15mm 18mm 17mm; @bottom-left { content: "${footer}"; font: 7.5pt "Pretendard Variable", Pretendard, sans-serif; color: #8a8a8a; } @bottom-right { content: counter(page) " / " counter(pages); font: 7.5pt "Pretendard Variable", Pretendard, sans-serif; color: #8a8a8a; } }`;
    const toolbar = mode !== 'web' ? '' : `<nav class="cv-bar" aria-label="Statement">
        <a href="/">← Homepage</a>
        <span class="cv-seg">${STATEMENTS.map(x => (x.id === s.id ? `<span aria-current="page">${esc(x.title)}</span>` : `<a href="/${x.path}">${esc(x.title)}</a>`)).join('')}</span>
        <span class="cv-seg"><a href="/cv/">CV</a></span>
        <a class="cv-dl" href="/cv/${s.pdf}" download="${s.pdf}">Download PDF</a>
    </nav>`;
    const updated = buildDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(`${config.name}, ${s.title}`)}</title>
<meta name="description" content="${esc(`${s.title}. ${config.name}, ${config.role}, ${config.affiliation}.`)}">
<meta name="author" content="${esc(config.name)}">
<meta name="robots" content="noindex">
<meta name="color-scheme" content="light">
<link rel="canonical" href="${url}">
<link rel="icon" type="image/png" sizes="32x32" href="/static/assets/favicon-32.png">
${mode === 'web' ? FONTS_SLOT : ''}
<style>${pageCss}${css}</style>
</head>
<body class="is-en mode-${mode} is-statement">
${toolbar}
<main class="sheet">
${renderHead('en', config)}
<h2 class="st-title">${esc(s.title)}</h2>
<div class="st">${bodyHtml(markdown)}</div>
<footer class="cv-foot">Last updated ${esc(updated)} · ${others.map(x => `<a href="${`https://${SITE}/${x.path}`}">${esc(x.title)}</a>`).join(' · ')}</footer>
</main>
</body>
</html>`;
}
