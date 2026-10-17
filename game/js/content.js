(function () {
  'use strict';
  var App = window.App;
  var U = App.util;

  // Контент — это данные рядом с игрой (или на CDN): game.json, animals.json,
  // countries.json. Меняется без релиза. Битые записи отбрасываются, а если
  // какой-то файл не загрузился, игра работает с тем, что есть.
  var DEFAULTS = {
    rounds: 8,
    boss: [4, 8],
    duelRounds: 5,
    stopwatch: false,
    ratio: { animals: [1.2, 15], countries: [1.3, 40] },
    traps: { animals: [], countries: [] },
    ranks: [
      { min: 100, text: 'ИДЕАЛЬНО! 🎯' }, { min: 85, text: 'ИМБА! 🔥' }, { min: 65, text: 'ХОРОШ! 😎' },
      { min: 40, text: 'ТЕПЛО 🙂' }, { min: 15, text: 'ХОЛОДНО 🥶' }, { min: 0, text: 'МИМО 😵‍💫' }
    ],
    titles: [{ min: 0, name: 'Прикидчик', emoji: '🧮' }],
    unlocks: [],
    tips: { animals: ['Считай эталонами: сколько раз чёрный силуэт поместится в белом?'], countries: ['Площадь растёт быстрее размера: вдвое шире — в 4 раза больше!'] },
    lessons: {}
  };
  var DIM = { long: 'в длину', tail: 'в длину с хвостом', tall: 'в высоту' };

  function isNum(v) { return typeof v === 'number' && isFinite(v) && v > 0; }
  function isStr(v) { return typeof v === 'string' && v.length > 0; }

  function getJSON(url) {
    if (!window.fetch) return Promise.reject(new Error('no fetch'));
    return fetch(url, { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error(r.status);
      return r.json();
    });
  }

  // Приводим зверей и страны к одной модели: значение, мир-размер при g = 1, форма
  function animal(a) {
    if (!a || !isStr(a.id) || !isStr(a.name) || !isNum(a.size) || !DIM[a.dim]) return null;
    if (!Array.isArray(a.vb) || a.vb.length !== 4 || !isNum(a.vb[2]) || !isNum(a.vb[3]) || !isStr(a.svg)) return null;
    var aspect = a.vb[3] / a.vb[2];
    var byH = a.axis === 'h';
    return {
      kind: 'animal', id: a.id, name: a.name, fact: a.fact || '', value: a.size, dim: a.dim,
      dimText: DIM[a.dim], vb: a.vb, markup: a.svg,
      w: byH ? a.size / aspect : a.size, h: byH ? a.size : a.size * aspect
    };
  }

  function country(c) {
    if (!c || !isStr(c.id) || !isStr(c.name) || !isNum(c.area) || !isNum(c.w) || !isNum(c.h) || !isNum(c.unitArea) || !isStr(c.d)) return null;
    var s = Math.sqrt(c.area / c.unitArea); // км на единицу контура
    return {
      kind: 'country', id: c.id, name: c.name, fact: c.fact || '', value: c.area,
      dimText: 'по площади', vb: [0, 0, c.w, c.h],
      markup: '<path d="' + c.d.replace(/"/g, '') + '" fill-rule="evenodd"/>',
      w: c.w * s, h: c.h * s
    };
  }

  function load() {
    function safe(p) { return p.catch(function () { return null; }); }
    return Promise.all([
      safe(getJSON('content/game.json')),
      safe(getJSON('content/animals.json')),
      safe(getJSON('content/countries.json'))
    ]).then(function (res) {
      var cfg = {};
      var raw = res[0] && typeof res[0] === 'object' ? res[0] : {};
      Object.keys(DEFAULTS).forEach(function (k) {
        cfg[k] = raw[k] !== undefined && typeof raw[k] === typeof DEFAULTS[k] ? raw[k] : DEFAULTS[k];
      });
      if (!(cfg.rounds >= 3 && cfg.rounds <= 12)) cfg.rounds = DEFAULTS.rounds;
      if (!(cfg.duelRounds >= 3 && cfg.duelRounds <= 10)) cfg.duelRounds = DEFAULTS.duelRounds;
      var animals = res[1] && Array.isArray(res[1].animals) ? res[1].animals.map(animal).filter(Boolean) : [];
      var countries = res[2] && Array.isArray(res[2].countries) ? res[2].countries.map(country).filter(Boolean) : [];
      return { cfg: cfg, pools: { animals: animals, countries: countries } };
    });
  }

  function byId(pool, id) {
    for (var i = 0; i < pool.length; i++) if (pool[i].id === id) return pool[i];
    return null;
  }

  // Случайная пара, где цель больше или меньше эталона в разумное число раз
  function randomPair(pool, range, usedTargets, target) {
    var lo = range[0], hi = range[1];
    var targets = target ? [target] : U.shuffle(pool.filter(function (x) { return !usedTargets[x.id]; }));
    for (var i = 0; i < targets.length; i++) {
      var t = targets[i];
      var refs = pool.filter(function (r) {
        if (r.id === t.id) return false;
        var k = t.value > r.value ? t.value / r.value : r.value / t.value;
        return k >= lo && k <= hi;
      });
      if (refs.length) return { target: t, ref: U.pick(refs) };
    }
    return null;
  }

  function trapPair(content, kind, usedTargets) {
    var pool = content.pools[kind];
    var list = U.shuffle(content.cfg.traps[kind] || []);
    for (var i = 0; i < list.length; i++) {
      var t = byId(pool, list[i][0]), r = byId(pool, list[i][1]);
      if (t && r && !usedTargets[t.id]) return { target: t, ref: r, trap: true };
    }
    return null;
  }

  // Набор раундов. mode: animals | countries | chaos
  function makeRun(content, mode, n, boss) {
    var kinds = [];
    var has = { animals: content.pools.animals.length >= 4, countries: content.pools.countries.length >= 4 };
    if (mode === 'chaos' && has.animals && has.countries) {
      for (var i = 0; i < n; i++) kinds.push(i % 2 ? 'countries' : 'animals');
      kinds = U.shuffle(kinds);
    } else {
      var only = mode === 'countries' && has.countries ? 'countries' : has.animals ? 'animals' : 'countries';
      for (var j = 0; j < n; j++) kinds.push(only);
    }
    var used = {};
    var out = [];
    kinds.forEach(function (kind, idx) {
      var isBoss = (boss || []).indexOf(idx + 1) >= 0;
      var p = (isBoss || Math.random() < 0.35) ? trapPair(content, kind, used) : null;
      if (!p) p = randomPair(content.pools[kind], content.cfg.ratio[kind] || [1.2, 15], used);
      if (!p) p = trapPair(content, kind, used);
      if (!p) return;
      used[p.target.id] = true;
      p.kind = kind;
      p.boss = isBoss;
      out.push(p);
    });
    return out;
  }

  // Реванш: та же цель, но другой эталон
  function rematch(content, round) {
    var pool = content.pools[round.kind];
    var p = null;
    for (var i = 0; i < 6 && (!p || p.ref.id === round.ref.id); i++) {
      p = randomPair(pool, content.cfg.ratio[round.kind] || [1.2, 15], {}, round.target);
    }
    if (!p || p.ref.id === round.ref.id) return null;
    p.kind = round.kind;
    p.rematch = true;
    return p;
  }

  App.content = { load: load, makeRun: makeRun, rematch: rematch };
})();
