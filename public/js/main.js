'use strict';

// ---------- state ----------
const state = {
  lang: localStorage.getItem('bh_lang') || 'zh',
  route: window.location.hash || '#/home',
  site: null,
  homeData: null
};
let logCall = '';   // active station callsign for the logs page
let logPage = 1;    // current logs page
let logQuery = '';   // callsign search query

const app = document.getElementById('app');
const navLinksEl = document.getElementById('navLinks');

// ---------- i18n ----------
function t(...path) {
  let o = window.I18N[state.lang];
  for (const k of path) o = o && o[k];
  if (o !== undefined && o !== null) return o;
  o = window.I18N.zh;
  for (const k of path) o = o && o[k];
  return o;
}
function pick(a, b) { return state.lang === 'zh' ? (a || b) : (b || a); }

// ---------- helpers ----------
function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
async function fetchJSON(url, opts) {
  const r = await fetch(url, opts);
  let data;
  try { data = await r.json(); } catch (e) { data = { ok: false, error: 'bad_json' }; }
  if (!r.ok || data.ok === false) throw new Error(data.error || '请求失败');
  return data;
}
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 2200);
}
function fmtDate(d) {
  if (!d) return '';
  const s = String(d); return s.length >= 10 ? s.slice(0, 10) : s;
}
const qs = (sel) => document.querySelector(sel);

// ---------- nav ----------
function renderNav(active) {
  const items = [
    ['#/home', t('nav.home')],
    ['#/about', t('nav.about')],
    ['#/articles', t('nav.articles')],
    ['#/logs', t('nav.logs')],
    ['#/pota', t('nav.pota')],
    ['#/guestbook', t('nav.guestbook')]
  ];
  navLinksEl.innerHTML = items.map(([href, label]) =>
    `<a href="${href}" class="nav-link ${active === href ? 'active' : ''}">${escapeHtml(label)}</a>`
  ).join('');
  // lang
  document.querySelectorAll('#langToggle button').forEach(b => {
    b.classList.toggle('active', b.dataset.lang === state.lang);
  });
}

// ---------- VIEWS ----------
function homeView() {
  const d = state.homeData;
  const site = d.site || {};
  const posts = d.latestArticles || [];
  const logs = d.latestLogs || [];
  const css = t('home') || {};
  const quick = css.quick;
  const oa = d.onAirInfo || { mode: 'auto', onAir: false, freq: '', modeValue: '', date: '', time: '' };
  const on = !!oa.onAir;
  const onAirParts = [oa.freq ? oa.freq + ' MHz' : '', oa.modeValue, oa.date, oa.time ? oa.time + ' UTC' : ''].filter(Boolean);
  const onAirDetail = (onAirParts.length ? onAirParts.join(' · ') : '') + (oa.mode === 'auto' ? ' · PSKReporter' : ' · 手动');
  const stats = [
    { n: d.logCount || 0, l: css.stats.qso },
    { n: d.totalArticles || 0, l: css.stats.posts },
    { n: d.messageCount || 0, l: css.stats.gb }
  ];
  const quickItems = [
    { href: '#/logs', icon: '📡', t: quick.logs, d: quick.logsDesc },
    { href: '#/guestbook', icon: '📮', t: quick.guestbook, d: quick.guestbookDesc },
    { href: '#/pota', icon: '🏞️', t: quick.pota, d: quick.potaDesc },
    { href: '#/articles', icon: '✍️', t: quick.articles, d: quick.articlesDesc },
    { href: '#/about', icon: '👋', t: quick.about, d: quick.aboutDesc }
  ];
  return `
  <div class="home-hero">
    <div class="overlay"></div>
    <div class="content">
      <div class="callsign">${escapeHtml(site.callsign || 'BG4LZN')}<span>.</span></div>
      <div class="sub">${escapeHtml(pick(css.tagline, css.sub))}</div>
      <div class="status-strip">
        ${stats.map(s => `<div class="stat-chip"><span class="n">${escapeHtml(s.n)}</span><span class="l">${escapeHtml(s.l)}</span></div>`).join('')}
        <div class="stat-chip status-chip ${on ? 'on' : 'off'}" title="${escapeHtml(css.onAirHint)}">
          <span class="n"><span class="live-dot ${on ? 'on' : 'off'}"></span></span>
          <span class="l">${escapeHtml(on ? css.onAir : css.offAir)}</span>
        </div>
      </div>
      ${onAirDetail ? `<div class="stat-chip onair-detail ${on ? 'on' : 'off'}">📡 ${escapeHtml(onAirDetail)}</div>` : ''}
    </div>
  </div>
  <div class="quick-grid">
    ${quickItems.map(q => `<a href="${q.href}" class="card quick-card">
      <div class="qc-ico">${q.icon}</div>
      <div class="qc-t">${escapeHtml(q.t)}</div>
      <div class="qc-d">${escapeHtml(q.d)}</div>
    </a>`).join('')}
  </div>
  <div class="home-grid">
    <div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
        <h2 class="section-title">${escapeHtml(css.latest)}</h2>
        <a href="#/articles" class="btn ghost small">${escapeHtml(css.viewAll)} →</a>
      </div>
      <div class="posts-preview">
        ${posts.length ? posts.map(p => `
          <a href="#/article/${p.id}" class="card post-card">
            ${p.cover ? `<img class="cover" src="${escapeHtml(p.cover)}" alt="">` : `<div class="cover" style="background:linear-gradient(135deg,#fdeee6,#f2d9c6);display:grid;place-items:center;font-size:26px;">📡</div>`}
            <div class="p-body">
              <div class="p-title">${escapeHtml(pick(p.title, p.title_en))}</div>
              <div class="p-excerpt">${escapeHtml(pick(p.excerpt, p.excerpt_en))}</div>
              <div class="p-meta"><span>${escapeHtml(fmtDate(p.date))}</span><span>💬 ${p.comments || 0}</span><span>👍 ${p.likes || 0}</span></div>
            </div>
          </a>`).join('') : `<div class="card" style="padding:30px;text-align:center;color:var(--ink-faint);">${escapeHtml(t('articles.empty'))}</div>`}
      </div>
    </div>
    <div class="radioside">
      <div class="card">
        <h4><span class="band-chip">${escapeHtml(pick('无线电', 'Radio'))}</span> ${escapeHtml(css.radio)}</h4>
        <div>
          ${logs.length ? logs.map(l => `
            <div class="qso-mini">
              <div><span class="c">${escapeHtml(l.call)}</span> <span class="meta">${escapeHtml(fmtDate(l.date))}</span></div>
              <span class="band-chip">${escapeHtml(l.band || l.mode)}</span>
            </div>`).join('') : `<div style="font-size:13px;color:var(--ink-faint);">${escapeHtml(css.recentDemo)}</div>`}
        </div>
      </div>
    </div>
  </div>`;
}

function aboutView() {
  const a = t('about') || {};
  const meta = state.lang === 'zh' ? [
    { l: '呼号', v: 'BG4LZN' },
    { l: '所在地', v: '中国 · 山东 · 泰安' },
    { l: '操作级别', v: 'B 类' },
    { l: '网格定位', v: 'OM86' },
    { l: '邮箱', v: 'BG4LZN@outlook.com', mail: true }
  ] : [
    { l: 'Callsign', v: 'BG4LZN' },
    { l: 'Location', v: "Tai'an, Shandong, China" },
    { l: 'License', v: 'Class B' },
    { l: 'Grid Square', v: 'OM86' },
    { l: 'Email', v: 'BG4LZN@outlook.com', mail: true }
  ];
  const addrZh = '请通过邮箱联系索取 QSL 卡。';
  const addrEn = 'Contact me via email for QSL.';
  return `
  <div style="padding:26px 0 10px;">
    <h1 class="section-title">${escapeHtml(a.title)}</h1>
    <div class="section-sub">${escapeHtml(a.sub)}</div>
  </div>
  <div class="about-wrap">
    <div class="avatar"><img src="https://i.ibb.co/wh8QLjNp/picture.jpg" alt="BG4LZN"></div>
    <div class="about-info">
      <div class="h">BG4LZN</div>
      <div class="role">${escapeHtml(a.role)}</div>
      <div class="card about-card" style="margin-bottom:16px;">
        <p>${escapeHtml(a.intro1)}</p>
        <p style="margin-top:10px;">${escapeHtml(a.intro2)}</p>
      </div>
      <div class="card about-card" style="margin-bottom:16px;background:var(--accent-tint);border-color:#f7d7c9;">
        <p style="margin:0;">🙏 ${escapeHtml(a.credit || '')}</p>
      </div>
      <div class="card about-card">
        <h5>${escapeHtml(a.qslTitle)}</h5>
        <p>${escapeHtml(a.qsl)}</p>
        <div class="meta-row">
          ${meta.map(m => { const v = m.v || ''; return `<div class="meta-item"><b>${escapeHtml(m.l)}</b>${m.mail ? `<a class="m-email" href="mailto:${v}">${escapeHtml(v)}</a>` : escapeHtml(v)}</div>`; }).join('')}
        </div>
        <div class="qsl-addr">
          <div class="qsl-addr-block">
            <div class="qsl-t">${escapeHtml(pick('QSL 邮寄地址', 'Mailing Address'))}</div>
            <pre>${escapeHtml(addrZh)}</pre>
          </div>
          <div class="qsl-addr-block">
            <div class="qsl-t">English Address</div>
            <pre>${escapeHtml(addrEn)}</pre>
          </div>
        </div>
      </div>
    </div>
  </div>`;
}

function articlesView() {
  return `<div style="padding:26px 0 10px;">
    <h1 class="section-title">${escapeHtml(t('articles.title'))}</h1>
    <div class="section-sub">${escapeHtml(t('articles.sub'))}</div>
  </div><div id="articleGrid" class="article-grid"><div class="loading" style="grid-column:1/-1;"><div class="spinner"></div></div></div>`;
}

function articleDetailView(id) {
  return `<div style="padding:26px 0 10px;"><a href="#/articles" class="btn ghost small">← ${escapeHtml(t('articles.back'))}</a></div>
  <div id="articleDetail" class="article-detail"><div class="loading"><div class="spinner"></div></div></div>`;
}

function logsView() {
  return `<div style="padding:26px 0 10px;">
    <h1 class="section-title">${escapeHtml(t('logs.title'))}</h1>
    <div class="section-sub">${escapeHtml(t('logs.sub'))}</div>
  </div><div id="logsWrap"><div class="loading"><div class="spinner"></div></div></div>`;
}

async function potaView() {
  let url = 'https://pota-stats.wd4dan.net/?call=bg4lzn';
  try {
    const s = await (await fetch('/api/site')).json();
    if (s.site && s.site.potaUrl) url = s.site.potaUrl;
  } catch (e) {}
  return `<div style="padding:26px 0 10px;">
    <h1 class="section-title">${escapeHtml(t('pota.title'))}</h1>
    <div class="section-sub">${escapeHtml(t('pota.sub'))}</div>
  </div>
  <div class="pota-frame card">
    <iframe src="${escapeHtml(url)}" height="1250" frameborder="0" scrolling="no" loading="lazy" title="POTA Stats"></iframe>
  </div>`;
}

function guestbookView() {
  const g = t('guestbook') || {};
  return `<div style="padding:26px 0 10px;">
    <h1 class="section-title">${escapeHtml(g.title)}</h1>
    <div class="section-sub">${escapeHtml(g.sub)}</div>
  </div>
  <div class="card gb-form">
    <h3 class="section-sub" style="margin-bottom:0;">${escapeHtml(g.formTitle)}</h3>
    <input id="gb-name" placeholder="${escapeHtml(g.name)} (ops)" maxlength="30">
    <textarea id="gb-text" placeholder="${escapeHtml(g.ph)}" maxlength="2000"></textarea>
    <div><button class="btn accent" id="gb-submit">${escapeHtml(g.submit)}</button></div>
  </div>
  <div class="gb-list" id="gbList"><div class="loading"><div class="spinner"></div></div></div>`;
}

// ---------- render functions ----------
async function renderHome() {
  state.homeData = await fetchJSON('/api/home');
  app.innerHTML = homeView();
}
async function renderArticles() {
  const grid = qs('#articleGrid');
  try {
    const { articles } = await fetchJSON('/api/articles');
    if (!articles.length) grid.innerHTML = `<div class="empty" style="grid-column:1/-1;"><div class="e-ico">✍️</div>${escapeHtml(t('articles.empty'))}</div>`;
    else grid.innerHTML = articles.map(a => `
      <a href="#/article/${a.id}" class="card article-card">
        ${a.cover ? `<img class="ac-cover-img" src="${escapeHtml(a.cover)}" alt="">` : `<div class="ac-cover">📡</div>`}
        <div class="ac-body">
          <div class="ac-title">${escapeHtml(pick(a.title, a.title_en))}</div>
          <div class="ac-excerpt">${escapeHtml(pick(a.excerpt, a.excerpt_en))}</div>
          <div class="ac-foot">
            <span>${escapeHtml(fmtDate(a.date))}</span>
            <span class="likes">👍 ${a.likes || 0} · 💬 ${a.comments || 0}</span>
          </div>
        </div>
      </a>`).join('');
  } catch (e) {
    grid.innerHTML = `<div class="empty" style="grid-column:1/-1;">${escapeHtml(e.message)}</div>`;
  }
}
function renderArticleBody(content, images) {
  const imgs = Array.isArray(images) ? images : [];
  let text = String(content || '');
  // inline placement via [img:N]
  if (imgs.length && /\[img:/.test(text)) {
    const parts = text.split(/\[img:(\d+)\]/g);
    let html = '';
    for (let i = 0; i < parts.length; i++) {
      if (i % 2 === 0) html += escapeHtml(parts[i]);
      else { const idx = parseInt(parts[i], 10); if (imgs[idx] !== undefined) html += `<img class="ad-inline-img" src="${escapeHtml(imgs[idx])}" loading="lazy">`; }
    }
    return html;
  }
  // no markers → escaped text, then a gallery of illustrations below
  let html = escapeHtml(text);
  if (imgs.length) html += `<div class="ad-gallery">${imgs.map(u => `<figure><img src="${escapeHtml(u)}" loading="lazy"></figure>`).join('')}</div>`;
  return html;
}

async function renderArticleDetail(id) {
  const box = qs('#articleDetail');
  try {
    const res = await fetchJSON('/api/articles/' + id);
    const article = res.article;
    const liked = !!res.liked;
    const cs = t('articles') || {};
    let comments = (article.comments || []);
  try { const cbr = await fetchJSON('/api.php?action=comments&article=' + encodeURIComponent(id)); comments = cbr.comments || []; } catch (e) {}
  comments = (comments && Array.isArray(comments)) ? comments.slice().reverse() : [];
    
    box.innerHTML = `
      <div class="card">
        
        <h1>${escapeHtml(pick(article.title, article.title_en))}</h1>
        <div class="ad-meta">
          <span>${escapeHtml(fmtDate(article.date))}</span>
          <span>📖 ${article.views || 0} ${escapeHtml(pick('阅读', 'views'))}</span>
          <span>💬 ${comments.length}</span>
        </div>
        <div class="ad-content">${renderArticleBody(pick(article.content, article.content_en), article.images)}</div>
        <div class="like-bar">
          <button class="like-btn ${liked ? 'active' : ''}" id="likeBtn">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="${liked ? '#f0795a' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"/></svg>
            <span id="likeCount">${(article.likes || []).length}</span> ${escapeHtml(liked ? cs.liked : cs.like)}
          </button>
        </div>
        <div class="comments">
          <h3>${escapeHtml(cs.comment)} (${comments.length})</h3>
          <div id="commentList">${comments.map(c => `
            <div class="comment">
              <div class="c-avatar">${escapeHtml((c.name || 'Q').slice(0,1).toUpperCase())}</div>
              <div class="c-body">
                <div class="c-name">${escapeHtml(c.name)}<span class="c-time">${escapeHtml(fmtDate(c.date))}</span></div>
                <div class="c-text">${escapeHtml(c.text)}</div>
              </div>
            </div>`).join('') || `<div class="empty" style="padding:20px;">${escapeHtml(pick('还没有评论', 'No comments yet'))}</div>`}</div>
          <div class="comment-form">
            <input id="cm-name" placeholder="${escapeHtml(cs.name)} (ops)" maxlength="30">
            <textarea id="cm-text" placeholder="${escapeHtml(cs.commentPh)}" maxlength="2000"></textarea>
            <div><button class="btn accent" id="cm-submit">${escapeHtml(cs.submit)}</button></div>
          </div>
        </div>
      </div>`;
    qs('#likeBtn').onclick = async () => {
      try {
        const r = await fetchJSON('/api/articles/' + id + '/like', { method: 'POST' });
        localStorage.setItem('bh_liked_' + id, r.liked ? '1' : '0');
        const btn = qs('#likeBtn'), cnt = qs('#likeCount');
        if (btn) btn.classList.toggle('active', !!r.liked);
        if (cnt) cnt.textContent = String(r.count || 0);
        const svg = btn ? btn.querySelector('svg') : null;
        if (svg) svg.setAttribute('fill', r.liked ? '#f0795a' : 'none');
        toast((r.liked ? (cs.liked || '已点赞') : (cs.like || '点赞')) + (r.liked ? ' 73!' : ' (已取消)'));
      } catch (e) { toast(e.message); }
    };
    qs('#cm-submit').onclick = async () => {
      const name = qs('#cm-name').value.trim(); const text = qs('#cm-text').value.trim();
      if (!text) return toast(pick('请先写点内容', 'Please write a comment'));
      try {
        await fetchJSON('/api.php?action=addcomment', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ article: id, name, text }) });
        toast(pick('评论已发布', 'Comment posted'));
        renderArticleDetail(id);
      } catch (e) { toast(e.message); }
    };
  } catch (e) {
    box.innerHTML = `<div class="empty">${escapeHtml(e.message)}</div>`;
  }
}
﻿async function renderLogs() {
  const box = qs('#logsWrap');
  try {
    const data = await fetchLogsData();
    if (!qs('#logsToolbar')) {
      box.innerHTML = `<div id="logsToolbar"></div><div id="logResults"></div>`;
      buildLogsToolbar(data);
    }
    renderLogResults(data);
  } catch (e) {
    box.innerHTML = `<div class="empty">${escapeHtml(e.message)}</div>`;
  }
}
async function fetchLogsData() {
  const q = new URLSearchParams();
  if (logCall) q.set('call', logCall);
  if (logQuery) q.set('q', logQuery);
  q.set('page', logPage);
  q.set('per', '30');
  const data = await fetchJSON('/api/logs?' + q.toString());
  logCall = data.activeCall;
  return data;
}
function buildLogsToolbar(data) {
  const stationSel = `<select id="logCallSel" class="txt-input" style="max-width:230px;">
      ${(data.stations || []).map(s => `<option value="${escapeHtml(s.call)}" ${s.call === data.activeCall ? 'selected' : ''}>${escapeHtml(s.call)} (${s.count})</option>`).join('')}
    </select>`;
  document.getElementById('logsToolbar').innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:10px;">
      <div class="flex" style="flex-wrap:wrap;gap:10px;align-items:center;">
        <span class="section-sub" style="margin:0;">${escapeHtml(pick('请选择呼号：', 'Select callsign: '))}</span>${stationSel}
        <input class="txt-input" id="logSearch" placeholder="${escapeHtml(pick('搜索呼号…', 'Search callsign…'))}" value="${escapeHtml(logQuery)}" style="max-width:200px;">
      </div>
      <div class="pill blue" id="logCount"></div>
    </div>`;
  const search = document.getElementById('logSearch');
  let tm; search.addEventListener('input', () => { clearTimeout(tm); tm = setTimeout(() => { logQuery = search.value.trim(); logPage = 1; renderLogs(); }, 350); });
  const sel = document.getElementById('logCallSel');
  if (sel) sel.onchange = () => { logCall = sel.value; logPage = 1; renderLogs(); };
}
function renderLogResults(data) {
  const box = document.getElementById('logResults');
  const th = t('logs.th') || {};
  const logs = (data.logs || []).filter(Boolean);
  const page = data.page || 1, pages = data.pages || 1, total = data.total || 0;
  const count = document.getElementById('logCount');
  if (count) count.innerHTML = `${escapeHtml(pick('共', ''))} ${total} ${escapeHtml(t('logs.count'))}${data.lastSync ? ' · ' + escapeHtml(t('logs.lastSync')) + ': ' + escapeHtml(fmtDate(data.lastSync)) : ''}`;
  const pag = pages > 1 ? `<div class="logpager">
        <button class="btn ghost small" id="logPrev" ${page <= 1 ? 'disabled' : ''}>← ${escapeHtml(pick('上一页', 'Prev'))}</button>
        <span class="section-sub" style="margin:0;white-space:nowrap;">${escapeHtml(pick('第', 'Page '))} ${page} / ${pages}</span>
        <button class="btn ghost small" id="logNext" ${page >= pages ? 'disabled' : ''}>${escapeHtml(pick('下一页', 'Next'))} →</button>
      </div>` : '';
  box.innerHTML = `
      ${logs.length ? `<div class="card table-card"><div class="table-scroll"><table class="logs">
        <thead><tr>
          <th>${escapeHtml(th.date)}</th><th>${escapeHtml(th.time)}</th><th>${escapeHtml(th.call)}</th><th>${escapeHtml(th.freq)}</th><th>${escapeHtml(th.mode)}</th>
        </tr></thead>
        <tbody>${logs.map(l => `<tr>
          <td class="tdate">${escapeHtml(fmtDate(l.date))}</td>
          <td>${escapeHtml((l.time || '').slice(0, 8))} UTC</td>
          <td class="c-call">${escapeHtml(l.call || '')}</td>
          <td>${escapeHtml(l.freq || l.band || '')}</td>
          <td>${escapeHtml(l.mode || '')}</td>
        </tr>`).join('')}</tbody>
      </table></div></div>` : `<div class="card" style="padding:50px;text-align:center;"><div class="empty"><div class="e-ico">📤</div>${escapeHtml(t('logs.empty'))}</div></div>`}
      <div style="display:flex;justify-content:center;margin-top:16px;">${pag}</div>
    `;
  const prev = document.getElementById('logPrev'), next = document.getElementById('logNext');
  if (prev) prev.onclick = () => { logPage = Math.max(page - 1, 1); renderLogs(); };
  if (next) next.onclick = () => { logPage = Math.min(page + 1, pages); renderLogs(); };
}
async function renderPota() {
  const box = qs('#potaWrap');
  try {
    const { spots } = await fetchJSON('/api/pota');
    const th = t('pota.th') || {};
    if (!spots || !spots.length) {
      box.innerHTML = `<div class="card" style="padding:50px;text-align:center;"><div class="empty"><div class="e-ico">🏞️</div>${escapeHtml(t('pota.empty'))}</div></div>`;
      return;
    }
    box.innerHTML = `<div class="card table-card"><div class="table-scroll"><table class="logs">
      <thead><tr><th>${escapeHtml(th.time)}</th><th>${escapeHtml(th.ref)}</th><th>${escapeHtml(th.park)}</th><th>${escapeHtml(th.freq)}</th><th>${escapeHtml(th.mode)}</th><th>${escapeHtml(th.note)}</th></tr></thead>
      <tbody>${spots.map(s => `<tr>
        <td class="tdate">${escapeHtml((s.spotTime||'').replace('T',' ').slice(0,19))}</td>
        <td><span class="pill">${escapeHtml(s.reference || s.ref || '')}</span></td>
        <td>${escapeHtml(s.name || s.parkName || '')}</td>
        <td>${escapeHtml(s.frequency || s.freq || '')}</td>
        <td>${escapeHtml(s.mode || '')}</td>
        <td>${escapeHtml(s.comments || s.spotter || '')}</td>
      </tr>`).join('')}</tbody>
    </table></div></div>`;
  } catch (e) {
    box.innerHTML = `<div class="empty">${escapeHtml(e.message)}</div>`;
  }
}
async function renderGuestbook() {
  const g = t('guestbook') || {};
  const list = qs('#gbList');
  qs('#gb-submit').onclick = async () => {
    const name = qs('#gb-name').value.trim(); const text = qs('#gb-text').value.trim();
    if (!text) return toast(pick('请先写点什么', 'Please write a message'));
    try {
      await fetchJSON('/api.php?action=addguestbook', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ name, text }) });
      qs('#gb-name').value = ''; qs('#gb-text').value = '';
      toast(pick('留言已发布，73！', 'Message posted, 73!'));
      renderGuestbook();
    } catch (e) { toast(e.message); }
  };
  try {
    const gbd = await fetchJSON('/api.php?action=guestbook'); const messages = Array.isArray(gbd.messages) ? gbd.messages : (gbd.messages ? [gbd.messages] : []);
    if (!messages.length) list.innerHTML = `<div class="card" style="padding:50px;text-align:center;"><div class="empty"><div class="e-ico">📮</div>${escapeHtml(g.empty)}</div></div>`;
    else list.innerHTML = messages.map(m => `
      <div class="card gb-item">
        <div class="g-top">
          <div class="g-avatar">${escapeHtml((m.name||'N').slice(0,1).toUpperCase())}</div>
          <div><div class="g-name">${escapeHtml(m.name)}</div><div class="g-date">${escapeHtml(fmtDate(m.date))}</div></div>
        </div>
        <div class="g-text">${escapeHtml(m.text)}</div>
      </div>`).join('');
  } catch (e) {
    list.innerHTML = `<div class="empty">${escapeHtml(e.message)}</div>`;
  }
}

// ---------- router ----------
async function router() {
  const hash = window.location.hash || '#/home';
  state.route = hash;
  const [_, page, id] = hash.split('/');
  renderNav('#' + page);
  const backRound = document.getElementById('backRound');
  if (backRound) backRound.classList.toggle('show', !(page === 'home' || !page));
  window.scrollTo({ top: 0, behavior: 'smooth' });
  try {
    if (page === 'home' || !page) { await renderHome(); }
    else if (page === 'about') { app.innerHTML = aboutView(); }
    else if (page === 'articles') { app.innerHTML = articlesView(); await renderArticles(); }
    else if (page === 'article') { app.innerHTML = articleDetailView(id); await renderArticleDetail(id); }
    else if (page === 'logs') { app.innerHTML = logsView(); await renderLogs(); }
    else if (page === 'pota') { app.innerHTML = await potaView(); }
    else if (page === 'guestbook') { app.innerHTML = guestbookView(); await renderGuestbook(); }
    else { app.innerHTML = homeView(); }
  } catch (e) {
    app.innerHTML = `<div class="empty">${escapeHtml(e.message)}</div>`;
  }
  applyStaticI18n();
  app.classList.remove('route-anim');
  void app.offsetWidth;
  app.classList.add('route-anim');
}

// re-render brand/footer i18n
function applyStaticI18n() {
  const brand = document.querySelector('.brand .t');
  if (brand) brand.textContent = pick('BG4LZN 的电台小屋', 'BG4LZN\'s Radio Shack');
  const foot = document.querySelector('[data-i18n="footer"]');
  if (foot) foot.textContent = t('footer');
}

// ---------- events ----------
window.addEventListener('hashchange', router);
document.querySelectorAll('#langToggle button').forEach(b => {
  b.addEventListener('click', () => {
    state.lang = b.dataset.lang;
    localStorage.setItem('bh_lang', state.lang);
    router();
  });
});

(async () => { try { const r = await fetch('/api/copy'); const d = await r.json(); if (d && d.copy && window.I18N && window.I18N.merge) window.I18N.merge(d.copy); } catch(e){} router(); })();

// ---- image lightbox (double-click zoom) ----
function openImglb(src) {
  let lb = document.getElementById('imglb');
  if (lb) lb.remove();
  lb = document.createElement('div');
  lb.id = 'imglb'; lb.className = 'lightbox';
  lb.innerHTML = '<button class="lb-close" aria-label="Close">×</button><img src="' + escapeHtml(src) + '" alt="">';
  document.body.appendChild(lb);
  document.body.style.overflow = 'hidden';
  lb.addEventListener('click', (ev) => { if (ev.target === lb || ev.target.classList.contains('lb-close')) closeImglb(); });
}
function closeImglb() {
  const lb = document.getElementById('imglb');
  if (lb) lb.remove();
  document.body.style.overflow = '';
}
document.addEventListener('dblclick', (ev) => {
  const img = ev.target.closest && ev.target.closest('.ad-inline-img, .ad-gallery img');
  if (img) openImglb(img.src);
});
document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') closeImglb(); });
