/* =====================================================================
   devlog.js — 임시 디버그 수집 (작업 완료 후 이 파일 삭제 + index.html에서 script 태그 제거)
   수집 범위: Console(log/info/warn/error) · Network(fetch/XHR) · JS오류(onerror/unhandledrejection)
   ===================================================================== */
(function () {
  'use strict';

  /* ── 로그 저장소 ── */
  const LOGS = window.__DEVLOGS__ = [];

  function ts() {
    return new Date(Date.now() + 9 * 3600000).toISOString().replace('T', ' ').slice(0, 23) + ' KST';
  }

  /* ── 패널에 실시간 행 추가 ── */
  function push(entry) {
    LOGS.push(entry);
    const tbody = document.getElementById('devlog-tbody');
    if (tbody) tbody.insertAdjacentHTML('afterbegin', makeRow(entry));
    const count = document.getElementById('devlog-count');
    if (count) count.textContent = '(' + LOGS.length + '건)';
  }

  function levelClass(entry) {
    if (entry.level === 'ERROR' || entry.level === 'UNHANDLED') return 'dl-error';
    if (entry.level === 'WARN') return 'dl-warn';
    if (entry.cat === 'NETWORK' && entry.level === 'OK') return 'dl-net';
    return 'dl-info';
  }

  function makeRow(e) {
    const cls = levelClass(e);
    const safe = String(e.msg).replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return '<tr class="' + cls + '">'
      + '<td class="dl-time">' + e.time.slice(11) + '</td>'
      + '<td class="dl-cat">'  + e.cat            + '</td>'
      + '<td class="dl-lv">'   + e.level          + '</td>'
      + '<td class="dl-msg">'  + safe             + '</td>'
      + '</tr>';
  }

  /* ── Console 인터셉터 ── */
  ['log', 'info', 'warn', 'error'].forEach(function (level) {
    var orig = console[level].bind(console);
    console[level] = function () {
      orig.apply(console, arguments);
      var args = Array.prototype.slice.call(arguments);
      push({
        time: ts(), cat: 'CONSOLE', level: level.toUpperCase(),
        msg: args.map(function (a) {
          try { return typeof a === 'object' ? JSON.stringify(a) : String(a); } catch (_) { return String(a); }
        }).join(' ')
      });
    };
  });

  /* ── JS 전역 에러 ── */
  window.addEventListener('error', function (e) {
    push({ time: ts(), cat: 'JS', level: 'ERROR',
           msg: e.message + ' @ ' + e.filename + ':' + e.lineno });
  });
  window.addEventListener('unhandledrejection', function (e) {
    push({ time: ts(), cat: 'JS', level: 'UNHANDLED',
           msg: String((e.reason && e.reason.message) ? e.reason.message : (e.reason || 'Promise rejected')) });
  });

  /* ── Fetch 인터셉터 ── */
  var origFetch = window.fetch;
  window.fetch = function (input, init) {
    var url    = typeof input === 'string' ? input : (input.url || String(input));
    var method = ((init && init.method) || (input && input.method) || 'GET').toUpperCase();
    var t0     = Date.now();
    return origFetch(input, init).then(function (res) {
      push({ time: ts(), cat: 'NETWORK', level: res.ok ? 'OK' : 'WARN',
             msg: method + ' ' + url + ' → ' + res.status + ' (' + (Date.now() - t0) + 'ms)' });
      return res;
    }, function (err) {
      push({ time: ts(), cat: 'NETWORK', level: 'ERROR',
             msg: method + ' ' + url + ' → FAILED (' + (Date.now() - t0) + 'ms) ' + err.message });
      throw err;
    });
  };

  /* ── XHR 인터셉터 ── */
  var OrigXHR = window.XMLHttpRequest;
  function PatchedXHR() {
    var xhr     = new OrigXHR();
    var _method = '', _url = '', _t0 = 0;

    var origOpen = xhr.open.bind(xhr);
    xhr.open = function (method, url) {
      _method = method.toUpperCase();
      _url    = url;
      return origOpen.apply(xhr, arguments);
    };

    var origSend = xhr.send.bind(xhr);
    xhr.send = function () {
      _t0 = Date.now();
      xhr.addEventListener('loadend', function () {
        var ms  = Date.now() - _t0;
        var lvl = xhr.status === 0 ? 'ERROR' : xhr.status < 400 ? 'OK' : 'WARN';
        push({ time: ts(), cat: 'NETWORK', level: lvl,
               msg: _method + ' ' + _url + ' → ' + (xhr.status || 'ERR') + ' (' + ms + 'ms)' });
      });
      return origSend.apply(xhr, arguments);
    };

    return xhr;
  }
  PatchedXHR.prototype = OrigXHR.prototype;
  window.XMLHttpRequest = PatchedXHR;

  /* ── SYSTEM 탭 패널 렌더 (system.js의 renderSystemTab 완료 후 호출) ── */
  window.__renderDevlogPanel__ = function (container) {
    var html = ''
      + '<div class="sys-sec" style="margin-top:20px;display:flex;align-items:center;gap:10px">'
      +   '<span>CONSOLE / NETWORK LOG</span>'
      +   '<span style="font-size:10px;color:var(--fog)" id="devlog-count">(' + LOGS.length + '건)</span>'
      +   '<button class="sys-retry" id="devlog-clear" style="margin-left:auto;border-color:var(--buoy);color:var(--buoy)">CLEAR</button>'
      +   '<button class="sys-retry" id="devlog-copy" style="border-color:var(--sail);color:var(--sail)">COPY ALL</button>'
      + '</div>'
      + '<div style="overflow-x:auto;max-height:480px;overflow-y:auto;border:1px solid var(--line);background:#020A10">'
      +   '<table style="width:100%;border-collapse:collapse;font-family:\'IBM Plex Mono\',monospace;font-size:10.5px">'
      +     '<thead><tr style="position:sticky;top:0;background:#030E18;z-index:1">'
      +       '<th style="padding:5px 8px;text-align:left;color:var(--fog);font-weight:400;white-space:nowrap;border-bottom:1px solid var(--line)">TIME</th>'
      +       '<th style="padding:5px 8px;text-align:left;color:var(--fog);font-weight:400;border-bottom:1px solid var(--line)">CAT</th>'
      +       '<th style="padding:5px 8px;text-align:left;color:var(--fog);font-weight:400;border-bottom:1px solid var(--line)">LEVEL</th>'
      +       '<th style="padding:5px 8px;text-align:left;color:var(--fog);font-weight:400;border-bottom:1px solid var(--line);width:100%">MESSAGE</th>'
      +     '</tr></thead>'
      +     '<tbody id="devlog-tbody">'
      +       LOGS.slice().reverse().map(makeRow).join('')
      +     '</tbody>'
      +   '</table>'
      + '</div>';

    container.insertAdjacentHTML('beforeend', html);

    document.getElementById('devlog-clear').addEventListener('click', function () {
      LOGS.length = 0;
      var tb = document.getElementById('devlog-tbody');
      if (tb) tb.innerHTML = '';
      var c = document.getElementById('devlog-count');
      if (c) c.textContent = '(0건)';
    });

    document.getElementById('devlog-copy').addEventListener('click', function () {
      var btn = document.getElementById('devlog-copy');
      var txt = LOGS.map(function (e) {
        return '[' + e.time + '] ' + e.cat + ' ' + e.level + ' ' + e.msg;
      }).join('\n');
      navigator.clipboard.writeText(txt).then(function () {
        btn.textContent = 'COPIED!';
        setTimeout(function () { btn.textContent = 'COPY ALL'; }, 2000);
      });
    });
  };

  /* ── CSS 인라인 주입 ── */
  var style = document.createElement('style');
  style.textContent = [
    '#devlog-tbody tr{border-bottom:1px solid rgba(30,58,76,.5)}',
    '#devlog-tbody tr:hover{background:rgba(255,255,255,.03)}',
    '.dl-time{color:#5A7A8A;white-space:nowrap;padding:4px 8px}',
    '.dl-cat{color:#8AA4B5;white-space:nowrap;padding:4px 8px}',
    '.dl-lv{white-space:nowrap;padding:4px 8px;font-weight:600}',
    '.dl-msg{padding:4px 8px;word-break:break-all;color:#B8CDD8}',
    '.dl-error .dl-lv,.dl-error .dl-msg{color:#FF6B6B}',
    '.dl-warn .dl-lv{color:#F2C14E}',
    '.dl-warn .dl-msg{color:#E0C97A}',
    '.dl-net .dl-lv{color:#3FD0A6}',
    '.dl-info .dl-lv{color:#5A7A8A}'
  ].join('\n');
  document.head.appendChild(style);

})();
