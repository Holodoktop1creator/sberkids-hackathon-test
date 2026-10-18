(function () {
  'use strict';
  var App = window.App;
  var U = App.util;

  // Один canvas на весь экран: искры, ударные волны, пыль и конфетти — всё
  // рисуется примитивами, без картинок. Цикл крутится, только пока есть частицы,
  // и сам останавливается — батарею не тратим.
  var cv = document.getElementById('fx');
  var ctx = cv.getContext('2d');
  var W = 0, H = 0, dpr = 1;
  var parts = [];
  var running = false;
  var PALETTE = ['#d4f55a', '#3fd8c8', '#f3f4f6', '#ffb547', '#a98bff'];
  var MAX = 160;
  var TAU = Math.PI * 2;

  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = window.innerWidth; H = window.innerHeight;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();
  window.addEventListener('resize', resize);

  function loop() {
    ctx.clearRect(0, 0, W, H);
    for (var i = parts.length - 1; i >= 0; i--) {
      var p = parts[i];
      p.t++;
      if (p.t >= p.life || p.y > H + 40) { parts.splice(i, 1); continue; }
      var k = p.t / p.life;
      if (p.type === 'ring') {
        // ударная волна: кольцо расширяется и тает
        ctx.globalAlpha = (1 - k) * p.a;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.w * (1 - k) + 0.5;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r0 + (p.r1 - p.r0) * U.easeOut(k), 0, TAU);
        ctx.stroke();
        continue;
      }
      p.vy += p.g; p.vx *= p.drag; p.vy *= p.drag;
      p.x += p.vx; p.y += p.vy;
      ctx.globalAlpha = Math.min(1, (p.life - p.t) / 16) * p.a;
      if (p.type === 'spark') {
        // искра — короткий росчерк вдоль скорости
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.w;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * p.len, p.y - p.vy * p.len);
        ctx.stroke();
      } else if (p.type === 'dot') {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (1 - k * 0.5), 0, TAU);
        ctx.fill();
      } else {
        // конфетти — бумажная полоска, которая крутится в воздухе
        p.r += p.vr;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.r);
        ctx.scale(1, Math.cos(p.t * 0.18));
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 5, p.size, p.size * 0.4);
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
    if (parts.length) requestAnimationFrame(loop);
    else { running = false; ctx.clearRect(0, 0, W, H); }
  }
  function add(p) {
    if (U.reduced || parts.length >= MAX) return;
    parts.push(p);
    if (!running) { running = true; requestAnimationFrame(loop); }
  }
  function base(type, x, y) {
    return { type: type, x: x, y: y, vx: 0, vy: 0, g: 0, drag: 0.92, r: 0, vr: 0, t: 0, life: 40, a: 1 };
  }

  App.fx = {
    confetti: function (n) {
      n = n || 60;
      for (var i = 0; i < n; i++) {
        var p = base('paper', U.rand(0, W), U.rand(-60, -10));
        p.vx = U.rand(-2, 2); p.vy = U.rand(2, 5);
        p.g = 0.1; p.drag = 0.995; p.vr = U.rand(-0.18, 0.18);
        p.size = U.rand(7, 12); p.color = U.pick(PALETTE); p.life = U.rand(100, 160) | 0;
        add(p);
      }
    },
    // искры разлетаются из точки: попадание, тап по Капи
    sparks: function (x, y, n, colors, power) {
      n = n || 14;
      power = power || 1;
      colors = colors || PALETTE;
      for (var i = 0; i < n; i++) {
        var a = U.rand(0, TAU), sp = U.rand(4, 11) * power;
        var p = base('spark', x, y);
        p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp;
        p.g = 0.12; p.drag = 0.9; p.len = U.rand(1.6, 2.6); p.w = U.rand(1.5, 2.6);
        p.color = U.pick(colors); p.life = U.rand(26, 42) | 0;
        add(p);
      }
    },
    ring: function (x, y, color, r1, w) {
      var p = base('ring', x, y);
      p.r0 = 6; p.r1 = r1 || 90; p.w = w || 4; p.color = color || PALETTE[0]; p.life = 30; p.a = 0.9;
      add(p);
    },
    // промах: пара серых пылинок медленно оседает
    dust: function (x, y, n) {
      n = n || 10;
      for (var i = 0; i < n; i++) {
        var p = base('dot', x + U.rand(-30, 30), y + U.rand(-16, 16));
        p.vx = U.rand(-0.6, 0.6); p.vy = U.rand(-1.4, -0.2);
        p.g = 0.03; p.drag = 0.98; p.size = U.rand(1.5, 3.2);
        p.color = '#6d737e'; p.life = U.rand(40, 60) | 0; p.a = 0.8;
        add(p);
      }
    }
  };
})();
