'use strict';

const express = require('express');
const multer = require('multer');
const cookieParser = require('cookie-parser');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');
const https = require('https');
const { execSync } = require('child_process');
const forge = require('node-forge');
const AdmZip = require('adm-zip');
const { parseADIF } = require('./adif');

const app = express();
const PORT = process.env.PORT || 3000;
const BBS_BASE = 'http://127.0.0.1:' + PORT;
const BBS_TOKEN = 'LOCAL_DEMO_TOKEN';
async function bbsGuestbookCount(){ try { const r = await fetch(BBS_BASE + '/api.php?action=guestbook'); const d = await r.json(); const m = d.messages || []; return Array.isArray(m) ? m.length : (m ? 1 : 0); } catch(e){ return 0; } }
async function bbsCommentsCount(){ try { const r = await fetch(BBS_BASE + '/api.php?action=comments'); const d = await r.json(); const c = d.comments || []; return Array.isArray(c) ? c.length : 0; } catch(e){ return 0; } }
async function bbsCommentCountMap(){ try { const r = await fetch(BBS_BASE + '/api.php?action=comments'); const d = await r.json(); const c = d.comments || []; const arr = Array.isArray(c) ? c : []; const m = {}; arr.forEach(x => { if(x && x.article) m[x.article] = (m[x.article] || 0) + 1; }); return m; } catch(e){ return {}; } }
const DATA_DIR = path.join(__dirname, 'data');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const KEY_DIR = path.join(DATA_DIR, 'keys');

// Ensure dirs exist
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(KEY_DIR, { recursive: true });

// ---------- Config (defaults) ----------
const DEFAULT_SITE = {
  callsign: 'BG4LZN',
  potaUrl: 'https://pota-stats.wd4dan.net/?call=bg4lzn',
  potaRef: '',
  onAirMode: 'auto',          // 'auto' (pskreporter poll) | 'manual'
  onAir: false,
  onAirFreq: '',
  onAirModeVal: '',
  onAirDate: '',
  onAirTime: ''
};

const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'admin';

const SESSION_COOKIE = 'bh_session';
const sessions = new Set(); // in-memory session tokens

// ---------- Storage helpers ----------
function dataFile(name) {
  return path.join(DATA_DIR, name);
}

async function readJSON(name, fallback) {
  const file = dataFile(name);
  try {
    const raw = await fsp.readFile(file, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return fallback;
  }
}

async function writeJSON(name, data) {
  const file = dataFile(name);
  await fsp.writeFile(file, JSON.stringify(data, null, 2), 'utf8');
}

function uid() {
  return crypto.randomBytes(12).toString('hex');
}

function nowISO() {
  return new Date().toISOString();
}

// ---------- PSKreporter / ON AIR ----------
const ON_AIR_POLL_MS = 15 * 60 * 1000;
const onAirState = { checkedAt: 0, onAir: false, freq: '', mode: '', date: '', time: '', lastFetch: null };

// robust CSV line parser (handles quoted commas)
function parseCsvLine(line) {
  const out = []; let cur = ''; let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else inQ = false; }
      else cur += ch;
    } else {
      if (ch === '"') inQ = true;
      else if (ch === ',') { out.push(cur); cur = ''; }
      else cur += ch;
    }
  }
  out.push(cur);
  return out;
}

async function fetchPskreporterCsv(callsign) {
  const url = `https://pskreporter.info/cgi-bin/pskdata.pl?callsign=${encodeURIComponent(callsign)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(25000) });
  if (!res.ok) throw new Error('pskreporter HTTP ' + res.status);
  const buf = Buffer.from(await res.arrayBuffer());
  const zip = new AdmZip(buf);
  const entry = zip.getEntries().find(e => /\.csv$/i.test(e.entryName));
  if (!entry) throw new Error('psk_data.csv 未找到');
  return entry.getData().toString('utf8');
}

async function refreshOnAir(callsign) {
  try {
    const csv = await fetchPskreporterCsv(callsign);
    const lines = csv.split(/\r?\n/).filter(Boolean);
    if (!lines.length) throw new Error('空数据');
    const header = lines[0].split(',').map(h => h.replace(/"/g, '').trim());
    const hi = {}; header.forEach((h, i) => hi[h] = i);
    const mine = [];
    for (let i = 1; i < lines.length; i++) {
      const c = parseCsvLine(lines[i]);
      const sender = (c[hi.senderCallsign] || '').toUpperCase();
      if (sender !== String(callsign).toUpperCase()) continue;
      mine.push({ freq: c[hi.MHz] || '', mode: c[hi.mode] || '', time: c[hi.rxTime] || '', epoch: parseInt(c[hi.flowStartSeconds], 10) || 0 });
    }
    if (!mine.length) {
      Object.assign(onAirState, { checkedAt: Date.now(), onAir: false, freq: '', mode: '', date: '', time: '', lastFetch: null });
      return onAirState;
    }
    const latest = mine.reduce((a, b) => (b.epoch > a.epoch ? b : a));
    const now = Math.floor(Date.now() / 1000);
    const recent = latest.epoch > 0 && (now - latest.epoch) <= ON_AIR_POLL_MS / 1000;
    let date = '', time = '';
    if (latest.time) { const p = latest.time.split(' '); date = p[0] || ''; time = p[1] || ''; }
    Object.assign(onAirState, { checkedAt: Date.now(), onAir: !!recent, freq: latest.freq, mode: latest.mode, date, time, lastFetch: now });
    return onAirState;
  } catch (e) {
    onAirState.checkedAt = Date.now(); // keep last known values on failure
    return onAirState;
  }
}

async function getOnAirInfo(site) {
  if (site.onAirMode === 'manual') {
    return { mode: 'manual', onAir: !!site.onAir, freq: site.onAirFreq || '', modeValue: site.onAirModeVal || '', date: site.onAirDate || '', time: site.onAirTime || '', source: 'manual' };
  }
  const stale = !onAirState.checkedAt || (Date.now() - onAirState.checkedAt) >= ON_AIR_POLL_MS;
  if (stale) await refreshOnAir(site.callsign);
  return { mode: 'auto', onAir: onAirState.onAir, freq: onAirState.freq || '', modeValue: onAirState.mode || '', date: onAirState.date || '', time: onAirState.time || '', source: 'pskreporter' };
}

// ---------- Seed data ----------
async function ensureData() {
  // articles
  const articles = await readJSON('articles.json', null);
  if (!articles) {
    await writeJSON('articles.json', [
      {
        id: uid(),
        title: '欢迎来到我的电台小屋',
        title_en: 'Welcome to my Radio Shack',
        tags: ['感想', '入门'],
        tags_en: ['News', 'Intro'],
        date: '2026-08-01',
        cover: '',
        excerpt: '这是我的新业余无线电博客的第一篇文章。在这里我会分享我的通联记录、设备与天线折腾的故事。',
        excerpt_en: 'This is the first post of my new amateur radio blog. I will share my QSO log, gear and antenna journeys here.',
        content: '大家好，我是 BG4LZN，来自山东泰安，B 类业余无线电操作员。这座“电台小屋”是我记录业余无线电生活的地方——从架设天线、组装电台，到与世界各地的友台通联。欢迎常来坐坐，也欢迎在留言板里给我留言！\n\n73 de BG4LZN',
        content_en: "Hi, I'm BG4LZN from Tai'an, Shandong, a Class B amateur radio operator. This 'Radio Shack' is where I document my ham life — from antennas and rigs to QSOs with hams all over the world. Drop by anytime and leave a note in the guestbook!\n\n73 de BG4LZN",
        views: 0,
        likes: [],
        comments: [],
        published: true
      }
    ]);
  }

  // logs (empty initially; populated from LoTW / ADIF import)
  const logs = await readJSON('logs.json', null);
  if (!logs) await writeJSON('logs.json', []);

  // guestbook
  const guestbook = await readJSON('guestbook.json', null);
  if (!guestbook) {
    await writeJSON('guestbook.json', [
      {
        id: uid(),
        name: 'BA7XXX',
        text: '恭喜新站开张！这里环境真不错，73！',
        text_en: 'Congrats on the new site! Great vibes here, 73!',
        date: nowISO(),
        status: 'published'
      }
    ]);
  }

  // site & lotw config
  const site = await readJSON('site.json', null);
  if (!site) await writeJSON('site.json', DEFAULT_SITE);
  const lotw = await readJSON('lotw.json', null);
  if (!lotw) await writeJSON('lotw.json', { callsign: 'BG4LZN', password: '', endpoint: 'https://lotw.arrl.org/lotwuser/lotwreport.az', p12Uploaded: false, lastSync: null });
}

// ---------- Auth ----------
function requireAdmin(req, res, next) {
  const token = req.cookies[SESSION_COOKIE];
  if (token && sessions.has(token)) return next();
  return res.status(401).json({ ok: false, error: 'unauthorized' });
}

// ---------- ADIF/LoTW helpers ----------
// Resolve the openssl binary path robustly (needed for P12 parsing fallback).
function resolveOpenssl() {
  const candidates = [];
  // common install locations
  const common = [
    'C:/Program Files/Git/mingw64/bin/openssl.exe',
    'C:/Program Files/Git/usr/bin/openssl.exe',
    'C:/Program Files/OpenSSL-Win64/bin/openssl.exe',
    'C:/Program Files/OpenSSL/bin/openssl.exe',
    'C:/OpenSSL-Win64/bin/openssl.exe',
    '/usr/bin/openssl',
    '/usr/local/bin/openssl'
  ];
  for (const c of common) { try { if (fs.existsSync(c)) candidates.push(c); } catch (e) {} }
  // PATH search (Windows: openssl.exe; unix: openssl)
  const dirs = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
  for (const d of dirs) {
    try {
      for (const name of ['openssl.exe', 'openssl']) {
        const full = path.join(d, name);
        if (fs.existsSync(full) && d !== '') candidates.push(full);
      }
    } catch (e) {}
  }
  // dedupe, prefer absolute real files
  const seen = new Set();
  for (const c of candidates) {
    const norm = path.resolve(c);
    if (seen.has(norm)) continue;
    seen.add(norm);
  }
  if (seen.size) return [...seen][0];
  return 'openssl'; // last resort (assumes PATH has it)
}

const OPENSSL_BIN = resolveOpenssl();

function extractPemBlocks(text) {
  const blocks = [];
  const re = /-----BEGIN ([A-Z ]+)-----([\s\S]*?)-----END \1-----/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    blocks.push({ type: m[1].trim(), full: m[0] });
  }
  return blocks;
}

async function parseP12NodeForge(buffer, password) {
  const der = forge.asn1.fromDer(buffer.toString('binary'));
  const p12 = forge.pkcs12.pkcs12FromAsn1(der, password ? { password } : {});
  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
  const certs = certBags[forge.pki.oids.certBag] || [];
  if (!certs.length) throw new Error('P12 中未找到证书');

  const keySources = [
    forge.pki.oids.pkcs8ShroudedKeyBag,
    forge.pki.oids.privateKeyBag,
    forge.pki.oids.rsaEncryptedPrivateKey
  ];
  let key = null;
  for (const oid of keySources) {
    const kb = p12.getBags({ bagType: oid });
    const arr = kb[oid] || [];
    if (arr.length) { key = arr[0].key; break; }
  }
  if (!key) throw new Error('P12 中未找到私钥');

  const certPem = forge.pki.certificateToPem(certs[0].cert);
  const keyPem = forge.pki.privateKeyToPem(key);
  return { certPem, keyPem };
}

async function parseP12Openssl(buffer, password) {
  const tmpDir = path.join(DATA_DIR, 'tmp');
  fs.mkdirSync(tmpDir, { recursive: true });
  const id = uid();
  const src = path.join(tmpDir, id + '.p12');
  const outPem = path.join(tmpDir, id + '.pem');
  const passFile = path.join(tmpDir, id + '.pass');
  await fsp.writeFile(src, buffer);
  if (password) await fsp.writeFile(passFile, password, 'utf8');
  try {
    // -passin file: avoids stdin/execSync race & shell escaping; empty password → `-passin pass:` (unprotected p12)
    const passOpt = password ? `-passin file:"${passFile}"` : '-passin pass:';
    execSync(`"${OPENSSL_BIN}" pkcs12 -in "${src}" -nodes ${passOpt} -out "${outPem}"`, { encoding: 'utf8' });
    const text = await fsp.readFile(outPem, 'utf8');
    const blocks = extractPemBlocks(text);
    const cert = blocks.find(b => b.type === 'CERTIFICATE');
    const key = blocks.find(b => b.type && b.type.endsWith('PRIVATE KEY')); // PRIVATE KEY / RSA PRIVATE KEY / ENCRYPTED PRIVATE KEY
    if (!cert || !key) throw new Error('openssl 解析失败：未找到证书或私钥');
    return { certPem: cert.full.trim() + '\n', keyPem: key.full.trim() + '\n' };
  } catch (e) {
    const msg = (e.stderr || e.message || 'unknown').toString().trim();
    throw new Error('openssl 解析失败：' + msg);
  } finally {
    fsp.unlink(src).catch(() => {});
    fsp.unlink(outPem).catch(() => {});
    if (password) fsp.unlink(passFile).catch(() => {});
  }
}

async function parseP12(buffer, password) {
  try {
    return await parseP12NodeForge(buffer, password);
  } catch (forgeErr) {
    try {
      return await parseP12Openssl(buffer, password);
    } catch (opensslErr) {
      throw new Error('P12 解析失败：' + forgeErr.message + '（openssl 备用解析也已失败：' + opensslErr.message + '）');
    }
  }
}

// Generic HTTPS GET with client cert (mutual TLS) via cert/key PEM
function httpsGetWithCert(url, certPem, keyPem, basicAuth) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const headers = {};
    if (basicAuth) {
      const b64 = Buffer.from(basicAuth).toString('base64');
      headers['Authorization'] = 'Basic ' + b64;
    }
    const agent = new https.Agent({ cert: certPem, key: keyPem, rejectUnauthorized: false });
    const req = https.get({
      hostname: u.hostname,
      port: u.port || 443,
      path: u.pathname + u.search,
      headers,
      agent,
      rejectUnauthorized: false
    }, (res) => {
      let body = '';
      res.on('data', (c) => body += c);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(body);
        else reject(new Error(`LoTW 返回 ${res.statusCode}: ${body.slice(0,300)}`));
      });
    });
    req.on('error', reject);
    req.setTimeout(45000, () => req.destroy(new Error('请求超时')));
  });
}

function dedupeLogs(existing, incoming) {
  const seen = new Set();
  for (const q of existing) seen.add(q.key || `${q.station}|${q.call}|${q.date}|${q.time}|${q.mode}|${q.band}`);
  const added = [];
  for (const q of incoming) {
    const key = q.key || `${q.station}|${q.call}|${q.date}|${q.time}|${q.mode}|${q.band}`;
    if (seen.has(key)) continue;
    seen.add(key);
    added.push({ ...q, key });
  }
  return added;
}

// ---------- Middleware ----------
app.disable('x-powered-by');
app.use(express.json({ limit: '8mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Static assets
app.use('/css', express.static(path.join(__dirname, 'public', 'css'), { setHeaders: (res) => res.setHeader('Cache-Control', 'no-store') }));
app.use('/js', express.static(path.join(__dirname, 'public', 'js'), { setHeaders: (res) => res.setHeader('Cache-Control', 'no-store') }));
app.use('/img', express.static(path.join(__dirname, 'public', 'img'), { setHeaders: (res) => res.setHeader('Cache-Control', 'no-store') }));
app.use('/backgroud', express.static(path.join(__dirname, 'backgroud'), { maxAge: '365d' }));
app.use('/picture', express.static(path.join(__dirname, 'picture'), { maxAge: '365d' }));
app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads'), { maxAge: '30d' }));

// no-store on HTML + API responses so browsers always fetch the latest frontend code
app.use((req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });

// ---------- PUBLIC API ----------
app.get('/api/site', async (req, res) => {
  const site = await readJSON('site.json', DEFAULT_SITE);
  res.json({ ok: true, site });
});

app.get('/api/home', async (req, res) => {
  const [site, articles, logs, guestbook] = await Promise.all([
    readJSON('site.json', DEFAULT_SITE),
    readJSON('articles.json', []),
    readJSON('logs.json', []),
    readJSON('guestbook.json', [])
  ]);
  const published = articles.filter(a => a.published).sort((a,b) => new Date(b.date) - new Date(a.date));
  const onAirInfo = await getOnAirInfo(site);
  const ccmap = await bbsCommentCountMap();
  res.json({
    ok: true,
    site,
    callsign: site.callsign,
    latestArticles: published.slice(0, 2).map(a => ({ ...a, comments: ccmap[a.id] || 0, likes: a.likes ? a.likes.length : 0 })),
    logCount: logs.length,
    totalArticles: published.length,
    messageCount: await bbsGuestbookCount(),
    latestLogs: logs.filter(Boolean).slice().sort((a, b) => ((b.date || '') + (b.time || '')).localeCompare((a.date || '') + (a.time || ''))).slice(0, 5),
    onAirInfo
  });
});

app.get('/api/articles', async (req, res) => {
  const articles = await readJSON('articles.json', []);
  const acmap = await bbsCommentCountMap();
  const published = articles.filter(a => a.published)
    .sort((a,b) => new Date(b.date) - new Date(a.date))
    .map(a => ({
      id: a.id, title: a.title, title_en: a.title_en, tags: a.tags, tags_en: a.tags_en,
      date: a.date, cover: a.cover, excerpt: a.excerpt, excerpt_en: a.excerpt_en,
      likes: a.likes.length, comments: acmap[a.id] || 0, views: a.views
    }));
  res.json({ ok: true, articles: published });
});

app.get('/api/articles/:id', async (req, res) => {
  const articles = await readJSON('articles.json', []);
  const a = articles.find(x => x.id === req.params.id);
  if (!a) return res.status(404).json({ ok: false, error: 'not_found' });
  a.views = (a.views || 0) + 1;
  await writeJSON('articles.json', articles);
  res.json({ ok: true, article: a, liked: Array.isArray(a.likes) && a.likes.includes(req.ip), myIp: req.ip });
});

app.post('/api/articles/:id/comment', async (req, res) => {
  const { name, text } = req.body || {};
  if (!text || !text.trim()) return res.status(400).json({ ok: false, error: 'empty' });
  const articles = await readJSON('articles.json', []);
  const a = articles.find(x => x.id === req.params.id);
  if (!a) return res.status(404).json({ ok: false, error: 'not_found' });
  a.comments.push({
    id: uid(), name: (name || 'Anonymous').slice(0, 30), text: text.slice(0, 2000),
    ip: req.ip, date: nowISO()
  });
  await writeJSON('articles.json', articles);
  res.json({ ok: true, comment: a.comments[a.comments.length-1] });
});

app.post('/api/articles/:id/like', async (req, res) => {
  const articles = await readJSON('articles.json', []);
  const a = articles.find(x => x.id === req.params.id);
  if (!a) return res.status(404).json({ ok: false, error: 'not_found' });
  if (!Array.isArray(a.likes)) a.likes = [];
  const ip = req.ip || '';
  const wasLiked = a.likes.includes(ip);
  if (wasLiked) a.likes = a.likes.filter(x => x !== ip);
  else a.likes.push(ip);
  await writeJSON('articles.json', articles);
  res.json({ ok: true, liked: !wasLiked, count: a.likes.length });
});

app.get('/api/logs', async (req, res) => {
  const [logs, lotw] = await Promise.all([readJSON('logs.json', []), readJSON('lotw.json', null)]);
  const site = await readJSON('site.json', DEFAULT_SITE);
  const defaultCall = String((lotw && lotw.callsign) || site.callsign || 'BG4LZN').trim().toUpperCase();
  // assign an effective station callsign to every QSO (BG4LZN / BG4LZN/p / BG4LZN/qrp …)
  const enriched = logs.filter(Boolean).map(l => ({ ...l, station: String(l.station || defaultCall).trim().toUpperCase() }));
  // group by station
  const byCall = {};
  for (const l of enriched) byCall[l.station] = (byCall[l.station] || 0) + 1;
  const stations = Object.keys(byCall).map(call => ({ call, count: byCall[call] }))
    .sort((a, b) => b.count - a.count || a.call.localeCompare(b.call));
  const activeCall = req.query.call ? String(req.query.call).toUpperCase() : (stations[0] ? stations[0].call : defaultCall);
  const q = String(req.query.q || '').trim().toUpperCase();
  const list = enriched.filter(l => l.station === activeCall)
    .filter(l => !q || (l.call || '').toUpperCase().includes(q))
    .sort((a, b) => ((b.date || '') + (b.time || '')).localeCompare((a.date || '') + (a.time || '')));
  const per = Math.min(Math.max(parseInt(req.query.per, 10) || 30, 1), 200);
  const total = list.length;
  const pages = Math.max(Math.ceil(total / per), 1);
  const page = Math.min(Math.max(parseInt(req.query.page, 10) || 1, 1), pages);
  const start = (page - 1) * per;
  const paged = list.slice(start, start + per);
  res.json({ ok: true, stations, activeCall, logs: paged, total, page, pages, per, callsign: site.callsign, lastSync: lotw && lotw.lastSync });
});

app.get('/api/copy', async (req, res) => {
  res.json({ ok: true, copy: await readJSON('copy.json', {}) });
});

app.get('/api/guestbook', async (req, res) => {
  const gb = await readJSON('guestbook.json', []);
  const published = gb.filter(g => g.status === 'published').sort((a,b) => new Date(b.date) - new Date(a.date));
  res.json({ ok: true, messages: published });
});

app.post('/api/guestbook', async (req, res) => {
  const { name, text } = req.body || {};
  if (!text || !text.trim()) return res.status(400).json({ ok: false, error: 'empty' });
  const gb = await readJSON('guestbook.json', []);
  gb.push({ id: uid(), name: (name || 'Anonymous').slice(0, 30), text: text.slice(0, 2000), date: nowISO(), status: 'published' });
  await writeJSON('guestbook.json', gb);
  res.json({ ok: true, message: gb[gb.length-1] });
});

// POTA proxy (offline: disabled, returns empty)
app.get('/api/pota', async (req, res) => {
  res.json({ ok: true, callsign: '', spots: [] });
});

// ---------- Local /api.php (fully offline demo: bbs-like data from local files) ----------
app.all('/api.php', async (req, res) => {
  const action = req.query.action;
  try {
    if (action === 'guestbook') { const m = await readJSON('guestbook.json', []); return res.json({ ok: true, messages: Array.isArray(m) ? m.filter(g => g.status !== 'hidden') : [] }); }
    if (action === 'comments') { const all = await readJSON('comments.json', []); const list = req.query.article ? (Array.isArray(all) ? all.filter(c => c.article === req.query.article) : []) : (Array.isArray(all) ? all : []); return res.json({ ok: true, comments: list }); }
    if (action === 'addguestbook') { const b = req.body || {}; const m = await readJSON('guestbook.json', []); m.unshift({ id: uid(), name: String(b.name || 'Anonymous').slice(0,30), text: String(b.text || '').slice(0,300), date: nowISO(), status: 'published' }); await writeJSON('guestbook.json', m); return res.json({ ok: true }); }
    if (action === 'addcomment') { const b = req.body || {}; const m = await readJSON('comments.json', []); m.unshift({ id: uid(), article: String(b.article||''), name: String(b.name || 'Anonymous').slice(0,30), text: String(b.text || '').slice(0,300), date: nowISO() }); await writeJSON('comments.json', m); return res.json({ ok: true }); }
    res.json({ ok: false, error: 'unknown_action' });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});
// ---------- AUTH API ----------
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body || {};
  if (username === ADMIN_USER && password === ADMIN_PASS) {
    const token = crypto.randomBytes(24).toString('hex');
    sessions.add(token);
    res.cookie(SESSION_COOKIE, token, { httpOnly: true, sameSite: 'lax', maxAge: 7*24*3600*1000 });
    return res.json({ ok: true });
  }
  res.status(401).json({ ok: false, error: 'invalid' });
});

app.post('/api/auth/logout', (req, res) => {
  sessions.delete(req.cookies[SESSION_COOKIE]);
  res.clearCookie(SESSION_COOKIE);
  res.json({ ok: true });
});

app.get('/api/auth/me', (req, res) => {
  const token = req.cookies[SESSION_COOKIE];
  res.json({ ok: true, loggedIn: !!(token && sessions.has(token)) });
});

// ---------- ADMIN API ----------
function adminApi(routerPath) {
  const r = express.Router();
  r.use(requireAdmin);
  // ---- bbs (虚拟主机) 评论 / 留言管理：代理到 bbs.bg4lzn.cn ----
  const bbsGet = async (p) => { const rr = await fetch(BBS_BASE + p, { headers: { Accept: 'application/json' } }); return await rr.json(); };
  r.get('/bbs/comments', async (req, res) => { try { const q = req.query.article ? '&article=' + encodeURIComponent(req.query.article) : ''; const d = await bbsGet('/api.php?action=comments' + q); res.json({ ok: true, comments: d.comments || [] }); } catch (e) { res.json({ ok: false, error: e.message }); } });
  r.delete('/bbs/comments/:cid', async (req, res) => { try { const d = await bbsGet('/api.php?action=deletecomment&id=' + encodeURIComponent(req.params.cid) + '&token=' + BBS_TOKEN); res.json(d); } catch (e) { res.json({ ok: false, error: e.message }); } });
  r.get('/bbs/guestbook', async (req, res) => { try { const d = await bbsGet('/api.php?action=guestbook'); res.json({ ok: true, messages: d.messages || [] }); } catch (e) { res.json({ ok: false, error: e.message }); } });
  r.delete('/bbs/guestbook/:id', async (req, res) => { try { const d = await bbsGet('/api.php?action=deleteguestbook&id=' + encodeURIComponent(req.params.id) + '&token=' + BBS_TOKEN); res.json(d); } catch (e) { res.json({ ok: false, error: e.message }); } });


  // frontend copy (editable texts)
  r.get('/copy', async (req, res) => {
    res.json({ ok: true, copy: await readJSON('copy.json', {}) });
  });
  r.post('/copy', async (req, res) => {
    const copy = (req.body || {}).copy || {};
    await writeJSON('copy.json', copy);
    res.json({ ok: true });
  });

  // articles CRUD
  r.get('/articles', async (req, res) => {
    const articles = await readJSON('articles.json', []);
    const cmap = await bbsCommentCountMap();
    res.json({ ok: true, articles: articles.map(a => ({ ...a, _cc: cmap[a.id] || 0 })) });
  });

  // article image upload (cover + content illustrations)
  fs.mkdirSync(path.join(__dirname, 'public', 'uploads'), { recursive: true });
  const uploadImg = multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => cb(null, path.join(__dirname, 'public', 'uploads')),
      filename: (req, file, cb) => cb(null, uid() + (path.extname(file.originalname || '.jpg') || '.jpg').toLowerCase())
    }),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => cb(null, /image\/(jpe?g|png|gif|webp|avif)/i.test(file.mimetype))
  });
  r.post('/upload', uploadImg.single('image'), (req, res) => {
    if (!req.file) return res.status(400).json({ ok: false, error: 'no_image' });
    res.json({ ok: true, url: '/uploads/' + req.file.filename });
  });

  r.post('/articles', async (req, res) => {
    const b = req.body || {};
    if (!b.title || !b.title.trim()) return res.status(400).json({ ok: false, error: 'title_required' });
    const articles = await readJSON('articles.json', []);
    const art = {
      id: uid(), title: b.title, title_en: b.title_en || b.title,
      tags: b.tags || [], tags_en: b.tags_en || b.tags || [],
      date: b.date || new Date().toISOString().slice(0,10),
      cover: b.cover || '', images: Array.isArray(b.images) ? b.images : [],
      excerpt: b.excerpt || ' ', excerpt_en: b.excerpt_en || b.excerpt || ' ',
      content: b.content || '', content_en: b.content_en || b.content || '',
      views: 0, likes: [], comments: [], published: b.published !== false
    };
    articles.push(art);
    await writeJSON('articles.json', articles);
    res.json({ ok: true, article: art });
  });

  r.put('/articles/:id', async (req, res) => {
    const articles = await readJSON('articles.json', []);
    const a = articles.find(x => x.id === req.params.id);
    if (!a) return res.status(404).json({ ok: false, error: 'not_found' });
    const b = req.body || {};
    ['title','title_en','tags','tags_en','date','cover','images','excerpt','excerpt_en','content','content_en'].forEach(k => {
      if (b[k] !== undefined) a[k] = b[k];
    });
    if (b.published !== undefined) a.published = !!b.published;
    await writeJSON('articles.json', articles);
    res.json({ ok: true, article: a });
  });

  r.delete('/articles/:id', async (req, res) => {
    const articles = await readJSON('articles.json', []);
    const idx = articles.findIndex(x => x.id === req.params.id);
    if (idx === -1) return res.status(404).json({ ok: false, error: 'not_found' });
    articles.splice(idx, 1);
    await writeJSON('articles.json', articles);
    res.json({ ok: true });
  });

  r.delete('/articles/:id/comments/:cid', async (req, res) => {
    const articles = await readJSON('articles.json', []);
    const a = articles.find(x => x.id === req.params.id);
    if (!a) return res.status(404).json({ ok: false, error: 'not_found' });
    if (!Array.isArray(a.comments)) a.comments = [];
    a.comments = a.comments.filter(c => c.id !== req.params.cid);
    await writeJSON('articles.json', articles);
    res.json({ ok: true, count: a.comments.length });
  });

  // LOTW config
  r.get('/lotw', async (req, res) => {
    const lotw = await readJSON('lotw.json', {});
    const logs = await readJSON('logs.json', []);
    res.json({
      ok: true,
      config: { username: lotw.username || 'BG4LZN', callsign: lotw.callsign || lotw.username || 'BG4LZN', password: '', endpoint: lotw.endpoint, p12Uploaded: lotw.p12Uploaded, lastSync: lotw.lastSync },
      logCount: logs.length
    });
  });

  // LOTW config upload (p12 + fields) — 语义：
  //   username = ARRL LoTW 账户名（呼号）；password = ARRL LoTW 账户密码（下载报告用）
  //   证书 .p12 为无保护密码文件（不校验证书密码）
  const uploadP12 = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20*1024*1024 } });
  r.post('/lotw/config', uploadP12.single('p12'), async (req, res) => {
    try {
      const { username, password, endpoint } = req.body;
      const file = req.file;
      if (!file) return res.status(400).json({ ok: false, error: 'no_p12' });
      // Verify + extract PEM from p12 (unprotected p12 → empty password)
      const { certPem, keyPem } = await parseP12(file.buffer, '');
      fs.mkdirSync(KEY_DIR, { recursive: true });
      await fsp.writeFile(path.join(KEY_DIR, 'lotw-cert.pem'), certPem, 'utf8');
      await fsp.writeFile(path.join(KEY_DIR, 'lotw-key.pem'), keyPem, 'utf8');
      const lotw = await readJSON('lotw.json', {});
      const uname = (username || lotw.username || 'BG4LZN').trim().toUpperCase();
      lotw.username = uname;
      lotw.callsign = uname;
      lotw.password = ''; // password kept in systemd env LOTW_PASSWORD (not persisted to data)
      lotw.endpoint = endpoint || lotw.endpoint || 'https://lotw.arrl.org/lotwuser/lotwreport.az';
      lotw.p12Uploaded = true;
      await writeJSON('lotw.json', lotw);
      res.json({ ok: true, message: '证书已保存并解析成功（无密码 p12）。已记录 ARRL LoTW 账户名与密码用于下载通联报告。' });
    } catch (e) {
      res.status(400).json({ ok: false, error: e.message });
    }
  });

  // LOTW download logs (needs p12 already uploaded)
  r.post('/lotw/download', async (req, res) => {
    try {
      const lotw = await readJSON('lotw.json', {});
      const certPath = path.join(KEY_DIR, 'lotw-cert.pem');
      const keyPath = path.join(KEY_DIR, 'lotw-key.pem');
      if (!lotw.p12Uploaded || !fs.existsSync(certPath)) return res.status(400).json({ ok: false, error: '请先上传并解析 P12 证书' });
      const certPem = await fsp.readFile(certPath, 'utf8');
      const keyPem = await fsp.readFile(keyPath, 'utf8');
      const endpoint = lotw.endpoint || 'https://lotw.arrl.org/lotwuser/lotwreport.az';
      const authUser = lotw.username || lotw.callsign || 'BG4LZN';
      const authPass = process.env.LOTW_PASSWORD || lotw.password || '';
      // LoTW lotwreport.az: login + password as query params, plus ADIF report options
      const sep = endpoint.includes('?') ? '&' : '?';
      const url = endpoint + sep + 'login=' + encodeURIComponent(authUser) + '&password=' + encodeURIComponent(authPass) + '&getqso=1&qso_qsldetail=yes&qso_filter=all';
      const adif = await httpsGetWithCert(url, certPem, keyPem, authUser + ':' + authPass);
      if (!/<QSO_DATE/i.test(adif)) {
        throw new Error('LoTW 返回的内容不是 QSO 数据（可能 LoTW 账户名/密码有误或端点地址变化）：' + String(adif).slice(0, 160));
      }
      const { qsos } = parseADIF(adif);
      const existing = await readJSON('logs.json', []);
      const added = dedupeLogs(existing, qsos.map(q => ({ ...q, key: `${q.station}|${q.call}|${q.date}|${q.time}|${q.mode}|${q.band}` })));
      const updated = existing.concat(added);
      await writeJSON('logs.json', updated);
      lotw.lastSync = nowISO();
      await writeJSON('lotw.json', lotw);
      res.json({ ok: true, imported: added.length, total: updated.length });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // ADIF file/text import (reliable fallback)
  const uploadAdif = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20*1024*1024 } });
  r.post('/logs/import', uploadAdif.single('adif'), async (req, res) => {
    try {
      let text = req.file ? req.file.buffer.toString('utf8') : (req.body.adif_text || '');
      if (!text.trim()) return res.status(400).json({ ok: false, error: 'no_adif' });
      const { qsos } = parseADIF(text);
      const existing = await readJSON('logs.json', []);
      const added = dedupeLogs(existing, qsos.map(q => ({ ...q, key: `${q.station}|${q.call}|${q.date}|${q.time}|${q.mode}|${q.band}` })));
      const updated = existing.concat(added);
      await writeJSON('logs.json', updated);
      const lotw = await readJSON('lotw.json', {});
      lotw.lastSync = nowISO();
      await writeJSON('lotw.json', lotw);
      res.json({ ok: true, parsed: qsos.length, imported: added.length, total: updated.length });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  r.delete('/logs', async (req, res) => {
    await writeJSON('logs.json', []);
    res.json({ ok: true });
  });

  // log stats: group by station callsign
  function groupByCall(logs, defaultCall) {
    const map = {};
    for (const l of logs) {
      const key = (l.station || defaultCall || '').toUpperCase();
      if (!key) continue;
      map[key] = (map[key] || 0) + 1;
    }
    return Object.keys(map).map(call => ({ call, count: map[call] })).sort((a, b) => b.count - a.count);
  }

  r.get('/logs/stats', async (req, res) => {
    const [logs, lotw] = await Promise.all([readJSON('logs.json', []), readJSON('lotw.json', {})]);
    const defaultCall = (lotw && lotw.callsign) || 'BG4LZN';
    res.json({ ok: true, stats: groupByCall(logs, defaultCall) });
  });

  r.delete('/logs/byCallsign', async (req, res) => {
    const call = String(req.query.call || '').toUpperCase().trim();
    if (!call) return res.status(400).json({ ok: false, error: 'no_call' });
    const [logs, lotw] = await Promise.all([readJSON('logs.json', []), readJSON('lotw.json', {})]);
    const defaultCall = ((lotw && lotw.callsign) || 'BG4LZN').toUpperCase();
    const kept = logs.filter(l => (l.station || defaultCall).toUpperCase() !== call);
    const removed = logs.length - kept.length;
    await writeJSON('logs.json', kept);
    res.json({ ok: true, removed, total: kept.length });
  });

  // guestbook moderation
  r.get('/guestbook', async (req, res) => {
    const gb = await readJSON('guestbook.json', []);
    res.json({ ok: true, messages: gb });
  });
  r.delete('/guestbook/:id', async (req, res) => {
    const gb = await readJSON('guestbook.json', []);
    const nx = gb.filter(g => g.id !== req.params.id);
    await writeJSON('guestbook.json', nx);
    res.json({ ok: true });
  });

  // site/pota config
  r.get('/site', async (req, res) => {
    const site = await readJSON('site.json', DEFAULT_SITE);
    res.json({ ok: true, site });
  });
  r.post('/site', async (req, res) => {
    const site = Object.assign({}, DEFAULT_SITE, await readJSON('site.json', {}), req.body);
    site.potaUrl = (site.potaUrl || '').slice(0, 300);
    site.potaRef = (site.potaRef || '').slice(0, 40);
    site.onAirMode = site.onAirMode === 'manual' ? 'manual' : 'auto';
    site.onAir = !!site.onAir;
    site.onAirFreq = String(site.onAirFreq || '').slice(0, 40);
    site.onAirModeVal = String(site.onAirModeVal || '').slice(0, 20);
    site.onAirDate = String(site.onAirDate || '').slice(0, 12);
    site.onAirTime = String(site.onAirTime || '').slice(0, 12);
    await writeJSON('site.json', site);
    res.json({ ok: true, site });
  });

  // stats
  r.get('/stats', async (req, res) => {
    const [articles, logs, gb] = await Promise.all([
      readJSON('articles.json', []),
      readJSON('logs.json', []),
      readJSON('guestbook.json', [])
    ]);
    res.json({
      ok: true,
      articles: articles.length,
      logs: logs.length,
      guestbook: await bbsGuestbookCount(),
      logLikes: articles.reduce((s,a)=>s+(a.likes? a.likes.length:0),0),
      comments: await bbsCommentsCount(),
    });
  });

  return r;
}
app.use('/api/admin', adminApi());

// ---------- PAGE ROUTES ----------
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/adminlogin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'adminlogin.html')));
app.get('/home', (req, res) => res.sendFile(path.join(__dirname, 'public', 'main.html')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'welcome.html')));

// ---------- API 404 & error handlers ----------
app.use('/api', (req, res) => res.status(404).json({ ok: false, error: 'not_found' }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err && err.message) {
    if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ ok: false, error: '文件过大' });
    return res.status(500).json({ ok: false, error: err.message });
  }
  res.status(500).json({ ok: false, error: 'server_error' });
});

ensureData().then(() => {
  const CERT_DIR = '/etc/letsencrypt/live/bg4lzn.cn';
  const hasCert = fs.existsSync(CERT_DIR + '/fullchain.pem') && fs.existsSync(CERT_DIR + '/privkey.pem');
  if (hasCert) {
    const http = require('http');
    https.createServer({ cert: fs.readFileSync(CERT_DIR + '/fullchain.pem'), key: fs.readFileSync(CERT_DIR + '/privkey.pem') }, app).listen(443, () => {
      console.log('BG4LZN 电台小屋 HTTPS running at https://localhost:443');
    });
    http.createServer((req, res) => {
      if (req.url.indexOf('/.well-known/acme-challenge/') === 0) {
        const fp = path.join('/var/www/letsencrypt', path.basename(req.url));
        fs.readFile(fp, (e, d) => { if (e) { res.writeHead(404); res.end(); } else { res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end(d); } });
        return;
      }
      const host = req.headers.host || 'bg4lzn.cn';
      res.writeHead(301, { Location: 'https://' + host + req.url });
      res.end();
    }).listen(PORT, () => {
      console.log('BG4LZN 电台小屋 HTTP->HTTPS redirect on :' + PORT);
    });
  } else {
    app.listen(PORT, () => {
      console.log('BG4LZN 电台小屋 running at http://localhost:' + PORT);
    });
  }
  // poll pskreporter every 15 min when auto mode
  setInterval(async () => {
    try {
      const site = Object.assign({}, DEFAULT_SITE, await readJSON('site.json', {}));
      if (site.onAirMode === 'auto') await refreshOnAir(site.callsign);
    } catch (e) {}
  }, ON_AIR_POLL_MS);
});
