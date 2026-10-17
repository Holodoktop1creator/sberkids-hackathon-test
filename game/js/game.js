(function () {
  'use strict';
  var App = window.App;
  var U = App.util;
  function $(id) { return document.getElementById(id); }

  var LABEL_H = 26;   // подпись под башней
  var TOP_H = 66;     // место над башней: значение и эмодзи

  var S = {
    content: null,
    mode: 'solo',     // solo | duel
    levels: [],
    idx: 0,
    best: [],         // лучшие звёзды по уровням текущего захода
    shields: [],
    seen: {},
    record: 0,
    acc: [],          // аксессуары Капи, открытые в этой сессии
    phase: 'menu',    // play | pass | reveal | sheet | end
    turn: 1,
    startVal: 0,
    duelScore: [0, 0],
    duelMarks: [],
    hinted: false,
    runs: 0,
    last: null
  };
  var L = null;
  var cols = {};
  var G = { H: 200 };
  var capyGame = $('capy-game');

  // ---------- Экраны ----------
  function show(id) {
    ['scr-start', 'scr-game', 'scr-end', 'scr-duel-end'].forEach(function (s) {
      var e = $(s);
      var on = s === id;
      e.hidden = !on;
      if (on) { e.classList.remove('enter'); void e.offsetWidth; e.classList.add('enter'); }
    });
  }

  // ---------- Значения и единицы ----------
  function unitText(v, l) { return Array.isArray(l.unit) ? U.plural(v, l.unit) : l.unit; }
  function valText(v, l) { return U.fmt(v) + ' ' + unitText(v, l); }
  function snap(v) { return U.clamp(Math.round(v / L.step) * L.step, 0, L.max); }
  function errOf(l, g) { return l.answer > 0 ? Math.abs(g - l.answer) / l.answer : g / l.max; }

  function score(l, g) {
    var err = errOf(l, g);
    var stars;
    if (l.scam) stars = g === 0 ? 3 : 0; // «вернут немного» — тоже неверно: ловушка есть ловушка
    else if (l.answer === 0) stars = g === 0 ? 3 : err <= 0.05 ? 2 : err <= 0.15 ? 1 : 0;
    else stars = err <= 0.05 ? 3 : err <= 0.15 ? 2 : err <= 0.3 ? 1 : 0;
    return { err: err, stars: stars, acc: Math.max(0, Math.round((1 - err) * 100)) };
  }

  // ---------- Башни ----------
  function makeCol(kind, label, emoji) {
    var root = document.createElement('div');
    root.className = 'col col-' + kind;
    root.innerHTML =
      '<div class="col-body"><div class="col-track"><div class="col-fill"></div></div>' +
      '<div class="col-top"><span class="col-val"></span><span class="col-emoji"></span></div></div>' +
      '<div class="col-label"></div>';
    var c = {
      root: root,
      body: root.querySelector('.col-body'),
      track: root.querySelector('.col-track'),
      fill: root.querySelector('.col-fill'),
      top: root.querySelector('.col-top'),
      val: root.querySelector('.col-val'),
      value: 0,
      set: function (v) {
        this.value = v;
        var h = (L.max ? v / L.max : 0) * G.H;
        this.fill.style.transform = 'translateY(' + (G.H - h) + 'px)';
        this.top.style.transform = 'translateY(' + (-h) + 'px)';
        this.val.innerHTML = U.fmt(v) + '<small>' + unitText(v, L) + '</small>';
      }
    };
    root.querySelector('.col-emoji').textContent = emoji || '';
    root.querySelector('.col-label').textContent = label;
    $('cols').appendChild(root);
    return c;
  }

  function patternFor() {
    return L.unit !== '₽' && G.H / L.max >= 6 ? 'pat-blocks' : 'pat-coins';
  }

  function niceStep(max) {
    var raw = max / 5;
    var p = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10));
    var n = raw / p;
    return Math.max(L.step, (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * p);
  }

  function drawGrid() {
    var grid = $('grid');
    var step = niceStep(L.max);
    var html = '';
    for (var v = 0; v <= L.max + 1e-9; v += step) {
      var y = LABEL_H + v / L.max * G.H;
      html += '<div class="gl' + (v === 0 ? ' zero' : '') + '" style="bottom:' + y + 'px"><span>' + (v === 0 ? '0' : U.fmt(v)) + '</span></div>';
    }
    grid.innerHTML = html;
  }

  function measure() {
    if (!L) return;
    var st = $('stage');
    G.H = Math.max(80, st.clientHeight - LABEL_H - TOP_H);
    st.style.setProperty('--H', G.H + 'px');
    st.style.setProperty('--seg', (G.H / L.max) + 'px');
    var pat = patternFor();
    Object.keys(cols).forEach(function (k) {
      cols[k].fill.className = 'col-fill ' + pat;
      cols[k].set(cols[k].value);
    });
    drawGrid();
    if (!$('truth-line').hidden) placeTruthLine();
  }

  function placeTruthLine() {
    $('truth-line').style.bottom = (LABEL_H + L.answer / L.max * G.H) + 'px';
  }

  function active() {
    if (S.mode === 'duel') return S.turn === 1 ? cols.p1 : cols.p2;
    return cols.p1;
  }
  function setActive(c) {
    Object.keys(cols).forEach(function (k) { cols[k].root.classList.toggle('active', cols[k] === c); });
  }

  function animateCol(col, from, to, dur) {
    return new Promise(function (res) {
      var t0 = performance.now();
      function step(t) {
        var k = Math.min(1, (t - t0) / dur);
        col.set(Math.round(from + (to - from) * U.easeOut(k)));
        if (k < 1) requestAnimationFrame(step);
        else { col.set(to); res(); }
      }
      requestAnimationFrame(step);
    });
  }

  // ---------- Желе: башня тянется и пружинит ----------
  var wob = { x: 0, v: 0, raf: 0, col: null };
  function kick(f) {
    wob.v += f;
    wob.col = active();
    if (!wob.raf) wob.raf = requestAnimationFrame(wobStep);
  }
  function wobStep() {
    wob.v += -wob.x * 0.2;
    wob.v *= 0.8;
    wob.x += wob.v;
    var s = U.clamp(wob.x, -0.16, 0.16);
    if (Math.abs(wob.x) < 0.001 && Math.abs(wob.v) < 0.001) {
      wob.raf = 0; wob.x = wob.v = 0;
      if (wob.col) wob.col.body.style.transform = '';
      return;
    }
    if (wob.col) wob.col.body.style.transform = 'scale(' + (1 - s * 0.6) + ',' + (1 + s) + ')';
    wob.raf = requestAnimationFrame(wobStep);
  }

  // ---------- HUD ----------
  function updateHud() {
    var dots = '';
    for (var i = 0; i < S.levels.length; i++) {
      var cls = '';
      if (S.mode === 'solo' && S.best[i] !== undefined) cls = 's' + S.best[i];
      else if (S.mode === 'duel' && S.duelMarks[i] !== undefined) cls = 's3';
      if (i === S.idx && S.phase !== 'sheet') cls += ' cur';
      dots += '<i class="' + cls + '"></i>';
    }
    $('dots').innerHTML = dots;
    var hs = $('hud-score');
    hs.innerHTML = S.mode === 'duel'
      ? '<span style="color:var(--lime)">' + S.duelScore[0] + '</span> : <span style="color:var(--pink)">' + S.duelScore[1] + '</span>'
      : '⭐ ' + total();
    hs.classList.remove('bump'); void hs.offsetWidth; hs.classList.add('bump');
  }
  function total() { return S.best.reduce(function (a, b) { return a + (b || 0); }, 0); }

  function setControls(on) {
    ['btn-go', 'btn-minus', 'btn-plus'].forEach(function (id) { $(id).disabled = !on; });
  }

  // ---------- Уровень ----------
  function startValue() {
    if (L.start !== undefined) return L.start;
    var v, tries = 0;
    do { v = snap(U.rand(0.12, 0.9) * L.max); tries++; }
    while (tries < 30 && Math.abs(v - L.answer) < L.max * 0.18);
    return v;
  }

  function loadLevel(i) {
    S.idx = i;
    L = S.levels[i];
    var ch = S.content.chapters[L.chapter];
    $('chip').textContent = ch.icon + ' ' + ch.name;
    var q = $('qcard');
    q.style.animation = 'none'; void q.offsetWidth; q.style.animation = '';
    if (L.msg) {
      $('msg').hidden = false;
      $('msg-ava').textContent = L.msg.ava || '💬';
      $('msg-from').textContent = L.msg.from;
      $('msg-text').textContent = L.msg.text;
    } else {
      $('msg').hidden = true;
    }
    $('q-text').textContent = L.q;

    $('cols').innerHTML = '';
    cols = {};
    if (L.ref) cols.ref = makeCol('ref', L.ref.label, L.ref.emoji);
    if (S.mode === 'duel') {
      cols.p1 = makeCol('player', 'Игрок 1', L.item);
      cols.p2 = makeCol('p2', 'Игрок 2', L.item);
    } else {
      cols.p1 = makeCol('player', 'Твоя башня', L.item);
    }
    cols.truth = makeCol('truth', 'Ответ', '✅');
    cols.truth.body.style.opacity = '0';
    $('truth-line').hidden = true;
    $('sheet').hidden = true;

    measure();
    if (cols.ref) cols.ref.set(L.ref.value);
    S.startVal = startValue();
    cols.p1.set(S.startVal);
    if (cols.p2) cols.p2.set(S.startVal);
    cols.truth.set(0);

    App.capy.mood(capyGame, 'idle');
    S.turn = 1;
    if (S.mode === 'duel') {
      cols.p2.root.classList.add('hidden-turn');
      askPass(1);
    } else {
      beginTurn();
    }
    updateHud();
  }

  function beginTurn() {
    S.phase = 'play';
    setControls(true);
    setActive(active());
    var t = $('turn');
    if (S.mode === 'duel') {
      t.hidden = false;
      t.className = 'turn p' + S.turn;
      t.textContent = S.turn === 1 ? 'Ходит Игрок 1' : 'Ходит Игрок 2';
    } else {
      t.hidden = true;
    }
    $('hint').hidden = S.hinted;
  }

  function hideHint() {
    if (!S.hinted) { S.hinted = true; $('hint').hidden = true; }
  }

  // ---------- Перетаскивание ----------
  var drag = null;
  var lastTick = 0;
  var stage = $('stage');

  stage.addEventListener('pointerdown', function (e) {
    if (S.phase !== 'play') return;
    drag = { y: e.clientY, v: active().value, last: e.clientY, id: e.pointerId };
    try { stage.setPointerCapture(e.pointerId); } catch (_) { /* не критично */ }
    hideHint();
    App.capy.mood(capyGame, 'think');
  });
  stage.addEventListener('pointermove', function (e) {
    if (!drag || e.pointerId !== drag.id || S.phase !== 'play') return;
    var col = active();
    var v = snap(drag.v + (drag.y - e.clientY) / G.H * L.max);
    if (v !== col.value) {
      col.set(v);
      var now = performance.now();
      if (now - lastTick > 35) { App.sound.play('tick', v / L.max); lastTick = now; }
    }
    kick((drag.last - e.clientY) * 0.004);
    drag.last = e.clientY;
  });
  function endDrag() {
    if (!drag) return;
    drag = null;
    if (S.phase === 'play') App.capy.mood(capyGame, 'idle');
  }
  stage.addEventListener('pointerup', endDrag);
  stage.addEventListener('pointercancel', endDrag);

  function nudge(d) {
    if (S.phase !== 'play') return false;
    var col = active();
    var v = snap(col.value + d * L.step);
    if (v === col.value) return false;
    col.set(v);
    App.sound.play('tick', v / L.max);
    kick(d * 0.05);
    hideHint();
    return true;
  }
  // кнопки ± с автоповтором при удержании
  [['btn-minus', -1], ['btn-plus', 1]].forEach(function (p) {
    var btn = $(p[0]);
    var timer = 0;
    function stop() { clearTimeout(timer); clearInterval(timer); timer = 0; }
    btn.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      if (!nudge(p[1])) return;
      timer = setTimeout(function () {
        timer = setInterval(function () { if (!nudge(p[1])) stop(); }, 60);
      }, 350);
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(function (ev) { btn.addEventListener(ev, stop); });
  });

  // ---------- Готово / дуэль ----------
  $('btn-go').addEventListener('click', function () {
    if (S.phase !== 'play') return;
    App.sound.play('lock');
    if (S.mode === 'duel' && S.turn === 1) {
      cols.p1.root.classList.add('hidden-turn');
      askPass(2);
      return;
    }
    reveal();
  });

  function askPass(player) {
    S.phase = 'pass';
    setControls(false);
    setActive(null);
    $('pass-title').textContent = 'Ходит Игрок ' + player;
    $('pass-text').textContent = player === 1
      ? 'Задание ' + (S.idx + 1) + ' из ' + S.levels.length + '. Игрок 2 — отвернись 🙈'
      : 'Игрок 1 спрятал(а) свой ответ. Передай телефон — и не подглядывай 🙈';
    $('btn-pass').textContent = player === 1 ? 'Я Игрок 1, погнали!' : 'Я Игрок 2, погнали!';
    $('pass').hidden = false;
  }
  $('btn-pass').addEventListener('click', function () {
    App.sound.play('tap');
    $('pass').hidden = true;
    // первый игрок уже спрятал ответ — значит, ходит второй
    if (cols.p1.root.classList.contains('hidden-turn')) {
      S.turn = 2;
      cols.p2.root.classList.remove('hidden-turn');
    }
    beginTurn();
  });

  // ---------- Проверка ----------
  function reveal() {
    S.phase = 'reveal';
    setControls(false);
    setActive(null);
    hideHint();
    if (cols.p2) cols.p1.root.classList.remove('hidden-turn');
    $('turn').hidden = true;
    cols.truth.body.style.opacity = '1';
    App.sound.play('rise');
    animateCol(cols.truth, 0, L.answer, L.answer > 0 ? 900 : 250).then(function () {
      $('truth-label').textContent = '✓ ответ';
      $('truth-line').hidden = false;
      placeTruthLine();
      if (S.mode === 'duel') duelResult(); else soloResult();
    });
  }

  function crumble(col) {
    var fy = (G.H - col.value / L.max * G.H) + 'px';
    col.fill.style.setProperty('--fy', fy);
    col.root.classList.add('crumble');
    App.fx.rain(col.track.getBoundingClientRect(), L.item, 14);
    App.sound.play('crumble');
    App.bridge.vibrate();
    stage.classList.remove('shake'); void stage.offsetWidth; stage.classList.add('shake');
    return U.wait(750).then(function () {
      col.root.classList.remove('crumble');
      col.set(0);
    });
  }

  function celebrate(stars, col) {
    var r = col.track.getBoundingClientRect();
    var x = r.left + r.width / 2;
    var y = r.bottom - col.value / L.max * G.H;
    if (stars === 3) {
      App.fx.confetti(60);
      App.fx.burst(x, y, ['⭐', '✨', '🪙', L.item], 14);
      App.sound.play('win');
      App.bridge.vibrate();
    } else if (stars === 2) {
      App.fx.burst(x, y, ['⭐', '✨'], 8);
      App.bridge.vibrate();
    } else {
      App.sound.play('soft');
    }
  }

  function soloResult() {
    var g = cols.p1.value;
    var r = score(L, g);
    var trapFail = L.answer === 0 && g > 0;
    var chain = trapFail ? crumble(cols.p1) : Promise.resolve();
    chain.then(function () {
      var prev = S.best[S.idx];
      S.best[S.idx] = prev === undefined ? r.stars : Math.max(prev, r.stars);
      var mood = r.stars === 3 ? 'happy' : r.stars === 2 ? 'ok' : trapFail ? 'shock' : 'idle';
      App.capy.mood(capyGame, mood);

      var shield = null;
      if (L.scam && r.stars === 3) {
        if (L.shield && S.shields.indexOf(L.shield) < 0) S.shields.push(L.shield);
        shield = { ok: true, text: 'Новый щит: ' + (L.shield || '🛡️') };
        App.sound.play('shield');
      } else if (L.scam) {
        shield = { ok: false, text: 'Запомни: ' + (L.shield || 'это ловушка') };
      } else if (L.chapter === 'inbox' && g === 0) {
        shield = { ok: false, text: 'Проверять — правильно! Но тут всё честно: тебя не торопят и ничего не просят 🙂' };
      }

      var key = L.scam ? (r.stars === 3 ? 'scamWin' : 'scamFail') : String(r.stars);
      var rx = S.content.reactions;
      var acc = L.answer === 0
        ? (g === 0 ? 'Твой ответ: 0 — верно!' : 'Твой ответ: ' + valText(g, L) + ' · На деле: 0')
        : 'Твой ответ: ' + valText(g, L) + ' · Точность ' + r.acc + '%';
      openSheet({
        stars: r.stars,
        title: U.pick(rx[key] || rx[String(r.stars)] || ['']),
        acc: acc,
        shield: shield,
        explain: L.explain,
        retry: r.stars < 3
      });
      celebrate(r.stars, cols.p1);
    });
  }

  function duelResult() {
    var a = cols.p1.value, b = cols.p2.value;
    var e1 = errOf(L, a), e2 = errOf(L, b);
    var w = Math.abs(e1 - e2) < 1e-9 ? 0 : e1 < e2 ? 1 : 2;
    var chain = Promise.resolve();
    if (L.answer === 0) {
      if (a > 0) chain = chain.then(function () { return crumble(cols.p1); });
      if (b > 0) chain = chain.then(function () { return crumble(cols.p2); });
    }
    chain.then(function () {
      if (w) S.duelScore[w - 1]++;
      S.duelMarks[S.idx] = w;
      App.capy.mood(capyGame, 'happy');
      var title = w === 0 ? 'Ничья! 🤝' : 'Игрок ' + w + ' ближе! 🏆';
      openSheet({
        stars: null,
        title: title,
        acc: 'Игрок 1: ' + valText(a, L) + ' · Игрок 2: ' + valText(b, L),
        shield: L.scam ? { ok: true, text: 'Щит: ' + L.shield } : null,
        explain: L.explain,
        retry: false
      });
      App.fx.confetti(40);
      App.sound.play('win');
      App.bridge.vibrate();
    });
  }

  function openSheet(o) {
    S.phase = 'sheet';
    var starsEl = $('res-stars');
    starsEl.hidden = o.stars === null;
    var is = starsEl.querySelectorAll('i');
    for (var i = 0; i < 3; i++) is[i].className = '';
    $('res-title').textContent = o.title;
    $('res-acc').textContent = o.acc;
    var sh = $('res-shield');
    sh.hidden = !o.shield;
    if (o.shield) { sh.textContent = o.shield.text; sh.className = 'res-shield' + (o.shield.ok ? '' : ' warn'); }
    $('res-explain').textContent = o.explain;
    $('btn-retry').hidden = !o.retry;
    $('btn-next').textContent = S.idx + 1 < S.levels.length ? 'Дальше →' : 'Итоги 🏁';
    // сначала ребёнок видит сравнение башен, потом выезжает объяснение
    U.wait(1000).then(function () {
      $('sheet').hidden = false;
      updateHud();
      if (o.stars) {
        for (var k = 0; k < o.stars; k++) {
          (function (k) {
            setTimeout(function () { is[k].className = 'on'; App.sound.play('star', k); }, 250 + k * 200);
          })(k);
        }
      }
    });
  }

  $('btn-next').addEventListener('click', function () {
    if (S.phase !== 'sheet') return;
    App.sound.play('swoosh');
    $('sheet').hidden = true;
    if (S.idx + 1 < S.levels.length) loadLevel(S.idx + 1);
    else if (S.mode === 'duel') endDuel();
    else endSolo();
  });
  $('btn-retry').addEventListener('click', function () {
    if (S.phase !== 'sheet') return;
    App.sound.play('tap');
    loadLevel(S.idx);
  });

  // ---------- Итоги ----------
  function starSquare(s) { return ['⬜', '🟧', '🟨', '🟩'][s || 0]; }
  function titleFor(ratio) {
    var t = S.content.titles[0];
    S.content.titles.forEach(function (x) { if (ratio >= x.min) t = x; });
    return t;
  }

  function endSolo() {
    S.phase = 'end';
    var sum = total();
    var max = S.levels.length * 3;
    var isRecord = S.runs > 0 && sum > S.record;
    if (sum > S.record) S.record = sum;
    S.levels.forEach(function (l) { S.seen[l.id] = true; });
    var title = titleFor(sum / max);
    var unlocks = S.content.unlocks;
    var got = unlocks.filter(function (u) { return sum >= u.stars; }).map(function (u) { return u.id; });
    got.forEach(function (id) { if (S.acc.indexOf(id) < 0) S.acc.push(id); });

    $('end-stars').innerHTML = sum + ' ⭐<small> / ' + max + '</small>';
    $('end-title').textContent = title.emoji + ' ' + title.name;
    document.querySelector('#scr-end .end-kicker').textContent = isRecord ?'Новый рекорд сессии!' : 'Итог';
    var capyEnd = $('capy-end');
    App.capy.mount(capyEnd, 'happy');
    App.capy.wear(capyEnd, S.acc);
    $('end-grid').textContent = S.best.map(starSquare).join('');

    $('end-unlocks').innerHTML = '<h3>Гардероб Капи</h3><ul>' + unlocks.map(function (u) {
      var open = S.acc.indexOf(u.id) >= 0;
      return '<li class="' + (open ? 'new' : 'locked') + '">' + (open ? '✅ ' : '🔒 ') + u.label + (open ? '' : ' — нужно ' + u.stars + ' ⭐') + '</li>';
    }).join('') + '</ul>';

    var shp = $('end-shields');
    shp.hidden = !S.shields.length;
    shp.innerHTML = '<h3>Твои щиты от мошенников</h3><ul>' + S.shields.map(function (s) { return '<li>' + s + '</li>'; }).join('') + '</ul>';

    var seenCh = [];
    S.levels.forEach(function (l) { if (seenCh.indexOf(l.chapter) < 0) seenCh.push(l.chapter); });
    $('end-lessons').innerHTML = '<h3>Что теперь умеешь</h3><ul>' + seenCh.map(function (k) {
      var c = S.content.chapters[k];
      return '<li>' + c.icon + ' ' + c.lesson + '</li>';
    }).join('') + '</ul>';

    S.runs++;
    show('scr-end');
    $('scr-end').scrollTop = 0;
    if (sum / max >= 0.5) App.fx.confetti(90);
    App.sound.play('win');
    App.bridge.finish();
    App.bridge.completed();
    S.last = { sum: sum, max: max, title: title };
  }

  function endDuel() {
    S.phase = 'end';
    var a = S.duelScore[0], b = S.duelScore[1];
    $('duel-score').innerHTML = '<span class="p1">' + a + '</span> : <span class="p2">' + b + '</span>';
    $('duel-title').textContent = a > b ? '🏆 Победил Игрок 1!' : b > a ? '🏆 Победил Игрок 2!' : '🤝 Ничья — оба молодцы!';
    var cd = $('capy-duel');
    App.capy.mount(cd, 'happy');
    App.capy.wear(cd, S.acc);
    $('duel-grid').textContent = S.duelMarks.map(function (w) { return ['⚪', '🟢', '🟣'][w]; }).join('');
    show('scr-duel-end');
    App.fx.confetti(90);
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

  $('btn-share').addEventListener('click', function () {
    var r = S.last;
    if (!r) return;
    App.sound.play('tap');
    var grid = S.best.map(starSquare).join('');
    var text = 'Мой результат в игре «Прикинь!» в СберKids: ' + r.sum + '⭐ из ' + r.max +
      ' — «' + r.title.name + '» ' + grid + '\nСможешь прикинуть точнее? 😏';
    toast('Готовлю карточку…');
    App.share.card({
      kicker: 'Мой результат', big: r.sum + ' ⭐ / ' + r.max, title: r.title.emoji + ' ' + r.title.name,
      grid: grid, capy: { acc: S.acc, mood: 'happy' }, footer: 'Сможешь прикинуть точнее? 😏'
    }).then(function (img) { App.bridge.share(text, img); });
  });

  $('btn-duel-share').addEventListener('click', function () {
    App.sound.play('tap');
    var a = S.duelScore[0], b = S.duelScore[1];
    var grid = S.duelMarks.map(function (w) { return ['⚪', '🟢', '🟣'][w]; }).join('');
    var text = 'Дуэль в «Прикинь!»: ' + a + ' : ' + b + ' ' + grid + '\nКто прикинет точнее? ⚔️';
    toast('Готовлю карточку…');
    App.share.card({
      kicker: 'Дуэль на одном телефоне', big: a + ' : ' + b, title: $('duel-title').textContent,
      grid: grid, capy: { acc: S.acc, mood: 'happy' }, footer: 'Кто прикинет точнее? ⚔️'
    }).then(function (img) { App.bridge.share(text, img); });
  });

  // ---------- Старт ----------
  function startSolo() {
    App.sound.play('tap');
    S.mode = 'solo';
    S.levels = App.content.pick(S.content, S.content.run, S.seen);
    S.best = [];
    show('scr-game');
    loadLevel(0);
  }
  function startDuel() {
    App.sound.play('tap');
    S.mode = 'duel';
    S.levels = App.content.pick(S.content, S.content.duel, S.seen);
    S.duelScore = [0, 0];
    S.duelMarks = [];
    show('scr-game');
    loadLevel(0);
  }
  function toMenu() {
    App.sound.play('tap');
    S.phase = 'menu';
    var rec = $('record');
    rec.hidden = !S.record;
    rec.textContent = 'Рекорд этой сессии: ' + S.record + ' ⭐';
    App.capy.wear($('capy-start'), S.acc.length ? S.acc : ['orange']);
    show('scr-start');
  }

  $('btn-solo').addEventListener('click', startSolo);
  $('btn-duel').addEventListener('click', startDuel);
  $('btn-again').addEventListener('click', startSolo);
  $('btn-to-duel').addEventListener('click', startDuel);
  $('btn-rematch').addEventListener('click', startDuel);
  $('btn-menu').addEventListener('click', toMenu);
  $('btn-duel-menu').addEventListener('click', toMenu);
  Array.prototype.forEach.call(document.querySelectorAll('.js-exit'), function (b) {
    b.addEventListener('click', function () { App.bridge.close(); });
  });

  function syncSound() {
    var on = App.sound.isOn();
    Array.prototype.forEach.call(document.querySelectorAll('.js-sound'), function (b) {
      b.textContent = b.classList.contains('icon-btn') ? (on ? '🔊' : '🔇') : (on ? '🔊 Звук' : '🔇 Без звука');
    });
  }
  Array.prototype.forEach.call(document.querySelectorAll('.js-sound'), function (b) {
    b.addEventListener('click', function () { App.sound.toggle(); syncSound(); });
  });

  // Капи на старте реагирует на тап — маленькая пасхалка
  var LINES = [
    'Привет! Я Капи. Прикинем?',
    'Скейт = 50 пончиков. Прикинь!',
    'Капибары не спешат. Мошенники — спешат 😌',
    'Код из СМС? Никому. Даже мне.',
    'Тяни башню — и смотри, кто точнее!'
  ];
  var lineIdx = 0;
  $('capy-start').addEventListener('click', function (e) {
    lineIdx = (lineIdx + 1) % LINES.length;
    var b = $('hero-bubble');
    b.textContent = LINES[lineIdx];
    b.style.animation = 'none'; void b.offsetWidth; b.style.animation = '';
    App.capy.mood($('capy-start'), 'happy');
    App.fx.burst(e.clientX, e.clientY, ['🍊', '✨', '🪙'], 8, 24);
    App.sound.play('tap');
    App.bridge.vibrate();
  });

  window.addEventListener('resize', function () { if (S.phase !== 'menu' && S.phase !== 'end') measure(); });

  function init() {
    var logo = document.querySelector('.logo');
    logo.innerHTML = 'ПРИКИНЬ!'.split('').map(function (ch, i) {
      return '<span style="animation-delay:' + (i * 0.12) + 's">' + ch + '</span>';
    }).join('');
    App.capy.mount($('capy-start'), 'idle');
    App.capy.wear($('capy-start'), ['orange']);
    App.capy.mount(capyGame, 'idle');
    syncSound();
    $('btn-solo').disabled = $('btn-duel').disabled = true;
    App.content.load().then(function (c) {
      S.content = c;
      $('btn-solo').disabled = $('btn-duel').disabled = false;
    });
  }
  init();
})();
