#!/usr/bin/env node
/**
 * Post-build checks on dist/. Run after `npm run build`, before `npm run render`.
 *
 *   1. English pages are English only: no Hangul in the visible text of the English
 *      homepage, CVs (web and print), and social card. A few deliberate
 *      Korean strings (the link to the Korean pages, the Korean name) are allowed.
 *   2. Internal links resolve: every same-site href/src in the generated pages points
 *      to a file in dist/ (CV PDFs: to the page scripts/render.sh prints them from).
 *   3. Every sitemap URL resolves to a page in dist/.
 *
 * Exits non-zero with a list of problems. No dependencies.
 */
import fs from 'fs';
import path from 'path';

const DIST = 'dist';
const SITE = 'https://concrete-sangminlee.github.io/';
// Served from other repositories under the same domain.
const EXTERNAL_PREFIXES = ['/blog/', '/thinkmany/'];
// Korean text that belongs on English pages.
const ALLOWED_KOREAN = ['한국어로 보기', '한국어', '국문 CV', '이상민'];

if (!fs.existsSync(DIST)) {
    console.error('check: dist/ not found (run npm run build first)');
    process.exit(1);
}

const problems = [];
const rel = p => path.relative(DIST, p).split(path.sep).join('/');

function walk(dir, out = []) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(p, out);
        else out.push(p);
    }
    return out;
}

// Pages this repo generates (sequence-arena is a vendored app with its own checks).
const pages = walk(DIST).filter(p => p.endsWith('.html') && !rel(p).startsWith('sequence-arena/'));

// ------------------------------------------------------------------ 1. English only
const isEnglish = file => {
    const r = rel(file);
    if (r === 'index.html') return true; // 404.html is bilingual by design
    if (r.startsWith('cv/') && !r.startsWith('cv/ko/')) return true;
    if (r.startsWith('render/pdf/')) return !/-ko(-|\.html$)/.test(path.basename(r));
    if (r.startsWith('render/png/')) return path.basename(r) === 'og-en.html';
    return false;
};

/** Visible text: drop <head>, scripts, styles, SVG, tags (and so attributes); decode basic entities. */
function visibleText(html) {
    return html
        .replace(/<head[\s\S]*?<\/head>/gi, ' ')
        .replace(/<(script|style|svg|template)\b[\s\S]*?<\/\1>/gi, ' ')
        .replace(/<!--[\s\S]*?-->/g, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
        .replace(/\s+/g, ' ');
}

const HANGUL = /[\u1100-\u11FF\u3130-\u318F\uAC00-\uD7AF]/;
for (const file of pages.filter(isEnglish)) {
    let text = visibleText(fs.readFileSync(file, 'utf8'));
    for (const s of ALLOWED_KOREAN) text = text.split(s).join(' ');
    // Report each offending phrase with a little context.
    const hits = new Set();
    for (const m of text.matchAll(/[^\s]*[\u1100-\u11FF\u3130-\u318F\uAC00-\uD7AF][^.;·|]{0,40}/g)) hits.add(m[0].trim());
    if (hits.size) problems.push(`Korean text on English page ${rel(file)}:\n${[...hits].map(h => `      "${h}"`).join('\n')}`);
    else if (HANGUL.test(text)) problems.push(`Korean text on English page ${rel(file)}`);
}

// ------------------------------------------------------------------ 2. internal links
function resolveTarget(fromFile, url) {
    const clean = url.split('#')[0].split('?')[0];
    if (!clean) return null;
    let p = clean.startsWith('/') ? path.join(DIST, clean) : path.join(path.dirname(fromFile), clean);
    if (clean.endsWith('/') || (fs.existsSync(p) && fs.statSync(p).isDirectory())) p = path.join(p, 'index.html');
    return p;
}

function exists(target) {
    if (fs.existsSync(target)) return true;
    // CV PDFs are printed by scripts/render.sh from dist/render/pdf/<name>.html.
    const r = rel(target);
    if (/^cv\/[^/]+\.pdf$/.test(r)) return fs.existsSync(path.join(DIST, 'render/pdf', path.basename(r, '.pdf') + '.html'));
    return false;
}

for (const file of pages.filter(p => !rel(p).startsWith('render/'))) {
    const html = fs.readFileSync(file, 'utf8')
        .replace(/<script\b[\s\S]*?<\/script>/gi, ' '); // JSON data, not links
    const broken = new Set();
    for (const m of html.matchAll(/\s(?:href|src|srcset)=["']?([^"'\s>]+)/gi)) {
        let url = m[1].replace(/&amp;/g, '&');
        if (url.startsWith(SITE)) url = '/' + url.slice(SITE.length);
        if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(url)) continue; // external, mailto:, data:, fragment
        const target = resolveTarget(file, url);
        if (!target) continue;
        if (EXTERNAL_PREFIXES.some(x => `/${rel(target)}`.startsWith(x))) continue;
        if (!exists(target)) broken.add(url);
    }
    if (broken.size) problems.push(`Broken links in ${rel(file)}: ${[...broken].join(', ')}`);
}

// ------------------------------------------------------------------ 3. sitemap
const sitemapPath = path.join(DIST, 'sitemap.xml');
if (fs.existsSync(sitemapPath)) {
    for (const [, loc] of fs.readFileSync(sitemapPath, 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)) {
        if (!loc.startsWith(SITE)) { problems.push(`sitemap: ${loc} is not on ${SITE}`); continue; }
        const p = '/' + loc.slice(SITE.length);
        if (EXTERNAL_PREFIXES.some(x => p.startsWith(x))) continue;
        if (!exists(resolveTarget(DIST, p))) problems.push(`sitemap: ${loc} has no page in dist/`);
    }
}

// ------------------------------------------------------------------ report
if (problems.length) {
    console.error(`check: ${problems.length} problem${problems.length === 1 ? '' : 's'}\n`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
}
console.log(`check: OK (${pages.filter(isEnglish).length} English pages, ${pages.length} pages, links and sitemap)`);
