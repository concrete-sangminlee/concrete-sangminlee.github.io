# Sang Min Lee - Academic Homepage

Personal academic website for Sang Min Lee, Ph.D. Candidate in Artificial Intelligence at Seoul National University.

**Website:** https://concrete-sangminlee.github.io

**Static apps** (unlisted: not linked from the homepage, not in the sitemap): https://concrete-sangminlee.github.io/sequence-arena/, https://concrete-sangminlee.github.io/penguin-volley/

## About

- **Research Interests:** AI for Resilient Infrastructure, Structural Health Monitoring, Wind Engineering, Automated NDT, LLM for Engineering
- **Advisor:** Prof. Thomas H.-K. Kang
- **Email:** 201612445@snu.ac.kr

## Editing content

All content lives in `contents/`. Any text field can have a Korean counterpart with the `_ko` suffix (`title_ko`, `notes_ko`, ...), used by the Korean homepage and CVs. English pages use the base field, so keep base fields in English: `npm run check` fails the build if Korean shows up on an English page.

- `profile.yml`: education, experience, projects, patents, teaching, awards, certifications, service, skills.
- `publications.yml`: every publication. A Korean-language paper keeps its original `title` and `venue` and needs `title_en` / `venue_en` for the English pages, where it is shown as "*English title* (in Korean)". Optional `authors_ko`, `title_ko`, `venue_ko`, `scope` (international | domestic), and `indexing` (SCIE | KCI) feed the CVs and the Korean page.
- `publications.bib`: curated BibTeX for entries that reference it via `bib:`. The rest are generated.
- `research.yml`: research areas. Each `id` matches a publication `topic`.
- `news.yml`: homepage news (`date`, `text`, `text_ko`).
- `home.md` / `home.ko.md`: the homepage bio.
- `config.yml`: name, role, description, contact links.
- `cv-variants.yml`: tailored CVs (see below).

## Pages

| Page | Path |
|---|---|
| Homepage | `/` (English), `/ko/` (Korean) |
| CV, full | `/cv/`, `/cv/ko/` (also used for academic applications) |
| CV, short (2 pages) | `/cv/short/`, `/cv/ko/short/` |
| Tailored CVs | `/cv/<id>/`, `/cv/ko/<id>/`, from `contents/cv-variants.yml`. `sections` picks and orders the sections; `ml` is the industry CV. Unlisted by default |
| Paper pages | `/publications/<key>/` for English papers, `/ko/publications/<key>/` for Korean-language ones. Journal, conference, and thesis entries; each carries Google Scholar `citation_*` tags |
| `sitemap.xml` | generated; `<lastmod>` is the last commit that touched each page's sources |

Every CV page has a PDF next to it in `/cv/`. `npm run render` prints the PDFs and renders the social preview images (`/static/og/`) and maskable app icons with headless Chrome. CI does this on every push. To render locally, run `npm run build && npm run render` (set `CHROME=/path/to/chrome` if Chrome isn't on `PATH`; install Pretendard so Hangul matches the website).

## Build

```sh
npm ci
npm run build  # outputs to dist/
npm run check  # English pages English-only, links, CSP, fonts, JSON-LD, sitemap
```

Pretendard is self-hosted and subset to the site's own text at build time (`lib/fonts.js`, `subset-font`): one Latin file, a tiny file for the Hangul on English pages, and one file with every other Hangul syllable the site uses (about 36, 2 and 60 KB). Each page inlines the `@font-face` rules it needs and preloads Latin (and Hangul on Korean pages). New content needs no font step: the next build cuts new subsets. Every page gets a Content-Security-Policy `<meta>` with hashes of its inline scripts, so `script-src` has no `'unsafe-inline'` (`lib/csp.js`). GitHub Pages cannot send headers, so `frame-ancestors` is not available.

| Code | Role |
|---|---|
| `build.js` | orchestrates the build: pages, assets, CVs, paper pages, sitemap |
| `lib/data.js` | loads and validates `contents/`; BibTeX keys, APA strings, counts |
| `lib/home.js`, `lib/cv.js`, `lib/paper.js` | homepage, CVs, paper pages |
| `lib/og.js`, `lib/sitemap.js` | social cards and icons, sitemap |
| `lib/fonts.js`, `lib/csp.js` | self-hosted font subsets, Content-Security-Policy |
| `lib/statement.js` | research and teaching statements |
| `lib/format.js`, `lib/i18n.js` | shared formatting, UI strings |
| `scripts/check.js`, `scripts/render.sh` | post-build checks, headless Chrome rendering |
| `scripts/maintenance.js` | weekly report (see below) |
| `apps/<name>/` | static apps, copied as-is to `/<name>/`; not checked by `npm run check`. A `service-worker.js` containing `__APP_VERSION__` gets a hash of the app's files |
| `apps/sequence-arena/` | bundle synced from its own source |
| `apps/penguin-volley/` | Penguin Volley, written here: plain ES modules, no build step, no image or sound files (canvas drawing, Web Audio). `js/physics.js` (deterministic, 60 Hz) and `js/ai.js` (CPU) have no DOM dependencies |

## CI

- **Pull requests** (`check.yml`): build, `npm run check`, render, and Lighthouse on six pages: accessibility, best practices and SEO must be 100 (SEO not checked for the noindex statements), CLS at most 0.1; performance below 90 warns. Scores appear in the job summary. The PDFs and the whole built site are attached to the run.
- **Push to `master`** (`deploy.yml`): build, check, render, deploy to GitHub Pages.
- **Mondays** (`maintenance.yml`): lists works on ORCID that are missing from `publications.yml` and dead external links, in an issue titled "Site maintenance report". The issue closes itself when everything is clean. Run it any time from the Actions tab.

## License

Based on [academic-homepage-template](https://github.com/senli1073/academic-homepage-template) by Sen Li. Licensed under MIT License.
