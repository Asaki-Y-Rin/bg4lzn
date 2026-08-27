// Lightweight floating-particle background (ins-style, subtle pastel dots)
(function () {
  var cv = document.getElementById('fx');
  if (!cv || !cv.getContext) return;
  var ctx = cv.getContext('2d');
  var W = 0, H = 0, ps = [];
  var COUNT = 28;
  var colors = ['rgba(242,201,179,', 'rgba(224,214,255,', 'rgba(196,224,250,', 'rgba(255,214,196,', 'rgba(214,242,224,'];
  function resize() { W = cv.width = window.innerWidth; H = cv.height = window.innerHeight; }
  function make() {
    return {
      x: Math.random() * W, y: Math.random() * H,
      r: 1.6 + Math.random() * 3.6,
      vx: (Math.random() - 0.5) * 0.22, vy: -(0.12 + Math.random() * 0.28),
      c: colors[(Math.random() * colors.length) | 0],
      a: 0.12 + Math.random() * 0.22,
      p: Math.random() * Math.PI * 2,
      ph: 0.01 + Math.random() * 0.02
    };
  }
  function frame() {
    ctx.clearRect(0, 0, W, H);
    for (var i = 0; i < ps.length; i++) {
      var p = ps[i];
      p.x += p.vx; p.y += p.vy; p.p += p.ph;
      if (p.y < -24 || p.x < -24 || p.x > W + 24) ps[i] = make();
      var alpha = p.a * (0.55 + 0.45 * Math.sin(p.p));
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = p.c + alpha.toFixed(3) + ')';
      ctx.fill();
    }
    requestAnimationFrame(frame);
  }
  resize();
  for (var i = 0; i < COUNT; i++) ps.push(make());
  frame();
  window.addEventListener('resize', resize);
})();