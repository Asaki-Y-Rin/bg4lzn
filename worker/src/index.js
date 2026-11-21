// bg4lzn-site-api —— 纯 Cloudflare 版后端（Worker + KV）
// 提供原 Express 里 Pages 静态站缺少的接口：留言板、文章评论、站点配置、日志、QSL、点赞
// 数据键统一加 site: 前缀，避免和 dob-log 的键冲突
'use strict';

const PREFIX = 'site:';
const MAX_TEXT = 2000;
const MAX_NAME = 30;

const json = (data, status = 200, extra = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra }
  });

function cors(req, env) {
  const origin = req.headers.get('origin') || '';
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (origin && allowed.includes(origin)) {
    return {
      'access-control-allow-origin': origin,
      vary: 'Origin',
      'access-control-allow-methods': 'GET,POST,OPTIONS',
      'access-control-allow-headers': 'Content-Type',
      'access-control-max-age': '86400'
    };
  }
  return {};
}

const getJSON = async (env, key, fallback) => {
  const raw = await env.KV.get(PREFIX + key, 'text');
  if (!raw) return fallback;
  try { return JSON.parse(raw); } catch (e) { return fallback; }
};
const putJSON = (env, key, value) => env.KV.put(PREFIX + key, JSON.stringify(value));

const clip = (s, n) => String(s == null ? '' : s).trim().slice(0, n);
const nowISO = () => new Date().toISOString();

function sanitizeName(v) { return clip(v, MAX_NAME) || 'Anonymous'; }
function sanitizeText(v) { return clip(v, MAX_TEXT); }

async function addGuestbook(env, body) {
  const text = sanitizeText(body.text);
  if (!text) return { error: 'empty', status: 400 };
  const list = await getJSON(env, 'guestbook', []);
  const msg = { name: sanitizeName(body.name), text, date: nowISO() };
  list.unshift(msg);
  await putJSON(env, 'guestbook', list.slice(0, 500));
  return { ok: true, message: msg };
}

async function addComment(env, body) {
  const article = clip(body.article, 64);
  const text = sanitizeText(body.text);
  if (!article) return { error: 'no_article', status: 400 };
  if (!text) return { error: 'empty', status: 400 };
  const key = 'comments:' + article;
  const list = await getJSON(env, key, []);
  const c = { id: crypto.randomUUID(), name: sanitizeName(body.name), text, date: nowISO() };
  list.push(c);
  await putJSON(env, key, list.slice(-1000));
  return { ok: true, comment: c };
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const path = url.pathname;
    const headers = cors(req, env);

    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });

    // 合并后端：本 Worker 只管站点相关的几条，其余（文章/QSO/QSL）转给 dob-log
    const OURS = new Set(['/api.php', '/api/site', '/api/copy', '/api/logs', '/api/home']);
    if (!OURS.has(path)) {
      try { return await env.DOBLOG.fetch(req); }
      catch (e) { return json({ ok: false, error: 'upstream_unreachable' }, 502, headers); }
    }

    try {
      // ---------- /api.php?action=...（留言板 / 评论） ----------
      if (path === '/api.php') {
        const action = url.searchParams.get('action') || '';
        if (req.method === 'GET') {
          if (action === 'guestbook') {
            return json({ ok: true, messages: await getJSON(env, 'guestbook', []) }, 200, headers);
          }
          if (action === 'comments') {
            const article = url.searchParams.get('article') || '';
            const list = article ? await getJSON(env, 'comments:' + article, []) : [];
            return json({ ok: true, comments: list }, 200, headers);
          }
          return json({ ok: false, error: 'unknown_action' }, 400, headers);
        }
        if (req.method === 'POST') {
          const body = await req.json().catch(() => ({}));
          if (action === 'addguestbook') {
            const r = await addGuestbook(env, body);
            return json(r, r.status || 200, headers);
          }
          if (action === 'addcomment') {
            const r = await addComment(env, body);
            return json(r, r.status || 200, headers);
          }
          return json({ ok: false, error: 'unknown_action' }, 400, headers);
        }
      }

      // ---------- 站点配置 / 文案 ----------
      if (path === '/api/site') return json({ ok: true, site: await getJSON(env, 'site', {}) }, 200, headers);
      if (path === '/api/copy') return json({ ok: true, copy: await getJSON(env, 'copy', {}) }, 200, headers);

      // ---------- 通联日志（分页） ----------
      if (path === '/api/logs') {
        const logs = await getJSON(env, 'logs', []);
        const per = Math.min(Math.max(parseInt(url.searchParams.get('pageSize') || '30', 10) || 30, 1), 200);
        const page = Math.max(parseInt(url.searchParams.get('page') || '1', 10) || 1, 1);
        const pages = Math.max(Math.ceil(logs.length / per), 1);
        const start = (page - 1) * per;
        const site = await getJSON(env, 'site', {});
        const byCall = {};
        for (const l of logs) { const k = l.station || site.callsign || 'BG4LZN'; byCall[k] = (byCall[k] || 0) + 1; }
        return json({
          ok: true,
          stations: Object.keys(byCall).map((call) => ({ call, count: byCall[call] })),
          activeCall: site.callsign || 'BG4LZN',
          logs: logs.slice(start, start + per),
          total: logs.length, page, pages, per,
          callsign: site.callsign || 'BG4LZN',
          lastSync: null
        }, 200, headers);
      }

      // ---------- 首页聚合 ----------
      if (path === '/api/home') {
        const [site, articles, logs, guestbook] = await Promise.all([
          getJSON(env, 'site', {}),
          getJSON(env, 'articles', []),
          getJSON(env, 'logs', []),
          getJSON(env, 'guestbook', [])
        ]);
        const published = articles.filter((a) => a && a.published !== false)
          .sort((a, b) => new Date(b.date) - new Date(a.date));
        return json({
          ok: true,
          site,
          callsign: site.callsign || 'BG4LZN',
          latestArticles: published.slice(0, 2).map((a) => ({
            ...a,
            comments: 0,
            likes: Array.isArray(a.likes) ? a.likes.length : (Number.isFinite(a.likes) ? a.likes : 0)
          })),
          logCount: logs.length,
          totalArticles: published.length,
          messageCount: guestbook.length,
          latestLogs: logs.slice(0, 5),
          onAirInfo: { mode: 'manual', onAir: false, freq: '', modeValue: '', date: '', time: '', source: 'manual' }
        }, 200, headers);
      }

      // ---------- QSL ----------
      if (path === '/api/qsl') {
        const qsl = await getJSON(env, 'qsl', []);
        const stats = {
          sent: qsl.filter((q) => q.status === 'sent' || q.status === 'both').length,
          received: qsl.filter((q) => q.status === 'received' || q.status === 'both').length,
          both: qsl.filter((q) => q.status === 'both').length
        };
        return json({ ok: true, qsl, stats }, 200, headers);
      }

      // ---------- 文章 / 点赞 ----------
      if (path === '/api/articles') {
        const articles = await getJSON(env, 'articles', []);
        const list = articles.filter((a) => a && a.published !== false)
          .sort((a, b) => new Date(b.date) - new Date(a.date))
          .map((a) => ({
            id: a.id, title: a.title, title_en: a.title_en, tags: a.tags, tags_en: a.tags_en,
            date: a.date, cover: a.cover, excerpt: a.excerpt, excerpt_en: a.excerpt_en,
            likes: Array.isArray(a.likes) ? a.likes.length : (Number.isFinite(a.likes) ? a.likes : 0),
            comments: 0, views: a.views || 0
          }));
        return json({ ok: true, articles: list }, 200, headers);
      }

      const likeMatch = path.match(/^\/api\/articles\/([^/]+)\/like$/);
      if (likeMatch && req.method === 'POST') {
        const id = decodeURIComponent(likeMatch[1]);
        const articles = await getJSON(env, 'articles', []);
        const a = articles.find((x) => String(x.id) === String(id));
        if (!a) return json({ ok: false, error: 'not_found' }, 404, headers);
        const ip = req.headers.get('cf-connecting-ip') || '';
        let likes = Array.isArray(a.likes) ? a.likes : (Number.isFinite(a.likes) ? Array.from({ length: a.likes }, (_, i) => 'legacy' + i) : []);
        const wasLiked = likes.includes(ip);
        likes = wasLiked ? likes.filter((x) => x !== ip) : likes.concat(ip);
        a.likes = likes;
        await putJSON(env, 'articles', articles);
        return json({ ok: true, liked: !wasLiked, count: likes.length }, 200, headers);
      }

      const oneMatch = path.match(/^\/api\/articles\/([^/]+)$/);
      if (oneMatch && req.method === 'GET') {
        const id = decodeURIComponent(oneMatch[1]);
        const articles = await getJSON(env, 'articles', []);
        const a = articles.find((x) => String(x.id) === String(id));
        if (!a) return json({ ok: false, error: 'not_found' }, 404, headers);
        a.views = (a.views || 0) + 1;
        await putJSON(env, 'articles', articles);
        const article = { ...a };
        if (article.content == null && article.content_md != null) article.content = article.content_md;
        return json({ ok: true, article, liked: false, myIp: req.headers.get('cf-connecting-ip') || '' }, 200, headers);
      }

      return json({ ok: false, error: 'not_found' }, 404, headers);
    } catch (e) {
      return json({ ok: false, error: 'server_error', detail: String(e && e.message || e).slice(0, 200) }, 500, headers);
    }
  }
};
