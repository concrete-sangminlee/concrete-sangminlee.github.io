#!/usr/bin/env node
/**
 * Weekly maintenance report (.github/workflows/maintenance.yml). Needs network.
 *
 *   node scripts/maintenance.js [--out report.md]
 *
 *   1. New publications: works on the ORCID record (contents/config.yml) that are
 *      not in contents/publications.yml, matched by DOI or normalised title.
 *   2. External links: every http(s) link in the built pages (dist/, run after
 *      `npm run build`) is requested; dead links are reported. Sites that refuse
 *      automated requests (401/403/429) count as reachable.
 *
 * Writes a Markdown report and exits 0 either way; prints FINDINGS=<n> for the workflow.
 */
import fs from 'fs';
import path from 'path';
import { loadData } from '../lib/data.js';

const args = process.argv.slice(2);
const outFile = args.includes('--out') ? args[args.indexOf('--out') + 1] : null;
const data = loadData('contents', msg => { throw new Error(msg); });
const UA = 'Mozilla/5.0 (compatible; site-maintenance; +https://concrete-sangminlee.github.io/)';

async function get(url, { method = 'GET', timeout = 20000, headers = {} } = {}) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    try {
        return await fetch(url, { method, redirect: 'follow', signal: ctrl.signal, headers: { 'User-Agent': UA, ...headers } });
    } finally {
        clearTimeout(timer);
    }
}

// ------------------------------------------------------------------ 1. ORCID
const norm = s => String(s || '').toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}]+/gu, '');

export function newWorks(orcidJson, pubs) {
    const dois = new Set(pubs.map(p => p.doi).filter(Boolean).map(d => d.toLowerCase()));
    const titles = new Set(pubs.flatMap(p => [p.title, p.title_en, p.title_ko]).filter(Boolean).map(norm));
    const out = [];
    for (const g of orcidJson.group || []) {
        const w = (g['work-summary'] || [])[0];
        if (!w) continue;
        const title = w.title?.title?.value;
        const ids = w['external-ids']?.['external-id'] || [];
        const doi = ids.find(x => x['external-id-type'] === 'doi')?.['external-id-value'];
        if (doi && dois.has(doi.toLowerCase())) continue;
        if (titles.has(norm(title))) continue;
        out.push({ title, doi, year: w['publication-date']?.year?.value, venue: w['journal-title']?.value, type: w.type });
    }
    return out;
}

async function checkOrcid() {
    const orcid = data.config.contact.find(c => c.icon === 'orcid')?.value;
    if (!orcid) return { section: '', findings: 0 };
    let works;
    try {
        const res = await get(`https://pub.orcid.org/v3.0/${orcid}/works`, { headers: { Accept: 'application/json' } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        works = newWorks(await res.json(), data.pubs);
    } catch (err) {
        return { section: `## New publications\n\nCould not read ORCID record ${orcid}: ${err.message}\n`, findings: 0 };
    }
    if (!works.length) return { section: `## New publications\n\nNone. Every work on ORCID ${orcid} is in \`contents/publications.yml\`.\n`, findings: 0 };
    const rows = works.map(w => `- [ ] **${w.title}** (${w.year || 'n.d.'})${w.venue ? `, *${w.venue}*` : ''}${w.doi ? `, [doi:${w.doi}](https://doi.org/${w.doi})` : ''}${w.type ? ` · ${w.type.toLowerCase()}` : ''}`);
    return {
        section: `## New publications\n\nOn [ORCID ${orcid}](https://orcid.org/${orcid}) but not in \`contents/publications.yml\` (add them, with \`title_en\`/\`title_ko\` as needed):\n\n${rows.join('\n')}\n`,
        findings: works.length,
    };
}

// ------------------------------------------------------------------ 2. links
function externalLinks(dist) {
    const links = new Map(); // url -> first page it appears on
    const walk = dir => {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            const p = path.join(dir, e.name);
            const r = path.relative(dist, p).split(path.sep).join('/');
            if (e.isDirectory()) { if (r !== 'sequence-arena' && r !== 'render') walk(p); continue; }
            if (!p.endsWith('.html')) continue;
            const html = fs.readFileSync(p, 'utf8').replace(/<script\b[\s\S]*?<\/script>/gi, ' ');
            for (const m of html.matchAll(/\shref=["']?(https?:\/\/[^"'\s>]+)/gi)) {
                const url = m[1].replace(/&amp;/g, '&');
                if (url.startsWith('https://concrete-sangminlee.github.io/')) continue;
                if (!links.has(url)) links.set(url, r);
            }
        }
    };
    walk(dist);
    return links;
}

async function probe(url) {
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            let res = await get(url, { method: 'HEAD' });
            if (res.status === 405 || res.status === 404 || res.status >= 500) res = await get(url);
            if (res.status < 400 || [401, 403, 429].includes(res.status)) return null;
            if (attempt) return `HTTP ${res.status}`;
        } catch (err) {
            if (attempt) return err.name === 'AbortError' ? 'timed out' : (err.cause?.code || err.message);
        }
        await new Promise(r => setTimeout(r, 3000));
    }
    return null;
}

async function checkLinks() {
    if (!fs.existsSync('dist')) return { section: '## External links\n\nSkipped: dist/ not found.\n', findings: 0 };
    const links = [...externalLinks('dist')];
    const dead = [];
    const queue = [...links];
    await Promise.all(Array.from({ length: 6 }, async () => {
        while (queue.length) {
            const [url, page] = queue.shift();
            const why = await probe(url);
            if (why) dead.push({ url, page, why });
        }
    }));
    if (!dead.length) return { section: `## External links\n\nAll ${links.length} reachable.\n`, findings: 0 };
    dead.sort((a, b) => a.url.localeCompare(b.url));
    return {
        section: `## External links\n\n${dead.length} of ${links.length} links failed twice:\n\n${dead.map(d => `- [ ] ${d.url} (${d.why}), on \`${d.page}\``).join('\n')}\n`,
        findings: dead.length,
    };
}

// ------------------------------------------------------------------ main
if (import.meta.url === `file://${process.argv[1]}`) {
    const parts = await Promise.all([checkOrcid(), checkLinks()]);
    const findings = parts.reduce((n, p) => n + p.findings, 0);
    const report = `${parts.map(p => p.section).join('\n')}\n_Generated by \`scripts/maintenance.js\` on ${new Date().toISOString().slice(0, 10)}._\n`;
    if (outFile) fs.writeFileSync(outFile, report);
    console.log(report);
    console.log(`FINDINGS=${findings}`);
}
