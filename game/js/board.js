(function () {
  'use strict';
  var App = window.App;
  var U = App.util;

  // Доска раунда: чёрный эталон в истинном масштабе, белая догадка игрока
  // и (после фиксации) салатовый контур правильного ответа.
  // Камера сама подстраивает зум, чтобы всё помещалось на вертикальном экране.
  var PAD = 14, TOP = 46, BOTTOM = 40, LABEL = 36, GAP = 22;
  var K = Math.LN2 / 170;          // 170 px свайпа = размер ×2
  var G_MIN = 0.12, G_MAX = 8;

  var el, svg, L = {}, chips = {}, ruler, rulerTxt;
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
      '<div class="bgrid"></div>' +
      '<svg class="bsvg" xmlns="http://www.w3.org/2000/svg">' +
      '<g class="grounds"></g>' +
      '<g class="item ref"><g class="shape"></g></g>' +
      '<g class="item guess g1"><g class="shape"></g></g>' +
      '<g class="item guess g2"><g class="shape"></g></g>' +
      '<g class="item truth"><g class="shape"></g></g>' +
      '</svg>' +
      '<div class="chip-ref"></div>' +
      '<div class="vchip v1"></div><div class="vchip v2"></div><div class="vchip vt"></div>' +
      '<div class="ruler"><i></i><span></span></div>' +
      '<div class="swipe-demo" aria-hidden="true"><i>▲</i><span class="sd-hand">👆</span><i>▼</i></div>';
    svg = el.querySelector('.bsvg');
    ['ref', 'g1', 'g2', 'truth'].forEach(function (k) {
      var g = svg.querySelector(k === 'ref' ? '.ref' : k === 'truth' ? '.truth' : '.' + k);
      L[k] = { wrap: g, shape: g.querySelector('.shape') };
    });
    L.grounds = svg.querySelector('.grounds');
    chips.ref = el.querySelector('.chip-ref');
    chips.v1 = el.querySelector('.v1');
    chips.v2 = el.querySelector('.v2');
    chips.vt = el.querySelector('.vt');
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
  function fmtVal(item, v) { return item.kind === 'country' ? U.fmtArea(v) : U.fmtLen(v); }

  // Раскладка: «row» — рядом на одной земле, «col» — эталон сверху, догадка снизу
  function geom(m, dg, s) {
    var ax0 = PAD, ay0 = TOP + LABEL, aw = W - PAD * 2, ah = H - BOTTOM - ay0, ay1 = H - BOTTOM;
    var r = R.ref, t = R.target, country = R.kind === 'countries';
    var o = { m: m };
    if (m === 'row') {
      o.fit = Math.min((aw - GAP) / (r.w + t.w * dg), ah / Math.max(r.h, t.h * dg));
      if (s === undefined) s = o.fit;
      var total = (r.w + t.w * dg) * s + GAP;
      var x = ax0 + (aw - total) / 2;
      var cy = (ay0 + ay1) / 2;
      o.ref = country ? { cx: x + r.w * s / 2, cy: cy } : { left: x, bottom: ay1 };
      var left = x + r.w * s + GAP;
      o.anchor = country ? { cx: left + t.w * dg * s / 2, cy: cy } : { left: left, bottom: ay1 };
      o.grounds = country ? [] : [ay1];
    } else {
      o.fit = Math.min(aw / Math.max(r.w, t.w * dg), (ah - GAP - LABEL) / (r.h + t.h * dg));
      if (s === undefined) s = o.fit;
      var bw = Math.max(r.w, t.w * dg) * s;
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

  function box(item, pos, f, s) {
    var w = item.w * f * s, h = item.h * f * s;
    var x = pos.left !== undefined ? pos.left : pos.cx - w / 2;
    var y = pos.bottom !== undefined ? pos.bottom - h : pos.cy - h / 2;
    return { x: x, y: y, w: w, h: h };
  }

  function place(layer, item, b) {
    var k = b.w / item.vb[2];
    layer.shape.setAttribute('transform',
      'translate(' + b.x.toFixed(2) + ' ' + b.y.toFixed(2) + ') scale(' + k.toPrecision(5) + ') translate(' + (-item.vb[0]) + ' ' + (-item.vb[1]) + ')');
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
    c.textContent = text;
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
    place(L.ref, R.ref, box(R.ref, o.ref, 1, s));

    var b1 = box(R.target, o.anchor, gOf(0), s);
    var b2 = box(R.target, o.anchor, gOf(1), s);
    var bt = box(R.target, o.anchor, 1, s);
    place(L.g1, R.target, b1);
    place(L.g2, R.target, b2);
    place(L.truth, R.target, bt);
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
    chip(chips.vt, bt, '✓ ' + fmtVal(R.target, R.target.value), st.truth, 'right');

    // линейка в мировых единицах
    var units = niceLen((W - PAD * 2) * 0.28 / s);
    ruler.style.width = (units * s).toFixed(1) + 'px';
    rulerTxt.textContent = R.kind === 'countries' ? U.fmtKm(units) : U.fmtLen(units);
  }

  function loop() {
    if (demo.on) {
      var sn = Math.sin((performance.now() - demo.t0) / 1000 * Math.PI * 2 / DEMO_PERIOD);
      demo.k = Math.exp(0.35 * sn);
      demo.hand.style.transform = 'translateY(' + (-sn * 44).toFixed(1) + 'px)';
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
  function shapeOf(item, which) {
    return item.layers ? App.assets.layer(item, which) : item.markup;
  }

  function setRound(round, opts) {
    setDemo(false);
    R = round;
    measure();
    st.g = [opts.start, opts.start];
    st.show = [true, false];
    st.truth = false;
    st.active = 0;
    wob.x = wob.v = 0;
    L.ref.shape.innerHTML = shapeOf(R.ref, 'ref');
    L.g1.shape.innerHTML = shapeOf(R.target, 'g1');
    L.g2.shape.innerHTML = shapeOf(R.target, 'g2');
    L.truth.shape.innerHTML = shapeOf(R.target, 'truth');
    L.truth.wrap.classList.remove('slam');
    el.classList.toggle('is-country', R.kind === 'countries');
    var rowFit = geom('row', 1.3).fit, colFit = geom('col', 1.3).fit;
    // рост сравнивают на общей земле, длину — друг под другом от одного края
    var tall = R.kind === 'animals' && R.target.dim === 'tall';
    mode = rowFit >= colFit * (tall ? 0.5 : 1) ? 'row' : 'col';
    chips.ref.textContent = '⬛ ' + R.ref.name + ' · ' + fmtVal(R.ref, R.ref.value) + (R.kind === 'countries' ? '' : ' ' + R.ref.dimText);
    cam.s = goal();
    render();
  }

  // Дуэль: какой игрок сейчас тянет и чьи силуэты видны
  function setTurn(p, visible) {
    setDemo(false);
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
