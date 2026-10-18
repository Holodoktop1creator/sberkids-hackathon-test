(function () {
  'use strict';
  var App = window.App;

  // Картинки-файлы. Контент-менеджер кладёт PNG или SVG с прозрачным фоном
  // и пишет одну строку в content/items.json. Игра сама обрезает пустые края,
  // считает пропорции (у стран — площадь по закрашенным пикселям) и перекрашивает
  // силуэт в стили «эталон», «догадка», «ответ». Никаких скриптов сборки.
  // Цвета — те же, что у векторных силуэтов в css/style.css.
  var MAX = 640;             // сторона растра, px
  var REF = '#2c2862', INK = '#221e4f', LIME = '#b6ee3a', PINK = '#ff5ca8', VIOLET = '#6c4dff';
  var cache = {};

  function canvas(w, h) {
    var c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }

  function loadImg(src) {
    return new Promise(function (res, rej) {
      var img = new Image();
      if (/^https:/i.test(src)) img.crossOrigin = 'anonymous'; // CDN должен отдавать CORS
      img.onload = function () { res(img); };
      img.onerror = function () { rej(new Error('не загрузилась картинка ' + src)); };
      img.src = src;
    });
  }

  // У SVG-файлов размер бывает в pt или вовсе не указан — задаём его по viewBox
  function loadSource(url) {
    var m = /^data:image\/svg\+xml(;base64)?,(.*)$/i.exec(url);
    if (m) return fromSvgText(m[1] ? decodeURIComponent(escape(atob(m[2]))) : decodeURIComponent(m[2]), 'SVG');
    if (!/\.svg(\?|#|$)/i.test(url)) return loadImg(url);
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error(url + ': ' + r.status);
      return r.text();
    }).then(function (txt) { return fromSvgText(txt, url); });
  }

  function fromSvgText(txt, url) {
    return Promise.resolve().then(function () {
      var w = 0, h = 0;
      var vb = txt.match(/viewBox\s*=\s*"([^"]+)"/i);
      if (vb) {
        var p = vb[1].trim().split(/[\s,]+/).map(Number);
        w = p[2]; h = p[3];
      } else {
        w = parseFloat((txt.match(/\swidth\s*=\s*"([\d.]+)/i) || [])[1]);
        h = parseFloat((txt.match(/\sheight\s*=\s*"([\d.]+)/i) || [])[1]);
      }
      if (!(w > 0 && h > 0)) throw new Error(url + ': у SVG нет viewBox или размеров');
      var k = MAX / Math.max(w, h);
      txt = txt.replace(/<svg\b([^>]*)>/i, function (m, attrs) {
        attrs = attrs.replace(/\s(width|height)\s*=\s*"[^"]*"/gi, '');
        if (!vb) attrs += ' viewBox="0 0 ' + w + ' ' + h + '"';
        return '<svg' + attrs + ' width="' + Math.round(w * k) + '" height="' + Math.round(h * k) + '">';
      });
      return loadImg('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(txt));
    });
  }

  // Обрезаем прозрачные поля и считаем закрашенные пиксели
  function analyze(img) {
    var nw = img.naturalWidth || img.width, nh = img.naturalHeight || img.height;
    if (!nw || !nh) throw new Error('у картинки нулевой размер');
    var k = Math.min(1, MAX / Math.max(nw, nh));
    var w = Math.max(1, Math.round(nw * k)), h = Math.max(1, Math.round(nh * k));
    var c = canvas(w, h);
    var x = c.getContext('2d');
    x.drawImage(img, 0, 0, w, h);
    var d = x.getImageData(0, 0, w, h).data;
    var minX = w, minY = h, maxX = -1, maxY = -1, filled = 0;
    for (var y = 0; y < h; y++) {
      for (var i = 0; i < w; i++) {
        if (d[(y * w + i) * 4 + 3] > 24) {
          filled++;
          if (i < minX) minX = i;
          if (i > maxX) maxX = i;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0) throw new Error('картинка пустая — нужен силуэт на прозрачном фоне');
    var bw = maxX - minX + 1, bh = maxY - minY + 1;
    var crop = canvas(bw, bh);
    crop.getContext('2d').drawImage(c, minX, minY, bw, bh, 0, 0, bw, bh);
    return { src: crop, w: bw, h: bh, filled: filled };
  }

  function tint(src, color) {
    var c = canvas(src.width, src.height);
    var x = c.getContext('2d');
    x.drawImage(src, 0, 0);
    x.globalCompositeOperation = 'source-in';
    x.fillStyle = color;
    x.fillRect(0, 0, c.width, c.height);
    return c;
  }

  // Силуэт с обводкой: обводка рисуется сдвигами по кругу, сверху — заливка
  function outlined(src, fill, line, r, pad) {
    var c = canvas(src.width + pad * 2, src.height + pad * 2);
    var x = c.getContext('2d');
    var edge = tint(src, line);
    for (var i = 0; i < 16; i++) {
      var a = i / 16 * Math.PI * 2;
      x.drawImage(edge, pad + Math.cos(a) * r, pad + Math.sin(a) * r);
    }
    if (fill === null) {
      // только контур: вырезаем сам силуэт
      x.globalCompositeOperation = 'destination-out';
      x.drawImage(src, pad, pad);
      x.globalCompositeOperation = 'source-over';
      x.globalAlpha = 0.16;
      x.drawImage(tint(src, VIOLET), pad, pad);
      x.globalAlpha = 1;
    } else {
      x.drawImage(tint(src, fill), pad, pad);
    }
    return c;
  }

  function url(c) { return c.toDataURL('image/png'); }

  function build(path) {
    if (!cache[path]) {
      cache[path] = loadSource(path).then(analyze).then(function (a) {
        var r = Math.max(2, Math.round(Math.max(a.w, a.h) * 0.012));
        var pad = Math.ceil(r * 1.6) + 1;
        return {
          w: a.w, h: a.h, filled: a.filled, pad: pad,
          ref: url(tint(a.src, REF)),
          g1: url(outlined(a.src, LIME, INK, r, pad)),
          g2: url(outlined(a.src, PINK, INK, r, pad)),
          truth: url(outlined(a.src, null, VIOLET, r * 1.3, pad))
        };
      });
    }
    return cache[path];
  }

  // Готовит объект игры: размеры в мире и слои-картинки
  function prepare(item) {
    if (!item.image) return Promise.resolve(item);
    return build(item.image).then(function (b) {
      item.vb = [0, 0, b.w, b.h];
      item.layers = b;
      if (item.kind === 'country') {
        var s = Math.sqrt(item.value / b.filled); // км на пиксель
        item.w = b.w * s;
        item.h = b.h * s;
      } else if (item.axis === 'h') {
        item.h = item.value;
        item.w = item.value * b.w / b.h;
      } else {
        item.w = item.value;
        item.h = item.value * b.h / b.w;
      }
      item.ready = true;
      return item;
    });
  }

  // Разметка слоя доски для объекта с картинкой
  function layer(item, which) {
    var b = item.layers;
    var href = b[which];
    var p = which === 'ref' ? 0 : b.pad;
    return '<image href="' + href + '" xlink:href="' + href + '" x="' + (-p) + '" y="' + (-p) + '" width="' + (b.w + p * 2) +
      '" height="' + (b.h + p * 2) + '" preserveAspectRatio="none"/>';
  }

  App.assets = { prepare: prepare, layer: layer, build: build };
})();
