# Sang Min Lee - Academic Website

Personal academic website hosted on GitHub Pages, showcasing research, publications, projects, and teaching experience.

🌐 **Live Site**: [https://concrete-sangminlee.github.io](https://concrete-sangminlee.github.io)

## About

This website presents my academic profile, research contributions, and professional activities. I am a Ph.D. Candidate in Artificial Intelligence at Seoul National University, specializing in **AI for Resilient Infrastructure and Wind Engineering**.

## Site Structure

- **About** (`/`) - Education, research interests, honors & awards, contact information
- **Research** (`/research/`) - Current research projects, methods, tools, and collaborations
- **Publications** (`/publications/`) - 28 papers including journal articles, conference proceedings, and theses
- **Talks** (`/talks/`) - Conference presentations and invited talks
- **Projects** (`/portfolio/`) - Research projects and industry collaborations
- **CV** (`/cv/`) - Complete curriculum vitae
- **Teaching** (`/teaching/`) - Courses taught and assisted at Seoul National University

## Technology Stack

- **Framework**: Jekyll (static site generator)
- **Theme**: Academic Pages (forked from Minimal Mistakes)
- **Hosting**: GitHub Pages
- **Language**: Ruby, HTML, CSS, JavaScript

## Local Development

To run this site locally for development:

### Prerequisites

- Ruby (with ruby-dev)
- Bundler
- Node.js

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/concrete-sangminlee/concrete-sangminlee.github.io.git
   cd concrete-sangminlee.github.io
   ```

2. Install dependencies:
   ```bash
   bundle install
   ```

   If you encounter permission errors, install gems locally:
   ```bash
   bundle config set --local path 'vendor/bundle'
   bundle install
   ```

3. Run the local server:
   ```bash
   bundle exec jekyll serve -l -H localhost
   ```

4. Open your browser and navigate to `http://localhost:4000`

### Using Docker

Alternatively, use Docker to avoid local dependency installation:

```bash
docker compose up
```

The site will be available at `http://localhost:4000`.

## Content Management

### Adding Publications

Create a new markdown file in `_publications/` with the following format:

```markdown
---
title: "Your Paper Title"
collection: publications
permalink: /publication/YYYY-MM-DD-short-title
excerpt: 'Brief description of your paper'
date: YYYY-MM-DD
venue: 'Journal or Conference Name'
paperurl: 'URL to paper (if available)'
citation: 'Full citation'
category: manuscripts  # or conferences
---
```

### Adding Talks

Create a new markdown file in `_talks/`:

```markdown
---
title: "Your Talk Title"
collection: talks
type: "Conference presentation"  # or "Invited talk", etc.
permalink: /talks/YYYY-MM-DD-short-title
venue: "Conference or Institution Name"
date: YYYY-MM-DD
location: "City, Country"
---
```

### Adding Projects

Create a new markdown file in `_portfolio/`:

```markdown
---
title: "Project Title"
collection: portfolio
permalink: /portfolio/YYYY-MM-DD-short-title
excerpt: 'Brief project description'
date: YYYY-MM-DD
---
```

### Adding Teaching Experience

Create a new markdown file in `_teaching/`:

```markdown
---
title: "Course Name"
collection: teaching
type: "Undergraduate course"  # or "Graduate course", etc.
permalink: /teaching/YYYY-semester-course-name
venue: "Institution Name"
date: YYYY-MM-DD
location: "City, Country"
---
```

## Configuration

Main site configuration is in `_config.yml`. Key settings include:

- Site title and description
- Author information (bio, contact, social links)
- Navigation menu (`_data/navigation.yml`)
- Publication categories

## Deployment

This site is automatically deployed via GitHub Pages. Simply push changes to the `master` branch, and GitHub Pages will rebuild and deploy the site within a few minutes.

## License

This website is based on the [Academic Pages](https://github.com/academicpages/academicpages.github.io) template, which is a fork of [Minimal Mistakes](https://mmistakes.github.io/minimal-mistakes/) Jekyll theme.

- **Academic Pages**: © 2016-present, released under MIT License
- **Minimal Mistakes**: © 2016 Michael Rose, released under MIT License

## Contact

- **Email**: 201612445@snu.ac.kr
- **LinkedIn**: [Sang Min Lee](https://www.linkedin.com/in/sang-min-lee-3a2568174/)
- **GitHub**: [concrete-sangminlee](https://github.com/concrete-sangminlee)
- **Google Scholar**: [Sang Min Lee](https://scholar.google.com/citations?user=ogvd_LsAAAAJ&hl=en)

---

*Last updated: November 2025*
