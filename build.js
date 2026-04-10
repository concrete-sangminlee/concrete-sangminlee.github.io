#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { marked } from 'marked';
import yaml from 'js-yaml';
import sharp from 'sharp';
import esbuild from 'esbuild';
import { minify as minifyHTML } from 'html-minifier-terser';

const CONTENT_DIR = 'contents';
const DIST_DIR = 'dist';
const SECTIONS = ['home', 'education', 'experiences', 'research-interests', 'publications', 'projects', 'patents', 'awards', 'services'];

// Validate content dir + parse config with helpful errors
if (!fs.existsSync(CONTENT_DIR)) {
    console.error(`build.js: content directory not found: ${CONTENT_DIR}/`);
    process.exit(1);
}
const configPath = path.join(CONTENT_DIR, 'config.yml');
if (!fs.existsSync(configPath)) {
    console.error(`build.js: missing ${configPath}`);
    process.exit(1);
}
let config;
try {
    config = yaml.load(fs.readFileSync(configPath, 'utf8'));
} catch (err) {
    console.error(`build.js: failed to parse ${configPath}: ${err.message}`);
    process.exit(1);
}
if (!config || typeof config !== 'object') {
    console.error(`build.js: ${configPath} is empty or not an object`);
    process.exit(1);
}

// (marked v17 dropped mangle/headerIds options — defaults are now safe)

// Read all markdown sections
const sections = {};
for (const name of SECTIONS) {
    const mdPath = path.join(CONTENT_DIR, `${name}.md`);
    if (!fs.existsSync(mdPath)) {
        console.error(`build.js: missing content file ${mdPath}`);
        process.exit(1);
    }
    sections[name] = marked.parse(fs.readFileSync(mdPath, 'utf8'));
}

// Wrap content in terminal window (all sections except home)
function wrapInTerminal(name, html) {
    return `<div class="term">
            <div class="term-bar">
                <span class="dot dot-r"></span>
                <span class="dot dot-y"></span>
                <span class="dot dot-g"></span>
                <span class="term-title">~/${name}/</span>
            </div>
            <div class="term-body">
                <div class="term-cmd"><span class="g">$</span> ls ./${name}/</div>
                ${html}
            </div>
        </div>`;
}

// Generate stats HTML — pre-render final value (no "0" start) so LCP fires immediately
function buildStats() {
    if (!config.stats) return '';
    return config.stats.map(s =>
        `<div class="stat-item" title="${s.value}${s.suffix || ''} ${s.label.toLowerCase()}">
                    <span class="stat-num" data-target="${s.value}"${s.suffix ? ` data-suffix="${s.suffix}"` : ''}>${s.value}${s.suffix || ''}</span>
                    <span class="stat-label">${s.label}</span>
                </div>`
    ).join('\n');
}

// Generate contact cards HTML
function buildContact() {
    if (!config.contact) return '';
    return config.contact.map(c => {
        const isExternal = !c.url.startsWith('mailto:') && !c.url.startsWith('/');
        const attrs = isExternal ? ' target="_blank" rel="noopener noreferrer"' : '';
        return `<a class="contact-card" href="${c.url}"${attrs}>
                    <span class="contact-icon" aria-hidden="true">[${c.code}]</span>
                    <span class="contact-label">${c.label}</span>
                    <span class="contact-val">${c.value}</span>
                </a>`;
    }).join('\n');
}

// Generate featured paper HTML
function buildFeaturedPaper() {
    if (!config.featured_paper) return '';
    const fp = config.featured_paper;
    return `<div class="featured-label">// FEATURED PAPER</div>
                <div class="featured-venue">${fp.venue}</div>
                <div class="featured-title">${fp.title}</div>
                <div class="featured-authors">${fp.authors}</div>`;
}

// Build section HTML with terminal wrapping
function buildSection(name) {
    const html = sections[name];
    return name === 'home' ? html : wrapInTerminal(name, html);
}

// Parse publications.bib into a JSON-LD @graph of ScholarlyArticle entries
function parseBibToJsonLd(bibPath) {
    if (!fs.existsSync(bibPath)) return [];
    const bib = fs.readFileSync(bibPath, 'utf8');
    const entries = [];
    const re = /@(\w+)\{([^,]+),\s*([\s\S]*?)\n\}/g;
    let m;
    while ((m = re.exec(bib))) {
        const fields = {};
        const fieldRe = /(\w+)\s*=\s*\{([^}]*)\}/g;
        let f;
        while ((f = fieldRe.exec(m[3]))) fields[f[1].toLowerCase()] = f[2].trim();
        const authors = (fields.author || '').split(/\s+and\s+/).map(name => {
            const parts = name.split(',').map(s => s.trim());
            return parts.length === 2 ? { '@type': 'Person', name: parts[1] + ' ' + parts[0] } : { '@type': 'Person', name };
        });
        const article = {
            '@type': 'ScholarlyArticle',
            headline: fields.title,
            author: authors,
            datePublished: fields.year,
            isPartOf: fields.journal ? { '@type': 'Periodical', name: fields.journal, volumeNumber: fields.volume, issueNumber: fields.number } : undefined,
            pageStart: fields.pages ? fields.pages.split('--')[0] : undefined,
            pageEnd: fields.pages && fields.pages.includes('--') ? fields.pages.split('--')[1] : undefined,
        };
        if (fields.doi) {
            article.identifier = { '@type': 'PropertyValue', propertyID: 'DOI', value: fields.doi };
            article.sameAs = 'https://doi.org/' + fields.doi;
        }
        if (fields.url && !article.sameAs) article.sameAs = fields.url;
        // strip undefined
        Object.keys(article).forEach(k => article[k] === undefined && delete article[k]);
        entries.push(article);
    }
    return entries;
}
const articleEntries = parseBibToJsonLd(path.join(CONTENT_DIR, 'publications.bib'));

// Read template
const template = fs.readFileSync('index.html', 'utf8');

// Replace all placeholders
let output = template;

// Inject ScholarlyArticle JSON-LD graph
const articlesJson = JSON.stringify({ '@context': 'https://schema.org', '@graph': articleEntries });
output = output.replace(
    /<script type="application\/ld\+json" id="json-ld-articles">.*?<\/script>/,
    `<script type="application/ld+json" id="json-ld-articles">${articlesJson}</script>`
);

// Config string values
for (const [key, val] of Object.entries(config)) {
    if (typeof val === 'string') {
        output = output.replace(
            new RegExp(`(<[^>]+id="${key}"[^>]*>)[^<]*(</[^>]+>)`),
            `$1${val}$2`
        );
    }
}

// Section numbering (inject into h2 text)
const allSectionIds = [...SECTIONS.filter(s => s !== 'home'), 'contact'];
allSectionIds.forEach((name, i) => {
    const num = String(i + 1).padStart(2, '0');
    const idAttr = `id="${name}-subtitle"`;
    const re = new RegExp(`(${idAttr}>)([^<]*)`);
    output = output.replace(re, `$1<span class="sec-num">${num}.</span> $2`);
});

// Section content
for (const name of SECTIONS) {
    output = output.replace(
        `<div class="main-body" id="${name}-md"></div>`,
        `<div class="main-body" id="${name}-md">${buildSection(name)}</div>`
    );
}

// Stats
output = output.replace(
    '<div class="stats-grid" id="stats-grid"></div>',
    `<div class="stats-grid" id="stats-grid">${buildStats()}</div>`
);

// Contact
output = output.replace(
    '<div class="contact-grid" id="contact-grid"></div>',
    `<div class="contact-grid" id="contact-grid">${buildContact()}</div>`
);

// Featured paper
output = output.replace(
    '<a href="#publications" class="featured-paper" id="featured-paper"></a>',
    `<a href="#publications" class="featured-paper" id="featured-paper">${buildFeaturedPaper()}</a>`
);

// Remove client-side parsing libraries (no longer needed)
output = output.replace(/\s*<script[^>]*src="static\/js\/marked\.min\.js"[^>]*><\/script>\s*/g, '\n');
output = output.replace(/\s*<script[^>]*src="static\/js\/js-yaml\.min\.js"[^>]*><\/script>\s*/g, '\n');
output = output.replace(/\s*<script[^>]*src="static\/js\/bootstrap\.bundle\.min\.js"[^>]*><\/script>\s*/g, '\n');
output = output.replace(/\s*<!-- Markdown -->\s*/g, '\n');
output = output.replace(/\s*<!-- Bootstrap core JS-->\s*/g, '\n');

// Remove polyfill.io (ES6 is universally supported now)
output = output.replace(/\s*<!-- For Compatability -->\s*/g, '\n');
output = output.replace(/\s*<script[^>]*polyfill\.io[^>]*><\/script>\s*/g, '\n');

// Remove styles.css link (Bootstrap) — main.css is now self-contained
output = output.replace(/\s*<link[^>]*href="static\/css\/styles\.css"[^>]*\/>\s*/g, '\n');
output = output.replace(/\s*<!-- Core theme CSS \(includes Bootstrap\)-->\s*/g, '\n');

// Inject <picture> tag for WebP with JFIF fallback
output = output.replace(
    '<img src="static/assets/img/photo.jfif" alt="Sang Min Lee" class="hero-photo" loading="eager" fetchpriority="high" width="200" height="200">',
    '<picture><source srcset="static/assets/img/photo.webp" type="image/webp"><img src="static/assets/img/photo.jfif" alt="Sang Min Lee" class="hero-photo" loading="eager" fetchpriority="high" width="200" height="200"></picture>'
);

// Minify HTML
output = await minifyHTML(output, {
    collapseWhitespace: true,
    removeComments: true,
    removeRedundantAttributes: true,
    removeEmptyAttributes: true,
    minifyCSS: true,
    minifyJS: true,
    collapseBooleanAttributes: true,
    removeScriptTypeAttributes: true,
    removeStyleLinkTypeAttributes: true,
});

// Ensure dist directory exists
if (!fs.existsSync(DIST_DIR)) fs.mkdirSync(DIST_DIR, { recursive: true });

// Write output
fs.writeFileSync(path.join(DIST_DIR, 'index.html'), output);

// Copy static assets
function copyRecursive(src, dest) {
    if (!fs.existsSync(src)) return;
    if (fs.statSync(src).isDirectory()) {
        if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
        for (const entry of fs.readdirSync(src)) {
            if (entry === '.DS_Store') continue;
            copyRecursive(path.join(src, entry), path.join(dest, entry));
        }
    } else {
        fs.copyFileSync(src, dest);
    }
}

copyRecursive('static', path.join(DIST_DIR, 'static'));

// Optimize images
const photoSrc = path.join(DIST_DIR, 'static/assets/img/photo.jfif');
const photoDest = path.join(DIST_DIR, 'static/assets/img/photo.webp');
await sharp(photoSrc).webp({ quality: 80 }).toFile(photoDest);

const faviconPath = path.join(DIST_DIR, 'static/assets/favicon-32.png');
const faviconTmp = faviconPath + '.tmp';
await sharp(faviconPath).png({ compressionLevel: 9 }).toFile(faviconTmp);
fs.renameSync(faviconTmp, faviconPath);

// Generate PWA / iOS icons from photo
// Palette PNG drastically cuts file size for icons (these are install-only assets)
const iconSizes = [
    { size: 192, name: 'icon-192.png' },
    { size: 512, name: 'icon-512.png' },
    { size: 180, name: 'apple-touch-icon.png' },
];
await Promise.all(iconSizes.map(({ size, name }) =>
    sharp(photoSrc)
        .resize(size, size, { kernel: sharp.kernel.lanczos3 })
        .png({ compressionLevel: 9, palette: true, quality: 80 })
        .toFile(path.join(DIST_DIR, 'static/assets', name))
));

// Minify CSS and JS in parallel
await Promise.all([
    (async () => {
        const cssPath = path.join(DIST_DIR, 'static/css/main.css');
        const css = fs.readFileSync(cssPath, 'utf8');
        const result = await esbuild.transform(css, { loader: 'css', minify: true });
        fs.writeFileSync(cssPath, result.code);
    })(),
    (async () => {
        const jsPath = path.join(DIST_DIR, 'static/js/scripts.js');
        const js = fs.readFileSync(jsPath, 'utf8');
        const result = await esbuild.transform(js, { loader: 'js', minify: true, target: 'es2020' });
        fs.writeFileSync(jsPath, result.code);
    })(),
]);

// Remove libraries from dist that are no longer needed client-side
const toRemove = [
    'static/js/marked.min.js',
    'static/js/js-yaml.min.js',
    'static/js/bootstrap.bundle.min.js',
    'static/js/bootstrap.bundle.min.js.map',
    'static/js/tex-svg.js',
    'static/css/styles.css',
    'static/assets/leonard_round.png',
];
for (const f of toRemove) {
    const p = path.join(DIST_DIR, f);
    if (fs.existsSync(p)) fs.unlinkSync(p);
}

// Copy root-level files to dist (sitemap.xml gets a fresh lastmod stamp)
for (const f of ['robots.txt', '404.html', 'manifest.json']) {
    if (fs.existsSync(f)) fs.copyFileSync(f, path.join(DIST_DIR, f));
}

// Sitemap: stamp every <lastmod> with today's date in YYYY-MM-DD
if (fs.existsSync('sitemap.xml')) {
    const today = new Date().toISOString().slice(0, 10);
    let sitemap = fs.readFileSync('sitemap.xml', 'utf8');
    sitemap = sitemap.replace(/<lastmod>[^<]*<\/lastmod>/g, `<lastmod>${today}</lastmod>`);
    fs.writeFileSync(path.join(DIST_DIR, 'sitemap.xml'), sitemap);
}

// Service Worker: stamp CACHE_NAME with current build timestamp so old caches are evicted on every deploy
if (fs.existsSync('sw.js')) {
    const cacheVersion = 'sml-' + Date.now();
    const sw = fs.readFileSync('sw.js', 'utf8').replace('__CACHE_VERSION__', cacheVersion);
    // Minify the SW too
    const minified = await esbuild.transform(sw, { loader: 'js', minify: true, target: 'es2020' });
    fs.writeFileSync(path.join(DIST_DIR, 'sw.js'), minified.code);
}

// Copy publications.bib from contents to dist
const bibSrc = path.join(CONTENT_DIR, 'publications.bib');
if (fs.existsSync(bibSrc)) fs.copyFileSync(bibSrc, path.join(DIST_DIR, 'publications.bib'));

// Copy .well-known directory (security.txt etc.)
if (fs.existsSync('.well-known')) {
    copyRecursive('.well-known', path.join(DIST_DIR, '.well-known'));
}

console.log('Build complete → dist/');
