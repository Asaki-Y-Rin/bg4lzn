// psyche-chat —— Cloudflare Workers 版（D1 存储）
// 接口与原来的 Express 版保持完全一致，前端页面不用改
'use strict';
import PAGE from './page.js';

const COOKIE = 'psyche_session';
const MAX_TEXT = 2000;
const MAX_UPLOAD = 1024 * 1024; // 1MB，D1 行大小限制
const PBKDF2_ITER = 25000;
const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif']);

const enc = new TextEncoder();

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const unhex = (s) => new Uint8Array(s.match(/.{2}/g).map((h) => parseInt(h, 16)));

async function pbkdf2(password, saltHex) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: unhex(saltHex), iterations: PBKDF2_ITER },
    key, 256
  );
  return hex(bits);
}

async function hmac(secret, data) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, enc.encode(data)));
}

function b64url(str) { return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function unb64url(s) { return atob(s.replace(/-/g, '+').replace(/_/g, '/')); }

function parseCookies(req) {
  const raw = req.headers.get('cookie') || '';
  const out = {};
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

async function readSession(req, env) {
  const token = parseCookies(req)[COOKIE];
  if (!token) return null;
  const i = token.lastIndexOf('.');
  if (i < 1) return null;
  const payload = token.slice(0, i), sig = token.slice(i + 1);
  const expect = await hmac(env.SECRET, payload);
  if (sig !== expect) return null;
  try {
    const o = JSON.parse(unb64url(payload));
    if (!o.exp || o.exp < Date.now()) return null;
    return o;
  } catch (e) { return null; }
}

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers }
  });

const clip = (v, n) => String(v == null ? '' : v).trim().slice(0, n);

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const path = url.pathname;

    // ---------- 页面 ----------
    if (req.method === 'GET' && (path === '/' || path === '/index.html')) {
      return new Response(PAGE, {
        headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }
      });
    }
    if (req.method === 'GET' && path === '/healthz') return json({ ok: true });

    try {
      // ---------- 登录 ----------
      if (path === '/api/login' && req.method === 'POST') {
        const body = await req.json().catch(() => ({}));
        const username = clip(body.username, 40).toLowerCase();
        const password = String(body.password || '');
        const row = await env.DB.prepare('SELECT username, name, salt, hash FROM users WHERE username = ?').bind(username).first();
        if (!row) return json({ ok: false, error: '账号或密码不正确' }, 401);
        const calc = await pbkdf2(password, row.salt);
        if (calc !== row.hash) return json({ ok: false, error: '账号或密码不正确' }, 401);

        const exp = Date.now() + Number(env.COOKIE_DAYS || 14) * 864e5;
        const payload = b64url(JSON.stringify({ u: row.username, n: row.name, exp }));
        const token = payload + '.' + await hmac(env.SECRET, payload);
        return json({ ok: true, user: row.username, name: row.name }, 200, {
          'set-cookie': `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor((exp - Date.now()) / 1000)}`
        });
      }

      if (path === '/api/logout' && req.method === 'POST') {
        return json({ ok: true }, 200, { 'set-cookie': `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0` });
      }

      const session = await readSession(req, env);
      if (!session) {
        if (path.startsWith('/api/')) return json({ ok: false, error: 'unauthorized' }, 401);
        return json({ ok: false, error: 'not_found' }, 404);
      }

      if (path === '/api/me') return json({ ok: true, user: session.u, name: session.n });

      // ---------- 消息 ----------
      if (path === '/api/messages' && req.method === 'GET') {
        const after = Number(url.searchParams.get('after') || 0);
        const sql = after > 0
          ? 'SELECT * FROM messages WHERE ts > ? ORDER BY ts ASC'
          : 'SELECT * FROM messages ORDER BY ts ASC';
        const stmt = after > 0 ? env.DB.prepare(sql).bind(after) : env.DB.prepare(sql);
        const { results } = await stmt.all();
        const list = (results || []).map((r) => ({
          id: r.id, user: r.user, name: r.name, text: r.text, ts: r.ts,
          ...(r.file_id ? { file: { id: r.file_id, name: r.file_name, size: r.file_size, mime: r.file_mime, kind: r.file_kind } } : {})
        }));
        return json({ ok: true, me: { user: session.u, name: session.n }, messages: list, lastTs: list.length ? list[list.length - 1].ts : 0 });
      }

      if (path === '/api/messages' && req.method === 'POST') {
        const body = await req.json().catch(() => ({}));
        const text = clip(body.text, MAX_TEXT);
        if (!text) return json({ ok: false, error: '消息不能为空' }, 400);
        const id = crypto.randomUUID();
        const ts = Date.now();
        await env.DB.prepare('INSERT INTO messages (id, user, name, text, ts) VALUES (?, ?, ?, ?, ?)')
          .bind(id, session.u, session.n, text, ts).run();
        return json({ ok: true, message: { id, user: session.u, name: session.n, text, ts } });
      }

      // ---------- 上传（≤1MB 图片） ----------
      if (path === '/api/upload' && req.method === 'POST') {
        const form = await req.formData();
        const file = form.get('file');
        if (!file || typeof file === 'string') return json({ ok: false, error: '没有收到文件' }, 400);
        if (file.size > MAX_UPLOAD) return json({ ok: false, error: '文件太大，云端版上限 1MB（视频请用原站）' }, 413);
        if (!IMAGE_TYPES.has(file.type)) return json({ ok: false, error: '云端版只支持图片（png/jpg/gif/webp/avif）' }, 415);

        const msgId = crypto.randomUUID();
        const fileId = crypto.randomUUID();
        const caption = clip(form.get('text'), MAX_TEXT);
        const ts = Date.now();
        const kind = 'image';
        const name = clip(file.name || 'image', 120);

        await env.DB.prepare('INSERT INTO files (id, msg_id, name, mime, size, data) VALUES (?, ?, ?, ?, ?, ?)')
          .bind(fileId, msgId, name, file.type, file.size, new Uint8Array(await file.arrayBuffer())).run();
        await env.DB.prepare('INSERT INTO messages (id, user, name, text, ts, file_id, file_name, file_size, file_mime, file_kind) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
          .bind(msgId, session.u, session.n, caption, ts, fileId, name, file.size, file.type, kind).run();

        return json({ ok: true, message: { id: msgId, user: session.u, name: session.n, text: caption, ts, file: { id: fileId, name, size: file.size, mime: file.type, kind } } });
      }

      // ---------- 文件 ----------
      const fm = path.match(/^\/api\/files\/([A-Za-z0-9-]+)$/);
      if (fm && req.method === 'GET') {
        const row = await env.DB.prepare('SELECT name, mime, data FROM files WHERE id = ?').bind(fm[1]).first();
        if (!row) return json({ ok: false, error: 'not_found' }, 404);
        return new Response(row.data, {
          headers: {
            'content-type': row.mime || 'application/octet-stream',
            'content-disposition': `inline; filename*=UTF-8''${encodeURIComponent(row.name || 'file')}`,
            'cache-control': 'private, max-age=86400'
          }
        });
      }

      return json({ ok: false, error: 'not_found' }, 404);
    } catch (e) {
      return json({ ok: false, error: 'server_error', detail: String(e && e.message || e).slice(0, 200) }, 500);
    }
  }
};
