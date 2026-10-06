#!/usr/bin/env node
// Prints the Lighthouse scores from .lighthouseci/ as a Markdown table, and appends
// it to the GitHub Actions job summary when run in CI. Run after `lhci collect`.
import fs from 'fs';

const dir = '.lighthouseci';
if (!fs.existsSync(dir)) { console.error('lighthouse-summary: .lighthouseci/ not found'); process.exit(0); }
const rows = fs.readdirSync(dir).filter(f => /^lhr-.*\.json$/.test(f)).map(f => JSON.parse(fs.readFileSync(`${dir}/${f}`, 'utf8')))
    .map(r => {
        const s = id => Math.round((r.categories[id]?.score ?? 0) * 100);
        const a = id => r.audits[id]?.displayValue ?? '';
        return [r.finalDisplayedUrl.replace(/^https?:\/\/[^/]+/, '').replace(/index\.html$/, ''), s('performance'), s('accessibility'), s('best-practices'), s('seo'), a('first-contentful-paint'), a('largest-contentful-paint'), a('cumulative-layout-shift')];
    })
    .sort((a, b) => a[0].localeCompare(b[0]));
const head = ['Page', 'Perf', 'A11y', 'BP', 'SEO', 'FCP', 'LCP', 'CLS'];
const md = [head, head.map(() => '---'), ...rows].map(r => `| ${r.join(' | ')} |`).join('\n');

// What to fix: failed audits in the gated categories, with the offending elements,
// and the LCP element for pages under the performance target.
const notes = [];
for (const f of fs.readdirSync(dir).filter(x => /^lhr-.*\.json$/.test(x))) {
    const r = JSON.parse(fs.readFileSync(`${dir}/${f}`, 'utf8'));
    const page = r.finalDisplayedUrl.replace(/^https?:\/\/[^/]+/, '').replace(/index\.html$/, '');
    for (const cat of ['accessibility', 'best-practices', 'seo']) {
        for (const ref of r.categories[cat]?.auditRefs || []) {
            const a = r.audits[ref.id];
            if (!ref.weight || a.score === null || a.score >= 1) continue;
            if (cat === 'seo' && page.startsWith('/statements/')) continue;
            const items = (a.details?.items || []).slice(0, 3).map(i => i.node?.snippet || i.node?.selector || i.url || '').filter(Boolean);
            notes.push(`- \`${page}\` ${cat}: **${a.id}** (${a.title})${items.length ? `\n${items.map(s => `  - \`${String(s).slice(0, 140)}\``).join('\n')}` : ''}`);
        }
    }
    if ((r.categories.performance?.score ?? 1) < 0.9) {
        const lcp = r.audits['largest-contentful-paint-element']?.details?.items?.[0]?.items?.[0]?.node?.snippet;
        const blocking = (r.audits['render-blocking-resources']?.details?.items || []).map(i => i.url).join(', ');
        notes.push(`- \`${page}\` performance ${Math.round(r.categories.performance.score * 100)}: LCP element \`${String(lcp || '?').slice(0, 120)}\`${blocking ? `; render-blocking: ${blocking}` : ''}`);
    }
}
const out = `### Lighthouse (mobile)\n\n${md}\n\nSEO is not asserted for /statements/ (noindex on purpose).\n${notes.length ? `\n${notes.join('\n')}\n` : ''}`;
console.log(out);
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, out);
