/* ===== ui-mode-switch.js — 로그인 화면의 PC / MOBILE 체크 칸 =====
   둘 다 체크 안 하면 자동 감지, 하나를 체크하면 그 화면으로 고정(저장은 DeviceMode 가 한다).
   이미 체크한 칸을 다시 누르면 해제(자동). */
(function () {
  'use strict';
  if (typeof document === 'undefined') return;

  function init() {
    var pc = document.getElementById('uim-pc');
    var mo = document.getElementById('uim-mobile');
    var hint = document.getElementById('uim-hint');
    if (!pc || !mo) return;
    var DM = window.DeviceMode;

    function current() {
      try { return DM && DM.getMode ? DM.getMode(window) : 'auto'; } catch (e) { return 'auto'; }
    }
    function paint(mode) {
      pc.setAttribute('aria-checked', mode === 'pc' ? 'true' : 'false');
      mo.setAttribute('aria-checked', mode === 'mobile' ? 'true' : 'false');
      pc.classList.toggle('on', mode === 'pc');
      mo.classList.toggle('on', mode === 'mobile');
      if (hint) hint.textContent = mode === 'pc' ? 'PC screen' : mode === 'mobile' ? 'Mobile screen' : 'Auto-detect';
    }
    function pick(which) {
      var next = current() === which ? 'auto' : which;
      try { if (DM && DM.setMode) next = DM.setMode(window, document, next); } catch (e) { /* 무시 */ }
      paint(next);
    }
    pc.addEventListener('click', function () { pick('pc'); });
    mo.addEventListener('click', function () { pick('mobile'); });
    paint(current());
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
