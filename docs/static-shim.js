// ---- static-mode fetch shim: serve /api/* from embedded data (read-only) ----
(function () {
  var D = window.__DATA__ || {};
  var dc = String((D.site && D.site.callsign) || 'BG4LZN').trim().toUpperCase();
  var OF = window.fetch;
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
    function cardArt(a) {
    var o = {}; for (var k in a) o[k] = a[k];
    o.likes = Array.isArray(a.likes) ? a.likes.length : (a.likes || 0);
    var cc = 0; var bc = (D.bbsComments || {})[a.id] || []; if (Array.isArray(bc)) cc = bc.length;
    o.comments = cc;
    return o;
  }
function apiHome() {
    var arts = (D.articles || []).slice().sort(function (a, b) { return new Date(b.date) - new Date(a.date); });
    var lgs = sorted(enriched()).slice(0, 5);
    return { ok: true, site: D.site || {}, onAirInfo: D.onAirInfo || null, latestArticles: arts.slice(0, 2).map(cardArt), latestLogs: lgs };
  }
  window.fetch = function (url, opts) {
    var u = String(url);
    var method = ((opts && opts.method) || 'GET').toUpperCase();
    if (method !== 'GET') return resp({ ok: false, error: '静态导出仅支持浏览，评论/点赞/留言/后台需在线服务运行' }, 400);
    if (/\/api\/site$/.test(u)) return resp({ ok: true, site: D.site || {} });
    if (/\/api\/copy$/.test(u)) return resp({ ok: true, copy: D.copy || {} });
    if (/\/api\/home$/.test(u)) return resp(apiHome());
    var ma = u.match(/\/api\/articles\/([^/?#]+)/);
    if (ma) {
      var a = (D.articles || []).find(function (x) { return x.id === ma[1]; });
      if (!a) return resp({ ok: false, error: 'not_found' }, 404);
      return resp({ ok: true, article: a, liked: false });
    }
    if (/\/api\/articles$/.test(u)) return resp({ ok: true, articles: (D.articles || []).map(cardArt) });
    if (/\/api\/logs/.test(u)) return resp(apiLogs(u));
    if (/\/api\/guestbook$/.test(u)) return resp({ ok: true, messages: (D.guestbook || []).filter(function (m) { return m.status !== 'hidden'; }) });
    var mbs = u.match(/bbs\.bg4lzn\.cn\/api\.php.*action=comments.*article=([^&]+)/);
    if (mbs) { var aid = decodeURIComponent(mbs[1]); return resp({ ok: true, comments: (D.bbsComments || {})[aid] || [] }); }
    if (/bbs\.bg4lzn\.cn\/api\.php.*action=guestbook/.test(u)) return resp({ ok: true, messages: (D.guestbook || []).filter(function (m) { return m.status !== 'hidden'; }) });
    return OF.apply(this, arguments);
  };
})();