// Self-hosted Pretendard, subset to the characters this site actually uses.
//
// The build collects the text of every page (plus strings scripts insert later),
// then cuts the variable font (npm "pretendard", all weights kept) into three files:
//   latin      every non-Hangul character on the site          (all pages; preloaded)
//   hangul-en  Hangul that appears on English pages (the name) (tiny)
//   hangul     every other Hangul syllable on the site         (Korean pages; preloaded there)
// Each page inlines @font-face rules for the files its text needs; unicode-range
// keeps browsers from downloading the others. File names carry a content hash, so
// the service worker's cache-first rule never serves a stale subset.
// A character outside the site's text (e.g. typed into search) falls back to the system font.
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import subsetFont from 'subset-font';

const TTF = 'node_modules/pretendard/dist/public/variable/PretendardVariable.ttf';
const LICENSE = 'node_modules/pretendard/dist/LICENSE.txt';
export const FONT_URL = '/static/fonts/';
export const FONTS_SLOT = '<!-- @FONTS -->';
const FAMILY = 'Pretendard Variable';

const isHangul = cp => (cp >= 0xac00 && cp <= 0xd7a3) || (cp >= 0x1100 && cp <= 0x11ff) || (cp >= 0x3130 && cp <= 0x318f);

/** Text a reader sees: no head, scripts, styles or SVG; entities dropped. */
export const visibleText = html => html
    .replace(/<head[\s\S]*?<\/head>/i, ' ')
    .replace(/<(script|style|svg)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;|&#\d+;/gi, ' ');

const codepoints = text => new Set([...text].map(c => c.codePointAt(0)).filter(cp => cp > 0x20));

/** "U+41-43,U+61": compact unicode-range for a set of code points. */
function unicodeRange(cps) {
    const s = [...cps].sort((a, b) => a - b);
    const out = [];
    for (let i = 0; i < s.length; i++) {
        let j = i;
        while (j + 1 < s.length && s[j + 1] === s[j] + 1) j++;
        out.push(i === j ? `U+${s[i].toString(16)}` : `U+${s[i].toString(16)}-${s[j].toString(16)}`);
        i = j;
    }
    return out.join(',');
}

/**
 * Build the subsets. `pages` is a list of { html, english, extraText }.
 * Writes the woff2 files and the OFL licence to <distDir>/static/fonts/ and
 * returns the faces for withFonts().
 */
export async function buildFonts(pages, distDir) {
    const latin = new Set();
    const hangulEn = new Set();
    const hangul = new Set();
    for (const p of pages) {
        for (const cp of codepoints(visibleText(p.html) + (p.extraText || ''))) {
            if (!isHangul(cp)) latin.add(cp);
            else if (p.english && visibleText(p.html).includes(String.fromCodePoint(cp))) hangulEn.add(cp);
            else hangul.add(cp);
        }
    }
    for (const cp of hangulEn) hangul.delete(cp);

    const ttf = fs.readFileSync(TTF);
    const outDir = path.join(distDir, FONT_URL);
    fs.mkdirSync(outDir, { recursive: true });
    fs.copyFileSync(LICENSE, path.join(outDir, 'Pretendard-LICENSE.txt'));
    const faces = [];
    for (const [name, cps] of [['latin', latin], ['hangul-en', hangulEn], ['hangul', hangul]]) {
        if (!cps.size) continue;
        const woff2 = await subsetFont(ttf, String.fromCodePoint(...cps), { targetFormat: 'woff2' });
        const file = `pretendard-${name}.${crypto.createHash('sha256').update(woff2).digest('hex').slice(0, 8)}.woff2`;
        fs.writeFileSync(path.join(outDir, file), woff2);
        faces.push({
            name, file, cps, bytes: woff2.length,
            css: `@font-face{font-family:'${FAMILY}';font-style:normal;font-display:swap;font-weight:45 920;src:url(${FONT_URL}${file}) format('woff2');unicode-range:${unicodeRange(cps)}}`,
        });
    }
    return faces;
}

/**
 * Replace FONTS_SLOT with the faces this page can use, and preload the ones that
 * render its main text: Latin everywhere, the Hangul subset on Korean pages.
 */
export function withFonts(html, faces, { extraText = '' } = {}) {
    if (!html.includes(FONTS_SLOT)) return html;
    const text = visibleText(html);
    const used = codepoints(text + extraText);
    const needed = faces.filter(f => [...f.cps].some(cp => used.has(cp)));
    const shown = codepoints(text);
    const hangulShare = [...shown].filter(isHangul).length / (shown.size || 1);
    const preload = needed.filter(f => f.name === 'latin' || (f.name === 'hangul' && hangulShare > 0.2));
    const tags = preload.map(f => `<link rel="preload" href="${FONT_URL}${f.file}" as="font" type="font/woff2" crossorigin>`).join('')
        + `<style>${needed.map(f => f.css).join('')}</style>`;
    return html.replace(FONTS_SLOT, () => tags);
}
