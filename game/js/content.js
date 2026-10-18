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
    ratio: { animals: [1.2, 15], countries: [1.3, 40] },
    traps: { animals: [], countries: [] },
    ranks: [
      { min: 100, text: 'В точку' }, { min: 85, text: 'Отлично' }, { min: 65, text: 'Хорошо' },
      { min: 40, text: 'Тепло' }, { min: 15, text: 'Холодно' }, { min: 0, text: 'Мимо' }
    ],
    titles: [{ min: 0, name: 'Прикидчик' }],
    unlocks: [],
    lessons: {},
    modes: { chaos: true, animals: true, countries: true, money: true, duel: true },
    // «Сколько раз помещается»: ряд значков меньшего предмета в разборе раунда
    units: { show: true, max: 20 },
    theme: { animals: '#ffe9c4', countries: '#dcefff', money: '#dbf6e8' },
    texts: {
      tagline: 'Фейк или правда? Растяни силуэт\nдо **настоящего** размера.',
      capy: ['Я Капи. Проверяю громкие заявления.'],
      share: 'Сможешь прикинуть точнее?',
      ask: { long: 'сколько в длину?', tail: 'сколько в длину с хвостом?', tall: 'сколько в высоту?', area: 'какая площадь?' }
    },
    events: []
  };
  var DIM = { long: 'в длину', tail: 'в длину с хвостом', tall: 'в высоту', diam: 'в диаметре' };

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
      // деньги: вещи для задач «цена в купюрах» (смартфон, рюкзак…), стопки к ним игра строит сама
      var money = build(extra.money || [], animal, 'Деньги');
      var all = animals.concat(countries, money);
      return Promise.all(all.map(function (it) {
        if (it.ready) return null;
        return App.assets.prepare(it).catch(function (e) { errors.push(it.name + ': ' + e.message); });
      })).then(function () {
        var ok = function (it) { return it.ready; };
        var content = {
          cfg: cfg,
          pools: { animals: animals.filter(ok), countries: countries.filter(ok), money: money.filter(ok) },
          event: activeEvent(cfg, date),
          errors: errors,
          // убранные менеджером объекты: всё, что на них ссылается, отключается вместе с ними
          hidden: hidden,
          off: [],
          draft: !!override
        };
        checkTraps(content);
        content.claims = buildClaims(res[4], content);
        content.tasks = buildTasks(res[4], content);
        return content;
      });
    });
  }

  function byId(pool, id) {
    for (var i = 0; i < pool.length; i++) if (pool[i].id === id) return pool[i];
    return null;
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
      ['animals', 'countries'].forEach(function (kind) {
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
    map: 'На обычной карте', rumor: 'Говорят', cartoon: 'В мультиках', think: 'Многие думают'
  };
  var TRUE_RANGE = Math.log(1.06);

  // says — во сколько раз цель больше эталона «по словам» заявления.
  // Отсюда стартовый размер белого силуэта: ребёнок видит ровно то, что обещает фейк.
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
    var out = { animals: [], countries: [] };
    if (!raw || !Array.isArray(raw.claims)) return out;
    var sources = raw.sources && typeof raw.sources === 'object' ? raw.sources : {};
    raw.claims.forEach(function (c, i) {
      var kind = null, t = null, r = null;
      ['animals', 'countries'].forEach(function (k) {
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
  // и им же редактор пишет заявление для нового объекта
  function sayText(t, r, says) {
    var area = t.kind === 'country';
    var bigger = says >= 1;
    var x = bigger ? says : 1 / says;
    x = x >= 10 ? Math.round(x) : Math.round(x * 10) / 10;
    var text = x === 1
      ? t.name + ' и ' + lowerName(r) + (area ? ' одинаковые по площади.' : ' — одного размера.')
      : t.name + (area ? ' по площади' : '') + ' в ' + U.fmtRatio(x) + ' ' + razWord(x) + (bigger ? ' больше' : ' меньше') + ', чем ' + lowerName(r) + '.';
    return { says: bigger ? x : 1 / x, text: text };
  }

  // Заявление для любой пары: иногда правда, чаще враньё в 1,6–2,6 раза
  function autoClaim(p, kind, forceFake) {
    var t = p.target, r = p.ref;
    var k = t.value / r.value;
    var isTrue = !forceFake && Math.random() < 0.25;
    var says = k;
    if (!isTrue) {
      var lin = Math.random() < 0.5 ? U.rand(0.4, 0.62) : U.rand(1.6, 2.6);
      says = k * (kind === 'countries' ? lin * lin : lin);
    }
    var s = sayText(t, r, says);
    return makeClaim(t, r, s.says, 'rumor', s.text, '');
  }

  // ---------- «Цена в купюрах» ----------
  // Чем платим: номинал, толщина одной купюры или монеты (м), ширина (мм), как назвать
  var PAY = {
    note100: { rub: 100, t: 0.0001, w: 150, of: 'сторублёвок', forms: ['купюра', 'купюры', 'купюр'] },
    note1000: { rub: 1000, t: 0.0001, w: 157, of: 'тысячных купюр', forms: ['купюра', 'купюры', 'купюр'] },
    note5000: { rub: 5000, t: 0.0001, w: 157, of: 'пятитысячных купюр', forms: ['купюра', 'купюры', 'купюр'] },
    coin10: { rub: 10, t: 0.0022, w: 22, of: 'десятирублёвых монет', forms: ['монета', 'монеты', 'монет'] },
    coin1: { rub: 1, t: 0.0015, w: 20.5, of: 'рублёвых монет', forms: ['монета', 'монеты', 'монет'] }
  };

  // Стопка строится сама под любую цену: прямоугольник с «листами»
  function stackItem(key, count) {
    var pay = PAY[key];
    var h = count * pay.t;
    var W = pay.w, H = h * 1000;
    var n = Math.min(40, count - 1), step = H / (n + 1), th = step * 0.22;
    var d = 'M0 0H' + W + 'V' + H.toFixed(3) + 'H0Z';
    for (var i = 1; i <= n; i++) {
      var y = (step * i).toFixed(3);
      d += 'M2 ' + y + 'H' + (W - 2) + 'v' + th.toFixed(3) + 'H2Z';
    }
    return {
      kind: 'animal', id: 'stack-' + key + '-' + count, name: 'Стопка ' + pay.of, acc: 'стопку ' + pay.of, fact: '', value: h,
      dim: 'tall', dimText: 'в высоту', axis: 'h', vb: [0, 0, W, H], markup: '<path d="' + d + '" fill-rule="evenodd"/>',
      w: W / 1000, h: h, ready: true, stretch: true
    };
  }

  function buildTasks(raw, content) {
    var out = [];
    if (!raw || !Array.isArray(raw.prices)) return out;
    raw.prices.forEach(function (p, i) {
      var item = p && byId(content.pools.money, p.item);
      var pay = p && PAY[p.pay];
      var count = pay && isNum(p.price) ? Math.round(p.price / pay.rub) : 0;
      if (!item || !pay || count < 1 || count > 100000) {
        if (p && isOff(content, [p.item])) { content.off.push({ type: 'price', uid: 'p' + i, ids: [p.item] }); return; }
        content.errors.push('Задача «цена в купюрах» №' + (i + 1) + ' с ошибкой: нужны вещь, цена и чем платим');
        return;
      }
      var stack = stackItem(p.pay, count);
      var t = pay.t * 1000;
      out.push({
        uid: 'p' + i, task: true, isTrue: null, target: stack, ref: item, pay: p.pay, source: 'Цена в купюрах', srcKey: 'money',
        ask: 'какой высоты стопка?',
        text: isStr(p.text) ? p.text : item.name + (/[иы]$/.test(item.name) ? ' стоят ' : ' стоит ') + U.fmt(p.price) + ' ₽. Какой высоты будет стопка ' + pay.of + '?',
        why: U.fmt(p.price) + ' ₽ ÷ ' + U.fmt(pay.rub) + ' ₽ = ' + U.fmt(count) + ' ' + U.plural(count, pay.forms) + '. ' +
          (pay.t > 0.0005 ? 'Одна монета толщиной ' + U.dec(t, 1) + ' мм' : 'Одна купюра — около 0,1 мм') +
          ', значит стопка — ' + U.fmtLen(stack.value) + '.' + (isStr(p.why) ? ' ' + p.why : '')
      });
    });
    return out;
  }

  // Раунд из задачи: белая стопка стартует заметно выше или ниже правды
  function taskRound(tk) {
    var claim = {};
    Object.keys(tk).forEach(function (k) { claim[k] = tk[k]; });
    claim.g0 = Math.random() < 0.5 ? U.rand(0.3, 0.6) : U.rand(1.8, 3.2);
    return { target: tk.target, ref: tk.ref, claim: claim, kind: 'money' };
  }

  // Самый первый денежный раунд за сессию — пример из брифа: смартфон и сторублёвки
  var firstMoney = true;

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

  // Набор раундов. mode: animals | countries | money | chaos.
  // Звери и карты — заявления «фейк или правда», деньги — только задачи «цена в купюрах».
  // Во время события босс-раунды зверей и карт берутся из его пар.
  // first — готовый раунд, который встанет первым (проверка из редактора, см. pickRound)
  function makeRun(content, mode, n, boss, first) {
    var kinds = [];
    var cats = ['animals', 'countries'].filter(function (k) { return content.pools[k] && content.pools[k].length >= 4; });
    if ((content.tasks || []).length >= 3) cats.push('money');
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
    var claims = content.claims || { animals: [], countries: [] };
    if (first) {
      used[first.target.id] = true;
      if (first.claim.uid) usedClaims[first.claim.uid] = true;
      firstMoney = false;
    }
    var eventBoss = !!(content.event && content.event.traps);
    kinds.forEach(function (kind, idx) {
      var isBoss = (boss || []).indexOf(idx + 1) >= 0;
      var p = null;
      if (kind === 'money') {
        var all = content.tasks;
        var fresh = all.filter(function (t) { return !usedClaims[t.uid]; });
        var tk = firstMoney && mode === 'money' ? all[0] : U.pick(fresh.length ? fresh : all);
        firstMoney = false;
        usedClaims[tk.uid] = true;
        p = taskRound(tk);
        p.boss = isBoss;
        out.push(p);
        return;
      }
      // во время события босс-раунд берёт пару из события
      if (isBoss && eventBoss) p = trapPair(content, kind, used, true);
      // готовые заявления из claims.json; на босс-раунде — только фейки
      if (!p) {
        var pool = (claims[kind] || []).filter(function (c) {
          return !usedClaims[c.uid] && !used[c.target.id] && (!isBoss || !c.isTrue);
        });
        if (pool.length && (isBoss || Math.random() < 0.8)) {
          var c = U.pick(pool);
          usedClaims[c.uid] = true;
          p = { target: c.target, ref: c.ref, claim: c };
        }
      }
      if (!p) p = randomPair(content.pools[kind], content.cfg.ratio[kind] || [1.2, 15], used);
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

  // Раунд для проверки из редактора: заявление (c3), задача (p2) или объект по id.
  // Объект попадёт в своё заявление или задачу, а если их нет — в пару с подходящим эталоном.
  function pickRound(content, spec) {
    var claims = content.claims || { animals: [], countries: [] };
    var kinds = ['animals', 'countries'];
    var found = null;
    function fromClaim(test) {
      kinds.forEach(function (k) {
        (claims[k] || []).forEach(function (c) { if (!found && test(c)) found = { target: c.target, ref: c.ref, claim: c, kind: k }; });
      });
    }
    function fromTask(test) {
      (content.tasks || []).forEach(function (t) { if (!found && test(t)) found = taskRound(t); });
    }
    if (spec.claim) fromClaim(function (c) { return c.uid === spec.claim; });
    else if (spec.task) fromTask(function (t) { return t.uid === spec.task; });
    else if (spec.item) {
      var id = spec.item;
      fromTask(function (t) { return t.ref.id === id; });
      fromClaim(function (c) { return c.target.id === id || c.ref.id === id; });
      kinds.forEach(function (k) {
        var it = !found && byId(content.pools[k], id);
        if (!it) return;
        var p = randomPair(content.pools[k], content.cfg.ratio[k] || [1.2, 15], {}, it) || randomPair(content.pools[k], [1, 1e9], {}, it);
        if (!p) return;
        p.kind = k;
        p.claim = autoClaim(p, k, true);
        found = p;
      });
    }
    if (found) found.boss = false;
    return found;
  }

  // Реванш: та же цель, но другой эталон.
  // Для «цены в купюрах» — та же вещь другими деньгами или те же деньги за другую вещь.
  function rematch(content, round, rounds) {
    if (round.claim.task) {
      var inRun = {};
      (rounds || []).forEach(function (x) { if (x.claim) inRun[x.claim.uid] = true; });
      var near = (content.tasks || []).filter(function (t) {
        return !inRun[t.uid] && (t.ref.id === round.ref.id || t.pay === round.claim.pay);
      });
      if (!near.length) return null;
      var tp = taskRound(U.pick(near));
      tp.rematch = true;
      return tp;
    }
    var pool = content.pools[round.kind];
    var p = null;
    for (var i = 0; i < 6 && (!p || p.ref.id === round.ref.id); i++) {
      p = randomPair(pool, content.cfg.ratio[round.kind] || [1.2, 15], {}, round.target);
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
    load: load, makeRun: makeRun, rematch: rematch, rich: rich, pick: pickRound, sayText: sayText,
    DIM: DIM, SOURCES: SOURCES, DRAFT_KEY: DRAFT_KEY, PAY: PAY
  };
})();
