// Shared formatting helpers for the homepage and the CVs.
import { marked } from 'marked';

export const SELF = 'Lee, S. M.';
export const SELF_KO = '이상민';

export const esc = s => String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
export const md = s => marked.parseInline(String(s ?? '')).trim();
export const hasHangul = s => /[\u3131-\uD79D]/.test(String(s ?? ''));
export const langAttr = s => (hasHangul(s) ? ' lang="ko"' : '');
export const isExternal = url => /^https?:\/\//.test(String(url));
/** "2021-2027" -> "2021–2027", "38(1), 267-268" -> "38(1), 267–268" */
export const dashes = s => String(s ?? '').replace(/(\d)\s*-\s*(\d|present|현재)/g, '$1–$2');

/** Localised field: obj.key_ko for Korean when present, otherwise obj.key. */
export function L(obj, key, lang) {
    if (!obj) return undefined;
    if (lang === 'ko' && obj[`${key}_ko`] !== undefined && obj[`${key}_ko`] !== null) return obj[`${key}_ko`];
    return obj[key];
}

// ------------------------------------------------------------------ dates
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Normalise a YAML date (2021, "2021-03", Date, "present") to {y, m} or "present". */
export function ym(v) {
    if (v === undefined || v === null || v === '') return null;
    if (v instanceof Date) return { y: v.getUTCFullYear(), m: v.getUTCMonth() + 1 };
    const s = String(v).trim();
    if (/^present$/i.test(s)) return 'present';
    const m = s.match(/^(\d{4})(?:[-.](\d{1,2}))?/);
    if (!m) throw new Error(`unrecognised date "${s}" (use YYYY or YYYY-MM)`);
    return { y: Number(m[1]), m: m[2] ? Number(m[2]) : null };
}

export function fmtDate(d, lang, { yearOnly = false } = {}) {
    if (!d) return '';
    if (d === 'present') return lang === 'ko' ? '현재' : 'present';
    if (yearOnly || !d.m) return String(d.y);
    return lang === 'ko' ? `${d.y}.${String(d.m).padStart(2, '0')}` : `${MONTHS[d.m - 1]} ${d.y}`;
}

/**
 * Period text.
 *   en: "Oct–Nov 2025", "Sep 2024 – Feb 2025", "Mar 2021 – present", "2023–2027"
 *   ko: "2025.10–2025.11", "2021.03–현재", "2023.03–2027.02 (예정)"
 */
export function period(item, lang, { yearOnly = false, expectedSuffix = true } = {}) {
    const ko = lang === 'ko';
    const a = ym(item.start);
    const b = ym(item.end);
    const yearsOnly = yearOnly || !a.m || (b && b !== 'present' && !b.m);
    let out;
    if (!b) out = fmtDate(a, lang, { yearOnly });
    else if (b === 'present') {
        const sa = fmtDate(a, lang, { yearOnly });
        out = ko ? `${sa}–현재` : yearsOnly ? `${sa}–present` : `${sa} – present`;
    } else if (yearsOnly) out = a.y === b.y ? String(a.y) : `${a.y}–${b.y}`;
    else if (a.y === b.y && a.m === b.m) out = fmtDate(a, lang);
    else if (ko) out = `${fmtDate(a, lang)}–${fmtDate(b, lang)}`;
    else if (a.y === b.y) out = `${MONTHS[a.m - 1]}–${MONTHS[b.m - 1]} ${a.y}`;
    else out = `${fmtDate(a, lang)} – ${fmtDate(b, lang)}`;
    if (item.expected && expectedSuffix) out += ko ? ' (예정)' : ' (expected)';
    return out;
}

/** Sort key for "newest first": ongoing entries first, then by end, then start. */
export function recency(item) {
    const a = ym(item.start) || { y: 0, m: 0 };
    const b = ym(item.end);
    const end = b === 'present' ? 999999 : b ? b.y * 100 + (b.m || 12) : a.y * 100 + (a.m || 12);
    return end * 1e6 + a.y * 100 + (a.m || 0);
}

// ------------------------------------------------------------------ authors
/** "Lee, S. M., Hong, J., & Kang, T. H.-K." -> ["Lee, S. M.", "Hong, J.", "Kang, T. H.-K."];
 *  "안병욱, 이동혁, 이상민" -> ["안병욱", "이동혁", "이상민"] */
export function splitAuthors(str) {
    const s = String(str ?? '');
    if (hasHangul(s) && !/[A-Z][a-z]+,\s/.test(s)) return s.split(/\s*[,，]\s*/).filter(Boolean);
    return s.split(/,\s*(?:&\s*)?(?=[A-Z][A-Za-z'\-]+,\s)/).map(x => x.replace(/^&\s*/, '').trim()).filter(Boolean);
}

/** HTML author list with the site owner wrapped in <span class="me">. */
export function renderAuthors(str) {
    const parts = splitAuthors(str);
    const korean = parts.length && parts.every(hasHangul);
    const list = parts.map(a => (a === SELF || a === SELF_KO ? `<span class="me">${esc(a)}</span>` : esc(a)));
    if (korean) return list.join(', ');
    if (list.length <= 1) return list.join('');
    return list.slice(0, -1).join(', ') + ', &amp; ' + list[list.length - 1];
}

/** "Field: value" notes -> label + value markup. */
export function noteHtml(n) {
    const kv = String(n).match(/^([^:]{2,24}):\s+(.+)$/);
    return kv && !/\d/.test(kv[1])
        ? `<span class="cv-k">${esc(kv[1])}:</span> ${md(kv[2])}`
        : md(n);
}
