#!/usr/bin/env node
/**
 * Static site builder for concrete-sangminlee.github.io
 *
 *   contents/*  ──►  dist/
 *     index.html, ko/index.html     homepage (English, Korean)      lib/home.js
 *     cv/**                         CVs: full/short/tailored, en/ko  lib/cv.js
 *     publications.bib, sitemap.xml, sw.js, static assets
 *
 * After the build, `npm run cv:pdf` (scripts/render.sh) prints the CVs to PDF
 * and renders the social preview images with headless Chrome.
 */

import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import esbuild from 'esbuild';
import { minify as minifyHTML } from 'html-minifier-terser';
import * as F from './lib/format.js';
import { loadData } from './lib/data.js';
import { UI } from './lib/i18n.js';
import { renderHome } from './lib/home.js';
import { renderCV, CV_VARIANTS, cvVariantsFrom } from './lib/cv.js';
import { renderOgCard, renderIcon } from './lib/og.js';
import { renderPaper, paperPath, hasPage } from './lib/paper.js';
import { renderSitemap } from './lib/sitemap.js';
import { renderStatement, STATEMENTS } from './lib/statement.js';
import { withFonts, copyFonts } from './lib/fonts.js';
import { withCsp } from './lib/csp.js';

const buildStart = Date.now();
const CONTENT_DIR = 'contents';
const DIST_DIR = 'dist';
const SITE_URL = 'https://concrete-sangminlee.github.io/';

function fail(msg) {
    console.error(`build.js: ${msg}`);
    process.exit(1);
}
if (!fs.existsSync(CONTENT_DIR)) fail(`content directory not found: ${CONTENT_DIR}/`);

const data = loadData(CONTENT_DIR, fail);
const { config, counts } = data;
const now = new Date();
const buildDate = now.toISOString().slice(0, 10);

const mainCss = (await esbuild.transform(fs.readFileSync('static/css/main.css', 'utf8'), { loader: 'css', minify: true })).code;
const template = fs.readFileSync('index.html', 'utf8');
const htmlMinify = html => minifyHTML(html, {
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
// Site pages get a CSP computed from their final bytes; render/ sources are printed locally.
const writeDist = (file, content) => {
    const p = path.join(DIST_DIR, file);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, file.endsWith('.html') && !file.startsWith('render/') ? withCsp(String(content)) : content);
};
// UI strings that scripts.js inserts, so the fonts cover them too.
const scriptText = fs.readFileSync('static/js/scripts.js', 'utf8');

// ==========================================================================
// Homepages
// ==========================================================================
const cvVariants = [...CV_VARIANTS, ...cvVariantsFrom(data.cvVariants, fail)];
const cvPath = (lang, variant = 'full') => cvVariants.find(v => v.lang === lang && v.variant === variant).path;

for (const lang of ['en', 'ko']) {
    const ko = lang === 'ko';
    const t = UI[lang];
    const root = ko ? '../' : '';
    const other = ko ? 'en' : 'ko';
    const page = renderHome(lang, data, { root, now, siteUrl: SITE_URL });

    let out = template;
    const slot = (name, html) => {
        if (!out.includes(`<!-- @SLOT:${name} -->`)) fail(`index.html is missing <!-- @SLOT:${name} -->`);
        out = out.split(`<!-- @SLOT:${name} -->`).join(html);
    };
    slot('nav', page.nav);
    slot('intro', page.intro);
    slot('sections', page.sections);

    const vars = {
        lang,
        root,
        title: ko ? config['title-ko'] || config.title : config.title,
        description: ko ? config['description-ko'] || config.description : config.description,
        name: ko ? config['name-ko'] : config.name,
        canonical: `${SITE_URL}${ko ? 'ko/' : ''}`,
        'og-image': `${SITE_URL}static/og/${ko ? 'og-ko' : 'og-en'}.png`,
        'og-image-alt': ko ? `${config['name-ko']}, ${config['role-ko']}` : `${config.name}, ${config.role}, ${config.affiliation}`,
        'og-locale': t.locale,
        'og-locale-alt': UI[other].locale,
        'lang-href': ko ? '../' : 'ko/',
        'lang-target': other,
        'lang-label': t.langSwitch.label,
        'lang-title': t.langSwitch.title,
        'ui-skip': t.skip,
        'ui-primary': t.primaryNav,
        'ui-mobile': t.mobileNav,
        'ui-theme': t.themeToggle,
        'ui-menu': t.menuOpen,
        'ui-close': t.close,
        'ui-copy': t.copy,
        'cite-title': t.citeTitle,
        'cite-format': t.citeFormat,
        'cite-copy': ko ? 'BibTeX 복사' : 'Copy BibTeX',
        'copyright-text': config['copyright-text'],
        'footer-updated': t.footerUpdated(now),
        'footer-blog': t.footerLinks.blog,
        'footer-source': t.footerLinks.source,
        'cv-page': cvPath(lang),
        'cv-label': t.cv,
        'cv2-page': cvPath(other),
        'cv2-label': t.cvOther,
    };
    const RAW = new Set(['copyright-text', 'footer-updated', 'root']);
    out = out.replace(/\{\{([\w-]+)\}\}/g, (m, k) => {
        if (typeof vars[k] !== 'string') fail(`index.html references unknown placeholder {{${k}}}`);
        return RAW.has(k) ? vars[k] : F.esc(vars[k]);
    });

    out = out.replace('<script type="application/ld+json" id="json-ld">{}</script>', () => `<script type="application/ld+json">${page.jsonLd}</script>`);
    out = out.replace('<script type="application/json" id="bib-data">{}</script>', () => `<script type="application/json" id="bib-data">${JSON.stringify(data.bibData).replace(/</g, '\\u003c')}</script>`);
    const cssRe = /\s*<!-- INLINE_CSS_HERE:[\s\S]*?-->\s*<link rel="stylesheet" href="(?:\.\.\/)*static\/css\/main\.css" \/>/;
    if (!cssRe.test(out)) fail('INLINE_CSS_HERE marker not found in index.html');
    out = out.replace(cssRe, () => `\n<style>${mainCss}</style>`);

    // The cite dialog shows BibTeX/APA from bib-data, so its glyphs need faces too.
    writeDist(ko ? 'ko/index.html' : 'index.html', await htmlMinify(withFonts(out, { extraText: scriptText + JSON.stringify(data.bibData) })));
}

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

// main.css is inlined; cv.css is inlined into the CV pages
fs.rmSync(path.join(DIST_DIR, 'static/css'), { recursive: true, force: true });

{
    const jsPath = path.join(DIST_DIR, 'static/js/scripts.js');
    const result = await esbuild.transform(fs.readFileSync(jsPath, 'utf8'), { loader: 'js', minify: true, target: 'es2019' });
    fs.writeFileSync(jsPath, result.code);
}

for (const f of ['robots.txt', 'manifest.json']) {
    if (fs.existsSync(f)) fs.copyFileSync(f, path.join(DIST_DIR, f));
}
writeDist('404.html', await htmlMinify(withFonts(fs.readFileSync('404.html', 'utf8'))));
copyFonts(DIST_DIR);

copyRecursive('apps/sequence-arena', path.join(DIST_DIR, 'sequence-arena'));


if (fs.existsSync('sw.js')) {
    const sw = fs.readFileSync('sw.js', 'utf8').replace('__CACHE_VERSION__', 'sml-' + Date.now());
    writeDist('sw.js', (await esbuild.transform(sw, { loader: 'js', minify: true, target: 'es2019' })).code);
}

writeDist('publications.bib', data.bibFile);

if (fs.existsSync('.well-known/security.txt')) fs.copyFileSync('.well-known/security.txt', path.join(DIST_DIR, 'security.txt'));

// ==========================================================================
// CVs and social cards. The render/*.html files have no web-font link or
// toolbar; scripts/render.sh prints/screenshots each one and deletes them.
// ==========================================================================
{
    const cvCss = (await esbuild.transform(fs.readFileSync('static/css/cv.css', 'utf8'), { loader: 'css', minify: true })).code;
    const photo = 'data:image/jpeg;base64,' + fs.readFileSync('static/assets/img/photo.jfif').toString('base64');
    const ctx = { ...data, buildDate: now, css: cvCss, photo, variants: cvVariants };
    const min = html => minifyHTML(html, { collapseWhitespace: true, conservativeCollapse: true, removeComments: true });
    for (const v of cvVariants) {
        writeDist(`${v.path}index.html`, await min(withFonts(renderCV(v.lang, { ...ctx, variant: v.variant, spec: v, mode: 'web' }))));
        writeDist(`render/pdf/${v.pdf.replace(/\.pdf$/, '')}.html`, await min(renderCV(v.lang, { ...ctx, variant: v.variant, spec: v, mode: 'print' })));
    }
    for (const s of STATEMENTS) {
        const file = path.join(CONTENT_DIR, 'statements', s.file);
        if (!fs.existsSync(file)) continue;
        const md = fs.readFileSync(file, 'utf8');
        const sctx = { config, css: cvCss, buildDate: now };
        writeDist(`${s.path}index.html`, await min(withFonts(renderStatement(s, md, { ...sctx, mode: 'web' }))));
        writeDist(`render/pdf/${s.pdf.replace(/\.pdf$/, '')}.html`, await min(renderStatement(s, md, { ...sctx, mode: 'print' })));
    }
    // render/png/<dir>/<name>[@WxH].html -> static/<dir>/<name>.png (default 1200x630)
    for (const lang of ['en', 'ko']) {
        writeDist(`render/png/og/og-${lang}.html`, renderOgCard(lang, { ...data, photo }));
    }
    for (const size of [192, 512]) {
        writeDist(`render/png/assets/icon-maskable-${size}@${size}x${size}.html`, renderIcon());
    }
}

// ==========================================================================
// Paper pages (Google Scholar citation tags) and the sitemap
// ==========================================================================
const paperPubs = data.pubs.filter(hasPage);
for (const p of paperPubs) {
    writeDist(`${paperPath(p)}index.html`, await htmlMinify(withFonts(renderPaper(p, data, { css: mainCss, siteUrl: SITE_URL }))));
}

writeDist('sitemap.xml', renderSitemap({
    siteUrl: SITE_URL,
    buildDate,
    cvs: cvVariants.filter(v => !v.custom || v.listed).map(v => v.path),
    papers: paperPubs.map(paperPath),
}));

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
console.log(`CVs: ${cvVariants.map(v => v.path).join(', ')}`);
console.log(`Paper pages: ${paperPubs.length}`);
console.log(`Build complete: dist/ (${(dirSize(DIST_DIR) / 1024).toFixed(1)} KB in ${((Date.now() - buildStart) / 1000).toFixed(2)}s)`);
