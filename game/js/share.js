(function () {
  'use strict';
  var App = window.App;

  // Карточка результата для системного «поделиться»: рисуем на canvas
  // и отдаём data URL — работает без сети, ссылок наружу нет.
  function loadImg(src) {
    return new Promise(function (res, rej) {
      var img = new Image();
      img.onload = function () { res(img); };
      img.onerror = rej;
      img.src = src;
    });
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

  // o: { kicker, big, title, grid, capy: { acc, mood }, footer }
  function card(o) {
    var W = 600, H = 800;
    var c = document.createElement('canvas');
    c.width = W; c.height = H;
    var x = c.getContext('2d');

    var g = x.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#3a1f9e'); g.addColorStop(0.55, '#1a1046'); g.addColorStop(1, '#0d4f49');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    [['rgba(198,255,61,.25)', 520, 90, 200], ['rgba(255,92,168,.25)', 60, 640, 240], ['rgba(46,230,214,.2)', 560, 700, 180]].forEach(function (b) {
      var rg = x.createRadialGradient(b[1], b[2], 0, b[1], b[2], b[3]);
      rg.addColorStop(0, b[0]); rg.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = rg; x.fillRect(0, 0, W, H);
    });

    var font = 'ui-rounded, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    x.textAlign = 'center';
    x.textBaseline = 'alphabetic';

    x.font = '900 76px ' + font;
    x.fillStyle = '#2c1a7a'; x.fillText('ПРИКИНЬ!', W / 2 + 4, 112);
    x.fillStyle = '#c6ff3d'; x.fillText('ПРИКИНЬ!', W / 2, 106);

    x.font = '800 24px ' + font;
    x.fillStyle = '#bdb3ec';
    x.fillText(o.kicker, W / 2, 152);

    function finish(img) {
      if (img) x.drawImage(img, W / 2 - 110, 175, 220, 220);
      x.font = '900 72px ' + font;
      x.fillStyle = '#ffcf3d';
      x.fillText(o.big, W / 2, 470);
      x.font = '900 34px ' + font;
      x.fillStyle = '#ffffff';
      x.fillText(o.title, W / 2, 522);
      if (o.grid) {
        x.font = '40px ' + font;
        x.fillText(o.grid, W / 2, 592);
      }
      x.fillStyle = 'rgba(255,255,255,.12)';
      roundRect(x, 60, 640, W - 120, 84, 26);
      x.fill();
      x.font = '800 28px ' + font;
      x.fillStyle = '#ffffff';
      x.fillText(o.footer, W / 2, 692);
      // JPEG в разы легче PNG — сообщение через мост остаётся небольшим
      try { return c.toDataURL('image/jpeg', 0.88); } catch (e) { return null; }
    }

    var svg = App.capy.svgFor(o.capy.acc, o.capy.mood);
    return loadImg('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg))
      .then(finish, function () { return finish(null); });
  }

  App.share = { card: card };
})();
