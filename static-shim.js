// ---- static-mode fetch shim: articles proxied to Do-Blog backend (api.bg4lzn.online), rest from embedded data ----
// BG4LZN 版: 主站(GitHub Pages) 文章动态化 —— 内堂管理、前台展示; 后台模拟只读
(function () {
  var D = window.__DATA__ || {};
  var dc = String((D.site && D.site.callsign) || 'BG4LZN').trim().toUpperCase();
  var OF = window.fetch;
  var INNER = 'https://api.bg4lzn.online';
  function resp(obj, status) {
    return Promise.resolve(new Response(JSON.stringify(obj), { status: status || 200, headers: { 'Content-Type': 'application/json' } }));
  }
  function sorted(list) {
    return list.slice().sort(function (a, b) { return ((b.date || '') + (b.time || '')).localeCompare((a.date || '') + (a.time || '')); });
  }
  function enriched() {
    return (D.logs || []).filter(Boolean).map(function (l) {
      var st = String(l.station || dc).trim().toUpperCase();
      var o = {};
      for (var k in l) o[k] = l[k];
      o.station = st || dc;
      return o;
    });
  }
  function apiLogs(u) {
    var q = '', i = u.indexOf('?');
    if (i >= 0) q = u.slice(i + 1);
    var p = new URLSearchParams(q);
    var all = enriched();
    var by = {};
    all.forEach(function (l) { by[l.station] = (by[l.station] || 0) + 1; });
    var stations = Object.keys(by).map(function (c) { return { call: c, count: by[c] }; })
      .sort(function (a, b) { return b.count - a.count || a.call.localeCompare(b.call); });
    var active = String(p.get('call') || '').toUpperCase() || (stations[0] ? stations[0].call : dc);
    var qq = String(p.get('q') || '').trim().toUpperCase();
    var list = all.filter(function (l) { return l.station === active; })
      .filter(function (l) { return !qq || String(l.call || '').toUpperCase().indexOf(qq) >= 0; });
    list = sorted(list);
    var per = Math.min(Math.max(parseInt(p.get('per'), 10) || 30, 1), 200);
    var total = list.length;
    var pages = Math.max(Math.ceil(total / per), 1);
    var page = Math.min(Math.max(parseInt(p.get('page'), 10) || 1, 1), pages);
    var start = (page - 1) * per;
    return { ok: true, stations: stations, activeCall: active, logs: list.slice(start, start + per), total: total, page: page, pages: pages, per: per, callsign: dc, lastSync: (D.logsInfo && D.logsInfo.lastSync) || null };
  }
  // ---- 内堂字段映射 (Do-Blog article -> 旧站 article) ----
  function mapArt(a) {
    return {
      id: String(a.id),
      title: a.title || '',
      date: String(a.published_at || a.created_at || '').slice(0, 10),
      cover: a.cover_image || '',
      excerpt: a.excerpt || '',
      content_md: a.content_md || '',
      likes: a.like_count || 0,
      comments: 0,
      slug: a.slug || ''
    };
  }
  function fetchInner(path) {
    return OF(INNER + path, { headers: { Accept: 'application/json' } }).then(function (r) {
      return r.json();
    }).catch(function () { return null; });
  }
  // 内堂文章列表 -> 旧站 articles (按日期倒序)
  function proxyArticles() {
    return fetchInner('/api/articles?pageSize=50').then(function (j) {
      if (!j || !j.success) return resp({ ok: false, error: 'backend_unavailable' }, 502);
      var list = (j.data || []).slice().sort(function (a, b) { return String(b.published_at || '').localeCompare(String(a.published_at || '')); });
      return resp({ ok: true, articles: list.map(mapArt) });
    });
  }
  function proxyArticle(id) {
    return fetchInner('/api/articles/' + encodeURIComponent(id)).then(function (j) {
      if (!j || !j.success) return resp({ ok: false, error: 'not_found' }, 404);
      var art = mapArt(j.data);
      // 拉取评论数以填充卡片
      return fetchInner('/api/articles/' + encodeURIComponent(id) + '/comments').then(function (cj) {
        if (cj && cj.success) art.comments = (cj.data || []).length;
        return resp({ ok: true, article: art, liked: false });
      });
    });
  }
  function proxyHome() {
    return fetchInner('/api/articles?pageSize=5').then(function (j) {
      var arts = [];
      if (j && j.success) {
        arts = (j.data || []).slice().sort(function (a, b) { return String(b.published_at || '').localeCompare(String(a.published_at || '')); });
      }
      var lgs = sorted(enriched()).slice(0, 5);
      return resp({
        ok: true,
        site: D.site || {},
        onAirInfo: D.onAirInfo || null,
        latestArticles: arts.slice(0, 2).map(mapArt),
        latestLogs: lgs
      });
    });
  }
  window.fetch = function (url, opts) {
    var u = String(url);
    var method = ((opts && opts.method) || 'GET').toUpperCase();
    // ---- 静态后台(只读模拟) ----
    if (/\/api\/auth\/login$/.test(u)) return resp({ ok: true, loggedIn: true, user: 'admin' });
    if (/\/api\/auth\/logout$/.test(u)) return resp({ ok: true });
    if (/\/api\/auth\/me$/.test(u)) return resp({ ok: true, loggedIn: true, user: 'admin' });
    if (/\/api\/admin\/stats$/.test(u)) {
      var arts = D.articles || [], lgs = D.logs || [], gbs = D.guestbook || [];
      var cc = 0; for (var k in (D.bbsComments || {})) cc += (D.bbsComments[k] || []).length;
      var likes = 0; arts.forEach(function (a) { likes += Array.isArray(a.likes) ? a.likes.length : (a.likes || 0); });
      return resp({ ok: true, articles: arts.length, logs: lgs.length, guestbook: gbs.length, comments: cc, logLikes: likes });
    }
    if (/\/api\/admin\/site$/.test(u)) return resp({ ok: true, site: D.site || {} });
    if (/\/api\/admin\//.test(u)) return resp({ ok: false, error: '静态版只读：完整后台请部署服务器版' }, 400);
    // ---- 其余写操作一律只读提示 ----
    if (method !== 'GET') return resp({ ok: false, error: '静态导出仅支持浏览，评论/点赞/留言/后台需在线服务运行' }, 400);
    // ---- 内堂代理: 文章动态化 ----
    if (/\/api\/home$/.test(u)) return proxyHome();
    var ma = u.match(/\/api\/articles\/([^/?#]+)/);
    if (ma) return proxyArticle(decodeURIComponent(ma[1]));
    if (/\/api\/articles$/.test(u)) return proxyArticles();
    // ---- 静态数据 ----
    if (/\/api\/site$/.test(u)) return resp({ ok: true, site: D.site || {} });
    if (/\/api\/copy$/.test(u)) return resp({ ok: true, copy: D.copy || {} });
    if (/\/api\/logs/.test(u)) return resp(apiLogs(u));
    if (/\/api\/guestbook$/.test(u)) return resp({ ok: true, messages: (D.guestbook || []).filter(function (m) { return m.status !== 'hidden'; }) });
    var mbs = u.match(/bbs\.bg4lzn\.cn\/api\.php.*action=comments.*article=([^&]+)/);
    if (mbs) { var aid = decodeURIComponent(mbs[1]); return resp({ ok: true, comments: (D.bbsComments || {})[aid] || [] }); }
    if (/bbs\.bg4lzn\.cn\/api\.php.*action=guestbook/.test(u)) return resp({ ok: true, messages: (D.guestbook || []).filter(function (m) { return m.status !== 'hidden'; }) });
    return OF.apply(this, arguments);
  };
})();
