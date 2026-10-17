(function () {
  'use strict';
  var App = window.App;

  // Капи — собственный персонаж игры, нарисован векторами прямо в коде
  var D = '#3b2414';
  var SVG = [
    '<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">',
    '<ellipse cx="60" cy="114" rx="36" ry="5" fill="rgba(0,0,0,.25)"/>',
    '<g class="body">',
    // туловище и лапки
    '<ellipse cx="60" cy="92" rx="38" ry="22" fill="#a8703f"/>',
    '<ellipse cx="42" cy="110" rx="10" ry="6" fill="#8a5a33"/>',
    '<ellipse cx="78" cy="110" rx="10" ry="6" fill="#8a5a33"/>',
    // медаль
    '<g class="acc acc-medal"><path d="M52 84 L60 98 L68 84" fill="none" stroke="#ff5ca8" stroke-width="4"/><circle cx="60" cy="102" r="8" fill="#ffcf3d" stroke="#d39a00" stroke-width="2"/><text x="60" y="106" font-size="10" text-anchor="middle" fill="#8a5a00" font-weight="900">₽</text></g>',
    // голова
    '<ellipse cx="33" cy="25" rx="8" ry="7" fill="#8a5a33"/>',
    '<ellipse cx="87" cy="25" rx="8" ry="7" fill="#8a5a33"/>',
    '<rect x="20" y="20" width="80" height="66" rx="33" fill="#c08851"/>',
    '<ellipse cx="60" cy="68" rx="28" ry="17" fill="#a26b3e"/>',
    '<ellipse cx="51" cy="63" rx="3.4" ry="2.5" fill="' + D + '"/>',
    '<ellipse cx="69" cy="63" rx="3.4" ry="2.5" fill="' + D + '"/>',
    '<ellipse cx="33" cy="60" rx="6" ry="4" fill="#ff8fa3" opacity=".6"/>',
    '<ellipse cx="87" cy="60" rx="6" ry="4" fill="#ff8fa3" opacity=".6"/>',
    // глаза: обычные
    '<g class="eyes e-idle"><circle cx="43" cy="46" r="5.5" fill="' + D + '"/><circle cx="77" cy="46" r="5.5" fill="' + D + '"/><circle cx="45" cy="44" r="1.8" fill="#fff"/><circle cx="79" cy="44" r="1.8" fill="#fff"/></g>',
    // глаза: думает (смотрит вверх)
    '<g class="eyes e-think"><circle cx="43" cy="46" r="5.5" fill="#fff"/><circle cx="77" cy="46" r="5.5" fill="#fff"/><circle cx="44" cy="43" r="3" fill="' + D + '"/><circle cx="78" cy="43" r="3" fill="' + D + '"/></g>',
    // глаза: радость
    '<g class="eyes e-happy" fill="none" stroke="' + D + '" stroke-width="3.5" stroke-linecap="round"><path d="M37 48 Q43 40 49 48"/><path d="M71 48 Q77 40 83 48"/></g>',
    // глаза: шок
    '<g class="eyes e-shock"><circle cx="43" cy="45" r="8" fill="#fff" stroke="' + D + '" stroke-width="2"/><circle cx="77" cy="45" r="8" fill="#fff" stroke="' + D + '" stroke-width="2"/><circle cx="43" cy="45" r="3" fill="' + D + '"/><circle cx="77" cy="45" r="3" fill="' + D + '"/></g>',
    // рты
    '<path class="mouth m-idle" d="M55 73 Q60 77 65 73" fill="none" stroke="' + D + '" stroke-width="2.5" stroke-linecap="round"/>',
    '<path class="mouth m-think" d="M56 75 L64 74" fill="none" stroke="' + D + '" stroke-width="2.5" stroke-linecap="round"/>',
    '<path class="mouth m-happy" d="M52 71 Q60 82 68 71 Z" fill="' + D + '"/>',
    '<ellipse class="mouth m-shock" cx="60" cy="76" rx="4.5" ry="5.5" fill="' + D + '"/>',
    // очки
    '<g class="acc acc-glasses"><rect x="31" y="38" width="24" height="15" rx="6" fill="#1b1340"/><rect x="65" y="38" width="24" height="15" rx="6" fill="#1b1340"/><path d="M55 44 H65" stroke="#1b1340" stroke-width="3"/><path d="M35 42 L42 42" stroke="#8b6cff" stroke-width="2.5" stroke-linecap="round"/><path d="M69 42 L76 42" stroke="#8b6cff" stroke-width="2.5" stroke-linecap="round"/></g>',
    // апельсинка на голове — капибары так умеют
    '<g class="acc acc-orange"><circle cx="60" cy="13" r="12" fill="#ff9a1f"/><circle cx="56" cy="9" r="3" fill="#ffc46b"/><path d="M60 2 Q66 -4 72 0 Q66 4 60 2 Z" fill="#4cc95a"/></g>',
    // корона
    '<g class="acc acc-crown"><path d="M42 22 L46 4 L54 14 L60 0 L66 14 L74 4 L78 22 Z" fill="#ffcf3d" stroke="#d39a00" stroke-width="2" stroke-linejoin="round"/><circle cx="60" cy="14" r="2.6" fill="#ff5ca8"/></g>',
    '</g></svg>'
  ].join('');

  function mount(el, mood) {
    el.innerHTML = SVG;
    el.setAttribute('data-mood', mood || 'idle');
    return el;
  }
  function mood(el, m) {
    // перезапускаем анимацию, даже если настроение то же
    el.removeAttribute('data-mood');
    void el.offsetWidth;
    el.setAttribute('data-mood', m);
  }
  function wear(el, ids) {
    ['orange', 'glasses', 'medal', 'crown'].forEach(function (id) {
      if (ids.indexOf(id) >= 0) el.setAttribute('data-' + id, '');
      else el.removeAttribute('data-' + id);
    });
  }
  // SVG-строка с выбранными аксессуарами — для картинки «поделиться»
  function svgFor(ids, m) {
    var css = '.eyes,.mouth,.acc{display:none}.e-' + (m === 'ok' ? 'idle' : m) + ',.m-' + (m === 'ok' ? 'happy' : m) + '{display:inline}' +
      ids.filter(function (id) { return !(id === 'orange' && ids.indexOf('crown') >= 0); })
        .map(function (id) { return '.acc-' + id + '{display:inline}'; }).join('');
    return SVG.replace('<g class="body">', '<style>' + css + '</style><g class="body">');
  }

  App.capy = { mount: mount, mood: mood, wear: wear, svgFor: svgFor };
})();
