// build-static.js —— os 完整版 → GitHub Pages 静态导出版 (docs/)
// 用法: node build-static.js  (需先 npm install 或仅需 Node 18+)
// 产物:
//   docs/index.html      —— 主站 SPA (内联 CSS/JS + __DATA__ + static-shim)
//   docs/welcome.html    —— 欢迎页 (相对路径版)
//   docs/static-shim.js  —— 只读 API shim
//   docs/picture/ docs/uploads/ docs/backgroud/  —— 静态资源
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const DOCS = path.join(ROOT, 'docs');
const PUB = path.join(ROOT, 'public');

function read(p) { return fs.readFileSync(path.join(ROOT, p), 'utf8'); }
function readPub(p) { return fs.readFileSync(path.join(PUB, p), 'utf8'); }
function writeDoc(p, s) { fs.writeFileSync(path.join(DOCS, p), s); }

// ---------- 1. 源 ----------
let html = readPub('main.html');
const css = readPub('css/style.css');
const i18nJs = readPub('js/i18n.js');
const mainJs = readPub('js/main.js');
const particlesJs = readPub('js/particles.js');

// ---------- 2. 数据 ----------
const site = JSON.parse(read('data/site.json'));
const articles = JSON.parse(read('data/articles.json'));
const guestbook = JSON.parse(read('data/guestbook.json'));
const logs = JSON.parse(read('data/logs.json'));
const copy = JSON.parse(read('data/copy.json'));
const comments = JSON.parse(read('data/comments.json'));
// 评论按文章分组
const bbsComments = {};
for (const c of comments) {
  const k = c.article || 'unknown';
  (bbsComments[k] = bbsComments[k] || []).push({ id: c.id, name: c.name, text: c.text, date: c.date });
}

const DATA = {
  bbsComments: bbsComments,
  site: { callsign: site.callsign || 'BG4LZN', potaUrl: site.potaUrl || '' },
  copy: copy || { zh: {}, en: {} },
  articles: JSON.parse(JSON.stringify(articles).replace(/\/uploads\//g, 'uploads/')),
  logs: logs,
  guestbook: guestbook.map(g => ({ name: g.name, text: g.text, date: g.date })),
  logsInfo: { lastSync: null },
  onAirInfo: null
};

// ---------- 3. 内联与路径处理 ----------
html = html.replace(/<html lang="zh">/, '<html data-static="1" lang="zh">');
html = html.replace(/<link rel="stylesheet" href="\/css\/style\.css">/, '<style>\n' + css + '\n</style>');
// 内联 JS —— 先于路径相对化
html = html.replace(/<script src="\/js\/i18n\.js"><\/script>/, '<script>\n' + i18nJs + '\n</script>');
html = html.replace(/<script src="\/js\/main\.js"><\/script>/, '<script>\n' + mainJs + '\n</script>');
html = html.replace(/<script src="\/js\/particles\.js"><\/script>/, '<script>\n' + particlesJs + '\n</script>');
// 绝对路径 -> 相对
html = html.replace(/href="\/home"/g, 'href="#/home"');
html = html.replace(/href="\/picture\//g, 'href="picture/');
html = html.replace(/src="\/picture\//g, 'src="picture/');
html = html.replace(/href="\/css\//g, 'href="css/');
html = html.replace(/src="\/js\//g, 'src="js/');
// 无 hash 访问 → 欢迎页 (入口)
html = html.replace('</head>', '  <script>if (!location.hash) location.replace(\'welcome.html\');</script>\n</head>');

// ---------- 4. 注入数据 + shim ----------
const dataJson = JSON.stringify(DATA);
const inject = '  <script>window.__DATA__=' + dataJson + ';</script>\n' +
               '  <script src="static-shim.js"></script>\n';
html = html.replace('<div class="toast" id="toast"></div>', '<div class="toast" id="toast"></div>\n' + inject);

// ---------- 5. 写产物 ----------
fs.mkdirSync(path.join(DOCS, 'uploads'), { recursive: true });
fs.mkdirSync(path.join(DOCS, 'backgroud'), { recursive: true });
fs.mkdirSync(path.join(DOCS, 'css'), { recursive: true });
fs.mkdirSync(path.join(DOCS, 'js'), { recursive: true });

writeDoc('index.html', html);

// welcome.html: 相对路径版
let wel = readPub('welcome.html');
wel = wel.replace("location.href='/home'", "location.href='./index.html#/home'");
wel = wel.replace('href="/picture/picture.jpg"', 'href="picture/picture.jpg"');
writeDoc('welcome.html', wel);

// static-shim.js (BG4LZN 适配版, 与 main 版一致)
fs.copyFileSync(path.join(ROOT, '..', 'ba4ihb-blog-main', 'docs', 'static-shim.js'), path.join(DOCS, 'static-shim.js'));

// 静态资源 (picture.jpg / backgroud.gif 均已改用 i.ibb.co 快速外链, 不再随站分发)
fs.rmSync(path.join(DOCS, 'backgroud'), { recursive: true, force: true });
fs.cpSync(path.join(PUB, 'uploads'), path.join(DOCS, 'uploads'), { recursive: true });

// 后台管理页 (静态版可打开页面; 登录/管理功能需服务器版后端)
function staticizeAdmin(srcName) {
  let a = readPub(srcName);
  a = a.replace('href="/css/style.css"', 'href="css/style.css"');
  a = a.replace('src="/js/admin.js"', 'src="js/admin.js"');
  a = a.replace('href="/home"', 'href="./index.html#/home"');
  return a;
}
writeDoc('adminlogin.html', staticizeAdmin('adminlogin.html'));
writeDoc('admin.html', staticizeAdmin('admin.html'));
fs.copyFileSync(path.join(PUB, 'css', 'style.css'), path.join(DOCS, 'css', 'style.css'));
fs.copyFileSync(path.join(PUB, 'js', 'admin.js'), path.join(DOCS, 'js', 'admin.js'));
// 清理旧 picture 目录 (外链后不再需要)
fs.rmSync(path.join(DOCS, 'picture'), { recursive: true, force: true });

console.log('静态版已生成于 docs/:');
console.log('  index.html ' + (fs.statSync(path.join(DOCS, 'index.html')).size / 1024).toFixed(0) + ' KB');
console.log('  welcome.html ' + (fs.statSync(path.join(DOCS, 'welcome.html')).size / 1024).toFixed(0) + ' KB');
console.log('  背景: backgroud.gif 使用 i.ibb.co 外链');
console.log('  内嵌数据: articles=' + DATA.articles.length + ' logs=' + DATA.logs.length + ' guestbook=' + DATA.guestbook.length + ' bbsComments=' + Object.keys(bbsComments).length + ' 组');
console.log('  后台: adminlogin.html + admin.html + css/style.css + js/admin.js');
