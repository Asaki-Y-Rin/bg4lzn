// ===== 中英互译词库 =====
window.I18N = {
  zh: {
    nav: { home: '首页', about: '关于我', articles: '文章', logs: '日志', pota: 'POTA', guestbook: '留言板' },
    home: {
      tagline: '山东泰安 · B 类业余无线电操作员',
      sub: '记录我的无线电生活 —— 从天线到电波，从通联日志到远方的 73。',
      stats: { qso: 'QSO 通联', posts: '文章', gb: '留言' },
      onAir: 'ON AIR', offAir: 'OFF AIR',
      onAirHint: 'ON AIR：正在发射中 · OFF AIR：当前未发射。自动(pskreporter)或手动判断。',
      latest: '最新文章', viewAll: '全部文章',
      radio: '电台小屋', recentQsos: '近期通联', recentDemo: '目前还没有通联记录，去后台配置 LoTW 证书，下载你的日志吧。',
      readMore: '阅读',
      quick: {
        title: '快捷入口',
        logs: '通联日志', logsDesc: 'LoTW 同步的通联记录',
        guestbook: '留言板', guestbookDesc: '留下你的脚印',
        pota: 'POTA', potaDesc: '空中公园激活统计',
        articles: '文章', articlesDesc: '电台随笔',
        about: '关于我', aboutDesc: '山东泰安 · B 类'
      }
    },
    about: {
      title: '关于我',
      sub: 'Hi，我是 BG4LZN。欢迎来到我的电台小屋。',
      role: 'B 类业余无线电操作员',
      intro1: '我来自山东泰安，一名 B 类业余无线电操作员，呼号 BG4LZN。',
      intro2: '业余无线电让我认识世界：架设天线、调试设备、追逐 DX，也让我认识了天南海北的友台。这里记录了我通联、装备与热爱故事的点点滴滴。',
      credit: '特别鸣谢：本博客的代码由我最好的朋友 BA4IHB 提供，向他致敬！73！',
      qslTitle: 'QSL 与通联',
      qsl: '欢迎交换 QSL 卡。QSL 方式支持纸质、卡片局、LoTW、eQSL 等。',
      meta: [
        { l: '呼号', v: 'BG4LZN' },
        { l: '所在地', v: '中国 · 山东 · 泰安' },
        { l: '操作级别', v: 'B 类' },
        { l: '邮政编码', v: '271000' }
      ]
    },
    articles: {
      title: '文章',
      sub: '电台小屋里的随笔与器材记录。',
      empty: '还没有文章，去后台写一篇吧。',
      share: '分享',
      like: '点赞', liked: '已赞',
      comments: '条评论', comment: '评论',
      leaveComment: '写下你的评论', name: '昵称', commentPh: '友善交流，73！', submit: '发布评论',
      back: '返回文章列表'
    },
    logs: {
      title: '通联日志',
      sub: '来自 ARRL LoTW 的通联记录，后台同步后同步显示。',
      count: '条通联记录',
      lastSync: '上次同步',
      th: { date: '日期', time: 'UTC 时间', call: '通联呼号', freq: '频率', mode: '模式' },
      empty: '还没有通联记录。请到后台上传 LoTW 的 P12 证书并同步下载日志。',
      hint: '日志来源：ARRL LoTW（Logbook of the World）'
    },
    pota: {
      title: 'POTA 记录',
      sub: 'Parks on the Air —— 空中公园计划。这里展示 BG4LZN 的 POTA 激活统计。',
      live: '实时 Spot',
      th: { time: '时间', ref: '公园编号', park: '公园名称', freq: '频率', mode: '模式', note: '备注' },
      empty: '暂未查询到该呼号的 POTA spot 记录。',
      note: '由 POTA 统计站 pota-stats.wd4dan.net 通过 iframe 内嵌展示 BG4LZN 的激活记录（官方 API 实时数据）。'
    },
    guestbook: {
      title: '留言板',
      sub: '路过的小伙伴，进来留个脚印吧！73。',
      formTitle: '写留言',
      name: '昵称', ph: '一句话或一段话，欢迎分享你对无线电的热爱……', submit: '发布',
      empty: '还没有留言，来抢沙发吧。'
    },
    footer: '© BG4LZN 的电台小屋 · 通联地球，73 de BG4LZN',
    lang: { zh: '中', en: 'EN' }
  },

  en: {
    nav: { home: 'Home', about: 'About', articles: 'Articles', logs: 'Logs', pota: 'POTA', guestbook: 'Guestbook' },
    home: {
      tagline: 'Tai\'an, Shandong · Class B Amateur Radio Operator',
      sub: 'My radio life — from antennas to airwaves, from QSO logs to 73s across the world.',
      stats: { qso: 'QSO Contacts', posts: 'Articles', gb: 'Messages' },
      onAir: 'ON AIR', offAir: 'OFF AIR',
      onAirHint: 'ON AIR: transmitting now · Listening: not transmitting, just monitoring. Auto (pskreporter) or manual.',
      latest: 'Latest Articles', viewAll: 'All Articles',
      radio: 'Radio Shack', recentQsos: 'Recent QSOs', recentDemo: 'No QSOs yet — configure your LoTW certificate in the admin panel to sync your log.',
      readMore: 'Read',
      quick: {
        title: 'Quick Access',
        logs: 'QSO Log', logsDesc: 'Contacts synced from LoTW',
        guestbook: 'Guestbook', guestbookDesc: 'Leave a footprint',
        pota: 'POTA', potaDesc: 'Park activation stats',
        articles: 'Articles', articlesDesc: 'Notes from the shack',
        about: 'About', aboutDesc: 'Tai\'an · Class B'
      }
    },
    about: {
      title: 'About Me',
      sub: 'Hi, I\'m BG4LZN. Welcome to my little radio shack.',
      role: 'Class B Amateur Radio Operator',
      intro1: 'I\'m from Tai\'an, Shandong, China. My callsign is BG4LZN, a Class B amateur radio operator.',
      intro2: 'Amateur radio introduced me to the world: building antennas, tuning rigs, chasing DX — and it has connected me with operators far and wide. This is where I share my QSOs, my gear, and my passion.',
      credit: 'Special thanks: this blog is powered by code from my best friend BA4IHB. Salute to him! 73!',
      qslTitle: 'QSL & QSOs',
      qsl: 'QSL cards are welcome. I support paper cards, bureau, LoTW and eQSL.',
      meta: [
        { l: 'Callsign', v: 'BG4LZN' },
        { l: 'Location', v: 'Tai\'an, Shandong, China' },
        { l: 'License', v: 'Class B' },
        { l: 'Region', v: 'CN' }
      ]
    },
    articles: {
      title: 'Articles',
      sub: 'Essays and gear notes from the shack.',
      empty: 'No articles yet — write one in the admin panel.',
      like: 'Like', liked: 'Liked',
      comments: 'comments', comment: 'Comments',
      leaveComment: 'Leave a comment', name: 'Name', commentPh: 'Be kind, 73!', submit: 'Post Comment',
      back: 'Back to articles'
    },
    logs: {
      title: 'QSO Log',
      sub: 'Contacts from ARRL LoTW, synced from the admin panel.',
      count: 'contacts',
      lastSync: 'Last sync',
      th: { date: 'Date', time: 'UTC Time', call: 'Callsign', freq: 'Frequency', mode: 'Mode' },
      empty: 'No contacts yet. Upload your LoTW P12 certificate in the admin panel and sync your log.',
      hint: 'Source: ARRL LoTW (Logbook of the World)'
    },
    pota: {
      title: 'POTA Activations',
      sub: 'Parks on the Air. This page shows BG4LZN\'s POTA activation stats.',
      live: 'Live Spots',
      th: { time: 'Time', ref: 'Park Ref', park: 'Park Name', freq: 'Frequency', mode: 'Mode', note: 'Notes' },
      empty: 'No POTA spots found for this callsign yet.',
      note: 'BG4LZN\'s activations are embedded from the POTA stats site pota-stats.wd4dan.net via iframe (live official API data).'
    },
    guestbook: {
      title: 'Guestbook',
      sub: 'Stop by and leave a footprint! 73.',
      formTitle: 'Write a message',
      name: 'Name', ph: 'A word or two — share your love for radio…', submit: 'Post',
      empty: 'No messages yet — be the first!'
    },
    footer: '© BG4LZN\'s Radio Shack · Around the world, 73 de BG4LZN',
    lang: { zh: '中', en: 'EN' }
  }
};

window.I18N.merge = function (copy) {
  if (!copy) return;
  if (copy.zh && typeof copy.zh === 'object') deepMerge(copy.zh, this.zh);
  if (copy.en && typeof copy.en === 'object') deepMerge(copy.en, this.en);
};
function deepMerge(src, dst) {
  for (const k in src) {
    if (src[k] && typeof src[k] === 'object' && !Array.isArray(src[k])) {
      if (!dst[k] || typeof dst[k] !== 'object') dst[k] = {};
      deepMerge(src[k], dst[k]);
    } else {
      dst[k] = src[k];
    }
  }
}
