// sync-from-inner.js — 从内堂 (Do-Blog, api.bg4lzn.online) 拉取最新 QSO 与 QSL，
// 合并进本地 data/logs.json、data/qsl.json（按 key 去重，只增不删）。
// 用法: node sync-from-inner.js
// 环境变量: INNER_API（默认 https://api.bg4lzn.online）
'use strict';
const fs = require('fs');
const path = require('path');
const http2 = require('http2');

const INNER = process.env.INNER_API || 'https://api.bg4lzn.online';
const DATA = path.join(__dirname, 'data');
const BACKUP = path.join(process.env.HOME || '/home/asaki', 'backups');

// 这台机器的 TLS 到 Cloudflare 时通时断：复用同一条 HTTP/2 会话，断了自动重连
let session = null;
function openSession(host) {
  return new Promise((resolve, reject) => {
    const c = http2.connect('https://' + host + ':443');
    const timer = setTimeout(() => { try { c.destroy(); } catch (e) {} reject(new Error('connect timeout')); }, 12000);
    c.once('connect', () => { clearTimeout(timer); resolve(c); });
    c.once('error', (e) => { clearTimeout(timer); reject(e); });
    c.once('goaway', () => { session = null; });
    c.once('close', () => { session = null; });
  });
}

function requestOn(client, reqPath) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (done) return; done = true; resolve(v); };
    const req = client.request({ ':path': reqPath, ':method': 'GET', 'user-agent': 'Mozilla/5.0', accept: 'application/json' });
    let status = 0, body = '';
    req.on('response', (h) => { status = h[':status']; });
    req.setEncoding('utf8');
    req.on('data', (d) => { body += d; });
    req.on('end', () => finish({ status, body }));
    req.on('error', (e) => finish({ err: 'stream:' + (e.code || e.message) }));
    req.setTimeout(15000, () => { try { req.close(); } catch (e) {} finish({ err: 'timeout' }); });
    req.end();
  });
}

async function getJSON(urlPath, tries = 8) {
  const host = new URL(INNER).host;
  let last = '';
  for (let i = 1; i <= tries; i++) {
    try {
      if (!session || session.destroyed || session.closed) session = await openSession(host);
      const r = await requestOn(session, '/api' + urlPath);
      if (r.status === 200) {
        try { return JSON.parse(r.body); } catch (e) { last = 'bad_json'; }
      } else { last = r.err || ('HTTP ' + r.status); }
    } catch (e) { last = e.message; }
    if (session) { try { session.destroy(); } catch (e) {} session = null; }
    await new Promise((z) => setTimeout(z, 300 * i));
  }
  throw new Error(urlPath + ' 拉取失败: ' + last);
}

function backup(file) {
  if (!fs.existsSync(file)) return;
  fs.mkdirSync(BACKUP, { recursive: true });
  const ts = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
  fs.copyFileSync(file, path.join(BACKUP, path.basename(file) + '.' + ts + '.bak'));
}

const keyOf = (q) => `${q.station || 'BG4LZN'}|${q.call}|${q.date}|${q.time}|${q.mode}|${q.band}`;

async function main() {
  const logsFile = path.join(DATA, 'logs.json');
  const qslFile = path.join(DATA, 'qsl.json');

  // ---- QSO ----
  const first = await getJSON('/qso/list?page=1&pageSize=30');
  const pages = first.pages || 1;
  const per = first.per || 30;
  const total = first.total || 0;
  console.log(`[sync] 内堂 QSO: total=${total}, pages=${pages}`);

  const remote = [];
  for (let p = 1; p <= pages; p++) {
    const j = p === 1 ? first : await getJSON(`/qso/list?page=${p}&pageSize=${per}`);
    for (const q of (j.logs || [])) {
      remote.push({ ...q, station: q.station || (j.activeCall || first.activeCall || 'BG4LZN') });
    }
    process.stdout.write(`\r[sync] 已拉取 ${remote.length}/${total}`);
  }
  process.stdout.write('\n');

  const local = JSON.parse(fs.readFileSync(logsFile, 'utf8').replace(/^\uFEFF/, '') || '[]');
  const seen = new Set(local.map((q) => q.key || keyOf(q)));
  const added = [];
  for (const q of remote) {
    const key = q.key || keyOf(q);
    if (seen.has(key)) continue;
    seen.add(key);
    added.push({ ...q, key });
  }

  if (added.length) {
    backup(logsFile);
    fs.writeFileSync(logsFile, JSON.stringify(local.concat(added), null, 2));
  }
  console.log(`[sync] QSO: 本地 ${local.length} + 新增 ${added.length} = ${local.length + added.length}`);

  // ---- QSL ----
  const qsl = await getJSON('/qsl');
  const remoteQsl = (qsl.qsl || []).filter((x) => x && x.call);
  const oldQsl = JSON.parse(fs.readFileSync(qslFile, 'utf8') || '[]');
  const qkey = (x) => `${x.call}|${x.date}|${x.band}|${x.mode}`;
  const have = new Set(oldQsl.map(qkey));
  const qslAdded = remoteQsl.filter((x) => !have.has(qkey(x)));
  if (qslAdded.length || !oldQsl.length) {
    backup(qslFile);
    fs.writeFileSync(qslFile, JSON.stringify(oldQsl.concat(qslAdded.map((x) => ({
      date: x.date || '', call: x.call || '', band: x.band || '', mode: x.mode || '',
      status: x.status || 'sent', note: x.note || ''
    }))), null, 2));
  }
  console.log(`[sync] QSL: 本地 ${oldQsl.length} + 新增 ${qslAdded.length} = ${oldQsl.length + qslAdded.length}`);
}

main().then(() => { if (session) { try { session.close(); } catch (e) {} } process.exit(0); })
  .catch((e) => { console.error('[sync] 失败: ' + e.message); process.exit(1); });
