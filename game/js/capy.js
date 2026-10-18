(function () {
  'use strict';
  var App = window.App;

  // Капи — собственный персонаж игры, нарисован векторами прямо в коде.
  // Плоские формы в трёх тонах, спокойный взгляд «невозмутимой капибары».
  var D = '#21170f';
  var SVG = [
    '<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">',
    '<ellipse cx="60" cy="114" rx="34" ry="4" fill="rgba(0,0,0,.4)"/>',
    '<g class="body">',
    // туловище и лапы
    '<path d="M24 98c0-14 16-24 36-24s36 10 36 24c0 9-8 14-36 14S24 107 24 98z" fill="#6f4a2e"/>',
    '<rect x="38" y="103" width="15" height="10" rx="5" fill="#553823"/>',
    '<rect x="67" y="103" width="15" height="10" rx="5" fill="#553823"/>',
    // медаль
    '<g class="acc acc-medal"><path d="M53 80l7 13 7-13" fill="none" stroke="#3fd8c8" stroke-width="4" stroke-linejoin="round"/><circle cx="60" cy="99" r="8.5" fill="#e9b949"/><circle cx="60" cy="99" r="5" fill="none" stroke="#b98a2b" stroke-width="1.6"/></g>',
    // уши и голова
    '<ellipse cx="34" cy="24" rx="7.5" ry="6.5" fill="#553823"/>',
    '<ellipse cx="86" cy="24" rx="7.5" ry="6.5" fill="#553823"/>',
    '<rect x="21" y="18" width="78" height="66" rx="31" fill="#93653f"/>',
    '<path d="M31 40c4-11 14-17 29-17s25 6 29 17" fill="none" stroke="#a7774e" stroke-width="7" stroke-linecap="round" opacity=".5"/>',
    // морда и ноздри
    '<rect x="33" y="53" width="54" height="31" rx="15.5" fill="#7a5233"/>',
    '<ellipse cx="51.5" cy="62" rx="3.4" ry="2.3" fill="' + D + '"/>',
    '<ellipse cx="68.5" cy="62" rx="3.4" ry="2.3" fill="' + D + '"/>',
    // глаза: спокойно, полуприкрыто
    '<g class="eyes e-idle" fill="' + D + '"><path d="M37.5 44a5.5 5.5 0 0 0 11 0z"/><path d="M71.5 44a5.5 5.5 0 0 0 11 0z"/><path d="M36 44h14M70 44h14" stroke="' + D + '" stroke-width="2.4" stroke-linecap="round"/></g>',
    // глаза: думает (смотрит вверх)
    '<g class="eyes e-think"><circle cx="43" cy="44" r="5" fill="' + D + '"/><circle cx="77" cy="44" r="5" fill="' + D + '"/><circle cx="44.6" cy="41.6" r="1.6" fill="#fff"/><circle cx="78.6" cy="41.6" r="1.6" fill="#fff"/></g>',
    // глаза: радость
    '<g class="eyes e-happy" fill="none" stroke="' + D + '" stroke-width="3" stroke-linecap="round"><path d="M37.5 46q5.5-7 11 0"/><path d="M71.5 46q5.5-7 11 0"/></g>',
    // глаза: шок
    '<g class="eyes e-shock"><circle cx="43" cy="44" r="7" fill="#f2e9df"/><circle cx="77" cy="44" r="7" fill="#f2e9df"/><circle cx="43" cy="44" r="3" fill="' + D + '"/><circle cx="77" cy="44" r="3" fill="' + D + '"/></g>',
    // рты
    '<path class="mouth m-idle" d="M55.5 72.5q4.5 3 9 0" fill="none" stroke="' + D + '" stroke-width="2.2" stroke-linecap="round"/>',
    '<path class="mouth m-think" d="M56 73.5h8" fill="none" stroke="' + D + '" stroke-width="2.2" stroke-linecap="round"/>',
    '<path class="mouth m-happy" d="M53.5 70.5q6.5 9 13 0z" fill="' + D + '"/>',
    '<ellipse class="mouth m-shock" cx="60" cy="74" rx="3.4" ry="4.2" fill="' + D + '"/>',
    // очки
    '<g class="acc acc-glasses"><rect x="30" y="37" width="25" height="14" rx="5" fill="#0e0f11"/><rect x="65" y="37" width="25" height="14" rx="5" fill="#0e0f11"/><path d="M55 43h10" stroke="#0e0f11" stroke-width="3"/><path d="M34 41h6M69 41h6" stroke="#d4f55a" stroke-width="2" stroke-linecap="round" opacity=".85"/></g>',
    // апельсинка на голове — капибары так умеют
    '<g class="acc acc-orange"><circle cx="60" cy="13" r="11" fill="#f39a2b"/><circle cx="56" cy="9.5" r="3" fill="#ffc06a" opacity=".8"/><path d="M60 3c3-5 9-5 12-2-4 3-8 3.5-12 2z" fill="#5fb865"/></g>',
    // корона
    '<g class="acc acc-crown"><path d="M42 23l3-17 9 9 6-13 6 13 9-9 3 17z" fill="#e9b949"/><path d="M42 23h36" stroke="#b98a2b" stroke-width="2.5"/><circle cx="60" cy="15" r="2.6" fill="#3fd8c8"/></g>',
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
