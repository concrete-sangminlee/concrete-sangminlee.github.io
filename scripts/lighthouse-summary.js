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
const out = `### Lighthouse (mobile)\n\n${md}\n\nSEO is not asserted for /statements/ (noindex on purpose).\n`;
console.log(out);
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, out);
