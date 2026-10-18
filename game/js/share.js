(function () {
  'use strict';
  var App = window.App;

  // Карточка результата для системного «поделиться»: рисуем на canvas
  // и отдаём data URL — работает без сети, ссылок наружу нет.
  var DISPLAY = 'Unbounded, Onest, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  var TEXT = 'Onest, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

  function loadImg(src) {
    return new Promise(function (res, rej) {
      var img = new Image();
      img.onload = function () { res(img); };
      img.onerror = rej;
      img.src = src;
    });
  }

  // Шрифты лежат рядом с игрой; ждём их не дольше 800 мс, иначе рисуем системным
  function fontsReady() {
    if (!document.fonts || !document.fonts.load) return Promise.resolve();
    var all = Promise.all([
      document.fonts.load('800 64px Unbounded'), document.fonts.load('700 30px Onest'), document.fonts.load('500 22px Onest')
    ]).catch(function () { /* без своих шрифтов тоже нарисуем */ });
    return Promise.race([all, new Promise(function (res) { setTimeout(res, 800); })]);
  }

  function roundRect(x, X, y, w, h, r) {
    x.beginPath();
    x.moveTo(X + r, y);
    x.arcTo(X + w, y, X + w, y + h, r);
    x.arcTo(X + w, y + h, X, y + h, r);
    x.arcTo(X, y + h, X, y, r);
    x.arcTo(X, y, X + w, y, r);
    x.closePath();
  }

  // Текст по центру: если не влезает — уменьшаем кегль, а не сжимаем буквы
  function fit(x, text, cx, y, maxW) {
    var font = x.font;
    var m = /(\d+(?:\.\d+)?)px/.exec(font);
    var size = m ? +m[1] : 20;
    while (size > 10 && x.measureText(text).width > maxW) {
      size -= 2;
      x.font = font.replace(/\d+(?:\.\d+)?px/, size + 'px');
    }
    x.fillText(text, cx, y);
  }

  // Буквы вразрядку: canvas.letterSpacing есть не во всех WebView
  function spaced(x, text, cx, y, gap) {
    var w = 0, i;
    for (i = 0; i < text.length; i++) w += x.measureText(text.charAt(i)).width + (i ? gap : 0);
    var px = cx - w / 2;
    x.textAlign = 'left';
    for (i = 0; i < text.length; i++) {
      x.fillText(text.charAt(i), px, y);
      px += x.measureText(text.charAt(i)).width + gap;
    }
    x.textAlign = 'center';
  }

  // Мерная лента, как под логотипом на старте
  function ruler(x, x0, y, w) {
    for (var i = 0; i <= w; i += 7) {
      var major = i % 35 === 0;
      x.fillStyle = major ? '#d4f55a' : '#6d737e';
      x.fillRect(x0 + i, y + (major ? 0 : 5), major ? 2 : 1, major ? 11 : 6);
    }
  }

  // o: { kicker, big, small, title, sub, marks: [{ color, boss }], capy: { acc, mood }, footer }
  function card(o) {
    var W = 600, H = 800;
    var c = document.createElement('canvas');
    c.width = W; c.height = H;
    var x = c.getContext('2d');

    function glow(cx, cy, r, color) {
      var g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, color);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g;
      x.fillRect(0, 0, W, H);
    }

    function finish(img) {
      x.fillStyle = '#0b0c0e';
      x.fillRect(0, 0, W, H);
      glow(70, 50, 380, 'rgba(212,245,90,0.16)');
      glow(560, 770, 340, 'rgba(63,216,200,0.12)');
      x.strokeStyle = 'rgba(255,255,255,0.08)';
      x.lineWidth = 2;
      roundRect(x, 20, 20, W - 40, H - 40, 28);
      x.stroke();

      x.textAlign = 'center';
      x.textBaseline = 'alphabetic';
      x.fillStyle = '#6d737e';
      x.font = '600 17px ' + TEXT;
      spaced(x, o.kicker.toUpperCase(), W / 2, 78, 4);
      x.fillStyle = '#d4f55a';
      x.font = '800 64px ' + DISPLAY;
      fit(x, 'ПРИКИНЬ!', W / 2, 150, W - 120);
      ruler(x, W / 2 - 140, 166, 280);
      if (img) x.drawImage(img, W / 2 - 95, 194, 190, 190);

      // крупный счёт: число белым, «/ максимум» — приглушённо
      x.font = '800 92px ' + DISPLAY;
      var bw = x.measureText(o.big).width;
      x.font = '600 38px ' + DISPLAY;
      var sw = o.small ? x.measureText(o.small).width : 0;
      var sx = W / 2 - (bw + sw) / 2;
      x.textAlign = 'left';
      x.fillStyle = '#f3f4f6';
      x.font = '800 92px ' + DISPLAY;
      x.fillText(o.big, sx, 488);
      if (o.small) {
        x.fillStyle = '#6d737e';
        x.font = '600 38px ' + DISPLAY;
        x.fillText(o.small, sx + bw, 488);
      }
      x.textAlign = 'center';
      x.fillStyle = '#f3f4f6';
      x.font = '700 32px ' + TEXT;
      fit(x, o.title, W / 2, 542, W - 100);
      if (o.sub) {
        x.fillStyle = '#a9afb9';
        x.font = '500 22px ' + TEXT;
        fit(x, o.sub, W / 2, 578, W - 100);
      }

      // раунды квадратами, босс-раунды — в янтарной рамке
      var n = (o.marks || []).length;
      if (n) {
        var gap = 10, sq = Math.min(34, Math.floor((W - 120 - gap * (n - 1)) / n));
        var mx = W / 2 - (n * sq + (n - 1) * gap) / 2, my = 608;
        o.marks.forEach(function (m, i) {
          var px = mx + i * (sq + gap);
          if (m.boss) {
            x.strokeStyle = '#ffb547';
            x.lineWidth = 3;
            roundRect(x, px - 5, my - 5, sq + 10, sq + 10, 12);
            x.stroke();
          }
          x.fillStyle = m.color;
          roundRect(x, px, my, sq, sq, 9);
          x.fill();
        });
      }

      if (o.footer) {
        x.fillStyle = '#15171b';
        roundRect(x, 60, 684, W - 120, 68, 20);
        x.fill();
        x.strokeStyle = 'rgba(255,255,255,0.08)';
        x.lineWidth = 2;
        x.stroke();
        x.fillStyle = '#f3f4f6';
        x.font = '600 24px ' + TEXT;
        fit(x, o.footer, W / 2, 727, W - 160);
      }
      // JPEG в разы легче PNG — сообщение через мост остаётся небольшим
      try { return c.toDataURL('image/jpeg', 0.9); } catch (e) { return null; }
    }

    var svg = App.capy.svgFor(o.capy.acc, o.capy.mood);
    // Если какой-то WebView не прорисует SVG, не ждём вечно: карточка соберётся без Капи
    var timeout = new Promise(function (res) { setTimeout(function () { res(null); }, 1500); });
    var img = loadImg('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)).catch(function () { return null; });
    return Promise.all([Promise.race([img, timeout]), fontsReady()]).then(function (r) {
      try { return finish(r[0]); } catch (e) { return null; }
    });
  }

  App.share = { card: card };
})();
