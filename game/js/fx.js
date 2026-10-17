(function () {
  'use strict';
  var App = window.App;

  // Один canvas на весь экран: конфетти и эмодзи-частицы. Цикл крутится,
  // только пока есть частицы, и сам останавливается — батарею не тратим.
  var cv = document.getElementById('fx');
  var ctx = cv.getContext('2d');
  var W = 0, H = 0, dpr = 1;
  var parts = [];
  var running = false;
  var cache = {};
  var COLORS = ['#c6ff3d', '#2ee6d6', '#ff5ca8', '#8b6cff', '#ffcf3d', '#ff9a1f'];
  var MAX = 140;

  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = window.innerWidth; H = window.innerHeight;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();
  window.addEventListener('resize', resize);

  // эмодзи рисуем один раз во вспомогательный canvas, дальше — drawImage
  function sprite(emoji, size) {
    var key = emoji + size;
    if (cache[key]) return cache[key];
    var c = document.createElement('canvas');
    var s = Math.ceil(size * 1.3 * dpr);
    c.width = c.height = s;
    var x = c.getContext('2d');
    x.scale(dpr, dpr);
    x.font = size + 'px sans-serif';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText(emoji, s / dpr / 2, s / dpr / 2 + size * 0.05);
    cache[key] = c;
    return c;
  }

  function loop() {
    ctx.clearRect(0, 0, W, H);
    for (var i = parts.length - 1; i >= 0; i--) {
      var p = parts[i];
      p.vy += p.g; p.vx *= p.drag; p.vy *= p.drag;
      p.x += p.vx; p.y += p.vy; p.r += p.vr; p.life--;
      if (p.life <= 0 || p.y > H + 50) { parts.splice(i, 1); continue; }
      ctx.save();
      ctx.globalAlpha = Math.min(1, p.life / 18);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.r);
      if (p.img) {
        var s = p.img.width / dpr;
        ctx.drawImage(p.img, -s / 2, -s / 2, s, s);
      } else {
        ctx.fillStyle = p.color;
        ctx.scale(1, Math.cos(p.life * 0.2));
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      }
      ctx.restore();
    }
    if (parts.length) requestAnimationFrame(loop);
    else { running = false; ctx.clearRect(0, 0, W, H); }
  }
  function add(p) {
    if (parts.length >= MAX) return;
    parts.push(p);
    if (!running) { running = true; requestAnimationFrame(loop); }
  }
  function base(x, y) {
    return { x: x, y: y, vx: 0, vy: 0, g: 0.35, drag: 0.99, r: 0, vr: 0, life: 90 };
  }

  App.fx = {
    confetti: function (n) {
      n = n || 70;
      for (var i = 0; i < n; i++) {
        var p = base(App.util.rand(0, W), App.util.rand(-60, -10));
        p.vx = App.util.rand(-2.5, 2.5); p.vy = App.util.rand(2, 6);
        p.g = 0.12; p.drag = 0.995; p.vr = App.util.rand(-0.2, 0.2);
        p.size = App.util.rand(8, 14); p.color = App.util.pick(COLORS); p.life = App.util.rand(90, 150) | 0;
        add(p);
      }
    },
    burst: function (x, y, emojis, n, size) {
      n = n || 12;
      for (var i = 0; i < n; i++) {
        var a = App.util.rand(0, Math.PI * 2), sp = App.util.rand(3, 9);
        var p = base(x, y);
        p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp - 4;
        p.vr = App.util.rand(-0.15, 0.15); p.life = App.util.rand(45, 75) | 0;
        p.img = sprite(App.util.pick(emojis), size || 26);
        add(p);
      }
    },
    // монеты осыпаются из прямоугольника (башня рушится)
    rain: function (rect, emoji, n) {
      n = n || 14;
      for (var i = 0; i < n; i++) {
        var p = base(App.util.rand(rect.left, rect.right), App.util.rand(rect.top, rect.bottom));
        p.vx = App.util.rand(-3, 3); p.vy = App.util.rand(-5, 0);
        p.vr = App.util.rand(-0.3, 0.3); p.life = 80;
        p.img = sprite(emoji, 24);
        add(p);
      }
    }
  };
})();
