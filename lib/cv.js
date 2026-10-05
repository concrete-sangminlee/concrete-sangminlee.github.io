// Renders the English and Korean CVs (HTML, printed to PDF in CI).
import { esc, md, hasHangul, isExternal, dashes, L, period, recency, renderAuthors, noteHtml } from './format.js';

const T = {
    en: {
        docTitle: 'Sang Min Lee, Curriculum Vitae',
        footer: 'Sang Min Lee · Curriculum Vitae',
        interests: 'Research Interests',
        education: 'Education',
        experience: 'Research and Professional Experience',
        publications: 'Publications',
        journals: 'Journal Articles',
        conferences: 'Conference Papers',
        theses: 'Theses',
        patents: 'Patents',
        projects: 'Research Projects',
        teaching: 'Teaching Experience',
        teachingSub: 'Teaching assistant, Seoul National University',
        awards: 'Honors and Awards',
        certifications: 'Certifications',
        service: 'Professional Service',
        reviewing: 'Reviewing',
        organizing: 'Conference Organization',
        memberships: 'Professional Memberships',
        outreach: 'Outreach',
        skills: 'Skills',
        inKorean: 'in Korean',
        patentNo: n => `Korean Patent ${n}, registered`,
        since: y => `since ${y}`,
        updated: d => `Last updated ${d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })}`,
        pubSummary: c => `${c.journal} journal articles · ${c.conference} conference papers`,
        home: 'Homepage',
        pdf: 'Download PDF',
        current: 'Current',
    },
    ko: {
        docTitle: '이상민 이력서',
        footer: '이상민 · 이력서',
        interests: '연구 분야',
        education: '학력',
        experience: '경력',
        publications: '연구실적',
        intlJournals: '국제학술지',
        domJournals: '국내학술지',
        intlConferences: '국제학술대회',
        domConferences: '국내학술대회',
        theses: '학위논문',
        patents: '특허 (등록)',
        projects: '참여 연구과제',
        teaching: '강의 및 조교',
        teachingSub: '서울대학교 교육조교',
        awards: '수상 및 장학',
        certifications: '자격',
        service: '학술 활동',
        reviewing: '논문 심사',
        organizing: '학술대회 조직',
        memberships: '학회 회원',
        outreach: '사회봉사',
        military: '병역',
        skills: '보유 기술',
        contact: { email: '이메일', web: '홈페이지', scholar: 'Google Scholar', orcid: 'ORCID', github: 'GitHub' },
        patentNo: n => `대한민국 특허 제${n}호`,
        since: y => `${y}–현재`,
        updated: d => `${d.getUTCFullYear()}년 ${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 기준`,
        pubSummary: c => `국제학술지 ${c.intlJournal}편 · 국내학술지 ${c.domJournal}편 · 국제학술대회 ${c.intlConf}편 · 국내학술대회 ${c.domConf}편`,
        home: '홈페이지',
        pdf: 'PDF 다운로드',
        current: '재직 중',
    },
};

const row = (when, what, cls = '') => `<li class="r${cls}"><div class="r-when">${when}</div><div class="r-what">${what}</div></li>`;
const section = (title, body, aside = '') => `<section class="s"><h2>${esc(title)}${aside ? `<span class="s-aside">${aside}</span>` : ''}</h2>${body}</section>`;
const sub = title => `<h3>${esc(title)}</h3>`;
const notes = list => (list && list.length ? `<ul class="notes">${list.map(n => `<li${hasHangul(n) ? ' lang="ko"' : ''}>${noteHtml(n)}</li>`).join('')}</ul>` : '');
const onCv = x => x.cv !== false;

// ------------------------------------------------------------------ publications
function pubParts(p, lang) {
    const ko = lang === 'ko';
    const koreanPaper = hasHangul(p.title) || hasHangul(p.venue);
    let title, authors, venue, note;
    if (ko) {
        title = p.title_ko || p.title;
        authors = koreanPaper || p.title_ko ? p.authors_ko || p.authors : p.authors;
        venue = p.venue_ko || p.venue;
        note = p.note_ko || p.note;
    } else {
        title = hasHangul(p.title) ? p.title_en || p.title : p.title;
        authors = p.authors;
        venue = p.venue_en || p.venue;
        note = p.note;
    }
    return { title, authors, venue, note, translated: !ko && hasHangul(p.title) && !!p.title_en };
}

function pubItem(p, lang, label) {
    const t = T[lang];
    const { title, authors, venue, note, translated } = pubParts(p, lang);
    const details = p.details ? dashes(p.details) : '';
    const titleText = title.replace(/[.?!]$/, '');
    let ref;
    if (p.type === 'thesis') {
        ref = lang === 'ko'
            ? `${renderAuthors(authors)} (${p.year}). <span class="pt">${esc(titleText)}</span>. ${esc(venue)}${note ? `, ${esc(note)}` : ''}.`
            : `${renderAuthors(authors)} (${p.year}). <span class="pt">${esc(titleText)}</span>${translated ? ` (${t.inKorean})` : ''} [${esc(note || 'Thesis')}]. ${esc(venue)}.`;
    } else {
        ref = `${renderAuthors(authors)} (${p.year}). <span class="pt"${hasHangul(titleText) ? ' lang="ko"' : ''}>${esc(titleText)}</span>${translated ? ` (${t.inKorean})` : ''}. <em${hasHangul(venue) ? ' lang="ko"' : ''}>${esc(venue)}</em>${details ? `, ${esc(details)}` : ''}.`;
    }
    const extras = [];
    if (p.indexing) extras.push(`<span class="idx">${esc(p.indexing)}</span>`);
    if (p.doi) extras.push(`<a href="https://doi.org/${esc(p.doi)}">doi:${esc(p.doi)}</a>`);
    return `<li><span class="n">${esc(label)}</span><span class="ref">${ref}${extras.length ? ` ${extras.join(' ')}` : ''}</span></li>`;
}

function pubList(items, lang, prefix) {
    return `<ol class="pubs">${items.map((p, i) => pubItem(p, lang, `${prefix}${items.length - i}`)).join('')}</ol>`;
}

function renderPublications(pubs, lang) {
    const t = T[lang];
    const list = pubs.filter(p => p.type !== 'early' && onCv(p));
    const by = f => list.filter(f);
    if (lang === 'ko') {
        const groups = [
            [t.intlJournals, by(p => p.type === 'journal' && p.scope !== 'domestic'), 'IJ'],
            [t.domJournals, by(p => p.type === 'journal' && p.scope === 'domestic'), 'DJ'],
            [t.intlConferences, by(p => p.type === 'conference' && p.scope !== 'domestic'), 'IC'],
            [t.domConferences, by(p => p.type === 'conference' && p.scope === 'domestic'), 'DC'],
            [t.theses, by(p => p.type === 'thesis'), 'T'],
        ].filter(g => g[1].length);
        const c = { intlJournal: groups.find(g => g[2] === 'IJ')?.[1].length || 0, domJournal: groups.find(g => g[2] === 'DJ')?.[1].length || 0, intlConf: groups.find(g => g[2] === 'IC')?.[1].length || 0, domConf: groups.find(g => g[2] === 'DC')?.[1].length || 0 };
        return section(t.publications, groups.map(([h, items, pre]) => sub(`${h} (${items.length})`) + pubList(items, lang, pre)).join(''), esc(t.pubSummary(c)));
    }
    const groups = [
        [t.journals, by(p => p.type === 'journal'), 'J'],
        [t.conferences, by(p => p.type === 'conference'), 'C'],
        [t.theses, by(p => p.type === 'thesis'), 'T'],
    ].filter(g => g[1].length);
    const c = { journal: by(p => p.type === 'journal').length, conference: by(p => p.type === 'conference').length };
    return section(t.publications, groups.map(([h, items, pre]) => sub(h) + pubList(items, lang, pre)).join(''), esc(t.pubSummary(c)));
}

// ------------------------------------------------------------------ document
export function renderCV(lang, ctx) {
    const { config, profile, pubs, research, buildDate, css, photo, mode } = ctx;
    const t = T[lang];
    const ko = lang === 'ko';
    const contacts = config.contact || [];
    const find = icon => contacts.find(c => c.icon === icon);
    const email = find('mail');
    const scholar = find('scholar');
    const orcid = find('orcid');
    const github = find('github');
    const site = 'concrete-sangminlee.github.io';

    // Header
    const contactRows = [
        email && [ko ? t.contact.email : '', `<a href="${esc(email.url)}">${esc(email.value)}</a>`],
        [ko ? t.contact.web : '', `<a href="https://${site}/">${site}</a>`],
        scholar && [ko ? t.contact.scholar : 'Google Scholar', `<a href="${esc(scholar.url)}">Sang Min Lee</a>`],
        orcid && [ko ? t.contact.orcid : 'ORCID', `<a href="${esc(orcid.url)}">${esc(orcid.value)}</a>`],
        github && [ko ? t.contact.github : 'GitHub', `<a href="${esc(github.url)}">github.com/${esc(github.value)}</a>`],
    ].filter(Boolean);
    const head = `<header class="cv-head">
        ${ko && photo ? `<img class="cv-photo" src="${photo}" alt="" width="200" height="200">` : ''}
        <div class="cv-id">
            <h1>${ko ? `${esc(config['name-ko'])}<span class="alt">${esc(config.name)}</span>` : esc(config.name)}</h1>
            <p class="cv-role">${ko ? esc(config['role-ko'] || config.role) : `${esc(config.role)}<br>${esc(config.affiliation)}`}</p>
        </div>
        <dl class="cv-contact">${contactRows.map(([k, v]) => `<div>${k ? `<dt>${esc(k)}</dt>` : ''}<dd>${v}</dd></div>`).join('')}</dl>
    </header>`;

    const body = [];

    // Research interests
    if (research.length) {
        body.push(section(t.interests, `<p class="interests">${research.map(r => esc(L(r, 'title', lang))).join(ko ? ', ' : '; ')}</p>`));
    }

    // Education
    body.push(section(t.education, `<ol class="rows">${(profile.education || []).filter(onCv).map(e => row(
        esc(period(e, lang, { yearOnly: !ko })),
        `<p class="rt">${esc(L(e, 'degree', lang))}</p><p class="rs">${esc(L(e, 'org', lang))}</p>${notes(L(e, 'notes', lang))}`
    )).join('')}</ol>`));

    // Experience (ongoing first, then newest)
    const exp = [...(profile.experience || [])].filter(onCv).sort((a, b) => recency(b) - recency(a));
    body.push(section(t.experience, `<ol class="rows">${exp.map(e => row(
        esc(period(e, lang)),
        `<p class="rt">${esc(L(e, 'title', lang))}</p><p class="rs">${esc(L(e, 'org', lang))}</p>${notes(L(e, 'notes', lang))}`
    )).join('')}</ol>`));

    // Publications
    body.push(renderPublications(pubs, lang));

    // Patents
    if (profile.patents?.length) {
        body.push(section(t.patents, `<ol class="rows">${profile.patents.filter(onCv).map(p => row(
            esc(p.year),
            `<p class="rt"${hasHangul(L(p, 'title', lang)) ? ' lang="ko"' : ''}>${esc(L(p, 'title', lang))}</p><p class="rs">${renderAuthors(L(p, 'inventors', lang))}. ${esc(t.patentNo(p.number))}</p>`
        )).join('')}</ol>`));
    }

    // Projects
    if (profile.projects?.length) {
        body.push(section(t.projects, `<ol class="rows">${profile.projects.filter(onCv).map(p => row(
            esc(period(p, lang, { yearOnly: true })),
            `<p class="rt">${esc(L(p, 'title', lang))}</p><p class="rs">${esc(L(p, 'funder', lang))}</p>`
        )).join('')}</ol>`));
    }

    // Teaching
    if (profile.teaching?.length) {
        body.push(section(t.teaching, `<ol class="rows compact">${profile.teaching.filter(onCv).map(c => row(
            esc(period(c, lang, { yearOnly: true })),
            `<p><span class="rt">${esc(L(c, 'course', lang))}</span><span class="rs">, ${esc(L(c, 'terms', lang))}</span></p>${L(c, 'note', lang) ? `<p class="rn">${esc(L(c, 'note', lang))}</p>` : ''}`
        )).join('')}</ol>`, esc(t.teachingSub)));
    }

    // Awards
    const awards = (profile.awards || []).filter(a => onCv(a) && !a.earlier);
    if (awards.length) {
        body.push(section(t.awards, `<ol class="rows compact">${awards.map(a => row(
            esc(period(a, lang, { yearOnly: !ko })),
            `<p><span class="rt"${hasHangul(L(a, 'title', lang)) ? ' lang="ko"' : ''}>${esc(L(a, 'title', lang))}</span>${L(a, 'by', lang) ? `<span class="rs">, ${esc(L(a, 'by', lang))}</span>` : ''}</p>${L(a, 'note', lang) ? `<p class="rn">${esc(L(a, 'note', lang))}</p>` : ''}`
        )).join('')}</ol>`));
    }

    // Certifications
    if (profile.certifications?.length) {
        body.push(section(t.certifications, `<ol class="rows compact">${profile.certifications.filter(onCv).map(c => row(
            esc(period(c, lang)),
            `<p><span class="rt">${esc(L(c, 'title', lang))}</span>${ko ? '' : ` <span class="rs" lang="ko">(${esc(c.title_ko || '')})</span>`}<span class="rs">, ${esc(L(c, 'by', lang))}</span></p>`
        )).join('')}</ol>`));
    }

    // Service
    const sv = profile.service || {};
    const svParts = [];
    const svRows = (items, opts = {}) => `<ol class="rows compact">${items.filter(onCv).map(x => row(
        esc(opts.since ? t.since(period({ start: x.start }, lang, { yearOnly: !ko })) : period(x, lang, { yearOnly: !ko })),
        `<p><span class="rt"${hasHangul(L(x, 'title', lang)) ? ' lang="ko"' : ''}>${esc(L(x, 'title', lang))}</span>${L(x, 'role', lang) ? `<span class="rs">, ${esc(opts.lowerRole && !ko ? L(x, 'role', lang).toLowerCase() : L(x, 'role', lang))}</span>` : ''}</p>${!opts.noNote && L(x, 'note', lang) ? `<p class="rn">${esc(L(x, 'note', lang))}</p>` : ''}`
    )).join('')}</ol>`;
    if (sv.reviewing?.length) svParts.push(sub(t.reviewing) + svRows(sv.reviewing));
    if (sv.organizing?.length) svParts.push(sub(t.organizing) + svRows(sv.organizing));
    if (sv.memberships?.length) svParts.push(sub(t.memberships) + svRows(sv.memberships, { since: true, lowerRole: true }));
    if (sv.outreach?.length && !ko) svParts.push(sub(t.outreach) + svRows(sv.outreach));
    if (svParts.length) body.push(section(t.service, svParts.join('')));
    if (ko && sv.outreach?.length) body.push(section(t.outreach, svRows(sv.outreach)));

    // Military service (Korean CV only, opt-in)
    if (ko && profile.military?.show) {
        body.push(section(t.military, `<ol class="rows compact">${row('', `<p class="rt">${esc(profile.military.text)}</p>${profile.military.note ? `<p class="rn">${esc(profile.military.note)}</p>` : ''}`)}</ol>`));
    }

    // Skills
    const skills = L(profile, 'skills', lang) || [];
    if (skills.length) body.push(section(t.skills, `<ul class="skills">${skills.map(s => `<li>${noteHtml(s)}</li>`).join('')}</ul>`));

    const toolbar = mode === 'web' ? `<nav class="cv-bar" aria-label="CV">
        <a href="/">← ${esc(t.home)}</a>
        <span class="cv-lang">${ko ? '<a href="/cv/" lang="en">English</a><span aria-current="page">한국어</span>' : '<span aria-current="page">English</span><a href="/cv/ko/" lang="ko">한국어</a>'}</span>
        <a class="cv-dl" href="/cv/${ko ? 'Sang-Min-Lee-CV-ko.pdf' : 'Sang-Min-Lee-CV.pdf'}" download="${ko ? '이상민_이력서.pdf' : 'Sang-Min-Lee-CV.pdf'}">${esc(t.pdf)}</a>
    </nav>` : '';

    const pageCss = `@page { size: A4; margin: 15mm 15mm 17mm; @bottom-left { content: "${t.footer}"; font: 7.5pt "Pretendard Variable", Pretendard, sans-serif; color: #8a8a8a; } @bottom-right { content: counter(page) " / " counter(pages); font: 7.5pt "Pretendard Variable", Pretendard, sans-serif; color: #8a8a8a; } }`;

    return `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(t.docTitle)}</title>
<meta name="description" content="${esc(ko ? `${config['name-ko']} (${config.name}) 이력서` : `Curriculum vitae of ${config.name}`)}">
<meta name="author" content="${esc(config.name)}">
<meta name="color-scheme" content="light">
<link rel="canonical" href="https://${site}/cv/${ko ? 'ko/' : ''}">
<link rel="alternate" hreflang="en" href="https://${site}/cv/">
<link rel="alternate" hreflang="ko" href="https://${site}/cv/ko/">
<link rel="icon" type="image/png" sizes="32x32" href="/static/assets/favicon-32.png">
${mode === 'web' ? '<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css">' : ''}
<style>${pageCss}${css}</style>
</head>
<body class="${ko ? 'is-ko' : 'is-en'} mode-${mode}">
${toolbar}
<main class="sheet">
${head}
${body.join('\n')}
<footer class="cv-foot">${esc(t.updated(buildDate))} · <a href="https://${site}/cv/${ko ? 'ko/' : ''}">${site}/cv${ko ? '/ko' : ''}</a></footer>
</main>
</body>
</html>`;
}
