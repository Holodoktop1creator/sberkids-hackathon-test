(function () {
  'use strict';
  var App = window.App;
  var U = App.util;

  // Контент — это данные: content/levels.json лежит рядом с игрой (или на CDN)
  // и меняется без релиза. Если файл не загрузился или битый, игра берёт
  // этот встроенный минимальный набор и всё равно работает.
  var FALLBACK = {
    run: ['value', 'save', 'tricky', 'inbox', 'value', 'save', 'bank', 'inbox'],
    duel: ['value', 'save', 'tricky', 'bank', 'inbox'],
    chapters: {
      value: { name: 'Цена и ценность', icon: '⚖️', lesson: 'Цену удобно мерить в понятных вещах: так видно, от чего отказываешься ради покупки.' },
      save: { name: 'Копилка', icon: '🫙', lesson: 'Недели копить = (цена − что уже есть) ÷ сколько откладываешь в неделю.' },
      tricky: { name: 'Хитрые цены', icon: '🏷️', lesson: 'Скидка в % считается от старой цены, а мелкие траты складываются в большую сумму.' },
      bank: { name: 'Вклад и кредит', icon: '🏦', lesson: 'Вклад приносит проценты тебе, а кредит — банку.' },
      inbox: { name: 'Входящие', icon: '📩', lesson: 'Обещают много, торопят, просят код или перевод — это ловушка. Стоп и расскажи взрослому.' }
    },
    levels: [
      { id: 'v1', chapter: 'value', item: '🎧', q: 'Наушники стоят 2 500 ₽, шоколадка — 100 ₽. Сколько шоколадок стоят наушники?', unit: ['шоколадка', 'шоколадки', 'шоколадок'], ref: { emoji: '🍫', label: '10 шт. = 1 000 ₽', value: 10 }, answer: 25, max: 40, step: 1, explain: '2 500 ÷ 100 = 25. Наушники — это 25 шоколадок.' },
      { id: 'v3', chapter: 'value', item: '🎲', q: 'Настольная игра стоит 1 500 ₽, кусок пиццы — 150 ₽. Сколько кусков пиццы стоит игра?', unit: ['кусок', 'куска', 'кусков'], ref: { emoji: '🍕', label: '5 шт. = 750 ₽', value: 5 }, answer: 10, max: 30, step: 1, explain: '1 500 ÷ 150 = 10.' },
      { id: 's1', chapter: 'save', item: '🎧', q: 'Ты откладываешь 300 ₽ в неделю. Наушники стоят 2 400 ₽. Сколько недель копить?', unit: ['неделя', 'недели', 'недель'], ref: { emoji: '🫙', label: '1 нед. = 300 ₽', value: 1 }, answer: 8, max: 20, step: 1, explain: '2 400 ÷ 300 = 8 недель.' },
      { id: 's4', chapter: 'save', item: '⌚', q: 'Часы стоят 5 000 ₽. У тебя есть 1 000 ₽, откладываешь 400 ₽ в неделю. Сколько недель ещё копить?', unit: ['неделя', 'недели', 'недель'], ref: { emoji: '🫙', label: '1 нед. = 400 ₽', value: 1 }, answer: 10, max: 18, step: 1, explain: '5 000 − 1 000 = 4 000. 4 000 ÷ 400 = 10 недель.' },
      { id: 't1', chapter: 'tricky', item: '👟', q: 'Кроссовки стоят 4 000 ₽, скидка 25%. Сколько заплатишь?', unit: '₽', ref: { emoji: '🏷️', label: 'Без скидки', value: 4000 }, answer: 3000, max: 5000, step: 100, explain: '25% — это четверть: 1 000 ₽. 4 000 − 1 000 = 3 000 ₽.' },
      { id: 'b2', chapter: 'bank', item: '📱', q: 'Телефон стоит 12 000 ₽. В кредит — 12 платежей по 1 200 ₽. Сколько отдашь всего?', unit: '₽', ref: { emoji: '🏷️', label: 'Цена', value: 12000 }, answer: 14400, max: 18000, step: 100, explain: '1 200 × 12 = 14 400 ₽. Переплата 2 400 ₽ — плата за кредит.' },
      { id: 'i1', chapter: 'inbox', scam: true, item: '💸', msg: { from: 'Неизвестный номер', ava: '❔', text: 'Переведи 500 ₽ — через час верну 5 000! Только быстрее 🔥' }, q: 'Сколько рублей тебе вернётся на самом деле?', unit: '₽', ref: { emoji: '💵', label: 'Твои 500 ₽', value: 500 }, answer: 0, max: 6000, step: 100, start: 5000, shield: '🛡️ Деньги незнакомцам не переводим', explain: 'Ноль. Незнакомец, «верну в 10 раз больше» и «быстрее» — признаки обмана.' },
      { id: 'i7', chapter: 'inbox', scam: false, item: '🎂', msg: { from: 'Бабушка', ava: '👵', text: 'С днём рождения! Перевела тебе 1 000 ₽ 🎂' }, q: 'На карте было 450 ₽. Сколько станет?', unit: '₽', ref: { emoji: '💳', label: 'Было', value: 450 }, answer: 1450, max: 2500, step: 50, explain: '450 + 1 000 = 1 450 ₽. Бабушка ничего не просит взамен — это не ловушка.' }
    ],
    titles: [
      { min: 0, name: 'Капибара-стажёр', emoji: '🌱' },
      { min: 0.35, name: 'Прикидчик', emoji: '🧮' },
      { min: 0.55, name: 'Глаз-алмаз', emoji: '💎' },
      { min: 0.75, name: 'Финансовый вайб-мастер', emoji: '😎' },
      { min: 0.92, name: 'Легенда прикидки', emoji: '👑' }
    ],
    unlocks: [
      { stars: 6, id: 'orange', label: '🍊 Апельсинка' },
      { stars: 12, id: 'glasses', label: '😎 Очки' },
      { stars: 18, id: 'medal', label: '🏅 Медаль' },
      { stars: 22, id: 'crown', label: '👑 Корона' }
    ],
    reactions: {
      '3': ['ИМБА!', 'Глаз-алмаз!', 'Точно в цель!'],
      '2': ['Почти имба!', 'Очень близко!'],
      '1': ['Тепло!', 'Уже рядом!'],
      '0': ['Не беда — смотри, как считать 👇'],
      scamWin: ['Ловушка раскрыта! 🛡️'],
      scamFail: ['Ой! Это была ловушка']
    }
  };

  function isNum(v) { return typeof v === 'number' && isFinite(v); }
  function isStr(v) { return typeof v === 'string' && v.length > 0; }

  function validLevel(l, chapters) {
    if (!l || !isStr(l.id) || !chapters[l.chapter] || !isStr(l.q)) return false;
    if (!isNum(l.answer) || !isNum(l.max) || !isNum(l.step)) return false;
    if (l.max <= 0 || l.step <= 0 || l.answer < 0 || l.answer > l.max) return false;
    if (!(isStr(l.unit) || (Array.isArray(l.unit) && l.unit.length === 3))) return false;
    if (l.ref && (!isNum(l.ref.value) || l.ref.value < 0 || l.ref.value > l.max)) return false;
    if (l.start !== undefined && (!isNum(l.start) || l.start < 0 || l.start > l.max)) return false;
    if (l.msg && (!isStr(l.msg.text) || !isStr(l.msg.from))) return false;
    return true;
  }

  function normalize(raw) {
    var c = {};
    var src = raw && typeof raw === 'object' ? raw : {};
    c.chapters = src.chapters && typeof src.chapters === 'object' ? src.chapters : FALLBACK.chapters;
    c.levels = Array.isArray(src.levels) ? src.levels.filter(function (l) { return validLevel(l, c.chapters); }) : [];
    var planOk = function (p) { return Array.isArray(p) && p.length > 0 && p.length <= 12 && p.every(function (k) { return c.chapters[k]; }); };
    c.run = planOk(src.run) ? src.run : FALLBACK.run;
    c.duel = planOk(src.duel) ? src.duel : FALLBACK.duel;
    c.titles = Array.isArray(src.titles) && src.titles.length ? src.titles : FALLBACK.titles;
    c.unlocks = Array.isArray(src.unlocks) ? src.unlocks : FALLBACK.unlocks;
    c.reactions = src.reactions && src.reactions['3'] ? src.reactions : FALLBACK.reactions;
    // слишком мало рабочих уровней — используем встроенный набор
    if (c.levels.length < c.run.length) return normalize(FALLBACK);
    return c;
  }

  function load() {
    var url = 'content/levels.json';
    if (!window.fetch) return Promise.resolve(normalize(FALLBACK));
    return fetch(url, { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(normalize)
      .catch(function () { return normalize(FALLBACK); });
  }

  // Набор уровней на один заход: по главе на каждый слот плана,
  // без повторов и с хотя бы одной ловушкой во «Входящих».
  function pick(content, plan, avoid) {
    avoid = avoid || {};
    var used = {};
    var out = [];
    plan.forEach(function (ch) {
      var pool = content.levels.filter(function (l) { return l.chapter === ch && !used[l.id]; });
      var fresh = pool.filter(function (l) { return !avoid[l.id]; });
      var any = content.levels.filter(function (l) { return !used[l.id]; });
      var l = U.pick(fresh.length ? fresh : pool.length ? pool : any);
      used[l.id] = true;
      out.push(l);
    });
    var inbox = out.filter(function (l) { return l.chapter === 'inbox'; });
    if (inbox.length && !inbox.some(function (l) { return l.scam; })) {
      var scams = content.levels.filter(function (l) { return l.scam && !used[l.id]; });
      if (scams.length) out[out.indexOf(inbox[0])] = U.pick(scams);
    }
    return out;
  }

  App.content = { load: load, pick: pick };
})();
