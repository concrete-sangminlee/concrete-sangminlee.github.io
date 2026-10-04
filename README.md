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

- `publications.yml`: every publication (type, year, authors, title, venue, topic, links). Counts, filters, BibTeX, and JSON-LD are generated from it.
- `publications.bib`: curated BibTeX for entries that reference it via `bib:`. The rest are generated.
- `research.yml`: research areas. Each `id` matches a publication `topic`.
- `news.md`: one line per item, `- **2026.03** Text` (month optional).
- `config.yml`: name, role, description, contact links.
- `home.md`: bio. The other `*.md` files are education, experiences, projects, patents, awards, and services.

## Build

```sh
npm ci
npm run build  # outputs to dist/
```

Auto-deploys to GitHub Pages on push to `master` via `.github/workflows/deploy.yml`.

## License

Based on [academic-homepage-template](https://github.com/senli1073/academic-homepage-template) by Sen Li. Licensed under MIT License.
