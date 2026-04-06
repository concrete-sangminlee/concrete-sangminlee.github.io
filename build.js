#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { marked } from 'marked';
import yaml from 'js-yaml';

const CONTENT_DIR = 'contents';
const DIST_DIR = 'dist';
const SECTIONS = ['home', 'publications', 'projects', 'patents', 'awards', 'services'];

// Read and parse config
const config = yaml.load(fs.readFileSync(path.join(CONTENT_DIR, 'config.yml'), 'utf8'));

// Configure marked
marked.use({ mangle: false, headerIds: false });

// Read all markdown sections
const sections = {};
for (const name of SECTIONS) {
    const md = fs.readFileSync(path.join(CONTENT_DIR, `${name}.md`), 'utf8');
    sections[name] = marked.parse(md);
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

// Generate stats HTML
function buildStats() {
    if (!config.stats) return '';
    return config.stats.map(s =>
        `<div class="stat-item">
                    <span class="stat-num" data-target="${s.value}">0</span>
                    <span class="stat-label">${s.label}</span>
                </div>`
    ).join('\n');
}

// Generate contact cards HTML
function buildContact() {
    if (!config.contact) return '';
    return config.contact.map(c => {
        const isExternal = !c.url.startsWith('mailto:') && c.url !== '/blog/';
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

// Read template
const template = fs.readFileSync('index.html', 'utf8');

// Replace all placeholders
let output = template;

// Config string values
for (const [key, val] of Object.entries(config)) {
    if (typeof val === 'string') {
        output = output.replace(
            new RegExp(`(<[^>]+id="${key}"[^>]*>)(</[^>]+>)`),
            `$1${val}$2`
        );
    }
}

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

// Remove libraries from dist that are no longer needed client-side
const toRemove = [
    'static/js/marked.min.js',
    'static/js/js-yaml.min.js',
    'static/js/bootstrap.bundle.min.js',
    'static/js/bootstrap.bundle.min.js.map',
    'static/js/tex-svg.js',
    'static/css/styles.css',
];
for (const f of toRemove) {
    const p = path.join(DIST_DIR, f);
    if (fs.existsSync(p)) fs.unlinkSync(p);
}

console.log('Build complete → dist/');
