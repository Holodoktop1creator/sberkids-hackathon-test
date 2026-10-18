(function () {
  'use strict';
  var App = window.App;
  var U = App.util;

  // Доска раунда: тёмный эталон в истинном масштабе, лаймовая догадка-наклейка игрока
  // и (после фиксации) фиолетовый пунктир правильного ответа.
  // Камера сама подстраивает зум, чтобы всё помещалось на вертикальном экране.
  var PAD = 14, TOP = 46, BOTTOM = 40, LABEL = 36, GAP = 22;
  // Цены — столбики на общей земле: под землёй картинки и ценники, над столбиком — число единиц
  var BAR_TOP = 34, BAR_BOTTOM = 70, PIC_H = 34;
  var K = Math.LN2 / 170;          // 170 px свайпа = размер ×2
  var G_MIN = 1 / 40, G_MAX = 40;   // фейк может преувеличивать в десятки раз

  var el, svg, L = {}, chips = {}, ruler, rulerTxt, tags = [];
  var W = 0, H = 0;
  var R = null;
  var mode = 'row';
  var cam = { s: 1, raf: 0 };
  var st = { g: [1, 1], show: [true, false], truth: false, active: 0, drag: false };
  var wob = { x: 0, v: 0 };
  var drag = null;
  var onChange = null;
  // Демо свайпа: палец ездит вверх-вниз, белый силуэт синхронно растёт и сжимается
  var demo = { on: false, t0: 0, k: 1, el: null, hand: null };
  var DEMO_PERIOD = 1.8;   // секунд на одно движение вверх-вниз

  function init(container, cb) {
    el = container;
    onChange = cb;
    el.innerHTML =
      '<div class="bglow"></div>' +
      '<svg class="bsvg" xmlns="http://www.w3.org/2000/svg">' +
      '<g class="grounds"></g>' +
      '<g class="pics"></g>' +
      '<g class="item ref"><g class="shape"></g></g>' +
      '<g class="item guess g1"><g class="shape"></g></g>' +
      '<g class="item guess g2"><g class="shape"></g></g>' +
      '<g class="item truth"><g class="shape"></g></g>' +
      '</svg>' +
      '<div class="chip-ref"><i></i><b></b><span></span></div>' +
      '<div class="ptag"></div><div class="ptag"></div>' +
      '<div class="vchip v1"><span></span></div><div class="vchip v2"><span></span></div>' +
      '<div class="vchip vt">' + U.icon('check') + '<span></span></div>' +
      '<div class="ruler"><i></i><span></span></div>' +
      '<div class="scan"></div>' +
      '<div class="swipe-demo" aria-hidden="true">' + U.icon('up') + '<span class="sd-hand"></span>' + U.icon('down') + '</div>';
    svg = el.querySelector('.bsvg');
    ['ref', 'g1', 'g2', 'truth'].forEach(function (k) {
      var g = svg.querySelector(k === 'ref' ? '.ref' : k === 'truth' ? '.truth' : '.' + k);
      L[k] = { wrap: g, shape: g.querySelector('.shape') };
    });
    L.grounds = svg.querySelector('.grounds');
    L.pics = svg.querySelector('.pics');
    chips.ref = el.querySelector('.chip-ref');
    chips.v1 = el.querySelector('.v1');
    chips.v2 = el.querySelector('.v2');
    chips.vt = el.querySelector('.vt');
    tags = el.querySelectorAll('.ptag');
    ruler = el.querySelector('.ruler i');
    rulerTxt = el.querySelector('.ruler span');
    demo.el = el.querySelector('.swipe-demo');
    demo.hand = el.querySelector('.sd-hand');

    el.addEventListener('pointerdown', function (e) {
      if (!st.drag) return;
      setDemo(false);
      drag = { y: e.clientY, g: st.g[st.active], id: e.pointerId, last: e.clientY };
      try { el.setPointerCapture(e.pointerId); } catch (_) { /* не критично */ }
    });
    el.addEventListener('pointermove', function (e) {
      if (!drag || e.pointerId !== drag.id || !st.drag) return;
      setG(st.active, drag.g * Math.exp((drag.y - e.clientY) * K));
      wob.v += (drag.last - e.clientY) * 0.003;
      drag.last = e.clientY;
      kick();
    });
    function end() { drag = null; }
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    window.addEventListener('resize', function () { if (R) { measure(); cam.s = goal(); render(); } });
  }

  function measure() {
    W = el.clientWidth;
    H = el.clientHeight;
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.setAttribute('width', W);
    svg.setAttribute('height', H);
  }

  function value(item, g) { return item.kind === 'country' ? item.value * g * g : item.value * g; }
  // в ценах размер — это сколько эталонов стоит вещь: «40 мороженых»
  function fmtVal(item, v) {
    if (item.kind === 'price') return App.content.price.count(v / R.ref.value, R.ref);
    return item.kind === 'country' ? U.fmtArea(v) : U.fmtLen(v);
  }

  // Раскладка: «row» — рядом на одной земле, «col» — эталон сверху, догадка снизу,
  // «bars» — два столбика цен
  function geom(m, dg, s) {
    if (m === 'bars') return bars(dg, s);
    var ax0 = PAD, ay0 = TOP + LABEL, aw = W - PAD * 2, ah = H - BOTTOM - ay0, ay1 = H - BOTTOM;
    var r = R.ref, t = R.target, country = R.kind === 'countries';
    var twd = t.w * dg;
    var o = { m: m };
    if (m === 'row') {
      o.fit = Math.min((aw - GAP) / (r.w + twd), ah / Math.max(r.h, t.h * dg));
      if (s === undefined) s = o.fit;
      var total = (r.w + twd) * s + GAP;
      var x = ax0 + (aw - total) / 2;
      var cy = (ay0 + ay1) / 2;
      o.ref = country ? { cx: x + r.w * s / 2, cy: cy } : { left: x, bottom: ay1 };
      var left = x + r.w * s + GAP;
      o.anchor = country ? { cx: left + twd * s / 2, cy: cy } : { left: left, bottom: ay1 };
      o.grounds = country ? [] : [ay1];
    } else {
      o.fit = Math.min(aw / Math.max(r.w, twd), (ah - GAP - LABEL) / (r.h + t.h * dg));
      if (s === undefined) s = o.fit;
      var bw = Math.max(r.w, twd) * s;
      var lx = ax0 + (aw - bw) / 2;
      var refBottom = ay0 + r.h * s;
      if (country) {
        o.ref = { cx: W / 2, cy: ay0 + r.h * s / 2 };
        var lowTop = refBottom + GAP + LABEL;
        o.anchor = { cx: W / 2, cy: (lowTop + ay1) / 2 };
        o.grounds = [];
      } else {
        o.ref = { left: lx, bottom: refBottom };
        o.anchor = { left: lx, bottom: ay1 };
        o.grounds = [refBottom, ay1];
      }
    }
    o.s = s;
    return o;
  }

  // Столбики: ширина постоянная, высота — цена. Камера вписывает самый высокий из них.
  function bars(dg, s) {
    var ground = H - BAR_BOTTOM;
    var room = Math.max(40, ground - TOP - BAR_TOP);
    var o = { m: 'bars', ground: ground, grounds: [ground] };
    o.fit = room / Math.max(R.ref.value, R.target.value * dg);
    o.s = s === undefined ? o.fit : s;
    o.bw = Math.round(U.clamp(W * 0.22, 56, 92));
    var gap = Math.round(U.clamp(W * 0.16, 30, 80));
    // справа оставляем место под подсказку свайпа: подпись «40 мороженых» не уходит под неё
    o.rx = Math.round((PAD + W - 64 - o.bw * 2 - gap) / 2);
    o.tx = o.rx + o.bw + gap;
    return o;
  }

  function box(item, pos, f, s) {
    var w = item.w * f * s, h = item.h * f * s;
    var x = pos.left !== undefined ? pos.left : pos.cx - w / 2;
    var y = pos.bottom !== undefined ? pos.bottom - h : pos.cy - h / 2;
    return { x: x, y: y, w: w, h: h };
  }

  function place(layer, item, b) {
    var kx = b.w / item.vb[2], ky = b.h / item.vb[3];
    layer.shape.setAttribute('transform',
      'translate(' + b.x.toFixed(2) + ' ' + b.y.toFixed(2) + ') scale(' + kx.toPrecision(5) + ' ' + ky.toPrecision(5) + ') translate(' + (-item.vb[0]) + ' ' + (-item.vb[1]) + ')');
  }

  // размер с учётом демо-покачивания
  function gOf(p) { return st.g[p] * (demo.on && p === st.active ? demo.k : 1); }

  function displayG() {
    var dg = 0;
    // во время демо камера берёт запас на максимум покачивания и стоит на месте
    var top = demo.on ? Math.exp(0.35) : 1;
    if (st.show[0]) dg = Math.max(dg, st.g[0] * (st.active === 0 ? top : 1));
    if (st.show[1]) dg = Math.max(dg, st.g[1] * (st.active === 1 ? top : 1));
    if (st.truth) dg = Math.max(dg, 1);
    return Math.max(dg, 0.2);
  }
  function goal() { return geom(mode, displayG()).fit; }

  function chip(c, b, text, on, side) {
    if (!on) { c.style.opacity = '0'; return; }
    c.style.opacity = '1';
    // текст меняем, только когда он другой: render крутится каждый кадр
    if (c._text !== text) { c._text = text; c.lastChild.textContent = text; }
    var x = side === 'right' ? b.x + b.w : b.x + b.w / 2;
    var y = Math.max(TOP + 4, b.y - 6);
    c.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px) translate(' + (side === 'right' ? '-100%' : '-50%') + ',-100%)';
  }

  function niceLen(x) {
    var p = Math.pow(10, Math.floor(Math.log(x) / Math.LN10));
    var n = x / p;
    return (n < 1.5 ? 1 : n < 3.5 ? 2 : n < 7.5 ? 5 : 10) * p;
  }

  function render() {
    if (!R) return;
    var dg = displayG();
    var o = geom(mode, dg, cam.s);
    var s = o.s;
    var b1, b2, bt;
    if (mode === 'bars') {
      var both = st.show[0] && st.show[1], half = Math.round((o.bw - 6) / 2), unit = R.ref.value * s, G = o.ground;
      var bar = function (x, w, h) { return { x: x, y: G - h, w: w, h: h }; };
      setBar(L.ref, bar(o.rx, o.bw, Math.max(3, unit)));
      // в дуэли после ответа столбики игроков стоят рядом в одном слоте
      b1 = bar(o.tx, both ? half : o.bw, R.target.value * gOf(0) * s);
      b2 = bar(both ? o.tx + o.bw - half : o.tx, both ? half : o.bw, R.target.value * gOf(1) * s);
      bt = bar(o.tx - 4, o.bw + 8, R.target.value * s);
      setBar(L.g1, b1, unit);
      setBar(L.g2, b2, unit);
      setBar(L.truth, bt);
      pic(L.pics.children[0], R.ref, o.rx + o.bw / 2, G + 8, o.bw);
      pic(L.pics.children[1], R.target, o.tx + o.bw / 2, G + 8, o.bw);
      tag(tags[0], o.rx + o.bw / 2, G + 12 + PIC_H);
      tag(tags[1], o.tx + o.bw / 2, G + 12 + PIC_H);
    } else {
      place(L.ref, R.ref, box(R.ref, o.ref, 1, s));
      b1 = box(R.target, o.anchor, gOf(0), s);
      b2 = box(R.target, o.anchor, gOf(1), s);
      bt = box(R.target, o.anchor, 1, s);
      place(L.g1, R.target, b1);
      place(L.g2, R.target, b2);
      place(L.truth, R.target, bt);
    }
    L.g1.wrap.style.display = st.show[0] ? '' : 'none';
    L.g2.wrap.style.display = st.show[1] ? '' : 'none';
    L.truth.wrap.style.display = st.truth ? '' : 'none';

    // желе: тянется и пружинит от якоря
    var w = U.clamp(wob.x, -0.14, 0.14);
    var act = st.active === 0 ? L.g1 : L.g2;
    var ba = st.active === 0 ? b1 : b2;
    var ax = ba.x + ba.w / 2, ay = R.kind === 'countries' ? ba.y + ba.h / 2 : ba.y + ba.h;
    L.g1.wrap.removeAttribute('transform');
    L.g2.wrap.removeAttribute('transform');
    if (Math.abs(w) > 0.002) {
      act.wrap.setAttribute('transform', 'translate(' + ax + ' ' + ay + ') scale(' + (1 - w * 0.6) + ' ' + (1 + w) + ') translate(' + (-ax) + ' ' + (-ay) + ')');
    }

    var grounds = '';
    o.grounds.forEach(function (y) { grounds += '<line x1="0" x2="' + W + '" y1="' + y + '" y2="' + y + '"/>'; });
    if (L.grounds._html !== grounds) { L.grounds.innerHTML = grounds; L.grounds._html = grounds; }

    chip(chips.v1, b1, fmtVal(R.target, value(R.target, gOf(0))), st.show[0], 'center');
    chip(chips.v2, b2, fmtVal(R.target, value(R.target, gOf(1))), st.show[1], 'center');
    chip(chips.vt, bt, fmtVal(R.target, R.target.value), st.truth, 'right');

    // линейка в мировых единицах (у столбиков цен её заменяют деления)
    if (mode === 'bars') return;
    var units = niceLen((W - PAD * 2) * 0.28 / s);
    ruler.style.width = (units * s).toFixed(1) + 'px';
    rulerTxt.textContent = R.kind === 'countries' ? U.fmtKm(units) : U.fmtLen(units);
  }

  // Столбик: прямоугольник и, у догадки, деления — по одной единице, а если тесно, по 2, 5, 10…
  // Каждая десятая линия жирнее: «40 мороженых» читаются как четыре десятка.
  function setBar(layer, b, unit) {
    var r = layer.shape.firstChild;
    r.setAttribute('x', b.x.toFixed(1));
    r.setAttribute('y', b.y.toFixed(1));
    r.setAttribute('width', b.w.toFixed(1));
    r.setAttribute('height', Math.max(0, b.h).toFixed(1));
    if (!unit) return;
    var step = 1, k = 0;
    while (step * unit < 7) { k++; step = [1, 2, 5][k % 3] * Math.pow(10, Math.floor(k / 3)); }
    var big = step < 10 ? 10 : step * 5, minor = '', major = '';
    for (var i = step; i * unit < b.h - 3; i += step) {
      var y = (b.y + b.h - i * unit).toFixed(1);
      var d = 'M' + (b.x + 4).toFixed(1) + ' ' + y + 'H' + (b.x + b.w - 4).toFixed(1);
      if (i % big === 0) major += d; else minor += d;
    }
    var p = layer.shape.querySelectorAll('path');
    p[0].setAttribute('d', minor);
    p[1].setAttribute('d', major);
  }

  // Картинка вещи под землёй — постоянного размера, по центру своего столбика
  function pic(g, item, cx, top, maxW) {
    var k = Math.min(maxW / item.vb[2], PIC_H / item.vb[3]);
    var t = 'translate(' + (cx - item.vb[2] * k / 2).toFixed(1) + ' ' + top.toFixed(1) + ') scale(' + k.toPrecision(4) + ')';
    if (g._t !== t) { g._t = t; g.setAttribute('transform', t); }
  }
  function tag(t, cx, top) {
    var tr = 'translate(' + cx.toFixed(1) + 'px,' + top.toFixed(1) + 'px) translateX(-50%)';
    if (t._t !== tr) { t._t = tr; t.style.transform = tr; }
  }

  function loop() {
    if (demo.on) {
      var sn = Math.sin((performance.now() - demo.t0) / 1000 * Math.PI * 2 / DEMO_PERIOD);
      demo.k = Math.exp(0.35 * sn);
      demo.hand.style.transform = 'translateY(' + (-sn * 38).toFixed(1) + 'px)';
    }
    var target = goal();
    cam.s += (target - cam.s) * 0.22;
    wob.v += -wob.x * 0.22;
    wob.v *= 0.78;
    wob.x += wob.v;
    render();
    var settled = Math.abs(target - cam.s) / target < 0.002 && Math.abs(wob.x) < 0.002 && Math.abs(wob.v) < 0.002;
    if (settled && !drag && !demo.on) { cam.s = target; wob.x = wob.v = 0; render(); cam.raf = 0; return; }
    cam.raf = requestAnimationFrame(loop);
  }
  function kick() { if (!cam.raf) cam.raf = requestAnimationFrame(loop); }

  function setG(p, g) {
    var v = U.clamp(g, G_MIN, G_MAX);
    var prev = st.g[p];
    st.g[p] = v;
    if (onChange && Math.floor(Math.log(prev) / 0.07) !== Math.floor(Math.log(v) / 0.07)) onChange(v);
    kick();
  }

  function setDemo(on) {
    if (demo.on === on || !el) return;
    if (!on && R) st.g[st.active] = gOf(st.active); // оставляем тот размер, который ребёнок видит
    demo.on = on;
    demo.k = 1;
    el.classList.toggle('demo', on);
    if (on) demo.t0 = performance.now();
    kick();
  }

  // Векторный силуэт красится стилями, картинка-файл — заранее перекрашенными слоями
  // Догадка рисуется в два слоя: толстая обводка снизу, заливка сверху —
  // так у континентов не видно внутренних границ стран, остаётся только внешний контур
  function shapeOf(item, which) {
    if (item.layers) return App.assets.layer(item, which);
    if (which === 'g1' || which === 'g2') return '<g class="ol">' + item.markup + '</g><g class="fl">' + item.markup + '</g>';
    return item.markup;
  }
  function picOf(item) { return '<g class="pic">' + (item.layers ? App.assets.layer(item, 'ref') : item.markup) + '</g>'; }

  function setRound(round, opts) {
    setDemo(false);
    R = round;
    measure();
    st.g = [opts.start, opts.start];
    st.show = [true, false];
    st.truth = false;
    st.active = 0;
    wob.x = wob.v = 0;
    var isBars = R.kind === 'prices';
    if (isBars) {
      L.ref.shape.innerHTML = '<rect class="pillar" rx="6"/>';
      L.g1.shape.innerHTML = L.g2.shape.innerHTML = '<rect class="pillar" rx="8"/><path class="tick"/><path class="tick major"/>';
      L.truth.shape.innerHTML = '<rect class="pillar" rx="10"/>';
      ['ref', 'g1', 'g2', 'truth'].forEach(function (k) { L[k].shape.removeAttribute('transform'); });
      L.pics.innerHTML = picOf(R.ref) + picOf(R.target);
      tags[0].textContent = U.fmt(R.ref.value) + ' ₽';
      tags[1].textContent = U.fmt(R.target.value) + ' ₽';
      tags[0]._t = tags[1]._t = '';
    } else {
      L.ref.shape.innerHTML = shapeOf(R.ref, 'ref');
      L.g1.shape.innerHTML = shapeOf(R.target, 'g1');
      L.g2.shape.innerHTML = shapeOf(R.target, 'g2');
      L.truth.shape.innerHTML = shapeOf(R.target, 'truth');
      L.pics.innerHTML = '';
    }
    L.truth.wrap.classList.remove('slam');
    el.classList.toggle('is-country', R.kind === 'countries');
    el.classList.toggle('is-price', isBars);
    if (isBars) mode = 'bars';
    else {
      var rowFit = geom('row', 1.3).fit, colFit = geom('col', 1.3).fit;
      // рост сравнивают на общей земле, длину — друг под другом от одного края
      var tall = R.kind !== 'countries' && R.target.dim === 'tall';
      mode = rowFit >= colFit * (tall ? 0.5 : 1) ? 'row' : 'col';
    }
    // легенда: цветной квадрат эталона, имя и настоящий размер (у цен цена — на ценниках внизу)
    chips.ref.children[1].textContent = R.ref.name;
    chips.ref.children[2].textContent = isBars ? 'эталон' : fmtVal(R.ref, R.ref.value) + (R.kind === 'countries' ? '' : ' ' + R.ref.dimText);
    cam.s = goal();
    render();
  }

  // Дуэль: какой игрок сейчас тянет и чьи силуэты видны
  function setTurn(p, visible) {
    setDemo(false);
    // плашка «Тянет Игрок N» меняет высоту доски — перемеряем, иначе низ обрезается
    if (R && (el.clientWidth !== W || el.clientHeight !== H)) { measure(); cam.s = goal(); }
    st.active = p;
    st.show = visible.slice();
    L.g1.wrap.classList.toggle('active', p === 0);
    L.g2.wrap.classList.toggle('active', p === 1);
    kick();
  }

  function reveal() {
    setDemo(false);
    st.drag = false;
    st.truth = true;
    L.truth.wrap.classList.remove('slam');
    void L.truth.wrap.getBoundingClientRect();
    L.truth.wrap.classList.add('slam');
    kick();
  }

  // точка на экране над правильным ответом — для салюта
  function truthPoint() {
    var r = L.truth.wrap.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  App.board = {
    init: init,
    setRound: setRound,
    setTurn: setTurn,
    reveal: reveal,
    truthPoint: truthPoint,
    enable: function (on) { st.drag = on; },
    getG: function (p) { return st.g[p]; },
    demo: setDemo,
    nudge: function (p, f) { setDemo(false); setG(p, st.g[p] * f); wob.v += f > 1 ? 0.04 : -0.04; },
    value: value,
    fmtVal: fmtVal
  };
})();
