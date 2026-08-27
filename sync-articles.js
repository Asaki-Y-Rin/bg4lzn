// sync-articles.js — 从内堂(Do-Blog, api.bg4lzn.online)拉取文章, 落盘 data/articles.json (os 版格式)
// 供 GitHub Actions 定时调用; 亦可本地手动运行: node sync-articles.js
'use strict';
const fs = require('fs');
const path = require('path');

const INNER = process.env.INNER_API || 'https://api.bg4lzn.online';
const ROOT = __dirname;
const DATA_FILE = path.join(ROOT, 'data', 'articles.json');

function mapArticle(a) {
  const art = {
    id: String(a.id),
    title: a.title || '',
    date: String(a.published_at || a.created_at || '').slice(0, 10),
    cover: a.cover_image || '',
    excerpt: a.excerpt || '',
    content_md: a.content_md || '',
    likes: typeof a.like_count === 'number' ? a.like_count : 0,
    comments: 0,
  };
  if (a.slug) art.slug = a.slug;
  return art;
}

async function main() {
  console.log('[sync] 拉取内堂文章: ' + INNER + '/api/articles?pageSize=100');
  const res = await fetch(INNER + '/api/articles?pageSize=100', {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error('内堂响应 ' + res.status);
  const j = await res.json();
  if (!j || !j.success) throw new Error('内堂返回异常: ' + JSON.stringify(j).slice(0, 200));
  const list = (j.data || [])
    .slice()
    .sort((a, b) => String(b.published_at || '').localeCompare(String(a.published_at || '')))
    .map(mapArticle);
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(list, null, 2), 'utf8');
  console.log('[sync] 已写入 ' + DATA_FILE + ': ' + list.length + ' 篇文章');
  // 标记改动供 Actions 判断
  fs.writeFileSync(path.join(ROOT, 'data', '.last-sync'), new Date().toISOString(), 'utf8');
}

main().catch((e) => {
  console.error('[sync] 失败: ' + e.message);
  process.exit(1);
});
