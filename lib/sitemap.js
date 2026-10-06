// sitemap.xml, generated from the pages the build writes. <lastmod> is the date of
// the last commit that touched each page's sources (needs full git history in CI:
// actions/checkout with fetch-depth: 0), falling back to the build date.
import { execFileSync } from 'child_process';

const SOURCES = {
    home: ['contents', 'lib', 'index.html', 'static'],
    cv: ['contents', 'lib/cv.js', 'lib/format.js', 'lib/data.js', 'static/css/cv.css'],
    paper: ['contents/publications.yml', 'contents/publications.bib', 'lib/paper.js', 'lib/format.js', 'lib/data.js', 'static/css/main.css'],
    arena: ['apps/sequence-arena'],
};
// Sites under the same domain that live in other repositories; no lastmod known here.
const EXTERNAL = ['blog/', 'thinkmany/'];

function lastCommitDate(paths, fallback) {
    try {
        const out = execFileSync('git', ['log', '-1', '--format=%cs', '--', ...paths], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
        return /^\d{4}-\d{2}-\d{2}$/.test(out) ? out : fallback;
    } catch {
        return fallback;
    }
}

export function renderSitemap({ siteUrl, buildDate, cvs, papers }) {
    const date = {};
    for (const [k, paths] of Object.entries(SOURCES)) date[k] = lastCommitDate(paths, buildDate);
    const urls = [
        ['', date.home], ['ko/', date.home],
        ...cvs.map(p => [p, date.cv]),
        ['sequence-arena/', date.arena],
        ...papers.map(p => [p, date.paper]),
        ...EXTERNAL.map(p => [p, null]),
    ];
    return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(([p, d]) => `  <url><loc>${siteUrl}${p}</loc>${d ? `<lastmod>${d}</lastmod>` : ''}</url>`).join('\n')}
</urlset>
`;
}
