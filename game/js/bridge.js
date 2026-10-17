(function () {
  'use strict';
  var App = window.App = window.App || {};

  // Канал «страница → приложение». Контракт: window.postMessage({ type, ... }, "*")
  var completedSent = false;
  var debug = /[?&]debug\b/.test(location.search);

  function send(type, extra) {
    var msg = { type: type };
    if (extra) for (var k in extra) msg[k] = extra[k];
    try { window.postMessage(msg, '*'); } catch (e) { /* вне приложения просто игнорируем */ }
    if (debug) {
      var t = document.getElementById('toast');
      if (t) {
        t.textContent = '→ ' + type + (msg.text ? ': ' + msg.text.slice(0, 40) + '…' : '');
        t.hidden = false;
        clearTimeout(send._t);
        send._t = setTimeout(function () { t.hidden = true; }, 1600);
      }
      console.log('[bridge]', type, extra || '');
    }
  }

  App.bridge = {
    close: function () { send('CLOSE_EVENT'); },
    finish: function () { send('FINISH_EVENT'); },
    // Засчитывает прогресс курса — отправляем один раз за открытие
    completed: function () {
      if (completedSent) return;
      completedSent = true;
      send('COMPLETED_EVENT');
    },
    vibrate: function () { send('VIBRATION_EVENT'); },
    share: function (text, image) {
      var extra = { text: text };
      if (image) extra.image = image;
      send('SHARING_EVENT', extra);
    }
  };
})();
