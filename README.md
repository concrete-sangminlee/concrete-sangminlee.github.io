# Sang Min Lee - Academic Homepage

Personal academic website for Sang Min Lee, Ph.D. Candidate in Artificial Intelligence at Seoul National University.

**Website:** https://concrete-sangminlee.github.io

**Static apps:** https://concrete-sangminlee.github.io/sequence-arena/

## About

- **Research Interests:** AI for Resilient Infrastructure, Structural Health Monitoring, Wind Engineering, Automated NDT, LLM for Engineering
- **Advisor:** Prof. Thomas H.-K. Kang
- **Email:** 201612445@snu.ac.kr

## Publications

- 6 Journal Articles (JNDE, ACI Structural Journal, ASCE J. Structural Engineering, etc.)
- 20 Conference Papers (JCDL, APCWE, ACEM, EACWE, Structures Congress, etc.)
- 2 Registered Patents (Korea)

## Editing content

All content lives in `contents/`. Any text field can have a Korean counterpart with the `_ko` suffix (`title_ko`, `notes_ko`, ...), used by the Korean homepage and CVs.

- `profile.yml`: education, experience, projects, patents, teaching, awards, certifications, service, skills.
- `publications.yml`: every publication. Optional `title_en` / `title_ko`, `authors_ko`, `venue_en` / `venue_ko`, `scope` (international | domestic), and `indexing` (SCIE | KCI) feed the CVs and the Korean page.
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
| CV, full | `/cv/`, `/cv/ko/` |
| CV, short (2 pages) | `/cv/short/`, `/cv/ko/short/` |
| Tailored CVs | `/cv/<id>/` or `/cv/ko/<id>/`, defined in `contents/cv-variants.yml` (unlisted by default) |

Every CV page has a PDF next to it in `/cv/`. `npm run render` prints the PDFs and renders the 1200×630 social preview images (`/static/og/og-en.png`, `og-ko.png`) with headless Chrome. CI does this on every push. To render locally, run `npm run build && npm run render` (set `CHROME=/path/to/chrome` if Chrome isn't on `PATH`; install Pretendard so Hangul matches the website).

## Build

```sh
npm ci
npm run build  # outputs to dist/
```

Auto-deploys to GitHub Pages on push to `master` via `.github/workflows/deploy.yml`.

## License

Based on [academic-homepage-template](https://github.com/senli1073/academic-homepage-template) by Sen Li. Licensed under MIT License.
