(function () {
  'use strict';
  var App = window.App;

  // Все звуки синтезируются WebAudio: ноль файлов, ноль веса.
  // Звук играет только в ответ на действие ребёнка и выключается переключателем.
  var ctx = null;
  var on = App.util.store('prikin.sound') !== '0';

  function ensure() {
    if (!on) return null;
    if (!ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try { ctx = new AC(); } catch (e) { return null; }
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone(freq, dur, type, vol, when, slideTo) {
    var c = ensure();
    if (!c) return;
    var t = c.currentTime + (when || 0);
    var o = c.createOscillator();
    var g = c.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol || 0.15, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(c.destination);
    o.start(t);
    o.stop(t + dur + 0.03);
  }

  function noise(dur, vol) {
    var c = ensure();
    if (!c) return;
    var len = Math.floor(c.sampleRate * dur);
    var buf = c.createBuffer(1, len, c.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
    var src = c.createBufferSource();
    var g = c.createGain();
    g.gain.value = vol || 0.2;
    src.buffer = buf;
    src.connect(g);
    g.connect(c.destination);
    src.start();
  }

  var sfx = {
    tick: function (r) { tone(260 + r * 760, 0.05, 'triangle', 0.05); },
    tap: function () { tone(520, 0.08, 'sine', 0.12, 0, 760); },
    lock: function () { tone(330, 0.12, 'square', 0.05, 0, 660); },
    rise: function () { tone(200, 0.8, 'triangle', 0.06, 0, 900); },
    star: function (i) { tone([784, 988, 1319][i] || 1319, 0.28, 'triangle', 0.16); tone(([784, 988, 1319][i] || 1319) * 2, 0.18, 'sine', 0.05); },
    win: function () { [523, 659, 784, 1047].forEach(function (f, i) { tone(f, 0.24, 'triangle', 0.15, i * 0.09); }); },
    soft: function () { tone(440, 0.18, 'sine', 0.1); tone(392, 0.25, 'sine', 0.1, 0.16); },
    crumble: function () { noise(0.6, 0.25); tone(300, 0.5, 'sawtooth', 0.04, 0, 90); },
    shield: function () { [659, 880, 1175].forEach(function (f, i) { tone(f, 0.2, 'square', 0.05, i * 0.07); }); },
    swoosh: function () { tone(300, 0.22, 'sine', 0.07, 0, 1200); }
  };

  App.sound = {
    play: function (name, arg) { try { if (sfx[name]) sfx[name](arg); } catch (e) { /* звук не критичен */ } },
    isOn: function () { return on; },
    toggle: function () {
      on = !on;
      App.util.store('prikin.sound', on ? '1' : '0');
      if (on) sfx.tap();
      return on;
    }
  };
})();
