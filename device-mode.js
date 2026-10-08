/* ═════════════════════════════════════════════════════════════════
 * device-mode.js — 19차: 작은 터치 화면의 "데스크톱 사이트" 모드 감지
 *
 * - 폰 브라우저의 "데스크톱 사이트" 모드는 innerWidth 를 약 980px 로 속여서
 *   CSS 미디어쿼리 (max-width: 900px) 의 모바일 카드 레이아웃이 안 켜진다.
 *   실제 화면(screen.width/height)은 폰 크기 그대로이고 입력은 터치
 *   ((pointer: coarse)) 이므로, 이 조합이면 html 에 force-cards 클래스를
 *   붙여 카드 레이아웃을 강제하고(#mobile-cards-css link 의 media 도 'all' 로
 *   넓힌다), 해제 조건이 되면 원래대로 되돌린다.
 * - 전역 노출: window.DeviceMode (브라우저) / module.exports (Node) — UMD.
 *   빌드 도구·외부 라이브러리 없음. 네트워크·스토리지·콘솔 출력 없음.
 *
 * 공개 API:
 *   shouldForceCards(env)  순수 함수. env = { coarse, screenW, screenH, innerW }.
 *                          true 조건(모두): coarse === true &&
 *                          min(screenW, screenH) <= 600 && innerW > 900.
 *                          숫자가 아니거나 NaN/Infinity/음수/0 이면 그 값은
 *                          "모름" → false. env 가 null/객체 아니면 false.
 *   readEnv(win)           win 에서 env 를 읽는다. 어떤 읽기 실패도
 *                          try/catch 로 "모름"(숫자 NaN, coarse false) 처리.
 *   apply(win, doc)        판정해서 documentElement.classList 의 'force-cards'
 *                          를 add/remove 하고, #mobile-cards-css link 의 media
 *                          속성을 'all' / '(max-width: 900px)' 로 바꾼다.
 *                          link 가 없으면 media 는 건드리지 않는다.
 *                          반환값: 지금 상태(force 여부) boolean. 예외 없음.
 *
 * 자동 실행: 브라우저(window 와 document 가 둘 다 있을 때)에서만 즉시 1회 +
 *            resize/orientationchange 마다 150ms 디바운스로 재판정.
 *            Node(require) 에서는 자동 실행하지 않는다.
 * ═════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.DeviceMode = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ───────────────────────── 상수 ───────────────────────── */

  /* 모바일 카드 CSS link(#mobile-cards-css)의 기본 media 질의.
     force 시 'all' 로 넓히고, 해제 시 이 값으로 되돌린다. */
  var CARDS_MEDIA = '(max-width: 900px)';
  var FORCE_CLASS = 'force-cards';
  var STORE_KEY = 'ui-mode';                 /* 20차: 'pc' | 'mobile' (자동이면 키 없음) */
  var VIEWPORT_AUTO = 'width=device-width, initial-scale=1';
  var VIEWPORT_PC = 'width=1100';
  var memMode = null;                        /* 저장소를 못 쓸 때 이번 화면에서만 기억 */

  /* ───────────────────────── 내부 유틸 ───────────────────────── */

  /* 숫자 "모름" 검사 — 숫자가 아니거나 NaN/±Infinity/음수/0 이면 null */
  function sureNum(v) {
    if (typeof v !== 'number') return null;
    if (v !== v) return null;                    /* NaN */
    if (v === Infinity || v === -Infinity) return null;
    if (v <= 0) return null;                     /* 음수·0 */
    return v;
  }

  /* link 의 media 속성 변경 — 진짜 DOM 과 가짜 DOM(plain 객체) 모두에서
     동작하게 setAttribute 가 있으면 같이 쓰고, media 프로퍼티에도 대입한다. */
  function setMedia(link, val) {
    try {
      if (typeof link.setAttribute === 'function') link.setAttribute('media', val);
    } catch (e) { /* 무시 */ }
    try { link.media = val; } catch (e2) { /* 무시 */ }
  }

  /* ───────────────────────── 1. 순수 판정 ───────────────────────── */

  function shouldForceCards(env) {
    try {
      if (!env || typeof env !== 'object') return false;
      if (env.coarse !== true) return false;
      var w = sureNum(env.screenW);
      var h = sureNum(env.screenH);
      var iw = sureNum(env.innerW);
      if (w === null || h === null || iw === null) return false;
      return Math.min(w, h) <= 600 && iw > 900;
    } catch (e) { return false; }
  }

  /* ───────────────────────── 2. env 읽기 ───────────────────────── */

  function readEnv(win) {
    var env = { coarse: false, screenW: NaN, screenH: NaN, innerW: NaN };
    try {
      if (win && typeof win.matchMedia === 'function') {
        var m = win.matchMedia('(pointer: coarse)');
        env.coarse = !!(m && m.matches);
      }
    } catch (e) { env.coarse = false; }
    try {
      if (win && win.screen) {
        var w = win.screen.width;
        var h = win.screen.height;
        if (typeof w === 'number') env.screenW = w;
        if (typeof h === 'number') env.screenH = h;
      }
    } catch (e2) { /* 모름 → NaN 유지 */ }
    try {
      var iw = win.innerWidth; /* win 이 null 이면 여기서 throw → 모름 */
      if (typeof iw === 'number') env.innerW = iw;
    } catch (e3) { /* 모름 → NaN 유지 */ }
    return env;
  }

  /* ───────────────────────── 2b. 화면 모드(수동 선택) ───────────────────────── */

  function normMode(m) { return (m === 'pc' || m === 'mobile') ? m : 'auto'; }

  /* 저장된 모드. 저장소 접근 실패·이상한 값이면 메모리 값, 그것도 없으면 'auto' */
  function getMode(win) {
    try {
      var ls = win && win.localStorage;
      if (ls && typeof ls.getItem === 'function') {
        var v = ls.getItem(STORE_KEY);
        if (v === 'pc' || v === 'mobile') return v;
        if (v !== null && v !== undefined) return 'auto';
        return memMode ? memMode : 'auto';
      }
    } catch (e) { /* 저장소를 못 읽음 → 메모리 값 */ }
    return memMode ? memMode : 'auto';
  }

  function setMode(win, doc, mode) {
    var m = normMode(mode);
    memMode = m === 'auto' ? null : m;
    try {
      var ls = win && win.localStorage;
      if (ls) {
        if (m === 'auto') { if (typeof ls.removeItem === 'function') ls.removeItem(STORE_KEY); }
        else if (typeof ls.setItem === 'function') ls.setItem(STORE_KEY, m);
      }
    } catch (e) { /* 저장 실패는 무시(메모리 값으로 이번 화면에는 적용) */ }
    apply(win, doc);
    return m;
  }

  /* ───────────────────────── 3. 판정 + 반영 ───────────────────────── */

  function apply(win, doc) {
    var mode = getMode(win);
    var force = mode === 'mobile' ? true : (mode === 'pc' ? false : shouldForceCards(readEnv(win)));
    try {
      var cl = doc && doc.documentElement && doc.documentElement.classList;
      if (cl) {
        if (force) cl.add(FORCE_CLASS); else cl.remove(FORCE_CLASS);
        if (mode === 'pc') cl.add('ui-pc'); else cl.remove('ui-pc');
        if (mode === 'mobile') cl.add('ui-mobile'); else cl.remove('ui-mobile');
      }
    } catch (e) { /* 예외 없음 */ }
    try {
      var link = (doc && typeof doc.getElementById === 'function')
        ? doc.getElementById('mobile-cards-css') : null;
      if (link) setMedia(link, mode === 'pc' ? 'not all' : (force ? 'all' : CARDS_MEDIA));
    } catch (e2) { /* 예외 없음 */ }
    try {
      var vp = (doc && typeof doc.querySelector === 'function')
        ? doc.querySelector('meta[name="viewport"]') : null;
      if (vp && typeof vp.setAttribute === 'function') {
        vp.setAttribute('content', mode === 'pc' ? VIEWPORT_PC : VIEWPORT_AUTO);
      }
    } catch (e3) { /* 예외 없음 */ }
    return force;
  }

  /* ───────────────────────── 4. 자동 실행(브라우저에서만) ───────────────────────── */

  /* window 와 document 가 둘 다 있을 때만 — Node(require) 에서는 document 가
     없어 실행되지 않는다. 실패해도 조용히 무시한다. */
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    try {
      apply(window, document);
      var timer = null;
      var rerun = function () {
        if (timer) clearTimeout(timer);
        timer = setTimeout(function () {
          timer = null;
          try { apply(window, document); } catch (e) { /* 무시 */ }
        }, 150);
      };
      if (typeof window.addEventListener === 'function') {
        window.addEventListener('resize', rerun);
        window.addEventListener('orientationchange', rerun);
      }
    } catch (e2) { /* 자동 실행 실패는 무시 */ }
  }

  /* ───────────────────────── 5. 공개 API ───────────────────────── */

  return {
    shouldForceCards: shouldForceCards,
    readEnv: readEnv,
    getMode: getMode,
    setMode: setMode,
    apply: apply
  };
});
