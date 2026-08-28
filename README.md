# BG4LZN Radio Hut · 电波小窝（开源版）

一个业余无线电个人博客：浅色 ins 风 + 视频欢迎页 + 中英双语 + 文章/通联日志/留言板/评论 + 后台管理。
本仓库为**完全离线演示**（评论/留言/数据全在本机 `data/`），也可按第 5 章接回生产数据源部署到服务器。
代码要感谢我最最喜欢的好朋友BA4IHB，他给我提供了代码。

---

## 1. 目录结构（功能在哪、怎么实现）

```
bg4lzn-blog/
├─ server.js          # Express 后端：静态资源 + 全部 API + 后台 + HTTP/HTTPS 自动切换
├─ adif.js            # ADIF 通联日志解析模块（后台导入 .adi / LoTW）
├─ package.json       # 依赖 (express/multer/cookie-parser/node-forge/adm-zip)
├─ run.bat            # Windows 一键启动
├─ .gitignore         # 忽略 node_modules 等
├─ public/            # ===== 前端 =====
│  ├─ main.html       #   主站 SPA（首页/文章/日志/关于/留言板）
│  ├─ welcome.html    #   视频欢迎页
│  ├─ adminlogin.html #   后台登录页
│  ├─ admin.html      #   后台管理面板
│  ├─ css/style.css   #   全站样式
│  ├─ js/main.js      #   前台逻辑（文章/日志/ON AIR/POTA/留言/评论）
│  ├─ js/i18n.js      #   中英双语文案
│  ├─ js/particles.js #   装饰粒子
│  ├─ js/admin.js     #   后台逻辑（仪表盘/文章/日志/LoTW/留言/评论/站点）
│  ├─ backgroud/backgroud.mp4  # 欢迎页视频
│  ├─ picture/picture.jpg      # logo / 头像
│  └─ uploads/        #   文章封面/插图（上传落这里）
└─ data/              # ===== JSON 数据存储 =====
   ├─ articles.json   # 文章 (含 views/likes/comments)
   ├─ logs.json       # 通联日志 (每条约 call/band/mode/freq/date/time/rst/grid)
   ├─ site.json       # 站点配置 (callsign, onAirMode, potaUrl...)
   ├─ guestbook.json  # 留言板
   ├─ comments.json   # 文章评论
   ├─ copy.json       # 前台可改文案
   ├─ lotw.json       # LoTW 配置(仅后台)
   └─ keys/           # LoTW 证书私钥(生产版才有; 开源版已剔除)
```

> 生产部署时，以上为 `/opt/bg4lzn/`；密钥（LoTW 证书、后台密码）放 `chmod 600` 的环境文件，不进仓库。

---

## 2. 功能实现 & 数据流（相互联系）

所有数据都是 **JSON 文件**，`server.js` 读写、前端走 `/api/*`。

| 功能 | 数据源 | 关键接口 | 说明 |
|---|---|---|---|
| 文章 | `data/articles.json` | `GET /api/articles` `GET /api/articles/:id` `POST /api/articles/:id/like` | 封面/插图存 `public/uploads` |
| 文章评论 | 本机 `data/comments.json` | `GET /api/comments?article=` `POST /api/comments` | 关联字段 `article`=文章 id |
| 通联日志 | `data/logs.json` | `GET /api/logs` | 按呼号/波段/模式筛选；`adif.js` 解析 `.adi` |
| 留言板 | `data/guestbook.json` | `GET/POST /api/guestbook` | `status!==hidden` 才显示 |
| ON AIR | `data/site.json` | `GET /api/home` | auto=轮询 pskreporter；manual=手填频率 |
| POTA | `site.json` potaUrl | `GET /api/pota` | 本版已禁用(返回空) |
| 站点设置 | `data/site.json` | `GET/POST /api/admin/site` | 后台改 |
| 文案 i18n | `js/i18n.js` + `data/copy.json` | `GET/POST /api/admin/copy` | 双语可后台改 |

**数据流链路**
```
浏览器(main.js/admin.js) ── 相对 /api/* ──▶ server.js ── 读写 ──▶ data/*.json
                                    │
图片上传 POST /api/admin/upload ────▶ public/uploads/
欢迎视频 ── public/backgroud/backgroud.mp4       logo ── public/picture/picture.jpg
后台 /adminlogin ── POST /api/auth/login(校验 ADMIN_USER/ADMIN_PASS) ──▶ /admin(admin.js)
```
- **评论/留言与文章的联系**：评论表的 `article` 字段与文章 id 对应；点赞(`likes`)按 IP 记录在文章对象内。
- **日志**：物理上就是 `data/logs.json` 一个数组；后台 `.adi` 导入、LoTW 同步都会 `writeJSON` 合并回来；首页/日志页 `/api/logs` 返回并按需聚合波段/模式统计。
- **生产版差异**（接 bbs）：文章/日志留在服务器 `data/`，**评论/留言移到独立 bbs**（`https://bbs.<domain>/api.php?action=...`）。`server.js` 里 `BBS_BASE`+`BBS_TOKEN` 做代理（`/api/admin/bbs/*` 转发），前台 `main.js` 的 `/api.php` 改成 `https://bbs.<domain>/api.php`，统计计数从 bbs 取。**本离线版把 `BBS_BASE` 指向本机 `127.0.0.1` 的 `/api.php`（读本机 data），因此完全离线。**

---

## 3. 本地运行（离线演示）

需要 **Node.js 18+ / 20+ LTS**。
- Windows 双击 `run.bat`，或 `node server.js`。
- 浏览器：
  | 端 | 地址 | 账号 |
  |---|---|---|
  | 前台·欢迎页 | `http://localhost:3000/` | — |
  | 前台·主站 | `http://localhost:3000/home` | — |
  | 后台·管理 | `http://localhost:3000/adminlogin` | `admin` / `admin` |
- 依赖已在 `node_modules/`（纯 JS，免编译）。若重装：`npm install`（国内 `--registry=https://registry.npmmirror.com`）。
- 默认端口 3000（`process.env.PORT` 可改）。

---

## 4. 部署到 VPS / 单台 ECS

目标形态：`Ubuntu 20.04/22.04/24.04` + `Node 20 LTS`，`server.js` 由 systemd 守护，监听 80/443（带 HTTPS），域名指向它。

### 4.1 环境配置
```bash
# 装 Node 20 LTS (NodeSource)
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
node -v                     # v20.x

# 拉代码到服务器
mkdir -p /opt/bg4lzn && cd /opt/bg4lzn
git clone <你的仓库> 或 上传解压
npm install                 # 国内加 --registry=https://registry.npmmirror.com
```
- 依赖 `npm` 一起装好；`node_modules` 不必提交（`.gitignore`）。

### 4.2 SSH 配置
```bash
# 本机生成密钥
ssh-keygen -t ed25519 -C "you@host"          # 一路回车，生成 ~/.ssh/id_ed25519(.pub)

# 公钥给到服务器(先有密码/密钥能登录)
ssh-copy-id -i ~/.ssh/id_ed25519.pub user@SERVER_IP
# 或手动把 id_ed25519.pub 内容追加到服务器 ~/.ssh/authorized_keys
#   服务器上： chmod 700 ~/.ssh && chmod 600 ~/.ssh/authorized_keys
```
加固（可选，防密码爆破）：
```bash
# 服务器 /etc/ssh/sshd_config
PasswordAuthentication no
PubkeyAuthentication yes
PermitRootLogin prohibit-password       # 建议用 sudo 普通用户
# 生效
sudo systemctl restart sshd
```
本机 `~/.ssh/config` 一劳永逸：
```
Host myblog
    HostName SERVER_IP
    User ubuntu
    IdentityFile ~/.ssh/id_ed25519
```
之后 `ssh myblog` 直达。

### 4.3 域名 DNS 配置
在域名 DNS 面板（阿里云/Cloudflare/万网等）加记录：
| 主机记录 | 类型 | 值 | 说明 |
|---|---|---|---|
| `@` | A | `<服务器IP>` | 主域 → 服务器 |
| `www` | A | `<服务器IP>` | www 子域 → 同机 |
| `api` / `bbs` | A/CNAME | 对应 IP / 服务地址 | 若用独立 bbs |

TTL 建议 `600`。生效后验证：`dig @8.8.8.8 <domain>` 或 `nslookup <domain>`。
> 若用 bbs 独立虚机：主域 A 指向 VPS，`bbs` CNAME 到虚机；并**只给 bbs 单独签一张 `bbs.<domain>` 证书**（主域证书不包含它）。

### 4.4 SSL / HTTPS 配置
本项目 `server.js` 支持**双模式自动切换**：
- 检测到 `/etc/letsencrypt/live/<domain>/fullchain.pem` + `privkey.pem` → 以 **HTTPS(443)** 启动 + **80→443 跳转** + 内置 `/.well-known/acme-challenge/` webroot 续期路由；
- 没有证书 → 纯 HTTP(3000/80)。

用 Let's Encrypt（certbot webroot）签发：
```bash
apt install -y certbot
mkdir -p /var/www/letsencrypt          # webroot 续期目录
certbot certonly --webroot -w /var/www/letsencrypt \
  -d <domain> -d www.<domain>
# 完成后证书在 /etc/letsencrypt/live/<domain>/
#   fullchain.pem(证书+链)  privkey.pem(私钥)  cert.pem  chain.pem
systemctl restart bg4lzn              # 重启应用启用 HTTPS
```
自动续期：
```bash
# /etc/letsencrypt/renewal/<domain>.conf 确保 authenticator=webroot, webroot_path=/var/www/letsencrypt
# deploy-hook 在续期成功后重启应用
certbot renew --dry-run               # 验证续期流程能跑通
```
> 若走 nginx 反代：`certbot --nginx -d <domain>` 更省事，让 nginx 管 443 + 跳转，应用只用 80。

### 4.5 systemd 服务 + 防火墙
`/etc/systemd/system/bg4lzn.service`：
```ini
[Unit]
Description=BG4LZN Radio Hut
After=network.target

[Service]
WorkingDirectory=/opt/bg4lzn
ExecStart=/usr/local/bin/node server.js
Restart=always
RestartSec=3
Environment=PORT=80
EnvironmentFile=/root/bg4lzn.env     # 存放密钥, chmod 600

[Install]
WantedBy=multi-user.target
```
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now bg4lzn
sudo systemctl status bg4lzn
journalctl -u bg4lzn -f               # 看日志
```
密钥环境文件 `/root/bg4lzn.env`（`chmod 600`）：
```
ADMIN_USER=fanyuxuan
ADMIN_PASS=<你的后台密码>
LOTW_PASSWORD=<LoWT 密码>
```
防火墙（ufw）：
```bash
ufw allow 22/tcp; ufw allow 80/tcp; ufw allow 443/tcp
ufw enable          # 先 allow 再 enable，防锁死
ufw status verbose
```
> 云侧（安全组/防火墙）也放行 22/80/443，入站其余丢弃。

### 4.6 生产数据源切换（接 bbs）
默认本开源版评论/留言用本机 `data/`。要接线上 bbs：
1. `server.js`：把 `BBS_BASE` 从 `http://127.0.0.1:PORT` 改回 `https://bbs.<domain>`；`BBS_TOKEN` 填 bbs 管理密钥。
2. `public/js/main.js`：把 4 处 `/api.php` 改回 `https://bbs.<domain>/api.php`。
3. bbs 侧部署 `api.php`（含 `action=guestbook|comments|addguestbook|addcomment|delete*|clean*`），数据在 `bbs/data/*.json`。
4. 统计/删除（后台）经 `server.js` 代理 `/api/admin/bbs/*` 到 bbs。
> 若 bbs 是独立虚机，另配其自身域名、HTTPS 证书与 DNS（见 4.3/4.4）。

---

## 5. 运维要点（上线后）
- **每日备份**：cron `0 0 * * *` 拉 `data/` + bbs 数据 + SSL 证书 → 推 GitHub 私有仓；`git pull --rebase` 防分叉。
- **证书续期**：certbot `renew`（主站）+ bbs 若用 acme.sh DNS-01 自动续期（面板需手动重传时注意）。
- **后台密码**：改 `/root/bg4lzn.env` 的 `ADMIN_PASS` 后 `systemctl restart bg4lzn`。
- **日志轮转/容量**：1G 内存从机注意 swap；`data/*.json` 用 `tail`/`jq` 手查。

---

## 6. 安全提示（开源版已净化）
本仓库**不含**：LoTW 私钥、bbs 管理密钥、真实 QSL 住址电话、真实访客信息、真实日志（均为虚构示例）。
生产密钥一律放 `600` 权限环境文件/`keys/`，**绝不入库**。
