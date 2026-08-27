'use strict';

const main = document.getElementById('main');

// ---------- helpers ----------
async function fetchJSON(url, opts) {
  const r = await fetch(url, opts);
  let d; try { d = await r.json(); } catch (e) { d = { ok: false, error: 'bad_json' }; }
  if (!r.ok || d.ok === false) throw new Error(d.error || '请求失败');
  return d;
}
function toast(msg) { const el = document.getElementById('toast'); el.textContent = msg; el.classList.add('show'); clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove('show'), 2400); }
function escapeHtml(s) { return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
function fmtDate(d) { const s = String(d||''); return s.length>=10 ? s.slice(0,10) : s; }

function panelHead(title, btnHTML) {
  return `<div class="panel-head"><h3>${escapeHtml(title)}</h3>${btnHTML||''}</div>`;
}

function openModal(html) {
  const m = document.getElementById('modalMask');
  document.getElementById('modalBox').innerHTML = `<button class="close" onclick="closeModal()">×</button>` + html;
  m.classList.add('show');
}
function closeModal() { document.getElementById('modalMask').classList.remove('show'); }
window.closeModal = closeModal;

// ---------- nav ----------
function setView(view) {
  document.querySelectorAll('.side-link[data-view]').forEach(a => a.classList.toggle('active', a.dataset.view === view));
  const views = { dashboard, articles, lotw, guestbook, pota, copy };
  (views[view] || dashboard)();
}

document.querySelectorAll('.side-link[data-view]').forEach(a => {
  a.addEventListener('click', () => setView(a.dataset.view));
});
document.getElementById('logoutBtn').addEventListener('click', async () => {
  try { await fetchJSON('/api/auth/logout', { method: 'POST' }); } catch(e) {}
  location.href = '/adminlogin';
});
document.getElementById('modalMask').addEventListener('click', e => { if (e.target.id === 'modalMask') closeModal(); });

// ---------- auth ----------
async function checkAuth() {
  try {
    const d = await fetchJSON('/api/auth/me');
    if (!d.loggedIn) { location.href = '/adminlogin'; return false; }
    return true;
  } catch (e) { location.href = '/adminlogin'; return false; }
}

// ---------- DASHBOARD ----------
async function dashboard() {
  main.innerHTML = `<div class="loading"><div class="spinner"></div></div>`;
  try {
    const [stats, site] = await Promise.all([fetchJSON('/api/admin/stats'), fetchJSON('/api/admin/site')]);
    main.innerHTML = `
      <div class="page-title">后台总览</div>
      <div class="page-sub">欢迎回来，BG4LZN。管理你的电波小窝。</div>
      <div class="stat-grid">
        <div class="stat-card"><div class="n">${stats.articles}</div><div class="l">文章</div></div>
        <div class="stat-card"><div class="n">${stats.logs}</div><div class="l">通联日志</div></div>
        <div class="stat-card"><div class="n">${stats.guestbook}</div><div class="l">留言</div></div>
        <div class="stat-card"><div class="n">${stats.comments}</div><div class="l">评论</div></div>
        <div class="stat-card"><div class="n">${stats.logLikes}</div><div class="l">点赞</div></div>
      </div>
      <div class="panel card" style="padding:22px;">
        <h3 style="margin-bottom:12px;">快捷操作</h3>
        <div class="flex" style="flex-wrap:wrap;">
          <button class="btn accent small" onclick="setView('articles')">✍️ 写新文章</button>
          <button class="btn ghost small" onclick="setView('lotw')">📡 同步 LoTW 日志</button>
          <button class="btn ghost small" onclick="setView('guestbook')">📮 管理留言板</button>
          <button class="btn ghost small" onclick="setView('pota')">🏞️ POTA 设置</button>
        </div>
      </div>
    `;
  } catch (e) { main.innerHTML = `<div class="empty">${escapeHtml(e.message)}</div>`; }
}

// ---------- ARTICLES ----------
async function articles() {
  main.innerHTML = `<div class="loading"><div class="spinner"></div></div>`;
  try {
    const { articles } = await fetchJSON('/api/admin/articles');
    main.innerHTML = `
      <div class="page-title">文章管理</div>
      <div class="page-sub">创建、编辑你的无线电随笔。</div>
      ${panelHead('', `<button class="btn accent small" onclick="editArticle(null)">＋ 新建文章</button>`)}
      <div class="card panel" style="overflow:auto;">
        <table class="adm">
          <thead><tr><th>标题</th><th>日期</th><th>阅读</th><th>赞</th><th>评论</th><th>状态</th><th style="width:110px;">操作</th></tr></thead>
          <tbody>${articles.map(a => `<tr>
            <td>${escapeHtml(a.title)}</td>
            <td>${escapeHtml(fmtDate(a.date))}</td>
            <td>${a.views||0}</td>
            <td>${(a.likes||[]).length}</td>
            <td>${a._cc || 0}</td>
            <td>${a.published ? '<span class="badge green">已发布</span>' : '<span class="badge grey">草稿</span>'}</td>
            <td><div class="flex"><button class="icon-btn" onclick="editArticle('${a.id}')">编辑</button><button class="icon-btn danger" onclick="delArticle('${a.id}')">删</button></div></td>
          </tr>`).join('')}</tbody>
        </table>
      </div>
    `;
  } catch (e) { main.innerHTML = `<div class="empty">${escapeHtml(e.message)}</div>`; }
}

async function uploadImage(file) {
  const fd = new FormData();
  fd.append('image', file);
  const r = await fetch('/api/admin/upload', { method: 'POST', body: fd });
  const d = await r.json();
  if (!d.ok) throw new Error(d.error || '上传失败');
  return d.url;
}

﻿async function editArticle(id) {
  let a = { title:'', title_en:'', tags:'', date: fmtDate(new Date()), excerpt:'', content:'' };
  if (id) {
    try {
      const { articles } = await fetchJSON('/api/admin/articles');
      const f = articles.find(x => x.id === id);
      if (f) a = { id: f.id, title: f.title, title_en: f.title_en, tags: (f.tags||[]).join(', '), date: fmtDate(f.date), excerpt: f.excerpt, excerpt_en: f.excerpt_en, content: f.content, content_en: f.content_en, cover: f.cover || '', images: (f.images || []).slice(), published: f.published, comments: f.comments || [] };
    } catch(e){ toast(e.message); return; }
  }
  let coverUrl = a.cover || '';
  const images = (a.images || []).slice();
  let bbsComments = [];
  if (id) { try { const bcr = await fetchJSON('/api/admin/bbs/comments?article=' + id); bbsComments = bcr.comments || []; } catch(e){ bbsComments = []; } }
  const commentsHtml = (id && bbsComments.length) ? `<div class="adm-comments" style="margin:12px 0 0;border-top:1px dashed var(--line);padding-top:12px;">
      <div style="font-weight:700;margin-bottom:8px;">评论管理（${bbsComments.length}）</div>
      ${bbsComments.map(c => `<div class="adm-comment" style="display:flex;gap:8px;align-items:flex-start;padding:8px 0;border-bottom:1px solid var(--line);">
        <div style="flex:1;"><div style="font-weight:600;">${escapeHtml(c.name)}<span style="font-weight:400;font-size:12px;color:var(--ink-faint);margin-left:8px;">${escapeHtml(fmtDate(c.date))}</span></div>
          <div style="font-size:13px;color:var(--ink-soft);margin-top:2px;">${escapeHtml(c.text)}</div></div>
        <button class="icon-btn danger" data-cid="${escapeHtml(c.id)}">删除</button>
      </div>`).join('')}
    </div>` : '';
  openModal(`<h3>${id ? '编辑' : '新建'}文章</h3>
    <div class="edit-grid">
      <div class="form-row">
        <input class="txt-input" id="f-title" placeholder="标题 (中文)" value="${escapeHtml(a.title)}">
        <input class="txt-input" id="f-title_en" placeholder="Title (EN)" value="${escapeHtml(a.title_en)}">
      </div>
      <div class="form-row">
        <input class="txt-input" id="f-tags" placeholder="标签，逗号分隔 (如: FT8, 天线)" value="${escapeHtml(a.tags)}">
        <input class="txt-input" id="f-date" type="date" value="${escapeHtml(a.date)}">
      </div>
      <div class="form-row">
        <input class="txt-input" id="f-excerpt" placeholder="摘要/简介(中文)" value="${escapeHtml(a.excerpt)}">
        <input class="txt-input" id="f-excerpt_en" placeholder="Excerpt (EN)" value="${escapeHtml(a.excerpt_en)}">
      </div>
      <div class="form-row">
        <div class="drop" id="coverDrop" style="cursor:pointer;">
          <div id="coverName">${coverUrl ? '🖼 封面缩略图：' + escapeHtml(coverUrl) : '🖼 点击上传封面缩略图（显示在首页/文章列表卡片，可选）'}</div>
          <input type="file" id="coverFile" accept="image/*" hidden>
        </div>
        <div class="drop" id="imgDrop" style="cursor:pointer;">
          <div id="imgName">🖼 点击上传内容插图（可多张）</div>
          <input type="file" id="imgFiles" accept="image/*" multiple hidden>
        </div>
      </div>
      <div id="coverPrev" style="display:${coverUrl ? 'block' : 'none'};margin:4px 0;"><img src="${escapeHtml(coverUrl)}" style="max-width:220px;border-radius:10px;"></div>
      <div class="adm-thumbs" id="imgPreviews">${images.map(u => `<figure><img src="${escapeHtml(u)}"><button class="icon-btn danger x" data-u="${escapeHtml(u)}">×</button></figure>`).join('')}</div>
      <textarea class="adm full" id="f-content" placeholder="正文 (中文，支持换行，可在图片位置插图后引用 [img:0])">${escapeHtml(a.content)}</textarea>
      <textarea class="adm full" id="f-content_en" placeholder="Content (EN)">${escapeHtml(a.content_en)}</textarea>
      ${commentsHtml}
      <div class="flex">
        <label class="flex" style="cursor:pointer;"><input type="checkbox" id="f-pub" ${a.published!==false?'checked':''}> 发布</label>
        <button class="btn accent" style="margin-left:auto;" id="saveArticle">保存</button>
      </div>
    </div>`);
  document.getElementById('coverDrop').onclick = () => document.getElementById('coverFile').click();
  document.getElementById('coverFile').onchange = async () => {
    const f = document.getElementById('coverFile').files[0];
    if (!f) return;
    try { coverUrl = await uploadImage(f); document.getElementById('coverName').textContent = '🖼 封面：' + coverUrl; document.getElementById('coverPrev').innerHTML = `<img src="${escapeHtml(coverUrl)}" style="max-width:220px;border-radius:10px;">`; document.getElementById('coverPrev').style.display = 'block'; toast('封面已上传'); } catch(e){ toast(e.message); }
  };
  document.getElementById('imgDrop').onclick = () => document.getElementById('imgFiles').click();
  document.getElementById('imgFiles').onchange = async () => {
    const files = [...document.getElementById('imgFiles').files];
    for (const f of files) {
      try { const url = await uploadImage(f); images.push(url); renderImgThumbs(); } catch(e){ toast(e.message); }
    }
    document.getElementById('imgFiles').value = '';
  };
  window.renderImgThumbs = () => {
    document.getElementById('imgPreviews').innerHTML = images.map((u, i) => `<figure><img src="${escapeHtml(u)}"><button class="icon-btn danger x" data-i="${i}">×</button></figure>`).join('');
    document.querySelectorAll('#imgPreviews .x').forEach(b => b.onclick = () => { images.splice(parseInt(b.dataset.i, 10), 1); renderImgThumbs(); });
  };
  renderImgThumbs();
  if (id) {
    document.querySelectorAll('#modalMask [data-cid]').forEach(btn => {
      btn.onclick = async () => {
        if (!confirm('确定删除这条评论？')) return;
        try { await fetchJSON('/api/admin/bbs/comments/' + encodeURIComponent(btn.dataset.cid), { method: 'DELETE' }); toast('评论已删除'); editArticle(id); }
        catch(e){ toast(e.message); }
      };
    });
  }
  document.getElementById('saveArticle').onclick = async () => {
    const body = {
      title: document.getElementById('f-title').value.trim(),
      title_en: document.getElementById('f-title_en').value.trim(),
      tags: document.getElementById('f-tags').value.split(',').map(s=>s.trim()).filter(Boolean),
      date: document.getElementById('f-date').value,
      excerpt: document.getElementById('f-excerpt').value,
      excerpt_en: document.getElementById('f-excerpt_en').value,
      content: document.getElementById('f-content').value,
      content_en: document.getElementById('f-content_en').value,
      cover: coverUrl, images,
      published: document.getElementById('f-pub').checked
    };
    if (!body.title) return toast('标题不能为空');
    try {
      if (id) await fetchJSON('/api/admin/articles/' + id, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) });
      else await fetchJSON('/api/admin/articles', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) });
      toast('已保存'); closeModal(); articles();
    } catch(e){ toast(e.message); }
  };
}
window.editArticle = editArticle;
async function delArticle(id) {
  if (!confirm('确定删除这篇文章？')) return;
  try { await fetchJSON('/api/admin/articles/' + id, { method: 'DELETE' }); toast('已删除'); articles(); }
  catch(e){ toast(e.message); }
}
window.delArticle = delArticle;

async function copy() {
  main.innerHTML = `<div class="loading"><div class="spinner"></div></div>`;
  try {
    const { copy: cur } = await fetchJSON('/api/admin/copy');
    const zh = (cur && cur.zh) || {}, en = (cur && cur.en) || {};
    const fields = [
      ['sub', '首页副标题', zh.sub, en.sub],
      ['about.sub', '关于页简介', zh.about && zh.about.sub, en.about && en.about.sub],
      ['articles.sub', '文章页副标题', zh.articles && zh.articles.sub, en.articles && en.articles.sub],
      ['logs.sub', '日志页副标题', zh.logs && zh.logs.sub, en.logs && en.logs.sub],
      ['pota.sub', 'POTA 副标题', zh.pota && zh.pota.sub, en.pota && en.pota.sub],
      ['guestbook.sub', '留言板副标题', zh.guestbook && zh.guestbook.sub, en.guestbook && en.guestbook.sub],
      ['footer', '页脚', zh.footer, en.footer]
    ];
    main.innerHTML = `
      <div class="page-title">前台文字</div>
      <div class="page-sub">修改前台显示的文案（中/英），留空则使用默认值。</div>
      <div class="card panel" style="padding:22px;">
        ${fields.map(function(f, i){ return `
          <div class="form-row" style="margin-bottom:14px;">
            <div style="font-weight:700;margin-bottom:6px;">${escapeHtml(f[1])} <span style="font-weight:400;color:var(--ink-faint);font-size:12px;">(${escapeHtml(f[0])})</span></div>
            <input class="txt-input" id="cp-${i}-zh" placeholder="中文" value="${escapeHtml(f[2] || '')}">
            <input class="txt-input" id="cp-${i}-en" placeholder="English" value="${escapeHtml(f[3] || '')}" style="margin-top:6px;">
          </div>`; }).join('')}
        <button class="btn accent" id="saveCopy">保存</button>
      </div>`;
    document.getElementById('saveCopy').onclick = async () => {
      const build = function(lang){
        const get = function(i){ return (document.getElementById('cp-'+i+'-'+lang).value || '').trim(); };
        return { sub: get(0), about: { sub: get(1) }, articles: { sub: get(2) }, logs: { sub: get(3) }, pota: { sub: get(4) }, guestbook: { sub: get(5) }, footer: get(6) };
      };
      try {
        await fetchJSON('/api/admin/copy', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ copy: { zh: build('zh'), en: build('en') } }) });
        toast('已保存');
      } catch(e){ toast(e.message); }
    };
  } catch (e) { main.innerHTML = `<div class="empty">${escapeHtml(e.message)}</div>`; }
}
window.copy = copy;

// ---------- LOTW ----------
async function lotw() {
  main.innerHTML = `<div class="loading"><div class="spinner"></div></div>`;
  try {
    const [lotwRes, stRes] = await Promise.all([fetchJSON('/api/admin/lotw'), fetchJSON('/api/admin/logs/stats')]);
    const config = lotwRes.config, logCount = lotwRes.logCount, stats = stRes.stats || [];
    main.innerHTML = `
      <div class="page-title">LoTW 通联日志</div>
      <div class="page-sub">配置 ARRL LoTW 的 P12 证书与账号，下载并同步你的通联日志。</div>
      <div class="card panel" style="padding:24px;">
        <h3 style="margin-bottom:14px;">1）上传 LoTW 证书 (P12)</h3>
        <div class="notice">上传你的 <b>tQSL 证书（.p12 文件，无保护密码）</b>，并填写 ARRL LoTW 账户信息。</div>
        <div class="edit-grid">
          <div class="form-row">
            <input class="txt-input" id="lotw-username" placeholder="ARRL LoTW 账户名（呼号）" value="${escapeHtml(config.username||'BG4LZN')}">
            <input class="txt-input" id="lotw-pass" type="password" placeholder="LoTW 账户密码" value="">
          </div>
          <div class="form-row">
            <input class="txt-input" id="lotw-endpoint" placeholder="下载端点 (advanced)" value="${escapeHtml(config.endpoint||'https://lotw.arrl.org/lotwuser/lotwreport.az')}">
          </div>
          <div class="drop" id="p12Drop">
            <div id="p12Name">${config.p12Uploaded ? '✅ 已上传并解析过证书' : '📄 点击/拖拽选择 .p12 证书文件'}</div>
            <input type="file" id="p12File" accept=".p12,.pfx" hidden>
          </div>
          <div class="notice" style="margin:0;">• <b>LoTW 账户名</b>：ARRL LoTW 的登录名（通常为呼号）<br>• <b>LoTW 账户密码</b>：登录 LoTW 下载通联报告用的密码<br>• <b>.p12 证书</b>：请使用<u>未设置保护密码</u>的 tQSL 证书文件</div>
          <button class="btn accent" id="lotwSave">保存证书并解析</button>
        </div>
      </div>
      <div class="card panel" style="padding:24px;">
        <h3 style="margin-bottom:8px;">2）同步下载日志</h3>
        <div class="info-line">当前已入库通联记录：<b>${logCount}</b> 条${config.lastSync ? ' · 上次同步 ' + escapeHtml(fmtDate(config.lastSync)) : ''}</div>
        <div class="flex" style="margin-top:14px;flex-wrap:wrap;">
          <button class="btn accent" id="lotwSync">📡 从 LoTW 下载并入库</button>
          <button class="btn ghost" id="adifImport">📄 上传 ADIF 文件导入</button>
          <button class="btn ghost danger" id="logClear">清空日志</button>
        </div>
        <input type="file" id="adifFile" accept=".adif,.adi,.txt,.adi3,.log" hidden>
      </div>
      <div class="card panel" style="padding:24px;">
        <h3 style="margin-bottom:8px;">3）日志统计</h3>
        <div class="info-line">按呼号汇总 QSO 数量，可单独清除某个呼号的全部日志。</div>
        <div id="logStatsBox" style="margin-top:14px;">
          ${stats.length ? `<div style="overflow:auto;"><table class="adm">
            <thead><tr><th>呼号</th><th>QSO 数量</th><th style="width:200px;">操作</th></tr></thead>
            <tbody>${stats.map(s => `<tr>
              <td><span class="tag">${escapeHtml(s.call)}</span></td>
              <td><b>${s.count}</b></td>
              <td><button class="icon-btn danger" onclick="delCallLogs('${escapeHtml(s.call)}')">删除该呼号所有日志</button></td>
            </tr>`).join('')}</tbody>
          </table></div>` : `<div class="info-line" style="color:var(--ink-faint);">暂无日志，同步后这里会按呼号统计。</div>`}
        </div>
      </div>
    `;
    bindLotw(config);
  } catch (e) { main.innerHTML = `<div class="empty">${escapeHtml(e.message)}</div>`; }
}

function bindLotw(config) {
  const p12Input = document.getElementById('p12File');
  const p12Name = document.getElementById('p12Name');
  let file = null;
  document.getElementById('p12Drop').onclick = () => p12Input.click();
  p12Input.onchange = () => { file = p12Input.files[0]; p12Name.textContent = '✅ ' + file.name; };

  document.getElementById('lotwSave').onclick = async () => {
    const username = document.getElementById('lotw-username').value.trim();
    const password = document.getElementById('lotw-pass').value;
    const endpoint = document.getElementById('lotw-endpoint').value.trim();
    if (!file) return toast('请先选择 .p12 证书文件');
    const fd = new FormData();
    fd.append('p12', file);
    fd.append('username', username);
    fd.append('password', password);
    fd.append('endpoint', endpoint);
    try {
      const r = await fetch('/api/admin/lotw/config', { method: 'POST', body: fd });
      const d = await r.json();
      if (d.ok) { toast('证书解析成功，已保存'); lotw(); } else throw new Error(d.error);
    } catch(e){ toast('保存失败: ' + e.message); }
  };

  document.getElementById('lotwSync').onclick = async () => {
    const btn = document.getElementById('lotwSync'); btn.disabled = true; btn.textContent = '同步中…';
    try {
      const d = await fetchJSON('/api/admin/lotw/download', { method: 'POST' });
      toast(`已导入 ${d.imported} 条，共 ${d.total} 条`);
      lotw();
    } catch(e){ toast('同步失败: ' + e.message); btn.disabled=false; btn.innerHTML='📡 从 LoTW 下载并入库'; }
  };

  document.getElementById('adifImport').onclick = () => document.getElementById('adifFile').click();
  document.getElementById('adifFile').onchange = async () => {
    const f = document.getElementById('adifFile').files[0];
    if (!f) return;
    const fd = new FormData(); fd.append('adif', f);
    try {
      const r = await fetch('/api/admin/logs/import', { method: 'POST', body: fd });
      const d = await r.json();
      if (d.ok) { toast(`解析 ${d.parsed} 条，新增 ${d.imported} 条，共 ${d.total} 条`); lotw(); } else toast('导入失败: ' + d.error);
    } catch(e){ toast('导入失败: ' + e.message); }
  };

  document.getElementById('logClear').onclick = async () => {
    if (!confirm('确定清空所有通联日志？此操作不可撤销。')) return;
    try { await fetchJSON('/api/admin/logs', { method: 'DELETE' }); toast('已清空'); lotw(); } catch(e){ toast(e.message); }
  };
}

// delete all logs of a single callsign
window.delCallLogs = async (call) => {
  if (!confirm('确定删除呼号 ' + call + ' 的全部日志？此操作不可撤销。')) return;
  try {
    const d = await fetchJSON('/api/admin/logs/byCallsign?call=' + encodeURIComponent(call), { method: 'DELETE' });
    toast('已删除 ' + call + ' 的 ' + d.removed + ' 条日志，剩余 ' + d.total + ' 条');
    lotw();
  } catch(e){ toast(e.message); }
};

// ---------- GUESTBOOK ----------
async function guestbook() {
  main.innerHTML = `<div class="loading"><div class="spinner"></div></div>`;
  try {
    const { messages } = await fetchJSON('/api/admin/bbs/guestbook');
    main.innerHTML = `
      <div class="page-title">留言板管理</div>
      <div class="page-sub">查看、删除访客留言。共 ${messages.length} 条。</div>
      <div class="card panel" style="overflow:auto;">
        <table class="adm">
          <thead><tr><th>昵称</th><th>内容</th><th>时间</th><th style="width:70px;">操作</th></tr></thead>
          <tbody>${messages.map(m => `<tr>
            <td>${escapeHtml(m.name)}</td>
            <td style="max-width:420px;">${escapeHtml(m.text)}</td>
            <td>${escapeHtml(fmtDate(m.date))}</td>
            <td><button class="icon-btn danger" onclick="delGbMessage('${m.id}')">删</button></td>
          </tr>`).join('') || `<tr><td colspan="4" style="text-align:center;color:var(--ink-faint);">暂无留言</td></tr>`}</tbody>
        </table>
      </div>
    `;
  } catch (e) { main.innerHTML = `<div class="empty">${escapeHtml(e.message)}</div>`; }
}window.delGbMessage = async (id) => {
  if (!confirm('确定删除这条留言？')) return;
  try { await fetchJSON('/api/admin/bbs/guestbook/' + id, { method: 'DELETE' }); toast('已删除'); guestbook(); } catch(e){ toast(e.message); }
};

// ---------- POTA / SITE ----------
async function pota() {
  main.innerHTML = `<div class="loading"><div class="spinner"></div></div>`;
  try {
    const { site } = await fetchJSON('/api/admin/site');
    const mode = site.onAirMode === 'manual' ? 'manual' : 'auto';
    main.innerHTML = `
      <div class="page-title">POTA 与站点设置</div>
      <div class="page-sub">配置 ON AIR 状态与 POTA 展示。</div>

      <div class="card panel" style="padding:24px;">
        ${panelHead('ON AIR 状态（PSKreporter）', '')}
        <div class="notice"><b>自动</b>：每 15 分钟调用 pskreporter 查询呼号最近是否被 spot，自动判断是否在发射；<b>手动</b>：自行填写频率 / 模式 / 日期 / UTC 时间公布。</div>
        <div class="edit-grid">
          <label class="flex" style="cursor:pointer;gap:16px;align-items:center;">
            <input type="radio" name="onairmode" value="auto" ${mode==='auto'?'checked':''}> 自动（pskreporter）
            <input type="radio" name="onairmode" value="manual" ${mode==='manual'?'checked':''}> 手动
          </label>
          <div id="onair-manual" class="${mode==='manual'?'':'hidden'}">
            <div class="form-row">
              <div><label class="info-line" style="margin-bottom:6px;">频率 (MHz)</label><input class="txt-input" id="site-onairfreq" placeholder="如 14.074" value="${escapeHtml(site.onAirFreq||'')}"></div>
              <div><label class="info-line" style="margin-bottom:6px;">模式</label><input class="txt-input" id="site-onairmode" placeholder="如 FT8 / CW / SSB" value="${escapeHtml(site.onAirModeVal||'')}"></div>
            </div>
            <div class="form-row">
              <div><label class="info-line" style="margin-bottom:6px;">日期 (UTC)</label><input class="txt-input" id="site-onairdate" placeholder="YYYY-MM-DD" value="${escapeHtml(site.onAirDate||'')}"></div>
              <div><label class="info-line" style="margin-bottom:6px;">时间 (UTC)</label><input class="txt-input" id="site-onairtime" placeholder="HH:MM:SS" value="${escapeHtml(site.onAirTime||'')}"></div>
            </div>
            <div><button class="btn ghost small" id="onairNow">🕐 使用当前时间（转为 UTC）</button></div>
            <label class="flex" style="cursor:pointer;gap:8px;margin-top:6px;"><input type="checkbox" id="site-onair" ${site.onAir?'checked':''}> 标记为 ON AIR（手动模式生效）</label>
          </div>
          <button class="btn accent" id="siteSave">保存设置</button>
        </div>
      </div>

      <div class="card panel" style="padding:24px;">
        ${panelHead('POTA 展示设置', '')}
        <div class="notice">POTA 前台通过 iframe 展示呼号的激活统计（来自 pota-stats.wd4dan.net 或下方 URL）。</div>
        <div class="edit-grid">
          <div class="form-row">
            <div><label class="info-line" style="margin-bottom:6px;">呼号</label><input class="txt-input" id="site-callsign" value="${escapeHtml(site.callsign||'BG4LZN')}"></div>
            <div><label class="info-line" style="margin-bottom:6px;">常用 POTA 参考编号</label><input class="txt-input" id="site-potaref" placeholder="如 K-1234" value="${escapeHtml(site.potaRef||'')}"></div>
          </div>
          <div><label class="info-line" style="margin-bottom:6px;">可嵌入 iframe URL（可选）</label><input class="txt-input" id="site-potaurl" value="${escapeHtml(site.potaUrl||'')}"></div>
        </div>
      </div>
    `;
    bindOnAirManual();
    document.getElementById('siteSave').onclick = async () => {
      const mode2 = document.querySelector('input[name="onairmode"]:checked').value;
      const body = {
        callsign: document.getElementById('site-callsign').value.trim(),
        potaRef: document.getElementById('site-potaref').value.trim(),
        potaUrl: document.getElementById('site-potaurl').value.trim(),
        onAirMode: mode2,
        onAir: document.getElementById('site-onair').checked,
        onAirFreq: document.getElementById('site-onairfreq').value.trim(),
        onAirModeVal: document.getElementById('site-onairmode').value.trim(),
        onAirDate: document.getElementById('site-onairdate').value.trim(),
        onAirTime: document.getElementById('site-onairtime').value.trim()
      };
      try { await fetchJSON('/api/admin/site', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) }); toast('已保存'); } catch(e){ toast(e.message); }
    };
  } catch (e) { main.innerHTML = `<div class="empty">${escapeHtml(e.message)}</div>`; }
}

function bindOnAirManual() {
  const radios = document.querySelectorAll('input[name="onairmode"]');
  const manualBox = document.getElementById('onair-manual');
  radios.forEach(r => r.addEventListener('change', () => {
    const m = document.querySelector('input[name="onairmode"]:checked');
    manualBox.classList.toggle('hidden', !(m && m.value === 'manual'));
  }));
  document.getElementById('onairNow').onclick = () => {
    const now = new Date().toISOString();
    document.getElementById('site-onairdate').value = now.slice(0, 10);
    document.getElementById('site-onairtime').value = now.slice(11, 19);
  };
}

// ---------- boot ----------
(async () => {
  const ok = await checkAuth();
  if (ok) setView('dashboard');
})();
