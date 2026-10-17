(function () {
  'use strict';
  var App = window.App;
  var U = App.util;
  var B = App.board;
  function $(id) { return document.getElementById(id); }

  var S = {
    content: null,
    mode: 'chaos',
    duel: false,
    rounds: [],
    idx: 0,
    results: [],
    score: 0,
    combo: 0,
    bestCombo: 0,
    turn: 1,
    duelScore: [0, 0],
    duelMarks: [],
    phase: 'menu',   // play | pass | intro | reveal | sheet | end
    hinted: false,   // ребёнок уже хоть раз потянул силуэт
    touched: false,  // трогал ли в этом ходу
    idleT: 0,
    runs: 0,
    record: 0,
    acc: [],
    last: null,
    epoch: 0,        // меняется при новом раунде и выходе в меню — отменяет отложенные шаги
    timedOut: []     // у кого в этом раунде вышло время
  };
  var MERCATOR = ['greenland', 'canada', 'antarctica', 'africa'];
  var capyEnd = $('capy-end');

  // ---------- Экраны ----------
  function show(id) {
    ['scr-start', 'scr-game', 'scr-end', 'scr-duel-end'].forEach(function (s) {
      var e = $(s);
      var on = s === id;
      e.hidden = !on;
      if (on) { e.classList.remove('enter'); void e.offsetWidth; e.classList.add('enter'); }
    });
  }
  function restart(el, cls) { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }

  // ---------- Очки: как в Size It Up ----------
  // ±6% → 100, ошибка в 2 раза → ~45, в 5 раз и больше → 0
  function points(g) {
    var e = Math.abs(Math.log(g));
    var ok = Math.log(1.06);
    if (e <= ok) return 100;
    var x = (e - ok) / (Math.log(5) - ok);
    return x >= 1 ? 0 : Math.round(100 * Math.pow(1 - x, 1.52));
  }
  function band(p) { return p >= 85 ? 3 : p >= 65 ? 2 : p >= 40 ? 1 : 0; }
  function square(p) { return ['⬜', '🟧', '🟨', '🟩'][band(p)]; }
  function rankText(p) {
    var r = S.content.cfg.ranks;
    for (var i = 0; i < r.length; i++) if (p >= r[i].min) return r[i].text;
    return '';
  }
  function maxScore() { return S.rounds.reduce(function (a, r) { return a + (r.boss ? 200 : 100); }, 0); }

  // ---------- HUD ----------
  function updateHud() {
    var html = '';
    for (var i = 0; i < S.rounds.length; i++) {
      var cls = S.rounds[i].boss ? 'boss' : '';
      if (S.duel) { if (S.duelMarks[i] !== undefined) cls += ' s3'; }
      else if (S.results[i]) cls += ' s' + band(S.results[i].pts);
      if (i === S.idx && S.phase !== 'sheet') cls += ' cur';
      html += '<i class="' + cls + '"></i>';
    }
    $('dots').innerHTML = html;
    var hs = $('hud-score');
    hs.innerHTML = S.duel
      ? S.duelScore[0] + ' : <span style="color:var(--hot)">' + S.duelScore[1] + '</span>'
      : String(S.score);
    restart(hs, 'bump');
    var c = $('combo');
    c.hidden = S.duel || S.combo < 2;
    if (!c.hidden) { c.textContent = '🔥 ×' + S.combo; restart(c, 'combo'); }
  }

  function setControls(on) {
    ['btn-go', 'btn-minus', 'btn-plus'].forEach(function (id) { $(id).disabled = !on; });
  }

  // ---------- Таймер хода ----------
  // Секунды на ход — в content/game.json ("timer", 0 — без таймера).
  // Когда время выходит, ответ фиксируется там, где ребёнок оставил силуэт.
  var TM = { el: null, ring: null, num: null, total: 0, t0: 0, on: false, raf: 0, sec: -1 };
  var RING_LEN = 2 * Math.PI * 22;
  function tmTotal() { return S.content ? S.content.cfg.timer : 0; }
  function tmDraw(left) {
    var frac = TM.total ? left / (TM.total * 1000) : 0;
    TM.ring.style.strokeDashoffset = (RING_LEN * (1 - frac)).toFixed(1);
    var sec = Math.ceil(left / 1000);
    if (sec === TM.sec) return;
    TM.sec = sec;
    TM.num.textContent = sec;
    TM.el.setAttribute('data-lvl', sec > 10 ? 'ok' : sec > 6 ? 'mid' : sec > 3 ? 'low' : 'crit');
    $('board').classList.toggle('hurry', TM.on && sec <= 3);
    if (TM.on && sec <= 3 && sec > 0) {
      restart(TM.el, 'beat');
      App.sound.play('beep', sec);
      if (sec === 3) App.bridge.vibrate();
    }
  }
  function tmLoop() {
    if (!TM.on) return;
    var left = TM.total * 1000 - (performance.now() - TM.t0);
    if (left <= 0) { tmDraw(0); tmStop(); timeUp(); return; }
    tmDraw(left);
    TM.raf = requestAnimationFrame(tmLoop);
  }
  function tmStop() {
    TM.on = false;
    cancelAnimationFrame(TM.raf);
    $('board').classList.remove('hurry');
    if (TM.el) TM.el.classList.remove('run', 'beat');
  }
  function tmReset() {
    tmStop();
    TM.total = tmTotal();
    TM.el.hidden = !TM.total;
    TM.sec = -1;
    if (TM.total) tmDraw(TM.total * 1000);
  }
  function tmStart() {
    tmReset();
    if (!TM.total) return;
    TM.on = true;
    TM.t0 = performance.now();
    TM.el.classList.add('run');
    tmLoop();
  }

  function timeUp() {
    if (S.phase !== 'play') return;
    S.phase = 'timeup';
    setControls(false);
    B.enable(false);
    clearTimeout(S.idleT);
    B.demo(false, false); // демо не в счёт: остаётся размер, который поставил сам ребёнок
    S.timedOut[S.turn - 1] = true;
    App.sound.play('buzzer');
    App.bridge.vibrate();
    restart($('timeup'), 'show');
    var ep = S.epoch;
    U.wait(900).then(function () {
      if (ep === S.epoch) lockIn(true);
    });
  }

  // ---------- Раунд ----------
  var ASK = { long: 'сколько в длину?', tail: 'сколько в длину с хвостом?', tall: 'сколько в высоту?', area: 'какая площадь?' };
  function askText(r) {
    var ask = S.content.cfg.texts.ask || {};
    var key = r.kind === 'countries' ? 'area' : r.target.dim;
    return typeof ask[key] === 'string' && ask[key] ? ask[key] : ASK[key];
  }
  function kickerText(r, i) {
    if (r.boss) return '⚡ БОСС-РАУНД · очки ×2';
    if (r.rematch) return '🔁 РЕВАНШ · новый эталон';
    return (r.kind === 'countries' ? '🌍 ' : '🐾 ') + 'Раунд ' + (i + 1) + ' из ' + S.rounds.length;
  }

  function startG() {
    return Math.random() < 0.5 ? U.rand(0.35, 0.65) : U.rand(1.55, 2.6);
  }

  function playRound(i) {
    S.idx = i;
    var r = S.rounds[i];
    var ep = ++S.epoch;
    S.phase = 'intro';
    S.timedOut = [];
    tmReset();
    setControls(false);
    $('sheet').hidden = true;
    var k = $('kicker');
    k.textContent = kickerText(r, i);
    k.className = 'kicker' + (r.boss ? ' boss' : r.rematch ? ' rematch' : '');
    $('target').textContent = r.target.name;
    restart($('target'), 'in');
    $('ask').textContent = askText(r);
    $('board').classList.toggle('boss', !!r.boss);
    $('turn').hidden = true;
    B.setRound(r, { start: startG() });
    B.enable(false);
    updateHud();
    showIntro(r).then(function () {
      if (ep !== S.epoch) return;
      if (S.duel) askPass(1);
      else beginTurn();
    });
  }

  function showIntro(r) {
    var tag = $('intro-tag');
    tag.textContent = r.boss ? '⚡ БОСС ×2 ⚡' : r.rematch ? '🔁 РЕВАНШ' : 'Раунд ' + (S.idx + 1);
    tag.className = 'intro-tag' + (r.boss ? ' boss' : r.rematch ? ' rematch' : '');
    $('intro-a').textContent = r.target.name;
    $('intro-b').innerHTML = '';
    $('intro-b').appendChild(document.createTextNode(r.ref.name));
    var sm = document.createElement('small');
    sm.textContent = 'эталон';
    $('intro-b').appendChild(sm);
    var ov = $('intro');
    ov.hidden = false;
    // перезапуск анимаций
    Array.prototype.forEach.call(ov.children, function (c) { c.style.animation = 'none'; void c.offsetWidth; c.style.animation = ''; });
    App.sound.play('swoosh');
    setTimeout(function () { App.sound.play('boom'); }, 160);
    return new Promise(function (res) {
      var done = false;
      function finish() {
        if (done) return;
        done = true;
        ov.hidden = true;
        ov.removeEventListener('pointerdown', finish);
        res();
      }
      ov.addEventListener('pointerdown', finish);
      setTimeout(finish, r.boss ? 1500 : 1100);
    });
  }

  function beginTurn() {
    S.phase = 'play';
    setControls(true);
    B.enable(true);
    if (S.duel) {
      B.setTurn(S.turn - 1, S.turn === 1 ? [true, false] : [false, true]);
      var t = $('turn');
      t.hidden = false;
      t.className = 'turn p' + S.turn;
      t.textContent = S.turn === 1 ? 'Тянет Игрок 1 (белый)' : 'Тянет Игрок 2 (розовый)';
    } else {
      B.setTurn(0, [true, false]);
    }
    // показываем, как тянуть: сразу, пока ребёнок ни разу не тянул,
    // и повторно, если в ходе ничего не трогали 5 секунд
    S.touched = false;
    clearTimeout(S.idleT);
    if (!S.hinted) B.demo(true);
    else {
      var ep = S.epoch;
      S.idleT = setTimeout(function () {
        if (ep === S.epoch && S.phase === 'play' && !S.touched) B.demo(true);
      }, 5000);
    }
    tmStart();
  }

  function onBoardChange(g) {
    App.sound.play('tick', U.clamp((Math.log(g) + 2) / 4, 0, 1));
    S.hinted = true;
    S.touched = true;
  }

  // ---------- Кнопки ----------
  [['btn-minus', 1 / 1.06], ['btn-plus', 1.06]].forEach(function (p) {
    var btn = $(p[0]);
    var timer = 0;
    function stop() { clearTimeout(timer); clearInterval(timer); timer = 0; }
    function step() {
      if (S.phase !== 'play') { stop(); return; }
      B.nudge(S.turn - 1, p[1]);
    }
    btn.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      step();
      timer = setTimeout(function () { timer = setInterval(step, 70); }, 320);
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(function (ev) { btn.addEventListener(ev, stop); });
  });

  // Фиксация ответа: по кнопке или когда вышло время
  function lockIn(byTimer) {
    if (S.phase !== (byTimer ? 'timeup' : 'play')) return;
    App.sound.play('lock');
    tmStop();
    clearTimeout(S.idleT);
    B.demo(false);
    if (S.duel && S.turn === 1) {
      B.enable(false);
      B.setTurn(0, [false, false]);
      askPass(2);
      return;
    }
    reveal();
  }
  $('btn-go').addEventListener('click', function () { lockIn(false); });

  function askPass(player) {
    S.phase = 'pass';
    setControls(false);
    S.turn = player;
    $('pass-title').textContent = 'Ход Игрока ' + player;
    $('pass-text').textContent = player === 1
      ? 'Раунд ' + (S.idx + 1) + ' из ' + S.rounds.length + '. Игрок 2 — отвернись 🙈'
      : 'Игрок 1 спрятал(а) ответ. Передай телефон — и не подглядывай 🙈';
    $('btn-pass').textContent = 'Я Игрок ' + player + ', погнали!';
    $('pass').hidden = false;
  }
  $('btn-pass').addEventListener('click', function () {
    App.sound.play('tap');
    $('pass').hidden = true;
    beginTurn();
  });

  // ---------- Проверка ----------
  function reveal() {
    S.phase = 'reveal';
    setControls(false);
    $('turn').hidden = true;
    if (S.duel) B.setTurn(-1, [true, true]);
    B.reveal();
    App.sound.play('slam');
    restart($('board'), 'shake');
    var ep = S.epoch;
    U.wait(450).then(function () {
      if (ep !== S.epoch) return;
      if (S.duel) duelResult(); else soloResult();
    });
  }

  function ratioLines(r, g) {
    var t = r.target, ref = r.ref;
    var k = t.value / ref.value;
    var gv = B.value(t, g) / ref.value;
    var flip = k < 1;
    function eq(x) {
      return flip ? ref.name + ' = ' + U.fmtRatio(1 / x) + ' × ' + t.name : t.name + ' = ' + U.fmtRatio(x) + ' × ' + ref.name;
    }
    var off = g > 1 ? g : 1 / g;
    if (r.kind === 'countries') off = off * off;
    var miss = points(g) === 100 ? 'В точку! 🎯'
      : 'Промах: ' + (r.kind === 'countries' ? 'площадь' : 'размер') + ' в ' + U.fmtRatio(off) + ' раза ' + (g > 1 ? 'больше' : 'меньше');
    return { truth: eq(k), guess: eq(gv), miss: miss };
  }

  function tipFor(r, pts) {
    var cfg = S.content.cfg;
    if (r.kind === 'countries') {
      if (MERCATOR.indexOf(r.target.id) >= 0 || MERCATOR.indexOf(r.ref.id) >= 0) return '🗺️ ' + (cfg.lessons.countries || '');
      if (pts < 65) return '📐 ' + (cfg.lessons.area || U.pick(cfg.tips.countries));
      return '';
    }
    return pts < 65 ? '💡 ' + U.pick(cfg.tips.animals) : '';
  }

  function soloResult() {
    var r = S.rounds[S.idx];
    var g = B.getG(0);
    var pts = points(g);
    var gained = pts * (r.boss ? 2 : 1);
    S.score += gained;
    S.results[S.idx] = { pts: pts, gained: gained, round: r };
    S.combo = pts >= 65 ? S.combo + 1 : 0;
    S.bestCombo = Math.max(S.bestCombo, S.combo);

    // промах → цель вернётся позже с другим эталоном
    var rematches = S.rounds.filter(function (x) { return x.rematch; }).length;
    if (pts < 40 && !r.rematch && rematches < 2) {
      for (var j = S.idx + 2; j < S.rounds.length; j++) {
        if (!S.rounds[j].boss && !S.rounds[j].rematch) {
          var rm = App.content.rematch(S.content, r);
          if (rm) S.rounds[j] = rm;
          break;
        }
      }
    }

    var lines = ratioLines(r, g);
    openSheet({
      score: '+' + gained + (r.boss ? ' ×2' : ''),
      band: band(pts),
      rank: rankText(pts),
      time: S.timedOut[0] ? '⏰ Время вышло — засчитали силуэт таким, каким он был' : '',
      ratio: 'Правильно: <b>' + esc(lines.truth) + '</b><br>У тебя: ' + esc(lines.guess) + '<br>' + esc(lines.miss),
      factOf: r.target.fact ? r.target : r.ref,
      tip: tipFor(r, pts)
    });
    celebrate(pts);
  }

  function duelResult() {
    var r = S.rounds[S.idx];
    var g1 = B.getG(0), g2 = B.getG(1);
    var p1 = points(g1), p2 = points(g2);
    S.duelScore[0] += p1;
    S.duelScore[1] += p2;
    var e1 = Math.abs(Math.log(g1)), e2 = Math.abs(Math.log(g2));
    var w = Math.abs(e1 - e2) < 1e-6 ? 0 : e1 < e2 ? 1 : 2;
    S.duelMarks[S.idx] = w;
    var lines = ratioLines(r, 1);
    openSheet({
      score: p1 + ' : ' + p2,
      band: 3,
      rank: w === 0 ? 'Ничья! 🤝' : 'Игрок ' + w + ' ближе! 🏆',
      time: timedOutText(),
      ratio: 'Правильно: <b>' + esc(lines.truth) + '</b><br>Игрок 1: ' + esc(B.fmtVal(r.target, B.value(r.target, g1))) +
        ' · Игрок 2: ' + esc(B.fmtVal(r.target, B.value(r.target, g2))),
      factOf: r.target.fact ? r.target : r.ref,
      tip: tipFor(r, Math.max(p1, p2))
    });
    celebrate(Math.max(p1, p2));
  }

  function timedOutText() {
    var who = [1, 2].filter(function (p) { return S.timedOut[p - 1]; });
    if (!who.length) return '';
    return '⏰ Время вышло: ' + who.map(function (p) { return 'Игрок ' + p; }).join(' и ');
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
  }

  function celebrate(pts) {
    var p = B.truthPoint();
    if (pts >= 85) {
      App.fx.confetti(pts === 100 ? 110 : 60);
      App.fx.burst(p.x, p.y, ['⭐', '✨', '🔥', '💥'], pts === 100 ? 18 : 12);
      App.sound.play('win');
      App.bridge.vibrate();
    } else if (pts >= 65) {
      App.fx.burst(p.x, p.y, ['⭐', '✨'], 8);
      App.sound.play('star', 1);
    } else {
      App.fx.burst(p.x, p.y, ['💨', '😵‍💫', '❓'], 6);
      App.sound.play('soft');
    }
    if (!S.duel && S.combo >= 2) setTimeout(function () { App.sound.play('combo', S.combo); }, 300);
  }

  function openSheet(o) {
    S.phase = 'sheet';
    var sc = $('res-score');
    sc.textContent = o.score;
    sc.className = 'res-score s' + o.band + (S.duel ? ' duel' : '');
    $('res-rank').textContent = o.rank;
    $('res-time').textContent = o.time;
    $('res-ratio').innerHTML = o.ratio;
    $('fact-name').textContent = o.factOf.name;
    $('res-fact').textContent = o.factOf.fact;
    $('res-tip').textContent = o.tip;
    $('btn-next').textContent = S.idx + 1 < S.rounds.length ? 'Дальше →' : 'Итоги 🏁';
    // сначала даём рассмотреть доску с ответом
    var ep = S.epoch;
    U.wait(650).then(function () {
      if (ep !== S.epoch) return;
      $('sheet').hidden = false;
      var inner = document.querySelector('.sheet-inner');
      inner.scrollTop = 0;
      restart(sc, 'res-score');
      updateHud();
    });
  }

  $('btn-next').addEventListener('click', function () {
    if (S.phase !== 'sheet') return;
    App.sound.play('swoosh');
    $('sheet').hidden = true;
    if (S.idx + 1 < S.rounds.length) playRound(S.idx + 1);
    else if (S.duel) endDuel();
    else endSolo();
  });

  // ---------- Итоги ----------
  function titleFor(norm) {
    var t = S.content.cfg.titles[0];
    S.content.cfg.titles.forEach(function (x) { if (norm >= x.min) t = x; });
    return t;
  }

  function endSolo() {
    S.phase = 'end';
    var max = maxScore();
    var norm = Math.round(S.score * 1000 / max);
    var isRecord = S.runs > 0 && S.score > S.record;
    S.record = Math.max(S.record, S.score);
    S.runs++;
    var title = titleFor(norm);
    var unlocks = S.content.cfg.unlocks;
    unlocks.forEach(function (u) { if (norm >= u.score && S.acc.indexOf(u.id) < 0) S.acc.push(u.id); });

    $('end-kicker').textContent = isRecord ? '🔥 Новый рекорд сессии!' : 'Итог';
    $('end-score').innerHTML = S.score + '<small> / ' + max + '</small>';
    $('end-title').textContent = title.emoji + ' ' + title.name;
    App.capy.mount(capyEnd, 'happy');
    App.capy.wear(capyEnd, S.acc);
    var grid = S.results.map(function (x) { return square(x.pts); }).join('');
    $('end-grid').textContent = grid;

    var best = S.results.reduce(function (a, b) { return !a || b.pts > a.pts ? b : a; }, null);
    $('end-best').innerHTML = '<h3>Лучшие моменты</h3><ul>' +
      (best ? '<li>🎯 ' + esc(best.round.target.name) + ' vs ' + esc(best.round.ref.name) + ' — ' + best.pts + ' ' + U.plural(best.pts, ['очко', 'очка', 'очков']) + '</li>' : '') +
      (S.bestCombo >= 2 ? '<li>🔥 Лучшая серия: ' + S.bestCombo + ' раунда подряд</li>' : '') +
      '</ul>';

    $('end-unlocks').innerHTML = '<h3>Гардероб Капи</h3><ul>' + unlocks.map(function (u) {
      var open = S.acc.indexOf(u.id) >= 0;
      var need = Math.round(u.score * max / 1000);
      return '<li class="' + (open ? 'new' : 'locked') + '">' + (open ? '✅ ' : '🔒 ') + esc(u.label) +
        (open ? '' : ' — нужно ' + need + ' ' + U.plural(need, ['очко', 'очка', 'очков'])) + '</li>';
    }).join('') + '</ul>';

    var kinds = {};
    S.rounds.forEach(function (r) { kinds[r.kind] = true; });
    var L = S.content.cfg.lessons;
    var lessons = [];
    if (kinds.animals && L.animals) lessons.push('🐾 ' + L.animals);
    if (kinds.countries && L.countries) lessons.push('🗺️ ' + L.countries);
    if (kinds.countries && L.area) lessons.push('📐 ' + L.area);
    $('end-lessons').innerHTML = '<h3>Что теперь знаешь</h3><ul>' + lessons.map(function (l) { return '<li>' + esc(l) + '</li>'; }).join('') + '</ul>';

    show('scr-end');
    $('scr-end').scrollTop = 0;
    if (norm >= 500) App.fx.confetti(100);
    App.sound.play('win');
    App.bridge.finish();
    App.bridge.completed();
    S.last = { score: S.score, max: max, title: title, grid: grid };
  }

  function endDuel() {
    S.phase = 'end';
    var a = S.duelScore[0], b = S.duelScore[1];
    $('duel-score').innerHTML = '<span class="p1">' + a + '</span> : <span class="p2">' + b + '</span>';
    $('duel-title').textContent = a > b ? '🏆 Победил Игрок 1!' : b > a ? '🏆 Победил Игрок 2!' : '🤝 Ничья — оба легенды!';
    var cd = $('capy-duel');
    App.capy.mount(cd, 'happy');
    App.capy.wear(cd, S.acc);
    // кто был ближе в каждом раунде: 🤍 — Игрок 1, 🩷 — Игрок 2, ⚪ — ничья
    $('duel-grid').textContent = S.duelMarks.map(function (w) { return ['⚪', '🤍', '🩷'][w]; }).join('');
    show('scr-duel-end');
    App.fx.confetti(100);
    App.sound.play('win');
    App.bridge.finish();
  }

  // ---------- Поделиться ----------
  function toast(text) {
    var t = $('toast');
    t.textContent = text;
    t.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.hidden = true; }, 1800);
  }

  // Приложение получает SHARING_EVENT и открывает системное «Поделиться».
  // Карточку показываем и в самой игре — так кнопка всегда даёт видимый результат.
  var sharing = false;
  function doShare(text, card) {
    if (sharing) return;
    sharing = true;
    App.sound.play('tap');
    toast('Готовлю карточку…');
    App.share.card(card).then(function (img) {
      sharing = false;
      App.bridge.share(text, img);
      $('toast').hidden = true;
      var im = $('share-img');
      im.hidden = !img;
      if (img) im.src = img;
      $('share-note').textContent = 'Открываем «Поделиться» 📲 Если меню не появилось, зажми картинку — её можно сохранить и отправить другу.';
      $('share-view').hidden = false;
      App.sound.play('win');
    });
  }
  $('btn-share-ok').addEventListener('click', function () {
    App.sound.play('tap');
    $('share-view').hidden = true;
  });

  $('btn-share').addEventListener('click', function () {
    var r = S.last;
    if (!r) return;
    doShare('Мой результат в «Прикинь!» в СберKids: ' + r.score + ' из ' + r.max + ' — «' + r.title.name + '» ' + r.grid +
      '\n' + S.content.cfg.texts.share, {
      kicker: 'Звери и страны: мой результат', big: r.score + ' / ' + r.max, title: r.title.emoji + ' ' + r.title.name,
      grid: r.grid, capy: { acc: S.acc, mood: 'happy' }, footer: S.content.cfg.texts.share
    });
  });

  $('btn-duel-share').addEventListener('click', function () {
    var a = S.duelScore[0], b = S.duelScore[1];
    var grid = $('duel-grid').textContent;
    doShare('Дуэль в «Прикинь!»: ' + a + ' : ' + b + ' ' + grid + '\nКто прикинет точнее? ⚔️', {
      kicker: 'Дуэль на одном телефоне', big: a + ' : ' + b, title: $('duel-title').textContent,
      grid: grid, capy: { acc: S.acc, mood: 'happy' }, footer: 'Кто прикинет точнее? ⚔️'
    });
  });

  // ---------- Старт ----------
  function startSolo(mode) {
    App.sound.play('tap');
    S.duel = false;
    S.turn = 1;
    S.mode = mode || S.mode;
    var cfg = S.content.cfg;
    S.rounds = App.content.makeRun(S.content, S.mode, cfg.rounds, cfg.boss);
    S.results = [];
    S.score = 0;
    S.combo = 0;
    S.bestCombo = 0;
    show('scr-game');
    playRound(0);
  }
  function startDuel() {
    App.sound.play('tap');
    S.duel = true;
    S.rounds = App.content.makeRun(S.content, 'chaos', S.content.cfg.duelRounds, []);
    S.duelScore = [0, 0];
    S.duelMarks = [];
    S.combo = 0;
    show('scr-game');
    playRound(0);
  }
  function toMenu() {
    App.sound.play('tap');
    S.epoch++;          // отменяем отложенные шаги текущего раунда
    S.phase = 'menu';
    tmStop();
    clearTimeout(S.idleT);
    B.demo(false);
    B.enable(false);
    ['intro', 'pass', 'sheet', 'share-view'].forEach(function (id) { $(id).hidden = true; });
    var rec = $('record');
    rec.hidden = !S.record;
    rec.textContent = 'Рекорд этой сессии: ' + S.record;
    App.capy.wear($('capy-start'), capyAcc());
    show('scr-start');
  }

  Array.prototype.forEach.call(document.querySelectorAll('[data-mode]'), function (b) {
    b.addEventListener('click', function () { startSolo(b.getAttribute('data-mode')); });
  });
  $('btn-duel').addEventListener('click', startDuel);
  $('btn-again').addEventListener('click', function () { startSolo(); });
  $('btn-to-duel').addEventListener('click', startDuel);
  $('btn-rematch').addEventListener('click', startDuel);
  $('btn-menu').addEventListener('click', toMenu);
  $('btn-duel-menu').addEventListener('click', toMenu);
  // ✕ в левом верхнем углу — всегда. В приложении CLOSE_EVENT закрывает экран игры;
  // если игра открыта не в приложении и экран остался, возвращаемся в меню.
  $('btn-close').addEventListener('click', function () {
    App.sound.play('tap');
    App.bridge.close();
    setTimeout(function () {
      if (document.visibilityState === 'hidden') return;
      if (S.phase === 'menu') { toast('В СберKids этот крестик закрывает игру'); return; }
      toMenu();
    }, 450);
  });

  function syncSound() {
    var on = App.sound.isOn();
    Array.prototype.forEach.call(document.querySelectorAll('.js-sound'), function (b) {
      b.textContent = b.classList.contains('icon-btn') ? (on ? '🔊' : '🔇') : (on ? '🔊 Звук и вибрация' : '🔇 Тихий режим');
      b.setAttribute('aria-label', on ? 'Выключить звук и вибрацию' : 'Включить звук и вибрацию');
    });
  }
  Array.prototype.forEach.call(document.querySelectorAll('.js-sound'), function (b) {
    b.addEventListener('click', function () { App.sound.toggle(); syncSound(); });
  });

  // Капи на старте отвечает на тап; реплики берутся из game.json → texts.capy
  var LINES = ['Йо! Я Капи. Сколько капибар в ките? 🤔'];
  var lineIdx = 0;
  $('capy-start').addEventListener('click', function (e) {
    lineIdx = (lineIdx + 1) % LINES.length;
    var b = $('hero-bubble');
    b.textContent = LINES[lineIdx];
    b.style.animation = 'none'; void b.offsetWidth; b.style.animation = '';
    App.capy.mood($('capy-start'), 'happy');
    App.fx.burst(e.clientX, e.clientY, ['🍊', '✨', '💥'], 10, 26);
    App.sound.play('boom');
    App.bridge.vibrate();
  });

  function loadContent() {
    $('load-error').hidden = true;
    App.content.load().then(function (c) {
      S.content = c;
      var a = c.pools.animals.length >= 4, k = c.pools.countries.length >= 4;
      document.querySelector('[data-mode="animals"]').disabled = !a;
      document.querySelector('[data-mode="countries"]').disabled = !k;
      document.querySelector('[data-mode="chaos"]').disabled = !(a || k);
      $('btn-duel').disabled = !(a || k);
      $('load-error').hidden = a || k;
      TM.el.hidden = !c.cfg.timer;
      applyLook(c);
    });
  }

  // Наряд Капи на старте: открытые в сессии вещи + то, что задаёт событие
  function capyAcc() {
    var ev = S.content && S.content.event;
    var acc = S.acc.length ? S.acc.slice() : ['orange'];
    if (ev && Array.isArray(ev.capy)) ev.capy.forEach(function (x) { if (acc.indexOf(x) < 0) acc.push(x); });
    return acc;
  }

  // Всё, что меняется из game.json без релиза: цвета, тексты, режимы, событие по датам
  function applyLook(c) {
    var cfg = c.cfg, ev = c.event;
    var theme = { animals: cfg.theme.animals, countries: cfg.theme.countries };
    if (ev && ev.theme) {
      ['animals', 'countries'].forEach(function (k) {
        if (/^#[0-9a-f]{3,8}$/i.test(ev.theme[k] || '')) theme[k] = ev.theme[k];
      });
    }
    document.documentElement.style.setProperty('--board-a', theme.animals);
    document.documentElement.style.setProperty('--board-c', theme.countries);
    $('tagline').innerHTML = App.content.rich(cfg.texts.tagline);
    var lines = Array.isArray(cfg.texts.capy) ? cfg.texts.capy.filter(function (x) { return typeof x === 'string' && x; }) : [];
    if (lines.length) {
      LINES = lines;
      lineIdx = 0;
      $('hero-bubble').textContent = LINES[0];
    }
    var evEl = $('event');
    evEl.hidden = !ev;
    if (ev) {
      evEl.querySelector('b').textContent = ev.title;
      evEl.querySelector('span').textContent = ev.text || '';
    }
    var m = cfg.modes;
    document.querySelector('[data-mode="chaos"]').hidden = !m.chaos;
    document.querySelector('[data-mode="animals"]').hidden = !m.animals;
    document.querySelector('[data-mode="countries"]').hidden = !m.countries;
    $('btn-duel').hidden = !m.duel;
    $('btn-to-duel').hidden = !m.duel;
    App.capy.wear($('capy-start'), capyAcc());
  }
  $('btn-reload').addEventListener('click', loadContent);

  function init() {
    var logo = document.querySelector('.logo');
    logo.innerHTML = 'ПРИКИНЬ!'.split('').map(function (ch, i) {
      return '<span style="animation-delay:' + (i * 0.09) + 's">' + ch + '</span>';
    }).join('');
    App.capy.mount($('capy-start'), 'idle');
    App.capy.wear($('capy-start'), ['orange']);
    B.init($('board'), onBoardChange);
    TM.el = document.createElement('div');
    TM.el.className = 'timer';
    TM.el.setAttribute('data-lvl', 'ok');
    TM.el.innerHTML = '<svg viewBox="0 0 52 52" aria-hidden="true"><circle class="tm-bg" cx="26" cy="26" r="22"/>' +
      '<circle class="tm-ring" cx="26" cy="26" r="22"/></svg><b></b>';
    TM.ring = TM.el.querySelector('.tm-ring');
    TM.num = TM.el.querySelector('b');
    TM.ring.style.strokeDasharray = RING_LEN.toFixed(1);
    TM.el.hidden = true;
    $('board').appendChild(TM.el);
    var stamp = document.createElement('div');
    stamp.className = 'timeup';
    stamp.id = 'timeup';
    stamp.textContent = '⏰ ВРЕМЯ!';
    $('board').appendChild(stamp);
    syncSound();
    loadContent();
  }
  init();
})();
