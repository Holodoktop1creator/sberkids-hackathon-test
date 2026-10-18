(function () {
  'use strict';
  var App = window.App;
  var U = App.util;

  // Весь контент — файлы рядом с игрой (или на CDN), меняются без релиза:
  //   game.json      — правила, тексты, цвета, режимы, расписание событий
  //   animals.json   — звери с векторными силуэтами (собирается скриптом)
  //   countries.json — страны с контурами (собирается скриптом)
  //   items.json     — ручные добавления контент-менеджера: картинки PNG/SVG,
  //                    вещи с ценами для режима «Цены», правки и скрытие любых объектов по id
  // Битые записи и картинки отбрасываются и попадают в errors, игра не падает.
  var DEFAULTS = {
    rounds: 8,
    boss: [4, 8],
    duelRounds: 5,
    ratio: { animals: [1.2, 15], countries: [1.3, 40], prices: [3, 50] },
    traps: { animals: [], countries: [], prices: [] },
    ranks: [
      { min: 100, text: 'В точку' }, { min: 85, text: 'Отлично' }, { min: 65, text: 'Хорошо' },
      { min: 40, text: 'Тепло' }, { min: 15, text: 'Холодно' }, { min: 0, text: 'Мимо' }
    ],
    titles: [{ min: 0, name: 'Прикидчик' }],
    unlocks: [],
    lessons: {},
    modes: { chaos: true, animals: true, countries: true, prices: true, duel: true },
    // «Сколько раз помещается»: ряд значков меньшего предмета в разборе раунда
    units: { show: true, max: 20 },
    theme: { animals: '#ffe9c4', countries: '#dcefff', prices: '#ffe4f1' },
    texts: {
      tagline: 'Фейк или правда? Растяни силуэт\nдо **настоящего** размера.',
      capy: ['Я Капи. Проверяю громкие заявления.'],
      share: 'Сможешь прикинуть точнее?',
      ask: { long: 'сколько в длину?', tail: 'сколько в длину с хвостом?', tall: 'сколько в высоту?', area: 'какая площадь?' }
    },
    events: []
  };
  var DIM = { long: 'в длину', tail: 'в длину с хвостом', tall: 'в высоту', diam: 'в диаметре' };
  var KINDS = ['animals', 'countries', 'prices'];

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

  // Вещь с ценой для режима «Цены»: цель (самокат, смартфон) или понятная единица (мороженое, пицца).
  // У единицы есть perWeek — сколько раз в неделю её обычно покупают: отсюда «сколько копить».
  // forms — как считать: «1 мороженое · 2 мороженых · 5 мороженых»; нет — подберутся сами.
  function priceItem(p, base) {
    if (!p || !isStr(p.id) || !isStr(p.name) || !isNum(p.price)) return null;
    var o = { kind: 'price', id: p.id, name: p.name, fact: p.fact || '', value: p.price, dimText: '' };
    var f = Array.isArray(p.forms) && p.forms.length === 3 && p.forms.every(isStr) ? p.forms : null;
    o.forms = f ? f.map(function (x) { return x.trim(); }) : autoForms(p.name);
    if (isNum(p.perWeek)) {
      o.perWeek = p.perWeek;
      o.without = isStr(p.without) ? p.without.trim() : '';
    }
    o.image = imagePath(base, p.image);
    return o.image ? o : null;
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
    ['modes', 'theme', 'texts', 'units'].forEach(function (k) {
      var merged = {};
      Object.keys(DEFAULTS[k]).forEach(function (f) {
        var v = cfg[k][f];
        var ok = k === 'theme' ? isColor(v) : typeof v === typeof DEFAULTS[k][f];
        merged[f] = ok ? v : DEFAULTS[k][f];
      });
      cfg[k] = merged;
    });
    if (!(cfg.units.max >= 5 && cfg.units.max <= 40)) cfg.units.max = DEFAULTS.units.max;
    cfg.events = Array.isArray(cfg.events) ? cfg.events.filter(function (e) {
      return e && isDate(e.from) && isDate(e.to) && isStr(e.title);
    }) : [];
    return cleanTexts(cfg);
  }

  // Тексты для показа: без эмодзи (у игры свои иконки) и без битых записей.
  // Исходные объекты не трогаем — в редакторе это живой черновик менеджера.
  function cleanTexts(cfg) {
    var P = U.plain;
    function obj(x) { return x && typeof x === 'object'; }
    function copy(o, patch) {
      var c = {};
      Object.keys(o).forEach(function (k) { c[k] = o[k]; });
      Object.keys(patch).forEach(function (k) { c[k] = patch[k]; });
      return c;
    }
    var ranks = cfg.ranks.filter(obj).map(function (r) { return copy(r, { text: P(r.text) }); });
    var titles = cfg.titles.filter(obj).map(function (t) { return copy(t, { name: P(t.name) }); });
    cfg.ranks = ranks.length ? ranks : DEFAULTS.ranks;
    cfg.titles = titles.length ? titles : DEFAULTS.titles;
    cfg.unlocks = cfg.unlocks.filter(obj).map(function (u) { return copy(u, { label: P(u.label) }); });
    var lessons = {};
    Object.keys(cfg.lessons).forEach(function (k) { if (isStr(cfg.lessons[k])) lessons[k] = P(cfg.lessons[k]); });
    cfg.lessons = lessons;
    cfg.texts = copy(cfg.texts, {
      tagline: P(cfg.texts.tagline),
      share: P(cfg.texts.share),
      capy: Array.isArray(cfg.texts.capy) ? cfg.texts.capy.filter(isStr).map(P).filter(isStr) : []
    });
    cfg.events = cfg.events.map(function (e) {
      return copy(e, { title: P(e.title), text: isStr(e.text) ? P(e.text) : '' });
    });
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

  // Черновик контент-менеджера: страница tools/content.html кладёт его в браузер,
  // а игра, открытая с ?draft, берёт его вместо файлов — чтобы увидеть правки до выкладки
  var DRAFT_KEY = 'prikin.draft';
  function readDraft() {
    if (!/[?&]draft\b/.test(location.search)) return null;
    try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); } catch (e) { return null; }
  }

  // Поправки к любому объекту по id (items.json → edits): большие файлы с силуэтами не трогаем
  var EDITABLE = ['name', 'fact', 'size', 'area', 'dim'];
  function withEdits(raw, edits) {
    var e = raw && edits[raw.id];
    if (!e || typeof e !== 'object') return raw;
    var o = {};
    Object.keys(raw).forEach(function (k) { o[k] = raw[k]; });
    EDITABLE.forEach(function (f) { if (e[f] !== undefined) o[f] = e[f]; });
    return o;
  }

  // Откуда игра берёт контент: по умолчанию папка content рядом с игрой. Если игру хостит
  // приложение, а актуальные конфиги лежат на CDN, адрес папки задаётся в index.html:
  // <meta name="prikin-content" content="https://cdn…/content/"> — CDN должен отдавать CORS
  function contentBase() {
    var m = document.querySelector('meta[name="prikin-content"]');
    var v = m ? (m.getAttribute('content') || '').trim() : '';
    return /^(https:\/\/[^\s"'<>]+|[\w.\-\/]+)\/$/.test(v) ? v : 'content/';
  }

  // base — папка контента ('content/' в игре), date — подменить «сегодня» для проверки событий,
  // override — { game, items, claims }: подставить эти данные вместо файлов (черновик)
  function load(base, date, override) {
    base = base || contentBase();
    override = override || readDraft();
    var errors = [];
    function safe(name) {
      return getJSON(base + name).catch(function (e) { errors.push('Файл ' + name + ' не загрузился (' + e.message + ')'); return null; });
    }
    function pick(name, key) { return override && override[key] ? Promise.resolve(override[key]) : safe(name); }
    return Promise.all([pick('game.json', 'game'), safe('animals.json'), safe('countries.json'), pick('items.json', 'items'), pick('claims.json', 'claims')]).then(function (res) {
      var cfg = config(res[0]);
      var extra = res[3] && typeof res[3] === 'object' ? res[3] : {};
      var hidden = Array.isArray(extra.hidden) ? extra.hidden : [];
      var edits = extra.edits && typeof extra.edits === 'object' ? extra.edits : {};
      function build(list, fn, label) {
        var byId = {}, order = [];
        (list || []).forEach(function (raw) {
          var it = fn(withEdits(raw, edits), base);
          if (!it) { errors.push(label + ': запись с ошибкой — ' + (raw && raw.id ? raw.id : JSON.stringify(raw).slice(0, 60))); return; }
          if (!byId[it.id]) order.push(it.id);
          byId[it.id] = it; // запись из items.json заменяет одноимённую
        });
        return order.filter(function (id) { return hidden.indexOf(id) < 0; }).map(function (id) { return byId[id]; });
      }
      var animals = build((res[1] && res[1].animals || []).concat(extra.animals || []), animal, 'Звери');
      var countries = build((res[2] && res[2].countries || []).concat(extra.countries || []), country, 'Страны');
      // цены: вещи и понятные единицы (мороженое, пицца…), столбики к ним игра строит сама
      var prices = build(Array.isArray(extra.prices) ? extra.prices : [], priceItem, 'Цены');
      var all = animals.concat(countries, prices);
      return Promise.all(all.map(function (it) {
        if (it.ready) return null;
        return App.assets.prepare(it).catch(function (e) { errors.push(it.name + ': ' + e.message); });
      })).then(function () {
        var ok = function (it) { return it.ready; };
        var content = {
          cfg: cfg,
          pools: { animals: animals.filter(ok), countries: countries.filter(ok), prices: prices.filter(ok) },
          event: activeEvent(cfg, date),
          errors: errors,
          // убранные менеджером объекты: всё, что на них ссылается, отключается вместе с ними
          hidden: hidden,
          off: [],
          draft: !!override
        };
        checkTraps(content);
        content.claims = buildClaims(res[4], content);
        return content;
      });
    });
  }

  function byId(pool, id) {
    for (var i = 0; i < pool.length; i++) if (pool[i].id === id) return pool[i];
    return null;
  }

  // Диапазон «во сколько раз» для случайных пар темы
  function range(content, kind) {
    var r = content.cfg.ratio && content.cfg.ratio[kind];
    return Array.isArray(r) && isNum(r[0]) && isNum(r[1]) && r[0] <= r[1] ? r : DEFAULTS.ratio[kind];
  }

  // Ссылка на объект, который менеджер убрал из игры, — не ошибка: запись отключена вместе с ним
  // и вернётся, когда объект вернут
  function isOff(content, ids) {
    return ids.length > 0 && ids.every(function (id) { return content.hidden.indexOf(id) >= 0; });
  }

  function checkTraps(content) {
    var lists = [['пары-ловушки', content.cfg.traps]];
    if (content.event && content.event.traps) lists.push(['события «' + content.event.title + '»', content.event.traps]);
    lists.forEach(function (l) {
      KINDS.forEach(function (kind) {
        (l[1][kind] || []).forEach(function (p) {
          var miss = [p[0], p[1]].filter(function (id) { return !byId(content.pools[kind], id); });
          if (!miss.length) return;
          if (isOff(content, miss)) content.off.push({ type: 'trap', uid: l[0] + ':' + p.join('/'), ids: miss });
          else content.errors.push('В списке ' + l[0] + ' нет объекта: ' + p.join(' / '));
        });
      });
    });
  }

  // ---------- Заявления «Детектора фейков» ----------
  // Источник заявления: подпись поста. Иконку к ключу рисует игра (game.js → SRC_ICON)
  var SOURCES = {
    social: 'В соцсетях пишут', movie: 'В кино показывают', photo: 'Вирусное фото',
    map: 'На обычной карте', rumor: 'Говорят', cartoon: 'В мультиках', think: 'Многие думают',
    ad: 'Реклама', friend: 'Говорит друг'
  };
  var TRUE_RANGE = Math.log(1.06);

  // says — во сколько раз цель больше эталона «по словам» заявления (в ценах — сколько эталонов стоит цель).
  // Отсюда стартовый размер лаймового силуэта или столбика: ребёнок видит ровно то, что обещает фейк.
  function makeClaim(t, r, says, source, text, why, sources) {
    var k = says * r.value / t.value;
    var g0 = t.kind === 'country' ? Math.sqrt(k) : k;
    var key = isStr(source) && (SOURCES[source] || (sources && isStr(sources[source]))) ? source : 'rumor';
    return {
      target: t, ref: r, says: says, text: text, why: why || '',
      source: U.plain((sources && isStr(sources[key]) && sources[key]) || SOURCES[key]) || SOURCES.rumor, srcKey: key,
      g0: U.clamp(g0, 1 / 40, 40), isTrue: Math.abs(Math.log(g0)) <= TRUE_RANGE
    };
  }

  function buildClaims(raw, content) {
    var out = { animals: [], countries: [], prices: [] };
    if (!raw || !Array.isArray(raw.claims)) return out;
    var sources = raw.sources && typeof raw.sources === 'object' ? raw.sources : {};
    raw.claims.forEach(function (c, i) {
      var kind = null, t = null, r = null;
      KINDS.forEach(function (k) {
        var a = byId(content.pools[k], c && c.target), b = byId(content.pools[k], c && c.ref);
        if (a && b && a !== b) { kind = k; t = a; r = b; }
      });
      if (!kind || !isNum(c.says) || !isStr(c.text)) {
        var gone = c ? [c.target, c.ref].filter(function (id) { return content.hidden.indexOf(id) >= 0; }) : [];
        if (gone.length) { content.off.push({ type: 'claim', uid: 'c' + i, ids: gone }); return; }
        content.errors.push('Заявление №' + (i + 1) + ' с ошибкой: ' + (c && c.text ? c.text : JSON.stringify(c).slice(0, 60)));
        return;
      }
      var cl = makeClaim(t, r, c.says, c.source, c.text, c.why, sources);
      cl.uid = 'c' + i;
      out[kind].push(cl);
    });
    return out;
  }

  function razWord(x) {
    if (U.fmtRatio(x).indexOf(',') >= 0) return 'раза';
    return U.plural(Math.round(x), ['раз', 'раза', 'раз']);
  }
  function lowerName(it) { return it.kind === 'country' ? it.name : it.name.charAt(0).toLowerCase() + it.name.slice(1); }

  // Текст «X в N раз больше, чем Y» с округлённым числом — им пишет заявления игра,
  // и им же редактор пишет заявление для нового объекта. В ценах — «X стоит как N мороженых».
  function sayText(t, r, says) {
    if (t.kind === 'price') {
      // про цены говорят круглыми числами: «как 3 пиццы», а не «как 3,4 пиццы»
      var n = says >= 2 ? Math.round(says) : roundCount(says);
      return { says: n, text: t.name + ' ' + costs(t) + ' как ' + countText(n, r) + '.' };
    }
    var area = t.kind === 'country';
    var bigger = says >= 1;
    var x = bigger ? says : 1 / says;
    x = x >= 10 ? Math.round(x) : Math.round(x * 10) / 10;
    var text = x === 1
      ? t.name + ' и ' + lowerName(r) + (area ? ' одинаковые по площади.' : ' — одного размера.')
      : t.name + (area ? ' по площади' : '') + ' в ' + U.fmtRatio(x) + ' ' + razWord(x) + (bigger ? ' больше' : ' меньше') + ', чем ' + lowerName(r) + '.';
    return { says: bigger ? x : 1 / x, text: text };
  }

  // Заявление для любой пары: иногда правда, чаще враньё в 1,6–2,6 раза.
  // Про цены врут чаще в меньшую сторону — так покупка кажется пустяком.
  function autoClaim(p, kind, forceFake) {
    var t = p.target, r = p.ref;
    var k = t.value / r.value;
    var isTrue = !forceFake && Math.random() < 0.25;
    var says = k;
    if (!isTrue) {
      var down = Math.random() < (kind === 'prices' ? 0.7 : 0.5);
      var lin = down ? U.rand(0.4, 0.62) : U.rand(1.6, 2.6);
      says = k * (kind === 'countries' ? lin * lin : lin);
    }
    var s = sayText(t, r, says);
    var src = kind === 'prices' ? U.pick(['ad', 'friend', 'rumor', 'think']) : 'rumor';
    return makeClaim(t, r, s.says, src, s.text, '');
  }

  // ---------- Цены: «сколько это мороженых» ----------
  // Как считать единицу, если менеджер не написал сам: прилагательные впереди — «летних»,
  // «воздушных», дальше главное слово по окончанию, остальное без изменений («билетов в кино»)
  function autoForms(name) {
    var words = String(name).toLowerCase().trim().split(/\s+/), adj = [];
    while (words.length > 1 && /(ый|ий|ой|ая|яя|ое|ее)$/.test(words[0])) {
      var w = words.shift(), st = w.slice(0, -2);
      adj.push([w, st + (/[гкхжчшщ]$/.test(st) || /(ий|яя|ее)$/.test(w) ? 'их' : 'ых')]);
    }
    var f = nounForms(words.shift() || ''), rest = words.length ? ' ' + words.join(' ') : '';
    return [0, 1, 2].map(function (i) {
      return adj.map(function (x) { return i ? x[1] : x[0]; }).concat(f[i]).join(' ') + rest;
    });
  }
  function nounForms(a) {
    var s = a.slice(0, -1), s2 = a.slice(0, -2), f;
    if (/(ое|ее)$/.test(a)) f = [a, s2 + 'ых', s2 + 'ых'];                                          // мороженое
    else if (/[^аеёиоуыэюя]ка$/.test(a)) f = [a, s + 'и', s2 + (/[жчшщ]ка$/.test(a) ? 'е' : 'о') + 'к']; // булочка, шоколадка
    else if (/[гкхжчшщ]а$/.test(a)) f = [a, s + 'и', s];                                             // книга
    else if (/а$/.test(a)) f = [a, s + 'ы', s];                                                      // пицца
    else if (/я$/.test(a)) f = [a, s + 'и', s + 'ь'];                                                // неделя
    else if (/ь$/.test(a)) f = [a, s + 'я', s + 'ей'];                                               // рубль
    else if (/й$/.test(a)) f = [a, s + 'я', s + 'ев'];                                               // музей
    else if (/[жчшщ]$/.test(a)) f = [a, a + 'а', a + 'ей'];                                          // мяч
    else if (/[аеёиоуыэюя]$/.test(a)) f = [a, a, a];                                                  // кино, кофе
    else f = [a, a + 'а', a + 'ов'];                                                                 // самокат, билет
    return f;
  }

  // «40 мороженых», «2,5 смартфона»: от 10 — целое число, меньше — с одним знаком
  function roundCount(n) { return n >= 10 ? Math.round(n) : Math.round(n * 10) / 10; }
  function countText(n, unit) {
    var r = roundCount(n);
    return U.fmtRatio(r) + ' ' + (r % 1 ? unit.forms[1] : U.plural(r, unit.forms));
  }
  // «Самокат стоит», «Наушники стоят»
  function costs(t) { return /[иы]$/.test(t.name.split(' ')[0]) ? 'стоят' : 'стоит'; }
  // «не покупать мороженое / булочку / пиццу»
  function accName(it) {
    var w = it.name.charAt(0).toLowerCase() + it.name.slice(1);
    return w.replace(/^(\S+?)(ая|яя|а|я)(?=\s|$)/, function (m, stem, end) {
      return stem + { 'ая': 'ую', 'яя': 'юю', 'а': 'у', 'я': 'ю' }[end];
    });
  }
  // Как часто покупают единицу: 5 → «каждый будний день», 1 → «раз в неделю»
  function often(pw) {
    if (pw >= 6.5) return 'каждый день';
    if (pw === 5) return 'каждый будний день';
    if (pw >= 1.5) { var n = Math.round(pw); return n + ' ' + U.plural(n, ['раз', 'раза', 'раз']) + ' в неделю'; }
    if (pw >= 0.75) return 'раз в неделю';
    if (pw >= 0.4) return 'раз в две недели';
    if (pw >= 0.2) return 'раз в месяц';
    var w = Math.round(1 / pw);
    return 'раз в ' + w + ' ' + U.plural(w, ['неделю', 'недели', 'недель']);
  }
  // Сколько копить: точно — в неделях («8 недель»), по-человечески — «почти 2 месяца», «1,5 года»
  function weeksText(w) {
    if (w < 1) { var d = Math.max(1, Math.round(w * 7)); return d + ' ' + U.plural(d, ['день', 'дня', 'дней']); }
    var n = Math.round(w);
    return n + ' ' + U.plural(n, ['неделя', 'недели', 'недель']);
  }
  function waitText(w) {
    if (w < 7) return weeksText(w);
    var big = w < 48, v = big ? w / 4.345 : w / 52.18;
    var r = v < 3 ? Math.round(v * 2) / 2 : Math.round(v);
    var forms = big ? ['месяц', 'месяца', 'месяцев'] : ['год', 'года', 'лет'];
    var almost = r > v * 1.04, more = r < v * 0.96;
    // «почти 2 месяца», но «больше 5 месяцев», «больше года»
    var word = r % 1 || (more && r === 1) ? forms[1] : more ? forms[2] : U.plural(r, forms);
    return (almost ? 'почти ' : more ? 'больше ' : '') + (r === 1 ? '' : U.dec(r, 1) + ' ') + word;
  }
  // Что увидит ребёнок после ответа: «= почти 2 месяца без мороженого» и как это посчитать
  function saving(t, unit) {
    if (!unit.perWeek) return null;
    var n = roundCount(t.value / unit.value), w = n / unit.perWeek;
    var long = waitText(w), exact = weeksText(w);
    return {
      line: '= ' + long + (unit.without ? ' ' + unit.without : ' копить'),
      text: countText(n, unit) + ' — это ' + exact + (long.replace(/^(почти|больше) /, '') !== exact ? ' (' + long + ')' : '') +
        ' копить, если не покупать ' + accName(unit) + ' ' + often(unit.perWeek) + '.'
    };
  }

  // Пара для цен: вещь дороже понятной единицы (мороженого, пиццы)
  function unitOk(t, r) { return !!r.perWeek && t.value > r.value; }

  // Случайная пара, где цель больше или меньше эталона в разумное число раз
  function randomPair(pool, range, usedTargets, target, refOk) {
    var lo = range[0], hi = range[1];
    var targets = target ? [target] : U.shuffle(pool.filter(function (x) { return !usedTargets[x.id]; }));
    for (var i = 0; i < targets.length; i++) {
      var t = targets[i];
      var refs = pool.filter(function (r) {
        if (r.id === t.id || (refOk && !refOk(t, r))) return false;
        var k = t.value > r.value ? t.value / r.value : r.value / t.value;
        return k >= lo && k <= hi;
      });
      if (refs.length) return { target: t, ref: U.pick(refs) };
    }
    return null;
  }

  // Пара с конкретной вещью: сначала в разумном диапазоне, иначе — с самой подходящей единицей;
  // самая дешёвая единица сама становится эталоном («мяч — это 30 булочек»)
  function pricePairFor(content, it) {
    var pool = content.pools.prices;
    var p = randomPair(pool, range(content, 'prices'), {}, it, unitOk);
    if (p) return p;
    function far(x) { return Math.abs(Math.log(x.target.value / x.ref.value / 15)); }
    var best = null;
    pool.forEach(function (x) {
      if (x.id === it.id) return;
      var q = unitOk(it, x) ? { target: it, ref: x } : unitOk(x, it) ? { target: x, ref: it } : null;
      if (q && (!best || far(q) < far(best))) best = q;
    });
    return best;
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

  // Какие темы можно играть: хватает объектов, а для цен — есть понятные единицы или заявления
  function playable(content) {
    var p = content.pools, c = content.claims || {};
    return {
      animals: p.animals.length >= 4,
      countries: p.countries.length >= 4,
      prices: p.prices.length >= 4 && (p.prices.some(function (x) { return x.perWeek; }) || (c.prices || []).length >= 3)
    };
  }

  // Самый первый раунд режима «Цены» за сессию — пример из брифа: первое заявление про цены
  // (самокат и мороженое). Менеджер меняет его, просто поставив другое заявление выше.
  var firstPrice = true;

  // Набор раундов. mode: animals | countries | prices | chaos. В каждом раунде — заявление «фейк или правда».
  // Во время события босс-раунды берутся из его пар.
  // first — готовый раунд, который встанет первым (проверка из редактора, см. pickRound)
  function makeRun(content, mode, n, boss, first) {
    var kinds = [];
    var can = playable(content);
    var cats = KINDS.filter(function (k) { return can[k]; });
    if (!cats.length) return first ? [first] : [];
    if (mode === 'chaos') {
      // все темы вперемешку, поровну
      for (var i = 0; i < n; i++) kinds.push(cats[i % cats.length]);
      kinds = U.shuffle(kinds);
    } else {
      var only = cats.indexOf(mode) >= 0 ? mode : cats[0];
      for (var j = 0; j < n; j++) kinds.push(only);
    }
    var used = {}, usedClaims = {};
    var out = [];
    var claims = content.claims || { animals: [], countries: [], prices: [] };
    if (first) {
      used[first.target.id] = true;
      if (first.claim.uid) usedClaims[first.claim.uid] = true;
      firstPrice = false;
    }
    var eventBoss = !!(content.event && content.event.traps);
    kinds.forEach(function (kind, idx) {
      var isBoss = (boss || []).indexOf(idx + 1) >= 0;
      var p = null;
      var list = claims[kind] || [];
      if (kind === 'prices' && mode === 'prices' && firstPrice) {
        firstPrice = false;
        if (list.length && !isBoss) {
          p = { target: list[0].target, ref: list[0].ref, claim: list[0] };
          usedClaims[list[0].uid] = true;
        }
      }
      // во время события босс-раунд берёт пару из события
      if (!p && isBoss && eventBoss) p = trapPair(content, kind, used, true);
      // готовые заявления из claims.json; на босс-раунде — только фейки
      if (!p) {
        var pool = list.filter(function (c) {
          return !usedClaims[c.uid] && !used[c.target.id] && (!isBoss || !c.isTrue);
        });
        if (pool.length && (isBoss || Math.random() < 0.8)) {
          var c = U.pick(pool);
          usedClaims[c.uid] = true;
          p = { target: c.target, ref: c.ref, claim: c };
        }
      }
      if (!p) p = randomPair(content.pools[kind], range(content, kind), used, null, kind === 'prices' ? unitOk : null);
      if (!p) p = trapPair(content, kind, used, false);
      if (!p) return;
      if (!p.claim) p.claim = autoClaim(p, kind, isBoss);
      used[p.target.id] = true;
      p.kind = kind;
      p.boss = isBoss;
      out.push(p);
    });
    if (first) out[0] = first;
    return out;
  }

  // Раунд для проверки из редактора: заявление (c3) или объект по id.
  // Объект попадёт в своё заявление, а если его нет — в пару с подходящим эталоном.
  function pickRound(content, spec) {
    var claims = content.claims || { animals: [], countries: [], prices: [] };
    var found = null;
    function fromClaim(test) {
      KINDS.forEach(function (k) {
        (claims[k] || []).forEach(function (c) { if (!found && test(c)) found = { target: c.target, ref: c.ref, claim: c, kind: k }; });
      });
    }
    if (spec.claim) fromClaim(function (c) { return c.uid === spec.claim; });
    else if (spec.item) {
      var id = spec.item;
      fromClaim(function (c) { return c.target.id === id || c.ref.id === id; });
      KINDS.forEach(function (k) {
        var it = !found && byId(content.pools[k], id);
        if (!it) return;
        var p = k === 'prices' ? pricePairFor(content, it)
          : randomPair(content.pools[k], range(content, k), {}, it) || randomPair(content.pools[k], [1, 1e9], {}, it);
        if (!p) return;
        p.kind = k;
        p.claim = autoClaim(p, k, true);
        found = p;
      });
    }
    if (found) found.boss = false;
    return found;
  }

  // Реванш: та же цель, но другой эталон (в ценах — другая понятная единица)
  function rematch(content, round) {
    var pool = content.pools[round.kind];
    var ok = round.kind === 'prices' ? unitOk : null;
    var p = null;
    for (var i = 0; i < 6 && (!p || p.ref.id === round.ref.id); i++) {
      p = randomPair(pool, range(content, round.kind), {}, round.target, ok);
    }
    if (!p || p.ref.id === round.ref.id) return null;
    p.kind = round.kind;
    p.rematch = true;
    p.claim = autoClaim(p, round.kind, false);
    return p;
  }

  // Текст из конфига: **жирный** и переносы строк, всё остальное экранируется
  function rich(text) {
    return String(text).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; })
      .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>');
  }

  App.content = {
    load: load, makeRun: makeRun, rematch: rematch, rich: rich, pick: pickRound, sayText: sayText, playable: playable,
    price: { forms: autoForms, count: countText, round: roundCount, saving: saving, often: often, costs: costs },
    KINDS: KINDS, DIM: DIM, SOURCES: SOURCES, DRAFT_KEY: DRAFT_KEY
  };
})();
