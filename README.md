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

All content lives in `contents/`:

- `profile.yml`: education, experience, projects, patents, teaching, awards, certifications, service, skills. Every text field can have a Korean counterpart with the `_ko` suffix (`title_ko`, `notes_ko`, ...), which the Korean CV uses.
- `publications.yml`: every publication. Optional `title_en` / `title_ko`, `authors_ko`, `venue_en` / `venue_ko`, `scope` (international | domestic), and `indexing` (SCIE | KCI) feed the CVs.
- `publications.bib`: curated BibTeX for entries that reference it via `bib:`. The rest are generated.
- `research.yml`: research areas. Each `id` matches a publication `topic`.
- `news.md`: one line per item, `- **2026.03** Text` (month optional).
- `config.yml`: name, role, description, contact links.
- `home.md`: the homepage bio.

## CVs

The build writes an English CV at `/cv/` and a Korean CV at `/cv/ko/`, both generated from the same data as the homepage. In CI, `npm run cv:pdf` prints them to `/cv/Sang-Min-Lee-CV.pdf` and `/cv/Sang-Min-Lee-CV-ko.pdf` with headless Chrome and a locally installed Pretendard. To make the PDFs locally, run `npm run build && npm run cv:pdf` (set `CHROME=/path/to/chrome` if Chrome isn't on `PATH`).

## Build

```sh
npm ci
npm run build  # outputs to dist/
```

Auto-deploys to GitHub Pages on push to `master` via `.github/workflows/deploy.yml`.

## License

Based on [academic-homepage-template](https://github.com/senli1073/academic-homepage-template) by Sen Li. Licensed under MIT License.
