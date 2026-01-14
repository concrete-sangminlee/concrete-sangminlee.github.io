# Sang Min Lee - Academic Website

**Academic Pages is a GitHub Pages template for personal and professional portfolio-oriented websites.**

🌐 **Live Site**: [https://concrete-sangminlee.github.io](https://concrete-sangminlee.github.io)

## About

This website presents my academic profile, research contributions, and professional activities. I am a Ph.D. Candidate in Artificial Intelligence at Seoul National University, specializing in **AI for Resilient Infrastructure and Wind Engineering**.

This site is built using the [Academic Pages](https://github.com/academicpages/academicpages.github.io) template, which is a fork of the [Minimal Mistakes](https://mmistakes.github.io/minimal-mistakes/) Jekyll theme.

## Site Structure

- **About** (`/`) - Education, research interests, honors & awards, contact information
- **Research** (`/research/`) - Current research projects, methods, tools, and collaborations
- **Publications** (`/publications/`) - 28 papers including journal articles, conference proceedings, and theses
- **Talks** (`/talks/`) - Conference presentations and invited talks
- **Projects** (`/portfolio/`) - Research projects and industry collaborations
- **CV** (`/cv/`) - Complete curriculum vitae
- **Teaching** (`/teaching/`) - Courses taught and assisted at Seoul National University

## Adding Your Profile Photo

To add your profile photo:

1. **Prepare your image**:
   - Recommended size: 400x400 pixels (square)
   - Format: PNG or JPG
   - File size: Keep under 500KB for faster loading

2. **Add the image file**:
   - Place your photo in the `images/` folder
   - Name it `profile.png` (or `profile.jpg`)
   - Or use any name and update `_config.yml` accordingly

3. **Update configuration** (if using a different filename):
   - Open `_config.yml`
   - Find the `author:` section
   - Update `avatar: "profile.png"` to your filename

4. **Commit and push**:
   ```bash
   git add images/profile.png
   git commit -m "Add profile photo"
   git push origin master
   ```

The profile photo will appear in the sidebar on all pages with `author_profile: true`.

## Technology Stack

- **Framework**: Jekyll (static site generator)
- **Theme**: Academic Pages (forked from Minimal Mistakes)
- **Hosting**: GitHub Pages
- **Language**: Ruby, HTML, CSS, JavaScript

## Getting Started

1. Clone the repository:
   ```bash
   git clone https://github.com/concrete-sangminlee/concrete-sangminlee.github.io.git
   cd concrete-sangminlee.github.io
   ```

2. Set site-wide configuration and add your content (see Configuration section below).

3. Upload any files (like PDFs, .zip files, etc.) to the `files/` directory. They will appear at `https://concrete-sangminlee.github.io/files/example.pdf`.

4. Check status by going to the repository settings, in the "GitHub pages" section.

## Local Development

When you are initially working on your website, it is very useful to be able to preview the changes locally before pushing them to GitHub. To work locally you will need to:

### Prerequisites

- **Ruby** (with ruby-dev)
- **Bundler**
- **Node.js**

On most Linux distributions and Windows Subsystem Linux:
```bash
sudo apt install ruby-dev ruby-bundler nodejs
```

If you see errors like `Unable to locate package ruby-bundler` or `Unable to locate package nodejs`, run:
```bash
sudo apt update && sudo apt upgrade -y
```

On macOS:
```bash
brew install ruby
brew install node
gem install bundler
```

### Installation

1. **Install dependencies**:
   ```bash
   bundle install
   ```

   If you encounter permission errors, install gems locally (recommended):
   ```bash
   bundle config set --local path 'vendor/bundle'
   bundle install
   ```

   If you see file permission errors like `Gem::FilePermissionError` or `Bundler::PermissionError`, the local installation method above should resolve them. After successful installation, you should see a `vendor` folder and `.bundle` directory.

2. **Run the local server**:
   ```bash
   bundle exec jekyll serve -l -H localhost
   ```

   The local server will automatically rebuild and refresh the pages on change to Markdown (*.md) and HTML files, while changes to the core template and configuration (i.e., `_config.yml`) will require stopping and restarting Jekyll.

3. **Open your browser** and navigate to `http://localhost:4000`

**Note**: If you are running on Linux, it may be necessary to install some additional dependencies:
```bash
sudo apt install build-essential gcc make
```

### Using Docker

Working from a different OS, or just want to avoid installing dependencies? You can use Docker to build a container that will run the site for you if you have Docker installed.

```bash
chmod -R 777 .
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
- **Profile photo**: Set in `author.avatar` field

## Deployment

This site is automatically deployed via GitHub Pages. Simply push changes to the `master` branch, and GitHub Pages will rebuild and deploy the site within a few minutes.

### GitHub Pages Setup

1. Go to your repository settings
2. Navigate to the "Pages" section
3. Ensure the source is set to the `master` branch
4. Your site will be available at `https://concrete-sangminlee.github.io` within a few minutes after pushing changes

## License

This website is based on the [Academic Pages](https://github.com/academicpages/academicpages.github.io) template, which is a fork of the [Minimal Mistakes](https://mmistakes.github.io/minimal-mistakes/) Jekyll theme.

- **Academic Pages**: © 2016-present, released under MIT License
- **Minimal Mistakes**: © 2016 Michael Rose, released under MIT License

## Maintenance

This repository was forked (then detached) by Stuart Geiger from the Minimal Mistakes Jekyll Theme, which is © 2016 Michael Rose and released under the MIT License. It is currently being maintained by Robert Zupko and additional maintainers would be welcomed.

For questions concerning how to style the template, please refer to the [Academic Pages documentation](https://academicpages.github.io/) or start a new discussion on GitHub.

## Contact

- **Email**: 201612445@snu.ac.kr
- **LinkedIn**: [Sang Min Lee](https://www.linkedin.com/in/sang-min-lee-3a2568174/)
- **GitHub**: [concrete-sangminlee](https://github.com/concrete-sangminlee)
- **Google Scholar**: [Sang Min Lee](https://scholar.google.com/citations?user=ogvd_LsAAAAJ&hl=en)

---

*Last updated: January 2026*
