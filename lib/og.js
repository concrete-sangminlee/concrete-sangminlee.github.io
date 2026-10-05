// 1200×630 social preview cards. scripts/render.sh screenshots these with
// headless Chrome into dist/static/og/og-<lang>.png.
import { esc, L } from './format.js';

export function renderOgCard(lang, { config, research, counts, photo }) {
    const ko = lang === 'ko';
    const name = ko ? config['name-ko'] : config.name;
    const alt = ko ? config.name : config['name-ko'];
    const role = ko ? esc(config['role-ko']) : `${esc(config.role)}<br>${esc(config.affiliation)}`;
    const areas = research.slice(0, 4).map(r => L(r, 'title', lang));
    const stats = ko
        ? `학술지 ${counts.journal}편 · 학술대회 ${counts.conference}편`
        : `${counts.journal} journal articles · ${counts.conference} conference papers`;
    return `<!DOCTYPE html>
<html lang="${lang}"><head><meta charset="utf-8"><title>og</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: 1200px; height: 630px; overflow: hidden; }
  body {
    position: relative;
    background: #fff;
    color: #18181b;
    font-family: "Pretendard Variable", Pretendard, -apple-system, system-ui, sans-serif;
    -webkit-font-smoothing: antialiased;
    word-break: keep-all;
  }
  .bar { position: absolute; left: 0; top: 0; bottom: 0; width: 14px; background: #1e56a0; }
  .wrap { position: absolute; inset: 78px 84px 70px 98px; display: grid; grid-template-columns: 1fr 236px; gap: 64px; }
  h1 { font-size: 84px; font-weight: 700; letter-spacing: -0.035em; line-height: 1; }
  h1 span { margin-left: 18px; font-size: 38px; font-weight: 500; letter-spacing: 0; color: #7a7b83; }
  .role { margin-top: 22px; font-size: 30px; line-height: 1.35; color: #45464d; letter-spacing: -0.01em; }
  ul { list-style: none; margin-top: 46px; display: grid; gap: 10px; }
  li { font-size: 26px; color: #18181b; letter-spacing: -0.01em; }
  li::before { content: ""; display: inline-block; width: 9px; height: 9px; margin: 0 16px 4px 0; border-radius: 50%; background: #1e56a0; }
  .foot { position: absolute; left: 0; right: 0; bottom: 0; display: flex; justify-content: space-between; font-size: 22px; color: #7a7b83; }
  .foot b { color: #18181b; font-weight: 600; }
  img { width: 236px; height: 236px; object-fit: cover; border-radius: 10px; }
</style></head>
<body>
  <div class="bar"></div>
  <div class="wrap">
    <div>
      <h1>${esc(name)}${alt ? `<span>${esc(alt)}</span>` : ''}</h1>
      <p class="role">${role}</p>
      <ul>${areas.map(a => `<li>${esc(a)}</li>`).join('')}</ul>
    </div>
    <div>${photo ? `<img src="${photo}" alt="">` : ''}</div>
    <div class="foot"><b>concrete-sangminlee.github.io</b><span>${esc(stats)}</span></div>
  </div>
</body></html>`;
}
