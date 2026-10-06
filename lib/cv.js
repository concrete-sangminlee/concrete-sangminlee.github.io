// Renders the CVs from contents/ data: English / Korean, full / short (2 pages).
// CI prints the "print" mode of each to PDF (scripts/cv-pdf.sh).
import { esc, hasHangul, dashes, L, period, recency, renderAuthors, noteHtml } from './format.js';

const SITE = 'concrete-sangminlee.github.io';

/** URL path and PDF filename for each CV variant. */
export const CV_VARIANTS = [
    { lang: 'en', variant: 'full', base: 'full', path: 'cv/', pdf: 'Sang-Min-Lee-CV.pdf', download: 'Sang-Min-Lee-CV.pdf' },
    { lang: 'en', variant: 'short', base: 'short', path: 'cv/short/', pdf: 'Sang-Min-Lee-CV-short.pdf', download: 'Sang-Min-Lee-CV-short.pdf' },
    { lang: 'ko', variant: 'full', base: 'full', path: 'cv/ko/', pdf: 'Sang-Min-Lee-CV-ko.pdf', download: '이상민_이력서.pdf' },
    { lang: 'ko', variant: 'short', base: 'short', path: 'cv/ko/short/', pdf: 'Sang-Min-Lee-CV-ko-short.pdf', download: '이상민_요약이력서.pdf' },
];
const variantOf = (lang, variant) => CV_VARIANTS.find(v => v.lang === lang && v.variant === variant);

/**
 * Tailored CVs from contents/cv-variants.yml. Each entry:
 *   id        url slug, [a-z0-9-]           (required)
 *   lang      en | ko                       (default en)
 *   base      full | short                  (default short)
 *   title     document title
 *   topics    research ids to keep, in display order (default: all)
 *   group_by  type | topic                  how publications are grouped
 *   listed    false keeps the page out of search engines (default false)
 *   sections  section keys to include, in order (default: all, standard order)
 */
export const CV_SECTIONS = ['interests', 'education', 'experience', 'publications', 'patents', 'projects', 'teaching', 'awards', 'certifications', 'service', 'outreach', 'military', 'skills'];

export function cvVariantsFrom(list, fail) {
    if (!Array.isArray(list)) return [];
    const seen = new Set(['en:short', 'ko:short']);
    return list.map((v, i) => {
        const where = `cv-variants.yml entry #${i + 1}`;
        if (!v || !/^[a-z0-9-]+$/.test(String(v.id || ''))) fail(`${where} needs an id made of a-z, 0-9 and -`);
        const lang = v.lang === 'ko' ? 'ko' : 'en';
        if (seen.has(`${lang}:${v.id}`)) fail(`${where}: duplicate id "${v.id}" for lang ${lang}`);
        seen.add(`${lang}:${v.id}`);
        if (v.sections !== undefined) {
            const bad = Array.isArray(v.sections) ? v.sections.filter(s => !CV_SECTIONS.includes(s)) : ['(not a list)'];
            if (bad.length) fail(`${where}: unknown sections ${bad.join(', ')} (use ${CV_SECTIONS.join(', ')})`);
        }
        const base = v.base === 'full' ? 'full' : 'short';
        const stem = `Sang-Min-Lee-CV-${lang === 'ko' ? 'ko-' : ''}${v.id}`;
        return {
            ...v, lang, base, variant: v.id, custom: true,
            path: lang === 'ko' ? `cv/ko/${v.id}/` : `cv/${v.id}/`,
            pdf: `${stem}.pdf`, download: `${stem}.pdf`,
            groupBy: v.group_by === 'topic' ? 'topic' : 'type',
            listed: v.listed === true,
        };
    });
}

const T = {
    en: {
        docTitle: { full: 'Sang Min Lee, Curriculum Vitae', short: 'Sang Min Lee, CV (short)' },
        footer: { full: 'Sang Min Lee · Curriculum Vitae', short: 'Sang Min Lee · CV (short)' },
        variantLabel: { full: 'Full', short: 'Short' },
        byTopic: 'Publications by Research Area',
        interests: 'Research Interests',
        education: 'Education',
        experience: 'Research and Professional Experience',
        publications: 'Publications',
        selectedPublications: 'Selected Publications',
        journals: 'Journal Articles',
        conferences: 'Conference Papers',
        intlConferences: 'International Conference Papers',
        theses: 'Theses',
        morePubs: (dom, th) => `Also ${dom} papers at Korean domestic conferences and ${th} theses.`,
        patents: 'Patents',
        projects: 'Research Projects',
        teaching: 'Teaching Experience',
        teachingSub: 'Teaching assistant, Seoul National University',
        teachingShort: n => `Teaching assistant for ${n} courses, Seoul National University`,
        awards: 'Honors and Awards',
        certifications: 'Certifications',
        service: 'Professional Service',
        reviewing: 'Reviewing',
        organizing: 'Conference Organization',
        memberships: 'Professional Memberships',
        membershipsShort: 'Memberships',
        outreach: 'Outreach',
        skills: 'Skills',
        inKorean: 'in Korean',
        patentNo: n => `Korean Patent ${n}, registered`,
        since: y => `since ${y}`,
        updated: d => `Last updated ${d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })}`,
        fullAt: 'Full CV',
        pubSummary: c => `${c.journal} journal articles · ${c.conference} conference papers`,
        home: 'Homepage',
        pdf: 'Download PDF',
    },
    ko: {
        docTitle: { full: '이상민 이력서', short: '이상민 요약 이력서' },
        footer: { full: '이상민 · 이력서', short: '이상민 · 요약 이력서' },
        variantLabel: { full: '전체', short: '요약' },
        byTopic: '연구 분야별 연구실적',
        interests: '연구 분야',
        education: '학력',
        experience: '경력',
        publications: '연구실적',
        selectedPublications: '주요 연구실적',
        intlJournals: '국제학술지',
        domJournals: '국내학술지',
        intlConferences: '국제학술대회',
        domConferences: '국내학술대회',
        theses: '학위논문',
        morePubs: (dom, th) => `이 밖에 국내학술대회 논문 ${dom}편, 학위논문 ${th}편.`,
        patents: '특허 (등록)',
        projects: '참여 연구과제',
        teaching: '강의 및 조교',
        teachingSub: '서울대학교 교육조교',
        teachingShort: n => `서울대학교 교육조교 (${n}개 과목)`,
        awards: '수상 및 장학',
        certifications: '자격',
        service: '학술 활동',
        reviewing: '논문 심사',
        organizing: '학술대회 조직',
        memberships: '학회 회원',
        membershipsShort: '학회 회원',
        outreach: '사회봉사',
        military: '병역',
        skills: '보유 기술',
        contact: { email: '이메일', web: '홈페이지', scholar: 'Google Scholar', orcid: 'ORCID', github: 'GitHub' },
        patentNo: n => `대한민국 특허 제${n}호`,
        since: y => `${y}–현재`,
        updated: d => `${d.getUTCFullYear()}년 ${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 기준`,
        fullAt: '전체 이력서',
        pubSummary: c => `국제학술지 ${c.ij}편 · 국내학술지 ${c.dj}편 · 국제학술대회 ${c.ic}편 · 국내학술대회 ${c.dc}편`,
        home: '홈페이지',
        pdf: 'PDF 다운로드',
    },
};

const row = (when, what) => `<li class="r"><div class="r-when">${when}</div><div class="r-what">${what}</div></li>`;
const section = (title, body, aside = '') => `<section class="s"><h2>${esc(title)}${aside ? `<span class="s-aside">${aside}</span>` : ''}</h2>${body}</section>`;
const sub = title => `<h3>${esc(title)}</h3>`;
const ko_ = s => (hasHangul(s) ? ' lang="ko"' : '');
const notes = list => (list && list.length ? `<ul class="notes">${list.map(n => `<li${ko_(n)}>${noteHtml(n)}</li>`).join('')}</ul>` : '');
const onCv = x => x && x.cv !== false;
/** "Lee, S. M., & Kang, T. H.-K." + "." without doubling the final period. */
const endSentence = html => (/[.!?]$/.test(html.replace(/<[^>]+>/g, '')) ? html : `${html}.`);

// ------------------------------------------------------------------ publications
function pubParts(p, lang) {
    if (lang === 'ko') {
        const koreanPaper = hasHangul(p.title) || hasHangul(p.venue) || p.title_ko;
        return {
            title: p.title_ko || p.title,
            authors: koreanPaper || p.type === 'thesis' ? p.authors_ko || p.authors : p.authors,
            venue: p.venue_ko || p.venue,
            note: p.note_ko || p.note,
            translated: false,
        };
    }
    return {
        title: hasHangul(p.title) ? p.title_en || p.title : p.title,
        authors: p.authors,
        venue: p.venue_en || p.venue,
        note: p.note,
        translated: hasHangul(p.title) && !!p.title_en,
    };
}

function pubItem(p, lang, label) {
    const t = T[lang];
    const { title, authors, venue, note, translated } = pubParts(p, lang);
    const details = p.details ? dashes(p.details) : '';
    const titleText = title.replace(/[.?!]$/, '');
    const tr = translated ? ` (${t.inKorean})` : '';
    let ref = `${renderAuthors(authors)} (${p.year}). <span class="pt"${ko_(titleText)}>${esc(titleText)}</span>`;
    if (p.type === 'thesis') {
        ref += lang === 'ko' ? `. ${esc(venue)}${note ? `, ${esc(note)}` : ''}.` : `${tr} [${esc(note || 'Thesis')}]. ${esc(venue)}.`;
    } else {
        ref += `${tr}. <em${ko_(venue)}>${esc(venue)}</em>${details ? `, ${esc(details)}` : ''}.`;
    }
    const extras = [];
    if (p.indexing) extras.push(`<span class="idx">${esc(p.indexing)}</span>`);
    if (p.doi) extras.push(`<a href="https://doi.org/${esc(p.doi)}">doi:${esc(p.doi)}</a>`);
    return `<li><span class="n">${esc(label)}</span><span class="ref">${ref}${extras.length ? ` ${extras.join(' ')}` : ''}</span></li>`;
}

const pubList = (items, lang, prefix) => `<ol class="pubs">${items.map((p, i) => pubItem(p, lang, `${prefix}${items.length - i}`)).join('')}</ol>`;

function renderPublications(pubs, lang, short, fullUrl, spec, research) {
    const t = T[lang];
    const topics = spec?.topics;
    const list = pubs.filter(p => p.type !== 'early' && onCv(p) && (!topics || topics.includes(p.topic) || p.type === 'thesis' && !short));
    if (spec?.groupBy === 'topic') {
        const order = topics || research.map(r => r.id);
        const typeRank = { journal: 0, conference: 1, thesis: 2 };
        const pool = short ? list.filter(p => p.type !== 'thesis' && !(p.type === 'conference' && p.scope === 'domestic')) : list;
        const groups = order.map(id => [research.find(r => r.id === id), pool.filter(p => p.topic === id)]).filter(g => g[0] && g[1].length);
        let n = groups.reduce((a, g) => a + g[1].length, 0);
        const body = groups.map(([r, items]) => sub(L(r, 'title', lang)) + `<ol class="pubs">${items
            .sort((a, b) => typeRank[a.type] - typeRank[b.type] || b.year - a.year || a.index - b.index)
            .map(p => pubItem(p, lang, `[${n--}]`)).join('')}</ol>`).join('');
        const dom = list.filter(p => p.type === 'conference' && p.scope === 'domestic').length;
        const theses = short ? list.filter(p => p.type === 'thesis').length : 0;
        const more = `<p class="more">${short && (dom || theses) ? `${esc(t.morePubs(dom, theses))} ` : ''}${esc(t.fullAt)}: <a href="${fullUrl}">${fullUrl.replace(/^https:\/\//, '')}</a></p>`;
        return section(t.byTopic, body + more);
    }
    const by = f => list.filter(f);
    const J = p => p.type === 'journal';
    const C = p => p.type === 'conference';
    const dom = p => p.scope === 'domestic';
    const c = {
        journal: by(J).length, conference: by(C).length,
        ij: by(p => J(p) && !dom(p)).length, dj: by(p => J(p) && dom(p)).length,
        ic: by(p => C(p) && !dom(p)).length, dc: by(p => C(p) && dom(p)).length,
        th: by(p => p.type === 'thesis').length,
    };
    let groups;
    if (lang === 'ko') {
        groups = [
            [t.intlJournals, by(p => J(p) && !dom(p)), 'IJ'],
            [t.domJournals, by(p => J(p) && dom(p)), 'DJ'],
            [t.intlConferences, by(p => C(p) && !dom(p)), 'IC'],
            ...(short ? [] : [[t.domConferences, by(p => C(p) && dom(p)), 'DC'], [t.theses, by(p => p.type === 'thesis'), 'T']]),
        ];
    } else {
        groups = short
            ? [[t.journals, by(J), 'J'], [t.intlConferences, by(p => C(p) && !dom(p)), 'C']]
            : [[t.journals, by(J), 'J'], [t.conferences, by(C), 'C'], [t.theses, by(p => p.type === 'thesis'), 'T']];
    }
    const body = groups.filter(g => g[1].length)
        .map(([h, items, pre]) => sub(lang === 'ko' ? `${h} (${items.length})` : h) + pubList(items, lang, pre)).join('');
    const more = short ? `<p class="more">${esc(t.morePubs(c.dc, c.th))} ${esc(t.fullAt)}: <a href="${fullUrl}">${fullUrl.replace(/^https:\/\//, '')}</a></p>` : '';
    return section(short ? t.selectedPublications : t.publications, body + more, esc(t.pubSummary(c)));
}

// ------------------------------------------------------------------ document
export function renderCV(lang, ctx) {
    const { config, profile, pubs, research, buildDate, css, photo, mode } = ctx;
    const variant = ctx.variant || 'full';
    const self = ctx.spec || variantOf(lang, variant);
    const spec = self.custom ? self : null;
    const short = self.base === 'short';
    const t = T[lang];
    const ko = lang === 'ko';
    const fullUrl = `https://${SITE}/${variantOf(lang, 'full').path}`;
    const contacts = config.contact || [];
    const find = icon => contacts.find(c => c.icon === icon);
    const email = find('mail');
    const scholar = find('scholar');
    const orcid = find('orcid');
    const github = find('github');

    // Header
    const contactRows = [
        email && [ko ? t.contact.email : '', `<a href="${esc(email.url)}">${esc(email.value)}</a>`],
        [ko ? t.contact.web : '', `<a href="https://${SITE}/">${SITE}</a>`],
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

    // Sections are collected by key, then emitted in the variant's `sections` order
    // (default: the order they are built in below).
    const parts = new Map();
    const add = (key, html) => parts.set(key, (parts.get(key) || '') + html);

    const interests = spec?.topics ? spec.topics.map(id => research.find(r => r.id === id)).filter(Boolean) : research;
    if (interests.length && !short) {
        add('interests', section(t.interests, `<p class="interests">${interests.map(r => esc(L(r, 'title', lang))).join(ko ? ', ' : '; ')}</p>`));
    }

    // Education (short: notes only for graduate degrees)
    add('education', section(t.education, `<ol class="rows">${(profile.education || []).filter(e => onCv(e) && !(short && e.short === false)).map((e, i) => row(
        esc(period(e, lang, { yearOnly: !ko })),
        `<p class="rt">${esc(L(e, 'degree', lang))}</p><p class="rs"${ko_(L(e, 'org', lang))}>${esc(L(e, 'org', lang))}</p>${notes(short && i > 1 ? [] : L(e, 'notes', lang))}`
    )).join('')}</ol>`));

    // Experience: ongoing first, then newest. Short: skip `short: false`, two notes each
    const exp = [...(profile.experience || [])].filter(e => onCv(e) && !(short && e.short === false)).sort((a, b) => recency(b) - recency(a));
    add('experience', section(t.experience, `<ol class="rows">${exp.map(e => row(
        esc(period(e, lang)),
        `<p class="rt">${esc(L(e, 'title', lang))}</p><p class="rs"${ko_(L(e, 'org', lang))}>${esc(L(e, 'org', lang))}</p>${notes((L(e, 'notes', lang) || []).slice(0, short ? 1 : undefined))}`
    )).join('')}</ol>`));

    add('publications', renderPublications(pubs, lang, short, fullUrl, spec, research));

    if (profile.patents?.length) {
        add('patents', section(t.patents, `<ol class="rows">${profile.patents.filter(onCv).map(p => row(
            esc(p.year),
            `<p class="rt"${ko_(L(p, 'title', lang))}>${esc(L(p, 'title', lang))}</p><p class="rs">${endSentence(renderAuthors(L(p, 'inventors', lang)))} ${esc(t.patentNo(p.number))}</p>`
        )).join('')}</ol>`));
    }

    if (!short && profile.projects?.length) {
        add('projects', section(t.projects, `<ol class="rows compact">${profile.projects.filter(onCv).map(p => row(
            esc(period(p, lang, { yearOnly: true })),
            `<p><span class="rt">${esc(L(p, 'title', lang))}</span><span class="rs">, ${esc(L(p, 'funder', lang))}</span></p>`
        )).join('')}</ol>`));
    }

    const courses = (profile.teaching || []).filter(onCv);
    if (courses.length && !short) {
        add('teaching', section(t.teaching, `<ol class="rows compact">${courses.map(c => row(
            esc(period(c, lang, { yearOnly: true })),
            `<p><span class="rt">${esc(L(c, 'course', lang))}</span><span class="rs">, ${esc(L(c, 'terms', lang))}</span></p>${L(c, 'note', lang) ? `<p class="rn">${esc(L(c, 'note', lang))}</p>` : ''}`
        )).join('')}</ol>`, esc(t.teachingSub)));
    } else if (courses.length) {
        const years = courses.flatMap(c => [c.start, c.end]).filter(Boolean).map(Number);
        add('teaching', section(t.teaching, `<ol class="rows compact">${row(
            `${Math.min(...years)}–${Math.max(...years)}`,
            `<p class="rt">${esc(t.teachingShort(courses.length))}</p>`
        )}</ol>`));
    }

    const awards = (profile.awards || []).filter(a => onCv(a) && !a.earlier).slice(0, short ? 5 : undefined);
    if (short) awards.push(...(profile.certifications || []).filter(onCv));
    if (awards.length) {
        add('awards', section(short ? `${t.awards}${ko ? ' · ' : ', '}${t.certifications}` : t.awards, `<ol class="rows compact">${awards.map(a => row(
            esc(period(a, lang, { yearOnly: !ko })),
            `<p><span class="rt"${ko_(L(a, 'title', lang))}>${esc(L(a, 'title', lang))}</span>${L(a, 'by', lang) ? `<span class="rs">, ${esc(L(a, 'by', lang))}</span>` : ''}</p>${!short && L(a, 'note', lang) ? `<p class="rn">${esc(L(a, 'note', lang))}</p>` : ''}`
        )).join('')}</ol>`));
    }

    if (profile.certifications?.length && !short) {
        add('certifications', section(t.certifications, `<ol class="rows compact">${profile.certifications.filter(onCv).map(c => row(
            esc(period(c, lang)),
            `<p><span class="rt">${esc(L(c, 'title', lang))}</span><span class="rs">, ${esc(L(c, 'by', lang))}</span></p>`
        )).join('')}</ol>`));
    }

    // Service
    const sv = profile.service || {};
    const svRows = (items, opts = {}) => `<ol class="rows compact">${items.filter(onCv).map(x => row(
        esc(opts.since ? t.since(period({ start: x.start }, lang, { yearOnly: !ko })) : period(x, lang, { yearOnly: !ko })),
        `<p><span class="rt"${ko_(L(x, 'title', lang))}>${esc(L(x, 'title', lang))}</span>${L(x, 'role', lang) ? `<span class="rs">, ${esc(opts.lowerRole && !ko ? L(x, 'role', lang).toLowerCase() : L(x, 'role', lang))}</span>` : ''}</p>${!short && L(x, 'note', lang) ? `<p class="rn"${ko_(L(x, 'note', lang))}>${esc(L(x, 'note', lang))}</p>` : ''}`
    )).join('')}</ol>`;
    const svParts = [];
    if (short) {
        const items = [...(sv.reviewing || []), ...(sv.organizing || [])].filter(onCv);
        const names = (sv.memberships || []).filter(onCv).map(m => (ko ? m.title_ko || m.title : (m.title.match(/\(([A-Z]{2,})\)\s*$/) || [])[1] || m.title));
        svParts.push(`<ol class="rows compact">${items.map(x => row(
            esc(period(x, lang, { yearOnly: !ko })),
            `<p><span class="rs">${esc(L(x, 'role', lang))}${ko ? ', ' : ', '}</span><span class="rt"${ko_(L(x, 'title', lang))}>${esc(L(x, 'title', lang))}</span></p>`
        )).join('')}${names.length ? row(esc(t.membershipsShort), `<p class="rs"${ko_(names.join(''))}>${esc(names.join(', '))}</p>`) : ''}</ol>`);
    } else {
        if (sv.reviewing?.length) svParts.push(sub(t.reviewing) + svRows(sv.reviewing));
        if (sv.organizing?.length) svParts.push(sub(t.organizing) + svRows(sv.organizing));
        if (sv.memberships?.length) svParts.push(sub(t.memberships) + svRows(sv.memberships, { since: true, lowerRole: true }));
        if (sv.outreach?.length && !ko) svParts.push(sub(t.outreach) + svRows(sv.outreach));
    }
    if (svParts.length) add('service', section(t.service, svParts.join('')));
    if (ko && !short && sv.outreach?.length) add('outreach', section(t.outreach, svRows(sv.outreach)));

    if (ko && profile.military?.show) {
        add('military', section(t.military, `<ol class="rows compact">${row('', `<p class="rt">${esc(profile.military.text)}</p>${profile.military.note ? `<p class="rn">${esc(profile.military.note)}</p>` : ''}`)}</ol>`));
    }

    const skills = L(profile, 'skills', lang) || [];
    if (skills.length) add('skills', section(t.skills, short
        ? `<p class="skills">${skills.map(s => noteHtml(s)).join('<span class="dot"> · </span>')}</p>`
        : `<ul class="skills">${skills.map(s => `<li>${noteHtml(s)}</li>`).join('')}</ul>`));

    // Screen toolbar: homepage, full/short, language, PDF
    const other = (l, v) => `/${variantOf(l, v).path}`;
    const toolbar = mode !== 'web' ? '' : spec ? `<nav class="cv-bar" aria-label="CV">
        <a href="/">← ${esc(t.home)}</a>
        <span class="cv-seg"><a href="${other(lang, 'full')}">${esc(t.fullAt)}</a></span>
        <a class="cv-dl" href="/cv/${self.pdf}" download="${esc(self.download)}">${esc(t.pdf)}</a>
    </nav>` : `<nav class="cv-bar" aria-label="CV">
        <a href="/">← ${esc(t.home)}</a>
        <span class="cv-seg">${['full', 'short'].map(v => (v === variant ? `<span aria-current="page">${esc(t.variantLabel[v])}</span>` : `<a href="${other(lang, v)}">${esc(t.variantLabel[v])}</a>`)).join('')}</span>
        <span class="cv-seg">${ko ? `<a href="${other('en', variant)}" hreflang="en" title="영어로 보기">En</a><span aria-current="page">Ko</span>` : `<span aria-current="page">En</span><a href="${other('ko', variant)}" hreflang="ko" title="View in Korean">Ko</a>`}</span>
        <a class="cv-dl" href="/cv/${self.pdf}" download="${esc(self.download)}">${esc(t.pdf)}</a>
    </nav>`;

    const footer = spec ? (spec.title || t.footer.short) : t.footer[variant];
    const pageCss = `@page { size: A4; margin: 15mm 15mm 17mm; @bottom-left { content: "${footer}"; font: 7.5pt "Pretendard Variable", Pretendard, sans-serif; color: #8a8a8a; } @bottom-right { content: counter(page) " / " counter(pages); font: 7.5pt "Pretendard Variable", Pretendard, sans-serif; color: #8a8a8a; } }`;
    const title = spec ? (spec.title || t.docTitle.short) : t.docTitle[variant];
    const desc = ko ? `${config['name-ko']} (${config.name}), ${config['role-ko'] || config.role}. ${title}.` : `${title}. ${config.role}, ${config.affiliation}.`;
    const url = `https://${SITE}/${self.path}`;
    const ld = JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'ProfilePage',
        url,
        inLanguage: lang,
        mainEntity: { '@type': 'Person', '@id': `https://${SITE}/#person`, name: config.name, alternateName: config['name-ko'], url: `https://${SITE}/` },
    }).replace(/</g, '\\u003c');

    return `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta name="author" content="${esc(config.name)}">
<meta name="color-scheme" content="light">
<link rel="canonical" href="${url}">
${spec ? (spec.listed ? '' : '<meta name="robots" content="noindex">') : ['en', 'ko'].map(l => `<link rel="alternate" hreflang="${l}" href="https://${SITE}/${variantOf(l, variant).path}">`).join('')}
<meta property="og:type" content="profile">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="https://${SITE}/static/assets/img/photo.jfif">
<meta property="og:locale" content="${ko ? 'ko_KR' : 'en_US'}">
<link rel="icon" type="image/png" sizes="32x32" href="/static/assets/favicon-32.png">
${mode === 'web' ? '<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css">' : ''}
<script type="application/ld+json">${ld}</script>
<style>${pageCss}${css}</style>
</head>
<body class="${ko ? 'is-ko' : 'is-en'} mode-${mode} is-${self.base}">
${toolbar}
<main class="sheet">
${head}
${(spec?.sections || [...parts.keys()]).map(k => parts.get(k)).filter(Boolean).join('\n')}
<footer class="cv-foot">${esc(t.updated(buildDate))} · <a href="${url}">${SITE}/${self.path.replace(/\/$/, '')}</a></footer>
</main>
</body>
</html>`;
}
