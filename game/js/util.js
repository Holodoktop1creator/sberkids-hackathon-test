(function () {
  'use strict';
  var App = window.App = window.App || {};

  function fmt(n) {
    var s = String(Math.round(n));
    return s.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  }

  // plural(5, ['неделя', 'недели', 'недель']) → 'недель'
  function plural(n, forms) {
    n = Math.abs(Math.round(n));
    var m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return forms[0];
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return forms[1];
    return forms[2];
  }

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function store(key, val) {
    try {
      if (val === undefined) return sessionStorage.getItem(key);
      sessionStorage.setItem(key, val);
    } catch (e) { /* хранилище может быть недоступно */ }
    return null;
  }

  // 1,6 — десятичная запятая, без лишних нулей
  function dec(n, digits) {
    var s = n.toFixed(digits);
    if (s.indexOf('.') >= 0) s = s.replace(/0+$/, '').replace(/\.$/, '');
    return s.replace('.', ',');
  }

  function fmtLen(m) {
    if (m < 0.1) return dec(m * 100, 1) + ' см';
    if (m < 1) return Math.round(m * 100) + ' см';
    if (m < 10) return dec(m, 1) + ' м';
    return fmt(m) + ' м';
  }

  function fmtArea(km2) {
    if (km2 >= 1e6) return dec(km2 / 1e6, km2 >= 1e7 ? 1 : 2) + ' млн км²';
    if (km2 >= 1e3) return fmt(km2 / 1e3) + ' тыс. км²';
    return fmt(km2) + ' км²';
  }

  function fmtKm(km) {
    return km >= 1 ? fmt(km) + ' км' : Math.round(km * 1000) + ' м';
  }

  // во сколько раз: 1,6 · 14 · 2,5
  function fmtRatio(r) {
    return r >= 10 ? fmt(r) : dec(r, 1);
  }

  App.util = {
    fmt: fmt, plural: plural, clamp: clamp, rand: rand, pick: pick, shuffle: shuffle, easeOut: easeOut,
    wait: wait, store: store, dec: dec, fmtLen: fmtLen, fmtArea: fmtArea, fmtKm: fmtKm, fmtRatio: fmtRatio
  };
})();
