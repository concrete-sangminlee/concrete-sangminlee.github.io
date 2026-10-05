// Loads and validates contents/, and derives what every page needs:
// publication keys, DOIs, BibTeX, APA strings, and counts.
import fs from 'fs';
import path from 'path';
import { load as parseYaml } from 'js-yaml';
import { splitAuthors } from './format.js';

export const PUB_TYPES = {
    journal: { bib: 'article' },
    conference: { bib: 'inproceedings' },
    thesis: { bib: 'thesis' },
    early: { bib: 'misc' },
};

export function loadData(contentDir, fail) {
    const read = file => {
        const p = path.join(contentDir, file);
        if (!fs.existsSync(p)) fail(`missing content file ${p}`);
        return fs.readFileSync(p, 'utf8');
    };
    const yaml = file => {
        try { return parseYaml(read(file)); } catch (err) { fail(`failed to parse ${path.join(contentDir, file)}: ${err.message}`); }
    };

    // ---- config
    const config = yaml('config.yml');
    if (!config || typeof config !== 'object') fail('config.yml is empty or not an object');
    const missing = ['title', 'name', 'role', 'affiliation', 'description', 'copyright-text'].filter(k => typeof config[k] !== 'string');
    if (missing.length) fail(`config.yml missing required string keys: ${missing.join(', ')}`);
    config.contact = Array.isArray(config.contact) ? config.contact : [];

    const research = yaml('research.yml') || [];
    const profile = yaml('profile.yml') || {};
    const news = yaml('news.yml') || [];
    const home = { en: read('home.md'), ko: fs.existsSync(path.join(contentDir, 'home.ko.md')) ? read('home.ko.md') : read('home.md') };
    const topicIds = new Set(research.map(r => r.id));

    // ---- publications
    const pubs = yaml('publications.yml');
    if (!Array.isArray(pubs)) fail('publications.yml must be a list');
    pubs.forEach((p, i) => {
        for (const k of ['type', 'year', 'authors', 'title']) {
            if (p[k] === undefined || p[k] === null || p[k] === '') fail(`publications.yml entry #${i + 1} is missing "${k}"`);
        }
        if (!PUB_TYPES[p.type]) fail(`publications.yml entry #${i + 1} has unknown type "${p.type}"`);
        if (p.topic && !topicIds.has(p.topic)) fail(`publications.yml entry #${i + 1} has unknown topic "${p.topic}"`);
        p.year = Number(p.year);
        p.index = i;
    });

    // ---- BibTeX: curated entries from publications.bib, generated for the rest
    const bibPath = path.join(contentDir, 'publications.bib');
    const curatedBib = fs.existsSync(bibPath) ? fs.readFileSync(bibPath, 'utf8') : '';
    const bibByKey = {};
    for (const m of curatedBib.matchAll(/@\w+\{([^,\s]+),[\s\S]*?\n\}/g)) bibByKey[m[1]] = m[0].trim();

    const usedKeys = new Set(Object.keys(bibByKey));
    const makeKey = p => {
        const first = splitAuthors(p.authors)[0] || 'anon';
        const surname = first.split(',')[0].toLowerCase().replace(/[^a-z]/g, '') || 'anon';
        const word = (String(p.title).match(/[A-Za-z]{4,}/g) || [])
            .map(w => w.toLowerCase())
            .find(w => !['with', 'from', 'using', 'based', 'study', 'toward', 'towards'].includes(w));
        let key = `${surname}${p.year}${word || ''}`;
        let n = 2;
        while (usedKeys.has(key)) key = `${surname}${p.year}${word || ''}${String.fromCharCode(96 + n++)}`;
        usedKeys.add(key);
        return key;
    };
    const generateBib = p => {
        const t = PUB_TYPES[p.type].bib;
        const d = parseDetails(p.details);
        let type = t;
        const fields = [['author', splitAuthors(p.authors).join(' and ')], ['title', `{${p.title}}`]];
        if (t === 'article') fields.push(['journal', p.venue]);
        else if (t === 'inproceedings') fields.push(['booktitle', p.venue]);
        else if (t === 'thesis') {
            type = /master/i.test(p.note || '') ? 'mastersthesis' : 'misc';
            fields.push([type === 'mastersthesis' ? 'school' : 'howpublished', p.venue]);
            if (type === 'misc' && p.note) fields.push(['note', p.note]);
        } else {
            fields.push(['howpublished', p.venue]);
            if (p.note) fields.push(['note', p.note]);
        }
        for (const k of ['volume', 'number', 'pages', 'address']) if (d[k]) fields.push([k, d[k]]);
        fields.push(['year', String(p.year)]);
        if (p.links?.doi) fields.push(['doi', p.links.doi]);
        if (p.links?.paper) fields.push(['url', p.links.paper]);
        const key = makeKey(p);
        const w = Math.max(...fields.map(f => f[0].length));
        const tex = (k, v) => (k === 'url' || k === 'doi' ? v : v.replace(/(^|[^\\])([&%#])/g, '$1\\$2'));
        const body = fields.filter(f => f[1]).map(([k, v]) => `  ${k.padEnd(w)} = {${tex(k, v)}}`).join(',\n');
        return { key, text: `@${type}{${key},\n${body}\n}` };
    };

    for (const p of pubs) p.doi = ((bibByKey[p.bib] || '').match(/doi\s*=\s*\{([^}]+)\}/) || [])[1] || p.links?.doi;

    const bibData = {};
    const generatedBib = [];
    for (const p of pubs) {
        if (p.bib && bibByKey[p.bib]) {
            p.bibKey = p.bib;
            bibData[p.bib] = { bib: bibByKey[p.bib], apa: apa(p) };
        } else {
            if (p.bib) console.warn(`build.js: bib key "${p.bib}" not found in publications.bib, generating one`);
            const g = generateBib(p);
            p.bibKey = g.key;
            bibData[g.key] = { bib: g.text, apa: apa(p) };
            generatedBib.push(g.text);
        }
    }

    const counts = Object.fromEntries(Object.keys(PUB_TYPES).map(t => [t, pubs.filter(p => p.type === t).length]));
    const topicCounts = Object.fromEntries(research.map(r => [r.id, pubs.filter(p => p.topic === r.id).length]));
    const bibFile = curatedBib.trim() + '\n\n' + (generatedBib.length ? '% Generated from contents/publications.yml\n\n' + generatedBib.join('\n\n') + '\n' : '');

    const cvVariants = fs.existsSync(path.join(contentDir, 'cv-variants.yml')) ? yaml('cv-variants.yml') || [] : [];

    return { config, research, profile, news, home, pubs, bibData, bibFile, counts, topicCounts, cvVariants };
}

export function parseDetails(d) {
    if (!d) return {};
    const m = String(d).match(/^(\d+)\((\d+)\)(?:,\s*(.+))?$/);
    if (m) return { volume: m[1], number: m[2], pages: m[3] ? m[3].replace(/-/g, '--') : undefined };
    return { address: String(d) };
}

/** APA 7 reference as plain text (no italics in clipboard text). */
function apa(p) {
    const title = String(p.title).replace(/[.?!]$/, '');
    const details = p.details ? String(p.details).replace(/(\d)-(\d)/g, '$1–$2') : '';
    let ref = `${p.authors} (${p.year}). `;
    if (p.type === 'thesis') ref += `${title} [${p.note || 'Thesis'}, ${p.venue}].`;
    else if (p.type === 'journal') ref += `${title}. ${p.venue}${details ? `, ${details}` : ''}.`;
    else ref += `${title}${p.note ? ` [${p.note}]` : ''}. ${p.venue}${details ? `, ${details}` : ''}.`;
    if (p.doi) ref += ` https://doi.org/${p.doi}`;
    else if (p.links?.paper) ref += ` ${p.links.paper}`;
    return ref;
}
