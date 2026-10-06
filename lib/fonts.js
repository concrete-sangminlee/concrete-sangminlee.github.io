// Self-hosted Pretendard (npm "pretendard", dynamic subset: 92 woff2 files split by
// unicode-range). Instead of the render-blocking CDN stylesheet, each page gets
//   - inline @font-face rules for only the subsets its text can use, and
//   - <link rel="preload"> for the subset that carries most of its visible text
//     (more preloads compete with the HTML for bandwidth on slow connections),
// so the font arrives early and same-origin, and the text does not reflow late.
// Renderers emit FONTS_SLOT where the fonts go; build.js calls withFonts().
import fs from 'fs';
import path from 'path';

const PKG = 'node_modules/pretendard/dist';
const CSS = `${PKG}/web/variable/pretendardvariable-dynamic-subset.css`;
const FILES = `${PKG}/web/variable/woff2-dynamic-subset`;
export const FONT_URL = '/static/fonts/pretendard/';
export const FONTS_SLOT = '<!-- @FONTS -->';

let RULES = null;
function rules() {
    if (RULES) return RULES;
    const css = fs.readFileSync(CSS, 'utf8');
    RULES = [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].map(([, body]) => {
        const file = body.match(/url\(\.\/woff2-dynamic-subset\/([^)]+)\)/)[1];
        const ranges = body.match(/unicode-range:\s*([^;]+);/)[1].split(',').map(r => {
            const [a, b] = r.trim().replace(/^U\+/i, '').split('-');
            return [parseInt(a, 16), parseInt(b || a, 16)];
        });
        const decl = body.trim().replace(/\s+/g, ' ').replace(/url\(\.\/woff2-dynamic-subset\//, `url(${FONT_URL}`);
        return { file, ranges, css: `@font-face{${decl}}` };
    });
    return RULES;
}
const covers = (rule, cp) => rule.ranges.some(([a, b]) => cp >= a && cp <= b);

/** Copy the woff2 files and the OFL licence to dist/. */
export function copyFonts(distDir) {
    const out = path.join(distDir, FONT_URL);
    fs.mkdirSync(out, { recursive: true });
    for (const f of fs.readdirSync(FILES)) if (f.endsWith('.woff2')) fs.copyFileSync(path.join(FILES, f), path.join(out, f));
    fs.copyFileSync(`${PKG}/LICENSE.txt`, path.join(out, 'LICENSE.txt'));
}

const visibleText = html => html
    .replace(/<head[\s\S]*?<\/head>/i, ' ')
    .replace(/<(script|style|svg)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;|&#\d+;/gi, ' ');

/**
 * Replace FONTS_SLOT with the page's font tags. `extraText` covers text that
 * scripts insert later (UI strings), so its glyphs have a face too.
 */
export function withFonts(html, { extraText = '', maxPreload = 1 } = {}) {
    if (!html.includes(FONTS_SLOT)) return html;
    const all = rules();
    // Characters the page renders in its own fonts: visible text plus UI strings that
    // scripts insert. Data that is never shown as page text (search attributes, JSON)
    // is left out; the rare glyph outside these falls back to the system font.
    const text = visibleText(html);
    const used = new Set([...(text + extraText)].map(c => c.codePointAt(0)).filter(cp => cp > 0x20));
    const needed = all.filter(r => [...used].some(cp => covers(r, cp)));
    // Rank subsets by how much visible text they render. Browsers use the last
    // matching face, so attribute each character to the last rule that covers it.
    const counts = new Map();
    for (const ch of text) {
        const cp = ch.codePointAt(0);
        if (cp <= 0x20) continue;
        const r = [...needed].reverse().find(x => covers(x, cp));
        if (r) counts.set(r, (counts.get(r) || 0) + 1);
    }
    const total = [...counts.values()].reduce((a, b) => a + b, 0) || 1;
    const preload = [...counts.entries()].sort((a, b) => b[1] - a[1])
        .filter(([, n], i) => i === 0 || n / total >= 0.05).slice(0, maxPreload).map(([r]) => r);
    const tags = preload.map(r => `<link rel="preload" href="${FONT_URL}${r.file}" as="font" type="font/woff2" crossorigin>`).join('')
        + `<style>${needed.map(r => r.css).join('')}</style>`;
    return html.replace(FONTS_SLOT, () => tags);
}
