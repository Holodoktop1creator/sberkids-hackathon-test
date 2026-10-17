(function () {
  'use strict';
  var App = window.App;
  var U = App.util;

  // Весь контент — файлы рядом с игрой (или на CDN), меняются без релиза:
  //   game.json      — правила, тексты, цвета, режимы, расписание событий
  //   animals.json   — звери с векторными силуэтами (собирается скриптом)
  //   countries.json — страны с контурами (собирается скриптом)
  //   items.json     — ручные добавления контент-менеджера: картинки PNG/SVG,
  //                    правки и скрытие любых объектов по id
  // Битые записи и картинки отбрасываются и попадают в errors, игра не падает.
  var DEFAULTS = {
    rounds: 8,
    boss: [4, 8],
    duelRounds: 5,
    timer: 20,
    ratio: { animals: [1.2, 15], countries: [1.3, 40] },
    traps: { animals: [], countries: [] },
    ranks: [
      { min: 100, text: 'ИДЕАЛЬНО! 🎯' }, { min: 85, text: 'ИМБА! 🔥' }, { min: 65, text: 'ХОРОШ! 😎' },
      { min: 40, text: 'ТЕПЛО 🙂' }, { min: 15, text: 'ХОЛОДНО 🥶' }, { min: 0, text: 'МИМО 😵‍💫' }
    ],
    titles: [{ min: 0, name: 'Прикидчик', emoji: '🧮' }],
    unlocks: [],
    tips: { animals: ['Считай эталонами: сколько раз чёрный силуэт поместится в белом?'], countries: ['Площадь растёт быстрее размера: вдвое шире — в 4 раза больше!'] },
    lessons: {},
    modes: { chaos: true, animals: true, countries: true, duel: true },
    theme: { animals: '#ffcf3d', countries: '#63e6ff' },
    texts: {
      tagline: 'Звери и страны. Растяни силуэт\nдо **настоящего** размера!',
      capy: ['Йо! Я Капи. Сколько капибар в ките? 🤔'],
      share: 'Сможешь прикинуть точнее? 😏',
      ask: { long: 'сколько в длину?', tail: 'сколько в длину с хвостом?', tall: 'сколько в высоту?', area: 'какая площадь?' }
    },
    events: []
  };
  var DIM = { long: 'в длину', tail: 'в длину с хвостом', tall: 'в высоту' };

  function isNum(v) { return typeof v === 'number' && isFinite(v) && v > 0; }
  function isStr(v) { return typeof v === 'string' && v.length > 0; }
  function isColor(v) { return typeof v === 'string' && /^#[0-9a-f]{3,8}$/i.test(v); }
  function isDate(v) { return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v); }

  function getJSON(url) {
    if (!window.fetch) return Promise.reject(new Error('no fetch'));
    return fetch(url, { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error(url + ': ' + r.status);
      return r.json();
    });
  }

  // Путь к картинке: относительно папки content, https-ссылка на CDN или data:image
  function imagePath(base, p) {
    if (!isStr(p)) return null;
    if (/^https:\/\//i.test(p) || /^data:image\//i.test(p)) return p;
    if (/^[a-z]+:/i.test(p) || p.indexOf('//') === 0 || p.indexOf('..') >= 0) return null;
    return base + p.replace(/^\.?\//, '');
  }

  // Звери и страны приводятся к одной модели: значение, мир-размер при g = 1, форма
  function animal(a, base) {
    if (!a || !isStr(a.id) || !isStr(a.name) || !isNum(a.size) || !DIM[a.dim]) return null;
    var axis = a.axis === 'h' || a.dim === 'tall' ? 'h' : 'w';
    var o = { kind: 'animal', id: a.id, name: a.name, fact: a.fact || '', value: a.size, dim: a.dim, dimText: DIM[a.dim], axis: axis };
    if (a.image !== undefined) {
      o.image = imagePath(base, a.image);
      return o.image ? o : null;
    }
    if (!Array.isArray(a.vb) || a.vb.length !== 4 || !isNum(a.vb[2]) || !isNum(a.vb[3]) || !isStr(a.svg)) return null;
    var aspect = a.vb[3] / a.vb[2];
    o.vb = a.vb;
    o.markup = a.svg;
    o.w = axis === 'h' ? a.size / aspect : a.size;
    o.h = axis === 'h' ? a.size : a.size * aspect;
    o.ready = true;
    return o;
  }

  function country(c, base) {
    if (!c || !isStr(c.id) || !isStr(c.name) || !isNum(c.area)) return null;
    var o = { kind: 'country', id: c.id, name: c.name, fact: c.fact || '', value: c.area, dimText: 'по площади' };
    if (c.image !== undefined) {
      o.image = imagePath(base, c.image);
      return o.image ? o : null;
    }
    if (!isNum(c.w) || !isNum(c.h) || !isNum(c.unitArea) || !isStr(c.d)) return null;
    var s = Math.sqrt(c.area / c.unitArea); // км на единицу контура
    o.vb = [0, 0, c.w, c.h];
    o.markup = '<path d="' + c.d.replace(/"/g, '') + '" fill-rule="evenodd"/>';
    o.w = c.w * s;
    o.h = c.h * s;
    o.ready = true;
    return o;
  }

  function today() {
    var d = new Date();
    function z(n) { return (n < 10 ? '0' : '') + n; }
    return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate());
  }

  // Конфиг: каждое поле проверяется, всё непонятное заменяется значением по умолчанию
  function config(raw) {
    var cfg = {};
    raw = raw && typeof raw === 'object' ? raw : {};
    Object.keys(DEFAULTS).forEach(function (k) {
      cfg[k] = raw[k] !== undefined && typeof raw[k] === typeof DEFAULTS[k] ? raw[k] : DEFAULTS[k];
    });
    if (!(cfg.rounds >= 3 && cfg.rounds <= 12)) cfg.rounds = DEFAULTS.rounds;
    if (!(cfg.duelRounds >= 3 && cfg.duelRounds <= 10)) cfg.duelRounds = DEFAULTS.duelRounds;
    if (!(cfg.timer >= 0 && cfg.timer <= 120)) cfg.timer = DEFAULTS.timer;
    ['modes', 'theme', 'texts'].forEach(function (k) {
      var merged = {};
      Object.keys(DEFAULTS[k]).forEach(function (f) {
        var v = cfg[k][f];
        var ok = k === 'theme' ? isColor(v) : typeof v === typeof DEFAULTS[k][f];
        merged[f] = ok ? v : DEFAULTS[k][f];
      });
      cfg[k] = merged;
    });
    cfg.events = Array.isArray(cfg.events) ? cfg.events.filter(function (e) {
      return e && isDate(e.from) && isDate(e.to) && isStr(e.title);
    }) : [];
    return cfg;
  }

  function activeEvent(cfg, date) {
    var d = date || today();
    for (var i = 0; i < cfg.events.length; i++) {
      var e = cfg.events[i];
      if (e.from <= d && d <= e.to) return e;
    }
    return null;
  }

  // base — папка контента ('content/' в игре), date — подменить «сегодня» для проверки событий
  function load(base, date) {
    base = base || 'content/';
    var errors = [];
    function safe(name) {
      return getJSON(base + name).catch(function (e) { errors.push('Файл ' + name + ' не загрузился (' + e.message + ')'); return null; });
    }
    return Promise.all([safe('game.json'), safe('animals.json'), safe('countries.json'), safe('items.json')]).then(function (res) {
      var cfg = config(res[0]);
      var extra = res[3] && typeof res[3] === 'object' ? res[3] : {};
      var hidden = Array.isArray(extra.hidden) ? extra.hidden : [];
      function build(list, fn, label) {
        var byId = {}, order = [];
        (list || []).forEach(function (raw) {
          var it = fn(raw, base);
          if (!it) { errors.push(label + ': запись с ошибкой — ' + (raw && raw.id ? raw.id : JSON.stringify(raw).slice(0, 60))); return; }
          if (!byId[it.id]) order.push(it.id);
          byId[it.id] = it; // запись из items.json заменяет одноимённую
        });
        return order.filter(function (id) { return hidden.indexOf(id) < 0; }).map(function (id) { return byId[id]; });
      }
      var animals = build((res[1] && res[1].animals || []).concat(extra.animals || []), animal, 'Звери');
      var countries = build((res[2] && res[2].countries || []).concat(extra.countries || []), country, 'Страны');
      var all = animals.concat(countries);
      return Promise.all(all.map(function (it) {
        if (it.ready) return null;
        return App.assets.prepare(it).catch(function (e) { errors.push(it.name + ': ' + e.message); });
      })).then(function () {
        var ok = function (it) { return it.ready; };
        var content = {
          cfg: cfg,
          pools: { animals: animals.filter(ok), countries: countries.filter(ok) },
          event: activeEvent(cfg, date),
          errors: errors
        };
        checkTraps(content);
        return content;
      });
    });
  }

  function byId(pool, id) {
    for (var i = 0; i < pool.length; i++) if (pool[i].id === id) return pool[i];
    return null;
  }

  function checkTraps(content) {
    var lists = [['пары-ловушки', content.cfg.traps]];
    if (content.event && content.event.traps) lists.push(['события «' + content.event.title + '»', content.event.traps]);
    lists.forEach(function (l) {
      ['animals', 'countries'].forEach(function (kind) {
        (l[1][kind] || []).forEach(function (p) {
          if (!byId(content.pools[kind], p[0]) || !byId(content.pools[kind], p[1])) {
            content.errors.push('В списке ' + l[0] + ' нет объекта: ' + p.join(' / '));
          }
        });
      });
    });
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

  function trapPair(content, kind, usedTargets, preferEvent) {
    var pool = content.pools[kind];
    var ev = content.event && content.event.traps ? content.event.traps[kind] || [] : [];
    var list = U.shuffle(preferEvent ? ev : []).concat(U.shuffle(content.cfg.traps[kind] || []), U.shuffle(ev));
    for (var i = 0; i < list.length; i++) {
      var t = byId(pool, list[i][0]), r = byId(pool, list[i][1]);
      if (t && r && !usedTargets[t.id]) return { target: t, ref: r, trap: true };
    }
    return null;
  }

  // Набор раундов. mode: animals | countries | chaos.
  // Во время события босс-раунды берутся из его пар.
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
      var p = (isBoss || Math.random() < 0.35) ? trapPair(content, kind, used, isBoss) : null;
      if (!p) p = randomPair(content.pools[kind], content.cfg.ratio[kind] || [1.2, 15], used);
      if (!p) p = trapPair(content, kind, used, false);
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

  // Текст из конфига: **жирный** и переносы строк, всё остальное экранируется
  function rich(text) {
    return String(text).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; })
      .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>');
  }

  App.content = { load: load, makeRun: makeRun, rematch: rematch, rich: rich, DIM: DIM };
})();
