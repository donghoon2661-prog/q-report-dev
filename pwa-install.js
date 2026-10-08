/* ===== pwa-install.js — 로그인 화면의 "ADD TO HOME SCREEN" 버튼 =====
   안드로이드: 설치 창을 바로 띄움(없으면 메뉴 안내) / 아이폰: 사파리 단계 안내.
   화면 문구는 영문. 브라우저 저장소는 try/catch 로만 쓴다. */
(function (root) {
  'use strict';

  /* 순수 판정 함수(시험 가능) */
  function platformOf(ua, maxTouchPoints) {
    ua = String(ua || '');
    if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
    if (/Macintosh/i.test(ua) && (maxTouchPoints || 0) > 1) return 'ios';
    if (/Android/i.test(ua)) return 'android';
    return 'other';
  }
  function inAppBrowser(ua) {
    return /KAKAOTALK|FBAN|FBAV|Instagram|Line\/|NAVER\(|DaumApps|Snapchat|MicroMessenger/i.test(String(ua || ''));
  }
  function iosSafari(ua) {
    ua = String(ua || '');
    return /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|GSA\//i.test(ua) && !inAppBrowser(ua);
  }
  var api = { platformOf: platformOf, inAppBrowser: inAppBrowser, iosSafari: iosSafari };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.PwaInstall = api;
  if (typeof document === 'undefined') return;

  var ua = navigator.userAgent || '';
  var platform = platformOf(ua, navigator.maxTouchPoints);
  var KEY = 'a2hs-installed';
  var deferred = null;
  var btn = null, sheet = null;

  function stored() { try { return localStorage.getItem(KEY) === '1'; } catch (e) { return false; } }
  function store() { try { localStorage.setItem(KEY, '1'); } catch (e) { /* 저장 불가는 무시 */ } }
  function standalone() {
    try { if (navigator.standalone === true) return true; } catch (e) { /* 무시 */ }
    try { return !!(window.matchMedia && window.matchMedia('(display-mode: standalone)').matches); } catch (e) { return false; }
  }
  function hideAll() { if (btn) btn.hidden = true; if (sheet) sheet.hidden = true; }

  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferred = e; });
  window.addEventListener('appinstalled', function () { store(); hideAll(); });

  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }

  var SHARE_SVG = '<svg class="a2-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M8 7l4-4 4 4M5 11v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var MENU_SVG = '<svg class="a2-ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="1.8" fill="currentColor"/><circle cx="12" cy="12" r="1.8" fill="currentColor"/><circle cx="12" cy="19" r="1.8" fill="currentColor"/></svg>';

  function panel(which) {
    var wrap = sheet.querySelector('.a2-body');
    var html = '';
    if (which === 'android') {
      html += '<p class="a2-lead">One tap to put Kossan OQC on your home screen.</p>';
      if (deferred) {
        html += '<button type="button" class="a2-go" id="a2-install">INSTALL</button>';
      } else {
        html += '<ol class="a2-steps"><li>Open this page in <b>Chrome</b>.</li>' +
                '<li>Tap the ' + MENU_SVG + ' menu at the top right.</li>' +
                '<li>Tap <b>Install app</b> or <b>Add to Home screen</b>, then <b>Install</b>.</li></ol>' +
                '<p class="a2-note">If you do not see it, the app may already be installed.</p>';
      }
    } else {
      if (inAppBrowser(ua) || (platform === 'ios' && !iosSafari(ua))) {
        html += '<p class="a2-warn">Open this page in <b>Safari</b> first. Other browsers may not show the option.</p>';
      }
      html += '<p class="a2-lead">Add Kossan OQC to your iPhone home screen.</p>' +
              '<ol class="a2-steps"><li>Open this page in <b>Safari</b>.</li>' +
              '<li>Tap the Share button ' + SHARE_SVG + ' (bottom center, or top right on iPad).</li>' +
              '<li>Scroll down and tap <b>Add to Home Screen</b>.</li>' +
              '<li>Tap <b>Add</b>. The red Kossan icon appears on your home screen.</li></ol>';
    }
    wrap.innerHTML = html;
    var go = wrap.querySelector('#a2-install');
    if (go) go.addEventListener('click', function () {
      if (!deferred) return;
      deferred.prompt();
      deferred.userChoice.then(function (c) {
        if (c && c.outcome === 'accepted') { store(); hideAll(); }
        deferred = null;
      }, function () { deferred = null; });
    });
    var tabs = sheet.querySelectorAll('.a2-tab');
    for (var i = 0; i < tabs.length; i++) tabs[i].classList.toggle('on', tabs[i].getAttribute('data-p') === which);
  }

  function open() { sheet.hidden = false; panel(platform === 'ios' ? 'ios' : 'android'); }

  function build() {
    var box = document.querySelector('#gate .gate-box');
    if (!box || btn) return;
    if (platform === 'other' || standalone() || stored()) return;
    btn = el('button', 'a2-btn', 'ADD TO HOME SCREEN');
    btn.type = 'button';
    btn.id = 'a2hs-btn';
    btn.addEventListener('click', open);
    box.appendChild(btn);

    sheet = el('div', 'a2-sheet');
    sheet.hidden = true;
    sheet.innerHTML =
      '<div class="a2-card" role="dialog" aria-label="Add to home screen">' +
      '<button type="button" class="a2-x" aria-label="Close">&times;</button>' +
      '<div class="a2-head"><img src="icon-192.png" alt="" width="44" height="44"><div><b>Kossan OQC</b><span>Add to home screen</span></div></div>' +
      '<div class="a2-tabs"><button type="button" class="a2-tab" data-p="android">ANDROID</button>' +
      '<button type="button" class="a2-tab" data-p="ios">iPHONE</button></div>' +
      '<div class="a2-body"></div></div>';
    document.body.appendChild(sheet);
    sheet.addEventListener('click', function (e) { if (e.target === sheet) sheet.hidden = true; });
    sheet.querySelector('.a2-x').addEventListener('click', function () { sheet.hidden = true; });
    var tabs = sheet.querySelectorAll('.a2-tab');
    for (var i = 0; i < tabs.length; i++) tabs[i].addEventListener('click', function () { panel(this.getAttribute('data-p')); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build); else build();

  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', function () {
      try { navigator.serviceWorker.register('sw.js'); } catch (e) { /* 무시 */ }
    });
  }
})(typeof window !== 'undefined' ? window : this);
