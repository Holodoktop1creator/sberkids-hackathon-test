(function () {
  'use strict';
  var App = window.App;
  var U = App.util;
  var B = App.board;
  var ic = U.icon;
  function $(id) { return document.getElementById(id); }

  var S = {
    content: null,
    mode: 'chaos',
    duel: false,
    rounds: [],
    idx: 0,
    results: [],
    score: 0,
    hudShown: 0,     // сколько очков уже показано в HUD — счётчик доезжает до score
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
    epoch: 0         // меняется при новом раунде и выходе в меню — отменяет отложенные шаги
  };
  var capyEnd = $('capy-end');

  // Цвета палитры для canvas-эффектов и карточки (те же, что в css/style.css)
  var C = { lime: '#b6ee3a', violet: '#6c4dff', green: '#17b26a', red: '#ff4d5e', orange: '#ff8a3d', yellow: '#ffc83d', pink: '#ff5ca8', sky: '#3fb2ff', mute: '#cfcbe6' };
  var BAND_COLOR = [C.mute, '#ffb020', '#9cd92b', C.green];

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
  // цветные квадраты только для текста «поделиться»: так сетку узнают в мессенджере
  function shareSquare(p) { return ['⬜', '🟧', '🟨', '🟩'][band(p)]; }
  function rankText(p) {
    var r = S.content.cfg.ranks;
    for (var i = 0; i < r.length; i++) if (p >= r[i].min) return r[i].text;
    return '';
  }
  function maxScore() { return S.rounds.reduce(function (a, r) { return a + (r.boss ? 200 : 100); }, 0); }
  function pointsWord(n) { return U.plural(n, ['очко', 'очка', 'очков']); }

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
    if (S.duel) {
      hs.innerHTML = S.duelScore[0] + ' : <span class="p2">' + S.duelScore[1] + '</span>';
    } else if (S.hudShown !== S.score) {
      U.countUp(hs, S.hudShown, S.score, 500);
      S.hudShown = S.score;
      restart(hs, 'bump');
    } else {
      cancelAnimationFrame(hs._cu || 0);
      hs.textContent = String(S.score);
    }
    var c = $('combo');
    c.hidden = S.duel || S.combo < 2;
    if (!c.hidden && c._n !== S.combo) { c.innerHTML = ic('bolt') + 'Серия ×' + S.combo; restart(c, 'combo'); }
    c._n = c.hidden ? 0 : S.combo;
  }

  function setControls(on) {
    ['btn-go', 'btn-minus', 'btn-plus'].forEach(function (id) { $(id).disabled = !on; });
  }

  // ---------- Раунд ----------
  var ASK = { long: 'сколько в длину?', tail: 'сколько в длину с хвостом?', tall: 'сколько в высоту?', diam: 'какой диаметр?', area: 'какая площадь?' };
  // иконка в «аватарке» поста: откуда пришло заявление
  var SRC_ICON = { social: 'chat', movie: 'film', photo: 'camera', map: 'map', rumor: 'rumor', cartoon: 'tv', think: 'bulb', ad: 'tag', friend: 'duel' };
  var P = App.content.price;
  function askText(r) {
    // в ценах — «сколько это мороженых?»: цена вещи и эталона видна на ценниках под столбиками
    if (r.kind === 'prices') return 'сколько это ' + r.ref.forms[2] + '?';
    var ask = S.content.cfg.texts.ask || {};
    var key = r.kind === 'countries' ? 'area' : r.target.dim;
    return typeof ask[key] === 'string' && ask[key] ? ask[key] : ASK[key];
  }
  function postHead(r, i) {
    $('post-ava').innerHTML = ic(SRC_ICON[r.claim.srcKey] || 'rumor');
    $('post-src').textContent = r.claim.source;
    var tag = $('post-tag');
    tag.className = 'post-tag' + (r.boss ? ' boss' : r.rematch ? ' rematch' : '');
    tag.textContent = r.boss ? 'Босс ×2' : r.rematch ? 'Реванш' : (i + 1) + ' / ' + S.rounds.length;
  }

  function playRound(i) {
    S.idx = i;
    var r = S.rounds[i];
    var ep = ++S.epoch;
    S.phase = 'intro';
    setControls(false);
    $('sheet').hidden = true;
    postHead(r, i);
    // громкое заявление, которое надо проверить
    var text = U.plain(r.claim.text);
    $('claim').textContent = '«' + text.replace(/\.$/, '') + '»';
    restart($('claim'), 'in');
    $('ask').innerHTML = ic('search') + '<span>Проверь: <b>' + esc(r.target.name) + '</b> — ' + esc(askText(r)) + '</span>';
    $('board').classList.toggle('boss', !!r.boss);
    $('board').classList.remove('scanning');
    $('turn').hidden = true;
    // лаймовый силуэт стартует в размере, который обещает заявление
    B.setRound(r, { start: r.claim.g0 });
    B.enable(false);
    updateHud();
    showIntro(r).then(function () {
      if (ep !== S.epoch) return;
      if (S.duel) askPass(1);
      else beginTurn();
    });
  }

  function showIntro(r) {
    var ov = $('intro');
    var tag = $('intro-tag');
    tag.textContent = r.boss ? 'Босс-раунд · очки ×2' : r.rematch ? 'Реванш · новый эталон' : 'Раунд ' + (S.idx + 1) + ' из ' + S.rounds.length;
    tag.className = 'intro-tag' + (r.boss ? ' boss' : r.rematch ? ' rematch' : '');
    ov.classList.toggle('boss', !!r.boss);
    $('intro-a').textContent = r.target.name;
    $('intro-b').innerHTML = '';
    $('intro-b').appendChild(document.createTextNode(r.ref.name));
    var sm = document.createElement('small');
    sm.textContent = 'эталон';
    $('intro-b').appendChild(sm);
    $('intro-q').textContent = 'Фейк или правда?';
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
      setTimeout(finish, r.boss ? 1500 : 1150);
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
      t.textContent = 'Тянет Игрок ' + S.turn;
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

  // Фиксация ответа
  function lockIn() {
    if (S.phase !== 'play') return;
    App.sound.play('lock');
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
  $('btn-go').addEventListener('click', lockIn);

  function askPass(player) {
    S.phase = 'pass';
    setControls(false);
    S.turn = player;
    $('pass-title').textContent = 'Ход Игрока ' + player;
    $('pass-text').textContent = player === 1
      ? 'Раунд ' + (S.idx + 1) + ' из ' + S.rounds.length + '. Игрок 2 — отвернись и не подглядывай.'
      : 'Ответ Игрока 1 спрятан. Передай телефон — и не подглядывай.';
    $('btn-pass').textContent = 'Я Игрок ' + player + ', начинаю';
    document.querySelector('.pass-card').className = 'pass-card p' + player;
    $('pass').hidden = false;
  }
  $('btn-pass').addEventListener('click', function () {
    App.sound.play('tap');
    $('pass').hidden = true;
    beginTurn();
  });

  // ---------- Проверка ----------
  // Луч сканера проходит по доске, затем проступает настоящий размер и падает штамп
  function reveal() {
    S.phase = 'reveal';
    setControls(false);
    B.enable(false);
    $('turn').hidden = true;
    if (S.duel) B.setTurn(-1, [true, true]);
    var board = $('board');
    var r = S.rounds[S.idx];
    var cl = r.claim;
    restart(board, 'scanning');
    App.sound.play('scan');
    var ep = S.epoch;
    U.wait(U.reduced ? 0 : 380).then(function () {
      if (ep !== S.epoch) return null;
      B.reveal();
      var v = $('verdict');
      v.textContent = cl.isTrue ? 'ПРАВДА' : 'ФЕЙК';
      v.className = 'verdict ' + (cl.isTrue ? 'is-true' : 'is-fake');
      restart(v, 'show');
      App.sound.play('slam');
      restart(board, 'shake');
      var br = board.getBoundingClientRect();
      App.fx.ring(br.left + br.width / 2, br.top + br.height * 0.42, cl.isTrue ? C.green : C.red, Math.min(br.width, 300) * 0.55, 6);
      return U.wait(450);
    }).then(function () {
      if (ep !== S.epoch) return;
      if (S.duel) duelResult(); else soloResult();
    });
  }

  function ratio(x) { return (x < 1 ? U.dec(x, 2) : U.fmtRatio(x)) + ' ×'; }
  // всегда «большее = N × меньшее» по настоящим размерам; в ценах — «Самокат = 40 мороженых»
  function equation(r) {
    var t = r.target, ref = r.ref, k = t.value / ref.value;
    if (r.kind === 'prices') return t.name + (Math.abs(P.round(k) - k) > k * 0.01 ? ' ≈ ' : ' = ') + P.count(k, ref);
    return k < 1 ? ref.name + ' = ' + U.fmtRatio(1 / k) + ' × ' + t.name : t.name + ' = ' + U.fmtRatio(k) + ' × ' + ref.name;
  }
  function ratioLines(r, g) {
    var t = r.target, ref = r.ref;
    if (r.kind === 'prices') {
      return { truth: equation(r), guess: P.count(B.value(t, g) / ref.value, ref), said: P.count(r.claim.says, ref), eq: '' };
    }
    var k = t.value / ref.value;
    var gv = B.value(t, g) / ref.value;
    var flip = k < 1;
    function side(x) { return flip ? 1 / x : x; }
    return { truth: equation(r), guess: ratio(side(gv)), said: ratio(side(r.claim.says)), eq: '' };
  }

  // Значки в ряд: целые и обрезанный последний; больше max — один значок = 2, 5, 10, 20…
  function unitRow(n, max, one, w) {
    var per = 1, k = 0;
    while (n / per > max) { k++; per = [1, 2, 5][k % 3] * Math.pow(10, Math.floor(k / 3)); }
    var m = n / per, whole = Math.floor(m + 1e-9), frac = m - whole;
    var icons = '';
    for (var i = 0; i < whole; i++) icons += '<i class="u" style="animation-delay:' + (0.25 + i * 0.045).toFixed(2) + 's">' + one + '</i>';
    // дробная часть — обрезанный значок
    if (frac >= 0.08) icons += '<i class="u" style="width:' + Math.max(4, Math.round(w * frac)) + 'px;animation-delay:' + (0.25 + whole * 0.045).toFixed(2) + 's">' + one + '</i>';
    return { icons: icons, per: per };
  }

  // «Сколько раз помещается»: меньший предмет значками в ряд — умножение видно глазами.
  // Работает для любой пары: по длине, росту и площади. В ценах значки — понятная единица:
  // 40 мороженых рядами по десять, чтобы их было видно поштучно.
  function unitsHtml(r) {
    var cfg = S.content.cfg.units;
    if (!cfg.show) return '';
    var price = r.kind === 'prices';
    var k = r.target.value / r.ref.value;
    var small = k >= 1 || price ? r.ref : r.target;
    var n = k >= 1 || price ? k : 1 / k;
    var a = small.vb[2] / small.vb[3];
    // в ценах значки вписаны в квадрат 22 px — десять штук встают в один ряд
    var h = price ? (a > 1 ? 22 / a : 22) : 28, w = Math.round(price ? Math.max(10, Math.min(22, 22 * a)) : U.clamp(h * a, 16, 56));
    var inner = small.layers ? App.assets.layer(small, 'ref') : '<g fill="currentColor">' + small.markup + '</g>';
    // силуэт один раз в symbol, дальше — ссылки: у стран контуры по несколько КБ
    var html = '<svg class="u-defs" aria-hidden="true"><symbol id="u-sym" viewBox="' + small.vb.join(' ') + '" preserveAspectRatio="xMidYMid meet">' + inner + '</symbol></svg>';
    var row = unitRow(n, price ? 50 : cfg.max, '<svg class="u-ic" style="width:' + w + 'px;height:' + Math.round(h) + 'px"><use href="#u-sym"/></svg>', w);
    var rowAttr = price ? ' class="u-row tens" style="max-width:' + (w * 10 + 46) + 'px"' : ' class="u-row"';
    return html + '<div class="units"><div' + rowAttr + '>' + row.icons + '</div>' +
      '<b class="u-n">' + (price ? U.fmtRatio(P.round(n)) : U.fmtRatio(n) + ' ×') + '</b></div>' +
      (row.per > 1 ? '<div class="u-note">Один значок = ' + esc(price ? P.count(row.per, small) : U.fmt(row.per) + ' × ' + small.name) + '</div>' : '');
  }

  // Почему фейк: в ценах — расчёт «4 000 ₽ ÷ 100 ₽ = 40 мороженых», а потом пояснение из заявления
  function whyText(r) {
    var cl = r.claim, why = U.plain(cl.why);
    if (r.kind === 'prices') {
      var t = r.target, u = r.ref, k = t.value / u.value;
      var calc = U.fmt(t.value) + ' ₽ ÷ ' + U.fmt(u.value) + ' ₽ ' + (Math.abs(P.round(k) - k) > k * 0.01 ? '≈' : '=') + ' ' +
        P.count(k, u) + (cl.isTrue ? ' — всё сходится.' : ', а не ' + U.fmtRatio(P.round(cl.says)) + '.');
      return calc + (why ? ' ' + why : '');
    }
    return why || (cl.isTrue ? 'Заявление совпадает с настоящими размерами.' :
      'Заявление сильно ошибается — сравни с эталоном. Громкие слова ещё не факт.');
  }

  // Вердикт детектора: фейк раскрыт, если ребёнок подогнал силуэт близко к правде
  function verdictInfo(r, pts) {
    var cl = r.claim;
    if (cl.isTrue) return { badge: 'Правда', cls: 'is-true', sub: S.duel ? 'Заявление верное' : pts >= 65 ? 'Проверка пройдена' : 'Не всё в сети — фейк' };
    return { badge: 'Фейк', cls: 'is-fake', sub: S.duel ? 'Заявление врёт' : pts >= 65 ? 'Фейк раскрыт' : 'Фейк почти прошёл — смотри правду' };
  }

  function soloResult() {
    var r = S.rounds[S.idx];
    var g = B.getG(0);
    var pts = points(g);
    var gained = pts * (r.boss ? 2 : 1);
    S.score += gained;
    S.results[S.idx] = { pts: pts, gained: gained, round: r, isTrue: r.claim.isTrue, caught: pts >= 65 };
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
    var cells = [];
    if (!r.claim.isTrue) cells.push({ cls: 'said', k: 'В заявлении', v: lines.said });
    cells.push({ cls: 'mine', k: 'Твой ответ', v: lines.guess });
    openSheet({
      score: gained,
      band: band(pts),
      rank: rankText(pts) + (r.boss ? ' · очки ×2' : ''),
      info: verdictInfo(r, pts),
      truth: lines.truth,
      eq: lines.eq,
      cells: cells,
      round: r
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
    var info = verdictInfo(r, 0);
    info.sub = w === 0 ? 'Ничья в этом раунде' : 'Ближе к правде — Игрок ' + w;
    var t = r.target, price = r.kind === 'prices';
    openSheet({
      scoreHtml: p1 + ' : <span class="p2">' + p2 + '</span>',
      band: 3,
      rank: '',
      info: info,
      truth: price ? equation(r) : t.name + ' — ' + B.fmtVal(t, t.value),
      eq: price ? '' : equation(r),
      cells: [
        { cls: 'mine', k: 'Игрок 1', v: B.fmtVal(t, B.value(t, g1)) },
        { cls: 'p2', k: 'Игрок 2', v: B.fmtVal(t, B.value(t, g2)) }
      ],
      round: r
    });
    celebrate(Math.max(p1, p2));
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
  }

  // Эффекты попадания: ударная волна и искры из настоящего размера, при промахе — оседающая пыль
  function celebrate(pts) {
    var p = B.truthPoint();
    if (pts >= 85) {
      App.fx.ring(p.x, p.y, C.violet, 130, 6);
      App.fx.sparks(p.x, p.y, pts === 100 ? 26 : 18, null, pts === 100 ? 1.2 : 1);
      if (pts === 100) App.fx.confetti(70);
      App.sound.play('win');
      App.bridge.vibrate();
    } else if (pts >= 65) {
      App.fx.sparks(p.x, p.y, 12, [C.violet, C.lime, C.yellow], 0.8);
      App.sound.play('star', 1);
    } else {
      App.fx.dust(p.x, p.y, 12);
      App.sound.play('soft');
    }
    if (!S.duel && S.combo >= 2) setTimeout(function () { App.sound.play('combo', S.combo); }, 300);
  }

  function openSheet(o) {
    S.phase = 'sheet';
    var cl = o.round.claim;
    var badge = $('res-badge');
    badge.textContent = o.info.badge;
    badge.className = 'res-badge ' + o.info.cls;
    $('res-sub').textContent = o.info.sub;
    var sc = $('res-score');
    sc.className = 'res-score s' + o.band + (S.duel ? ' duel' : '');
    sc.textContent = '';
    $('res-rank').textContent = o.rank;
    // в ценах сразу под правдой — «= почти 2 месяца без мороженого»: сколько копить
    var save = o.round.kind === 'prices' ? P.saving(o.round.target, o.round.ref) : null;
    $('res-rows').innerHTML = '<div class="res-truth"><span>На самом деле</span><b>' + esc(o.truth) + '</b>' +
      (o.eq ? '<div class="u-eq">' + esc(o.eq) + '</div>' : '') +
      (save ? '<div class="u-save">' + ic('piggy') + esc(save.line) + '</div>' : '') + unitsHtml(o.round) + '</div>' +
      '<div class="res-pair">' + o.cells.map(function (c) {
        return '<div class="res-cell ' + c.cls + '"><span>' + esc(c.k) + '</span><b>' + esc(c.v) + '</b></div>';
      }).join('') + '</div>';
    $('res-fact-box').className = 'res-box res-fact ' + o.info.cls;
    $('fact-ic').innerHTML = ic(cl.isTrue ? 'shield' : 'search');
    $('fact-title').textContent = cl.isTrue ? 'Почему правда' : 'Почему фейк';
    $('fact-name').textContent = o.round.target.name;
    $('res-fact').textContent = whyText(o.round);
    // «Копилка» в ценах: сколько недель копить, если не покупать единицу; дальше — совет из факта
    var fact = U.plain(o.round.target.fact);
    var tip = save ? save.text + (fact ? ' ' + fact : '') : fact;
    $('tip-ic').innerHTML = ic(save ? 'piggy' : 'bulb');
    $('tip-title').textContent = save ? 'Копилка' : 'Факт';
    $('res-tip-box').className = 'res-box res-tip' + (save ? ' is-save' : '');
    $('res-tip-box').hidden = !tip;
    $('res-tip').textContent = tip;
    $('btn-next').querySelector('span').textContent = S.idx + 1 < S.rounds.length ? 'Дальше' : 'Итоги';
    // сначала даём рассмотреть доску с ответом
    var ep = S.epoch;
    U.wait(520).then(function () {
      if (ep !== S.epoch) return;
      $('sheet').hidden = false;
      document.querySelector('.sheet-inner').scrollTop = 0;
      if (S.duel) sc.innerHTML = o.scoreHtml;
      else U.countUp(sc, 0, o.score, 650, function (v) { return '+' + v; });
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
  function li(icon, label, val, cls, small) {
    return '<li' + (cls ? ' class="' + cls + '"' : '') + '>' + ic(icon) + '<span class="lbl">' + label +
      (small ? '<small>' + small + '</small>' : '') + '</span>' + (val !== undefined ? '<span class="val">' + val + '</span>' : '') + '</li>';
  }
  function pips(list) {
    return list.map(function (cls, i) { return '<i class="' + cls + '" style="animation-delay:' + (0.25 + i * 0.05).toFixed(2) + 's"></i>'; }).join('');
  }

  var LESSON_ICON = { detector: 'search', animals: 'paw', countries: 'map', area: 'ruler', prices: 'piggy' };

  function endSolo() {
    S.phase = 'end';
    var max = maxScore();
    var norm = Math.round(S.score * 1000 / max);
    var isRecord = S.runs > 0 && S.score > S.record;
    S.record = Math.max(S.record, S.score);
    S.runs++;
    var titles = S.content.cfg.titles;
    var title = titleFor(norm);
    var level = titles.indexOf(title) + 1;
    var unlocks = S.content.cfg.unlocks;
    unlocks.forEach(function (u) { if (norm >= u.score && S.acc.indexOf(u.id) < 0) S.acc.push(u.id); });

    U.countUp($('end-score'), 0, S.score, 900, function (v) { return v + '<small> / ' + max + '</small>'; });
    $('end-title').textContent = title.name;
    $('end-level').textContent = 'Звание ' + level + ' из ' + titles.length;
    App.capy.mount(capyEnd, 'happy');
    App.capy.wear(capyEnd, S.acc);
    $('end-grid').innerHTML = pips(S.results.map(function (x) { return 's' + band(x.pts) + (x.round.boss ? ' boss' : ''); }));
    var grid = S.results.map(function (x) { return shareSquare(x.pts); }).join('');

    var best = S.results.reduce(function (a, b) { return !a || b.pts > a.pts ? b : a; }, null);
    var fakes = S.results.filter(function (x) { return !x.isTrue; });
    var truths = S.results.filter(function (x) { return x.isTrue; });
    var priced = S.results.filter(function (x) { return x.round.kind === 'prices'; });
    var caught = fakes.filter(function (x) { return x.caught; }).length;
    var confirmed = truths.filter(function (x) { return x.caught; }).length;
    var counted = priced.filter(function (x) { return x.caught; }).length;
    function avg(list) { return list.length ? Math.round(list.reduce(function (a, b) { return a + b.pts; }, 0) / list.length) : 0; }
    var early = avg(S.results.slice(0, 3)), late = avg(S.results.slice(-3));
    var grew = late >= early + 10;
    var kicker = $('end-kicker');
    kicker.textContent = isRecord ? 'Новый рекорд сессии' : 'Итог проверки';
    kicker.className = 'end-kicker' + (isRecord ? ' record' : '');
    $('end-best').innerHTML = '<h3>Детектор</h3><ul>' +
      (fakes.length ? li('search', 'Фейков раскрыто', caught + ' из ' + fakes.length, caught === fakes.length ? 'good' : '') : '') +
      (truths.length ? li('shield', 'Правда подтверждена', confirmed + ' из ' + truths.length, confirmed === truths.length ? 'good' : '') : '') +
      (priced.length ? li('piggy', 'Цены прикинуты', counted + ' из ' + priced.length, counted === priced.length ? 'good' : '') : '') +
      (S.results.length >= 6 ? li('trend', 'Точность прикидки', early + '% → ' + late + '%', grew ? 'good' : '',
        grew ? 'Есть прогресс: первые три раунда против последних' : 'Первые три раунда против последних') : '') +
      (best ? li('target', esc(best.round.target.name + ' и ' + best.round.ref.name),
        best.pts + ' ' + pointsWord(best.pts), '', 'Лучший раунд') : '') +
      (S.bestCombo >= 2 ? li('bolt', 'Лучшая серия', S.bestCombo + ' подряд') : '') +
      '</ul>';

    $('end-unlocks').innerHTML = '<h3>Гардероб Капи</h3><ul>' + unlocks.map(function (u) {
      var open = S.acc.indexOf(u.id) >= 0;
      var need = Math.max(1, Math.round(u.score * max / 1000));
      var prog = Math.min(100, Math.round(S.score * 100 / need));
      return '<li class="' + (open ? 'open' : 'locked') + '">' + ic(open ? 'check' : 'lock') + '<span class="lbl">' + esc(u.label) +
        '<small>' + (open ? 'Открыто' : 'Нужно ' + need + ' ' + pointsWord(need) + ' за заход') + '</small>' +
        (open ? '' : '<span class="bar"><i style="width:' + prog + '%"></i></span>') + '</span></li>';
    }).join('') + '</ul>';

    var kinds = {};
    S.rounds.forEach(function (r) { kinds[r.kind] = true; });
    var L = S.content.cfg.lessons;
    var lessons = [];
    if (L.detector) lessons.push('detector');
    if (kinds.animals && L.animals) lessons.push('animals');
    if (kinds.countries && L.countries) lessons.push('countries');
    if (kinds.countries && L.area) lessons.push('area');
    if (kinds.prices && L.prices) lessons.push('prices');
    $('end-lessons').hidden = !lessons.length;
    $('end-lessons').innerHTML = '<h3>Что теперь знаешь</h3><ul>' + lessons.map(function (k) {
      return '<li class="lesson">' + ic(LESSON_ICON[k]) + '<span class="lbl">' + esc(L[k]) + '</span></li>';
    }).join('') + '</ul>';

    show('scr-end');
    $('scr-end').scrollTop = 0;
    if (norm >= 500) App.fx.confetti(70);
    App.sound.play('win');
    App.bridge.finish();
    App.bridge.completed();
    S.last = {
      score: S.score, max: max, title: title, grid: grid, caught: caught, fakes: fakes.length, confirmed: confirmed, truths: truths.length,
      marks: S.results.map(function (x) { return { color: BAND_COLOR[band(x.pts)], boss: !!x.round.boss }; })
    };
  }

  function endDuel() {
    S.phase = 'end';
    var a = S.duelScore[0], b = S.duelScore[1];
    $('duel-score').innerHTML = '<span class="p1">' + a + '</span> <span class="sep">:</span> <span class="p2">' + b + '</span>';
    $('duel-title').textContent = a > b ? 'Победил Игрок 1' : b > a ? 'Победил Игрок 2' : 'Ничья — оба молодцы';
    var cd = $('capy-duel');
    App.capy.mount(cd, 'happy');
    App.capy.wear(cd, S.acc);
    // кто был ближе в каждом раунде: лайм — Игрок 1, розовый — Игрок 2, серый — ничья
    $('duel-grid').innerHTML = pips(S.duelMarks.map(function (w) { return 'w' + w; }));
    show('scr-duel-end');
    App.fx.confetti(70);
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
      $('share-note').textContent = 'Открываем «Поделиться». Если меню не появилось, зажми картинку — её можно сохранить и отправить другу.';
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
    var share = S.content.cfg.texts.share;
    var stat = r.fakes ? 'Фейков раскрыто: ' + r.caught + ' из ' + r.fakes : 'Правда подтверждена: ' + r.confirmed + ' из ' + r.truths;
    doShare('Детектор фейков «Прикинь!» в СберKids: ' + (r.fakes ? 'раскрыто ' + r.caught + ' из ' + r.fakes + ' фейков, ' : '') +
      r.score + ' из ' + r.max + ' очков — «' + r.title.name + '» ' + r.grid + (share ? '\n' + share : ''), {
      kicker: 'Детектор фейков', big: String(r.score), small: ' / ' + r.max, title: r.title.name, sub: stat,
      marks: r.marks, capy: { acc: S.acc, mood: 'happy' }, footer: share
    });
  });

  $('btn-duel-share').addEventListener('click', function () {
    var a = S.duelScore[0], b = S.duelScore[1];
    var grid = S.duelMarks.map(function (w) { return ['⬜', '🟩', '🟪'][w]; }).join('');
    var winColor = [C.mute, C.lime, C.pink];
    doShare('Дуэль в «Прикинь!»: ' + a + ' : ' + b + ' ' + grid + '\nКто прикинет точнее?', {
      kicker: 'Дуэль на одном телефоне', big: a + ' : ' + b, small: '', title: $('duel-title').textContent, sub: 'Кто ближе к правде в каждом раунде',
      marks: S.duelMarks.map(function (w) { return { color: winColor[w], boss: false }; }), capy: { acc: S.acc, mood: 'happy' }, footer: 'Кто прикинет точнее?'
    });
  });

  // ---------- Старт ----------
  // first — раунд, который встанет первым: так редактор показывает менеджеру его правку в игре
  function startSolo(mode, first) {
    App.sound.play('tap');
    S.duel = false;
    S.turn = 1;
    S.mode = mode || S.mode;
    var cfg = S.content.cfg;
    S.rounds = App.content.makeRun(S.content, S.mode, cfg.rounds, cfg.boss, first);
    S.results = [];
    S.score = 0;
    S.hudShown = 0;
    S.combo = 0;
    S.bestCombo = 0;
    S.started = true;
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
    clearTimeout(S.idleT);
    B.demo(false);
    B.enable(false);
    ['intro', 'pass', 'sheet', 'share-view'].forEach(function (id) { $(id).hidden = true; });
    var rec = $('record');
    rec.hidden = !S.record;
    rec.innerHTML = ic('trophy') + 'Рекорд сессии: ' + S.record;
    App.capy.wear($('capy-start'), capyAcc());
    show('scr-start');
    fitStart();
  }

  // ---------- Стартовый экран на любой высоте ----------
  // Капи с репликой занимают ровно то место, что осталось между шапкой и кнопками:
  // не помещаются друг под другом — встают в ряд, совсем тесно — Капи без реплики.
  // Так ничего не наезжает на баннер события и кнопки ни на одном телефоне.
  function fitStart() {
    var scr = $('scr-start');
    if (scr.hidden) return;
    var hero = scr.querySelector('.start-hero'), capy = $('capy-start'), bub = $('hero-bubble');
    var cs = getComputedStyle(hero), pt = parseFloat(cs.paddingTop) || 0, pb = parseFloat(cs.paddingBottom) || 0;
    // меряем по раскладке, а не по экрану: анимации появления не сбивают расчёт
    function fits(withBubble) {
      var cw = capy.offsetWidth, r = cw * 0.66;   // лаймовый круг больше самой Капи
      var cx = capy.offsetLeft + cw / 2, cy = capy.offsetTop + capy.offsetHeight * 0.52;
      var x0 = cx - r, y0 = cy - r, x1 = cx + r, y1 = cy + r;
      if (withBubble) {
        x0 = Math.min(x0, bub.offsetLeft); y0 = Math.min(y0, bub.offsetTop);
        x1 = Math.max(x1, bub.offsetLeft + bub.offsetWidth); y1 = Math.max(y1, bub.offsetTop + bub.offsetHeight);
      }
      // по краям — отступ блока: Капи и реплика не прилипают к баннеру и кнопкам
      return x0 >= -1 && y0 >= pt - 1 && x1 <= hero.clientWidth + 1 && y1 <= hero.clientHeight - pb + 1;
    }
    function tryMode(mode, from, to) {
      scr.setAttribute('data-hero', mode);
      var withBubble = mode === 'col' || mode === 'row';
      for (var s = from; s >= to; s -= 6) {
        hero.style.setProperty('--capy', s + 'px');
        if (withBubble && s === from) roomForLines(bub);
        if (fits(withBubble)) return true;
      }
      return false;
    }
    var big = Math.round(Math.min(150, hero.clientWidth * 0.38));
    function place(solo) { return tryMode('col', big, 104) || tryMode('row', 120, 72) || (solo && tryMode('solo', 120, 48)); }
    // Капи важнее баннера события: если ей не хватает места, баннер сначала теряет
    // вторую строку, потом прячется, потом ужимаются подзаголовок и плитки — Капи не пропадает со старта
    var steps = ['ev-short', 'ev-off', 'compact'];
    steps.forEach(function (c) { scr.classList.remove(c); });
    if (place(false)) return;
    for (var i = 0; i < steps.length; i++) {
      if (i < 2 && $('event').hidden) continue;
      scr.classList.add(steps[i]);
      if (place(i === steps.length - 1)) return;
    }
    scr.setAttribute('data-hero', 'off');
  }
  // Реплики Капи разной длины: высоту берём под самую длинную — тап по Капи не двигает экран
  function roomForLines(bub) {
    var cur = bub.textContent, h = 0;
    bub.style.minHeight = '';
    LINES.forEach(function (t) { bub.textContent = t; h = Math.max(h, bub.offsetHeight); });
    bub.textContent = cur;
    bub.style.minHeight = h + 'px';
  }
  window.addEventListener('resize', fitStart);

  // Видимая высота экрана: в песочнице WebView бывает выше видимой части, и всё,
  // что прижато к низу, уезжает. Разбор раунда берёт высоту отсюда.
  function syncHeight() {
    var h = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    document.documentElement.style.setProperty('--app-h', Math.round(Math.min(h, window.innerHeight)) + 'px');
  }
  syncHeight();
  window.addEventListener('resize', syncHeight);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', syncHeight);

  Array.prototype.forEach.call(document.querySelectorAll('[data-mode]'), function (b) {
    b.addEventListener('click', function () { startSolo(b.getAttribute('data-mode')); });
  });
  $('btn-duel').addEventListener('click', startDuel);
  $('btn-again').addEventListener('click', function () { startSolo(); });
  $('btn-to-duel').addEventListener('click', startDuel);
  $('btn-rematch').addEventListener('click', startDuel);
  $('btn-menu').addEventListener('click', toMenu);
  $('btn-duel-menu').addEventListener('click', toMenu);
  // Крестик в левом верхнем углу — всегда. В приложении CLOSE_EVENT закрывает экран игры;
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
      b.innerHTML = ic(on ? 'sound' : 'mute') + (b.classList.contains('icon-btn') ? '' : '<span>' + (on ? 'Звук и вибрация' : 'Тихий режим') + '</span>');
      b.setAttribute('aria-label', on ? 'Выключить звук и вибрацию' : 'Включить звук и вибрацию');
    });
  }
  Array.prototype.forEach.call(document.querySelectorAll('.js-sound'), function (b) {
    b.addEventListener('click', function () { App.sound.toggle(); syncSound(); });
  });

  // Капи на старте отвечает на тап; реплики берутся из game.json → texts.capy
  var LINES = ['Я Капи. Проверяю громкие заявления.'];
  var lineIdx = 0;
  $('capy-start').addEventListener('click', function () {
    lineIdx = (lineIdx + 1) % LINES.length;
    var b = $('hero-bubble');
    b.textContent = LINES[lineIdx];
    b.style.animation = 'none'; void b.offsetWidth; b.style.animation = '';
    var capy = $('capy-start');
    App.capy.mood(capy, 'happy');
    var cr = capy.getBoundingClientRect();
    App.fx.sparks(cr.left + cr.width / 2, cr.top + cr.height * 0.3, 12, [C.violet, C.yellow, C.pink, C.lime], 0.8);
    App.sound.play('star', 0);
    App.bridge.vibrate();
  });

  function loadContent() {
    $('load-error').hidden = true;
    App.content.load().then(function (c) {
      S.content = c;
      var can = App.content.playable(c), any = can.animals || can.countries || can.prices;
      App.content.KINDS.forEach(function (k) { document.querySelector('[data-mode="' + k + '"]').disabled = !can[k]; });
      document.querySelector('[data-mode="chaos"]').disabled = !any;
      $('btn-duel').disabled = !any;
      $('load-error').hidden = any;
      applyLook(c);
      var note = c.draft ? 'Черновик менеджера: игра с правками, которые ещё не опубликованы' : '';
      var spec = checkSpec();
      if (spec && !S.started) {
        var first = App.content.pick(c, spec);
        if (first) {
          startSolo(first.kind, first);
          note = 'Проверка из редактора: в первом раунде — ' + first.target.name + ' и ' + first.ref.name;
        } else {
          note = 'Этого нет в игре: объект убран, не загрузился или запись с ошибкой — посмотрите в редакторе';
        }
      }
      if (note) toast(note);
    });
  }

  // Ссылка из редактора контента: ?claim=c3 или ?try=okapi — этот раунд будет первым
  function checkSpec() {
    var q = location.search, m;
    if ((m = /[?&]claim=(c\d+)/.exec(q))) return { claim: m[1] };
    if ((m = /[?&]try=([\w-]+)/.exec(q))) return { item: m[1] };
    return null;
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
    var theme = { animals: cfg.theme.animals, countries: cfg.theme.countries, prices: cfg.theme.prices };
    if (ev && ev.theme) {
      App.content.KINDS.forEach(function (k) {
        if (/^#[0-9a-f]{3,8}$/i.test(ev.theme[k] || '')) theme[k] = ev.theme[k];
      });
    }
    // цвет темы — пастельный фон доски для зверей, стран и цен
    document.documentElement.style.setProperty('--board-a', theme.animals);
    document.documentElement.style.setProperty('--board-c', theme.countries);
    document.documentElement.style.setProperty('--board-p', theme.prices);
    $('tagline').innerHTML = App.content.rich(cfg.texts.tagline);
    if (cfg.texts.capy.length) {
      LINES = cfg.texts.capy;
      lineIdx = 0;
      $('hero-bubble').textContent = LINES[0];
    }
    var evEl = $('event');
    evEl.hidden = !ev;
    if (ev) {
      evEl.querySelector('.ev-title').textContent = ev.title;
      evEl.querySelector('.ev-text').textContent = ev.text || '';
    }
    var m = cfg.modes;
    document.querySelector('[data-mode="chaos"]').hidden = !m.chaos;
    App.content.KINDS.forEach(function (k) { document.querySelector('[data-mode="' + k + '"]').hidden = !m[k]; });
    document.querySelector('.modes').hidden = !(m.animals || m.countries || m.prices);
    $('btn-duel').hidden = !m.duel;
    $('btn-to-duel').hidden = !m.duel;
    App.capy.wear($('capy-start'), capyAcc());
    fitStart();
  }
  $('btn-reload').addEventListener('click', loadContent);

  function init() {
    App.capy.mount($('capy-start'), 'idle');
    App.capy.wear($('capy-start'), ['orange']);
    B.init($('board'), onBoardChange);
    var verdict = document.createElement('div');
    verdict.id = 'verdict';
    verdict.className = 'verdict';
    $('board').appendChild(verdict);
    syncSound();
    fitStart();
    // свои шрифты чуть меняют высоту текста — после загрузки раскладываем старт заново
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitStart);
    loadContent();
  }
  init();
})();
