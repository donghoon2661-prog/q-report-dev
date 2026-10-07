/* ═════════════════════════════════════════════════════════════════
 * country-add.js — 호주 ADD 창 (15차, SPEC15.md 1절)
 *
 * - 타깃: data-cg-action="add-au" 클릭을 country-form.js 의 위임이
 *   CountryAdd.open() 으로 넘겨준다. 없으면 country-form 이 수동 입력 창으로
 *   폴백한다(그 쪽 코드).
 * - NEW BOOKING (TRAQO): 부킹 번호만 입력(선박·일정·컨테이너는 서버가 Traqo 로
 *   자동 생성). 저장 전에 자체 확인 팝업(id ca-confirm, 브라우저 confirm 금지)을
 *   띄우고 CONTINUE 를 눌렀을 때만 POST /ais-plan-add (confirm:true).
 *   새 부킹 1개당 Traqo 무료 슬롯 1개 소모 — 팝업 문구로 명시.
 * - SAME VESSEL: 기존 선적을 따라간다(followFrom). Traqo 조회 없음(슬롯 소모
 *   없음) — 확인 팝업 없이 바로 전송.
 * - 관리자 키: country-form.js 와 같은 방식 — sessionStorage('cfAdminKey',
 *   같은 탭)에만 저장, 본문이 아니라 X-Refresh-Key 헤더로만 보낸다. 저장에
 *   성공한 키는 다음에 자동 채운다. 화면·오류 메시지에는 노출하지 않는다.
 * - 오류 문구는 describeResult 라는 같은 모양의 순수 함수로: 서버 400 error
 *   문구를 그대로(이스케이프해 표시), 401/네트워크는 지정 문구.
 * - 전역 노출: window.CountryAdd (브라우저) / module.exports (Node — require
 *   부작용 없음, DOM 은 브라우저에서만 만든다). 스타일은 country-form.css 의
 *   cf-* 규칙을 재사용하고, 이 창만의 조각은 country-add.css 에 둔다.
 * ═════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.CountryAdd = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ───────────────────── 공통 상수 · 유틸 ───────────────────── */

  /* 검증 규칙·문구 — country-form.js 의 규칙을 같은 문구로(재사용) */
  var RE_BOOKING = /^[A-Z]{3}\d{7}$/;
  var RE_PO = /^AU-\d{6,12}$/;
  var MSG_BOOKING = 'Booking must be 3 letters + 7 digits (e.g. CDB0585621).';
  var MSG_PO = 'PO must look like AU-1924661260.';
  var MSG_CNTR_QTY = 'Container count must be a whole number from 1 to 99.';
  var MSG_401 = 'Authentication failed \u2014 check the admin key.';
  var MSG_NET = 'Could not reach the server.';

  function text(v) { return (v == null ? '' : String(v)).trim(); }

  function hasOwn(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function getCountryUI() {
    if (typeof self !== 'undefined' && self && self.CountryUI) return self.CountryUI;
    if (typeof global !== 'undefined' && global && global.CountryUI) return global.CountryUI;
    return null;
  }

  function getCountryForm() {
    if (typeof self !== 'undefined' && self && self.CountryForm) return self.CountryForm;
    if (typeof global !== 'undefined' && global && global.CountryForm) return global.CountryForm;
    return null;
  }

  /* po 칸들 정규화: trim · 대문자화 · 중복 제거(빈 칸 무시) */
  function normalizePo(list) {
    var out = [];
    var raw = Array.isArray(list) ? list : [];
    for (var i = 0; i < raw.length; i++) {
      var p = text(raw[i]).toUpperCase();
      if (!p) continue;
      if (out.indexOf(p) === -1) out.push(p);
    }
    return out;
  }

  /* ───────────────── 순수 함수 (Node 테스트 대상, DOM 접근 없음) ───────────────── */

  /* validate(values) → { errors, count }
     values: { mode:'traqo'|'follow', booking, po:[], followFrom, cntrQty, adminKey }
     문구는 country-form.js 의 기존 규칙과 동일. PO 는 선택이라 빈 목록도 통과. */
  function validate(values) {
    var v = values || {};
    var errors = {};
    var mode = v.mode === 'follow' ? 'follow' : 'traqo';

    var booking = text(v.booking).toUpperCase();
    if (!booking) errors.booking = 'Required.';
    else if (!RE_BOOKING.test(booking)) errors.booking = MSG_BOOKING;

    /* PO: 선택. 비어 있지 않은 칸만 형식 검사(모두 비면 OK — 빈 po 는 보내지 않음) */
    var rawPo = Array.isArray(v.po) ? v.po : [];
    for (var i = 0; i < rawPo.length; i++) {
      var p = text(rawPo[i]);
      if (p && !RE_PO.test(p.toUpperCase())) { errors.po = MSG_PO; break; }
    }

    /* SAME VESSEL 은 따라갈 선적이 필요하다(목록조차 없으면 버튼이 비활성) */
    if (mode === 'follow' && !text(v.followFrom)) errors.followFrom = 'Required.';

    var cq = text(v.cntrQty);
    if (cq && !/^\d{1,2}$/.test(cq)) errors.cntrQty = MSG_CNTR_QTY;
    else if (cq && !(parseInt(cq, 10) >= 1 && parseInt(cq, 10) <= 99)) errors.cntrQty = MSG_CNTR_QTY;

    if (!text(v.adminKey)) errors.adminKey = 'Required.';

    var count = 0;
    for (var k in errors) { if (hasOwn(errors, k)) count++; }
    return { errors: errors, count: count };
  }

  /* buildPayload(values) → POST /ais-plan-add 본문. 관리자 키는 본문에 넣지 않는다.
     - NEW BOOKING(traqo): 서버 계약 — confirm:true 가 없으면 거부된다.
     - SAME VESSEL(follow): Traqo 조회 없음 → confirm 을 보내지 않는다.
     - 빈 po 는 보내지 않는다. cntrQty 는 값이 있을 때만 숫자로. */
  function buildPayload(values) {
    var v = values || {};
    var mode = v.mode === 'follow' ? 'follow' : 'traqo';
    var booking = text(v.booking).toUpperCase();
    var payload = { booking: booking };
    if (mode === 'traqo') {
      payload.confirm = true;
    } else {
      payload.followFrom = text(v.followFrom).toUpperCase();
      var cq = text(v.cntrQty);
      if (cq && /^\d{1,2}$/.test(cq)) {
        var n = parseInt(cq, 10);
        if (n >= 1 && n <= 99) payload.cntrQty = n;
      }
    }
    var po = normalizePo(v.po);
    if (po.length) payload.po = po;
    return payload; /* adminKey 는 절대 본문에 넣지 않는다(헤더로만) */
  }

  /* describeResult(status, json, booking) — country-form.js 의 describeResult 와
     같은 모양(상태 → 영문 문구)이되, 이 창의 문구를 쓴다.
     400: 서버 error 문구를 영문 그대로. 401/네트워크: 지정 문구.
     200: 토스트용 'Added <부킹>.'
     이스케이프: 문구를 표시하는 곳이 textContent(또는 esc 를 통과한 innerHTML)라
     이스케이프가 성립한다. */
  function describeResult(status, json, booking) {
    var j = (json && typeof json === 'object') ? json : {};
    if (status === 200) {
      var b = text(booking);
      return b ? 'Added ' + b + '.' : 'Added.';
    }
    if (status === 400) return j.error != null ? String(j.error) : 'Invalid input.';
    if (status === 401) return MSG_401;
    if (status == null || status === 0) return MSG_NET;
    return 'Server error (' + status + ').';
  }

  /* 확인 팝업(NEW BOOKING 전용) 문장들 — 순수 함수. body 는 이스케이프된
     부킹 번호가 들어간 HTML(inner@aHTML 로 붙인다 — 정적 문장 + esc(부킹)). */
  function slotConfirmHtml(booking) {
    return {
      title: 'Use 1 Traqo slot?',
      body: 'Adding ' + esc(booking) + ' looks it up on Traqo and uses 1 of '
        + 'your 4 free slots this month. Continue?',
      cancel: 'CANCEL',
      ok: 'CONTINUE'
    };
  }

  /* 따라가기 옵션 표시 '<부킹 또는 MBL> · <선박명> <항차>' (textContent 로 붙인다) */
  function followLabel(p) {
    var b = text(p && p.booking) || text(p && p.mbl);
    var name = (text(p && p.vessel) + ' ' + text(p && p.voyage)).trim();
    return name ? b + ' \u00B7 ' + name : b;
  }

  /* 따라갈 수 있는 기존 선적(현재는 plans 객체 — CountryUI.getPlans 복사본).
     이미 다른 선적을 따라가는(plan.scheduleFrom 이 있는) 선적은 제외 —
     한 단계만 허용(country-form.js 의 규칙과 동일). */
  function eligibleFollowPlans(plans) {
    var out = [];
    for (var k in plans) {
      if (!hasOwn(plans, k)) continue;
      var p = plans[k];
      if (!p || typeof p !== 'object') continue;
      if (!followLabel(p)) continue;
      if (p.scheduleFrom) continue;
      out.push(p);
    }
    return out;
  }

  function followChoices(plans) {
    return eligibleFollowPlans(plans).map(function (p) {
      return { key: text(p.mbl), label: followLabel(p) };
    }).filter(function (c) { return !!c.key; });
  }

  /* ───────────────────── DOM (브라우저) ───────────────────── */

  function byId(id) {
    return (typeof document !== 'undefined') ? document.getElementById(id) : null;
  }

  function el(tag, cls, txt) {
    var n = document.createElement(tag);
    if (cls) { n.className = cls; }
    if (txt != null) { n.textContent = txt; }
    return n;
  }

  function setHidden(node, hide) {
    if (!node) { return; }
    if (hide) { node.setAttribute('hidden', ''); }
    else { node.removeAttribute('hidden'); }
  }

  var INPUT_IDS = {
    booking: 'ca-booking', followFrom: 'ca-follow', cntrQty: 'ca-cntr-qty',
    adminKey: 'ca-admin-key'
  };
  var ERR_IDS = {
    booking: 'ca-err-booking', po: 'ca-err-po', followFrom: 'ca-err-follow',
    cntrQty: 'ca-err-cntrQty', adminKey: 'ca-err-admin-key'
  };

  /* 모달 골격 — 정적 문자열만. 동적 값(부킹·PO·선적 목록·서버 응답)은 전부
     textContent/value 또는 순수 함수가 esc 를 통과한 문자열로만 넣는다.
     기본 골격 모양은 country-form.js 의 cf-* 규칙을 재사용(모양 통일),
     이 창만의 조각(ca-*)은 country-add.css 에 둔다. */
  var MODAL_HTML = [
    '<div class="cf-modal" role="dialog" aria-modal="true" aria-labelledby="ca-title">',
    '<div class="cf-modal-head">',
    '<div>',
    '<h2 class="cf-modal-title" id="ca-title">ADD AUSTRALIA SHIPMENT</h2>',
    '<p class="cf-modal-sub" id="ca-sub">Port Klang \u2192 Sydney</p>',
    '</div>',
    '<button type="button" class="cf-modal-close" id="ca-close" aria-label="Close">\u00D7</button>',
    '</div>',
    '<p class="cf-modal-alert" id="ca-alert" hidden></p>',
    '<div class="cf-modal-body">',
    '<section class="cf-sect">',
    '<div class="cf-seg" role="radiogroup" aria-label="Add mode">',
    '<label class="cf-seg-opt"><input type="radio" name="ca-mode" id="ca-mode-traqo" value="traqo" checked><span>NEW BOOKING (TRAQO)</span></label>',
    '<label class="cf-seg-opt"><input type="radio" name="ca-mode" id="ca-mode-follow" value="follow"><span>SAME VESSEL AS EXISTING SHIPMENT</span></label>',
    '</div>',
    '</section>',
    '<section class="cf-sect" id="ca-sect-traqo">',
    '<div class="cf-form-grid">',
    '<div class="cf-field cf-span2">',
    '<label class="cf-lbl" for="ca-booking">BOOKING NUMBER <span class="cf-req">*</span></label>',
    '<input class="cf-inp" type="text" id="ca-booking" placeholder="CDB0585621" autocomplete="off" spellcheck="false">',
    '<p class="cf-err" id="ca-err-booking" hidden></p>',
    '</div>',
    '<p class="cf-help cf-span2" id="ca-hint-traqo">The vessel, schedule and container details are read automatically from Traqo.</p>',
    '<p class="cf-help cf-span2 ca-slot-note" id="ca-slot-note">This uses 1 of your 4 free Traqo slots per month.</p>',
    '</div>',
    '</section>',
    '<section class="cf-sect" id="ca-sect-follow" hidden>',
    '<div class="cf-form-grid">',
    '<div class="cf-field cf-span2">',
    '<label class="cf-lbl" for="ca-follow">FOLLOWS</label>',
    '<select class="cf-inp" id="ca-follow"></select>',
    '<p class="cf-notice-warn" id="ca-follow-empty" hidden>No shipment to follow yet.</p>',
    '<p class="cf-err" id="ca-err-follow" hidden></p>',
    '</div>',
    '<div class="cf-field cf-span2">',
    '<label class="cf-lbl" for="ca-cntr-qty">CONTAINERS (COUNT)</label>',
    '<input class="cf-inp" type="number" id="ca-cntr-qty" min="1" max="99" step="1" inputmode="numeric" autocomplete="off" spellcheck="false">',
    '<p class="cf-err" id="ca-err-cntrQty" hidden></p>',
    '</div>',
    '<p class="cf-help cf-span2" id="ca-hint-follow">Schedule and vessel follow the selected shipment. No Traqo slot is used.</p>',
    '</div>',
    '</section>',
    '<section class="cf-sect">',
    '<div class="cf-form-grid">',
    '<div class="cf-field cf-span2">',
    '<span class="cf-lbl" id="ca-po-label">PO</span>',
    '<div class="cf-rows" id="ca-po-rows" role="group" aria-labelledby="ca-po-label"></div>',
    '<button type="button" class="cf-btn-addrow" id="ca-add-po">+ PO</button>',
    '<p class="cf-help">Optional. Format: AU- followed by digits.</p>',
    '<p class="cf-err" id="ca-err-po" hidden></p>',
    '</div>',
    '</div>',
    '</section>',
    '</div>',
    '<div class="cf-modal-foot">',
    '<div class="cf-adminkey">',
    '<label class="cf-lbl" for="ca-admin-key">Admin key</label>',
    '<input class="cf-inp" type="password" id="ca-admin-key" autocomplete="new-password">',
    '<p class="cf-help">Same key as adding a booking.</p>',
    '<p class="cf-err" id="ca-err-admin-key" hidden></p>',
    '</div>',
    '<div class="cf-foot-actions">',
    '<button type="button" class="ca-manual-link" id="ca-manual">Enter manually instead</button>',
    '<button type="button" class="cf-btn cf-btn-ghost" id="ca-cancel">CANCEL</button>',
    '<button type="button" class="cf-btn cf-btn-save" id="ca-save">ADD</button>',
    '</div>',
    '</div>',
    '<div class="ca-confirm" id="ca-confirm" hidden>',
    '<div class="ca-card" role="dialog" aria-modal="true" aria-labelledby="ca-conf-title">',
    '<h3 class="ca-conf-title" id="ca-conf-title">Use 1 Traqo slot?</h3>',
    '<p class="ca-conf-body" id="ca-conf-body"></p>',
    '<div class="ca-actions">',
    '<button type="button" class="cf-btn cf-btn-ghost" id="ca-conf-cancel">CANCEL</button>',
    '<button type="button" class="cf-btn cf-btn-save" id="ca-conf-ok">CONTINUE</button>',
    '</div>',
    '</div>',
    '</div>',
    '</div>'
  ].join('');

  var built = false;
  function buildOnce() {
    if (built || typeof document === 'undefined' || !document.body) { return; }
    built = true;
    var overlay = el('div', 'cf-overlay');
    overlay.id = 'ca-overlay';
    setHidden(overlay, true);
    overlay.innerHTML = MODAL_HTML; /* 정적 골격만 — 사용자 값 없음 */
    document.body.appendChild(overlay);
    var toast = el('div', 'cf-toast');
    toast.id = 'ca-toast';
    setHidden(toast, true);
    document.body.appendChild(toast);
  }

  /* Node 테스트용: 가짜 DOM 을 갈아끼울 때 골격 생성·바인딩 플래그를 지운다.
     (브라우저에서는 한 번만 만드니까 이 함수를 쓰지 않는다) */
  function reset() {
    built = false;
    bound = false;
    pending = null;
    busy = false;
  }

  /* PO 반복 칸 — country-form.js 와 같은 방식(마지막 칸은 지우지 않고 비운다) */
  function addInputRow(boxId, value, label) {
    var box = byId(boxId);
    if (!box) { return null; }
    var row = el('div', 'cf-row');
    var inp = el('input', 'cf-inp');
    inp.type = 'text';
    inp.value = value || '';
    inp.setAttribute('aria-label', label);
    inp.setAttribute('autocomplete', 'off');
    inp.setAttribute('spellcheck', 'false');
    var x = el('button', 'cf-btn-x', '\u00D7');
    x.type = 'button';
    x.setAttribute('aria-label', 'Remove');
    x.addEventListener('click', function () {
      if (box.children.length > 1) { box.removeChild(row); }
      else { inp.value = ''; }
    });
    row.appendChild(inp);
    row.appendChild(x);
    box.appendChild(row);
    return inp;
  }

  function setRows(boxId, values, label) {
    var box = byId(boxId);
    if (!box) { return; }
    while (box.firstChild) { box.removeChild(box.firstChild); }
    var vals = (values && values.length) ? values : [''];
    for (var i = 0; i < vals.length; i++) { addInputRow(boxId, vals[i], label); }
  }

  function rowValues(boxId) {
    var box = byId(boxId);
    var out = [];
    if (!box || !box.querySelectorAll) { return out; }
    var inputs = box.querySelectorAll('input');
    for (var i = 0; i < inputs.length; i++) {
      var v = text(inputs[i].value);
      if (v) { out.push(v); }
    }
    return out;
  }

  /* 따라가기 드롭다운 — CountryUI.getPlans() 사본에서 만든다.
     따라갈 선적이 하나도 없으면: 안내문 + 저장 버튼 비활성(지시서 규칙) */
  function fillFollowOptions() {
    var sel = byId('ca-follow');
    if (!sel) { return; }
    while (sel.firstChild) { sel.removeChild(sel.firstChild); }
    var choices = followChoices(getPlansCopy());
    var note = byId('ca-follow-empty');
    if (note) {
      note.textContent = 'No shipment to follow yet.'; /* 지시서 문구 — 모듈이 직접 쓴다(테스트 관찰 가능) */
      setHidden(note, choices.length > 0 ? true : false);
    }
    var saveBtn = byId('ca-save');
    if (saveBtn) { saveBtn.disabled = choices.length === 0; }
    for (var i = 0; i < choices.length; i++) {
      var o = document.createElement('option');
      o.value = choices[i].key;
      o.textContent = choices[i].label;
      if (i === 0) { o.selected = true; }
      sel.appendChild(o);
    }
    if (choices.length && typeof sel.value === 'string') { sel.value = choices[0].key; } /* 기본 선택(첫 항목) */
  }

  function getPlansCopy() {
    var cui = getCountryUI();
    if (cui && typeof cui.getPlans === 'function') {
      try { return cui.getPlans() || {}; } catch (e) { return {}; }
    }
    return {};
  }

  function setMode(mode) {
    var t = byId('ca-mode-traqo');
    var f = byId('ca-mode-follow');
    if (t) { t.checked = (mode !== 'follow'); }
    if (f) { f.checked = (mode === 'follow'); }
    setHidden(byId('ca-sect-traqo'), mode === 'follow');
    setHidden(byId('ca-sect-follow'), mode !== 'follow');
    if (mode === 'follow') { fillFollowOptions(); }
  }

  /* ───────────────── 오류 표시 (country-form.js 와 같은 방식) ───────────────── */

  function showAlert(msg) {
    var a = byId('ca-alert');
    if (!a) { return; }
    if (msg) { a.textContent = msg; setHidden(a, false); }
    else { a.textContent = ''; setHidden(a, true); }
  }

  function setErr(key, msg) {
    var inp = byId(INPUT_IDS[key] || '');
    var err = byId(ERR_IDS[key] || '');
    if (err) {
      if (msg) { err.textContent = msg; setHidden(err, false); }
      else { err.textContent = ''; setHidden(err, true); }
    }
    if (inp && inp.classList) {
      if (msg) { inp.classList.add('cf-invalid'); }
      else { inp.classList.remove('cf-invalid'); }
    }
  }

  function clearErrors() {
    for (var k in ERR_IDS) { if (hasOwn(ERR_IDS, k)) { setErr(k, ''); } }
  }

  function showErrors(res) {
    clearErrors();
    var errors = (res && res.errors) || {};
    for (var k in errors) { if (hasOwn(errors, k)) { setErr(k, errors[k]); } }
  }

  /* ───────────────── 관리자 키 보관 (country-form.js 와 같은 저장 키) ───────────────── */

  var KEY_STORE = 'cfAdminKey'; /* country-form.js 와 같은 키 — 한 번 입력하면 ADD·EDIT·수동 창이 함께 쓴다 */
  function storeKey(key) {
    try { sessionStorage.setItem(KEY_STORE, key); } catch (e) { /* 저장 불가 환경 무시 */ }
  }
  function loadKey() {
    try { return sessionStorage.getItem(KEY_STORE) || ''; } catch (e) { return ''; }
  }

  /* ───────────────── 토스트 ───────────────── */

  var toastTimer = null;
  function showToast(msg) {
    var t = byId('ca-toast');
    if (!t) { return; }
    t.textContent = msg;
    setHidden(t, false);
    if (t.classList) {
      t.classList.remove('cf-show');
      void t.offsetWidth;
      t.classList.add('cf-show');
    }
    if (toastTimer) { clearTimeout(toastTimer); }
    toastTimer = setTimeout(function () {
      setHidden(t, true);
      if (t.classList) { t.classList.remove('cf-show'); }
    }, 3000);
  }

  /* ───────────────── 확인 팝업 (NEW BOOKING 전용) ───────────────── */

  /* 저장(ADD) 클릭 시점의 검증 통과 값 — CONTINUE 를 눌러야 서버로 간다 */
  var pending = null;
  var busy = false;

  function popupOpen() {
    var p = byId('ca-confirm');
    if (p && typeof p.getAttribute === 'function') { return p.getAttribute('hidden') === null; }
    return false;
  }

  function openSlotPopup(values) {
    pending = values;
    var conf = slotConfirmHtml(text(values.booking).toUpperCase());
    var body = byId('ca-conf-body');
    if (body) { body.innerHTML = conf.body; } /* 순수 함수가 esc(booking) 을 통과시켰다 */
    else { return; }
    setHidden(byId('ca-confirm'), false);
    var btn = byId('ca-save'); /* 팝업이 열려 있는 동안 ADD 중복 클릭 방지 */
    if (btn) { btn.disabled = true; }
    var cancel = byId('ca-conf-cancel'); /* 기본 포커스 = CANCEL */
    if (cancel && typeof cancel.focus === 'function') { cancel.focus(); }
  }

  function closeSlotPopup() {
    pending = null;
    setHidden(byId('ca-confirm'), true);
    var btn = byId('ca-save');
    if (btn) { btn.disabled = false; }
  }

  /* ───────────────── 값 수집 · 초기화 ───────────────── */

  function collectValues() {
    function val(id) { var n = byId(id); return n ? n.value : ''; }
    var f = byId('ca-mode-follow');
    var mode = (f && f.checked) ? 'follow' : 'traqo';
    var v = {
      mode: mode,
      booking: val('ca-booking'),
      po: rowValues('ca-po-rows'),
      adminKey: val('ca-admin-key')
    };
    if (mode === 'follow') {
      v.followFrom = val('ca-follow');
      v.cntrQty = val('ca-cntr-qty');
    }
    return v;
  }

  function resetForm() {
    var b = byId('ca-booking');
    if (b) { b.value = ''; }
    setRows('ca-po-rows', null, 'PO');
    var q = byId('ca-cntr-qty');
    if (q) { q.value = ''; }
    var key = byId('ca-admin-key');
    if (key) { key.value = loadKey(); } /* 같은 탭에서 저장했던 키 자동 채움 */
    setMode('traqo');
    clearErrors();
    showAlert('');
    closeSlotPopup();
    busy = false;
  }

  /* ───────────────── 저장 (이 창에서 허용된 유일한 서버 호출: POST /ais-plan-add) ───────────────── */

  function save() {
    if (busy || popupOpen()) { return; } /* 중복 클릭 방지 */
    var values = collectValues();
    var res = validate(values);
    showErrors(res);
    var overlay = byId('ca-overlay');
    if (res.count > 0) {
      if (overlay) { overlay.scrollTop = 0; }
      return;
    }
    /* NEW BOOKING: 서버 호출 전에 확인 팝업(CONTINUE 를 눌러야 전송) */
    if (values.mode === 'traqo') {
      openSlotPopup(values);
      return;
    }
    /* SAME VESSEL: 팝업 없이 바로 전송 */
    submit(values);
  }

  function continueSubmit() {
    if (!popupOpen() || !pending) { return; }
    var values = pending;
    setHidden(byId('ca-confirm'), true); /* 팝업만 닫고 전송(창은 그대로) */
    pending = null;
    submit(values);
  }

  function submit(values) {
    if (busy) { return; }
    if (typeof fetch !== 'function') { showAlert(MSG_NET); return; }
    busy = true;
    var btn = byId('ca-save');
    if (btn) { btn.disabled = true; }
    var key = text(values.adminKey);
    var base = (typeof API_ROOT === 'string') ? API_ROOT : ''; /* GET 전역(country-form 과 같은 방식) */
    var payload = buildPayload(values); /* 본문에 관리자 키를 넣지 않는다 */
    fetch(base + '/ais-plan-add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Refresh-Key': key },
      body: JSON.stringify(payload)
    }).then(function (r) {
      var status = r ? r.status : null;
      var wasOk = !!(r && r.ok);
      if (r && typeof r.json === 'function') {
        return r.json().catch(function () { return null; }).then(function (j) {
          return { status: status, ok: wasOk, json: j };
        });
      }
      return { status: status, ok: wasOk, json: null };
    }).then(function (out) {
      busy = false;
      if (btn) { btn.disabled = false; }
      if (out.ok && out.status === 200) {
        storeKey(key); /* 기존 방식 — sessionStorage 에만 저장 */
        var booking = text(values.booking).toUpperCase();
        closeModal();
        showToast(describeResult(200, out.json, booking));
        var cui = getCountryUI();
        if (cui && typeof cui.refresh === 'function') {
          try { cui.refresh(); } catch (e) { /* 무시 */ }
        }
      } else {
        /* 실패: 창을 유지하고 문구만 표시(입력값 보존) */
        showAlert(describeResult(out.status, out.json, text(values.booking)));
      }
    }).catch(function () {
      busy = false;
      if (btn) { btn.disabled = false; }
      showAlert(MSG_NET);
    });
  }

  /* ───────────────── 창 열기/닫기 ───────────────── */

  function open() {
    if (typeof document === 'undefined') { return; }
    buildOnce();
    bindOnce();
    var overlay = byId('ca-overlay');
    if (!overlay) { return; }
    resetForm();
    setHidden(overlay, false);
    if (document.body && document.body.classList) { document.body.classList.add('cf-modal-open'); }
    overlay.scrollTop = 0;
    var first = byId('ca-booking');
    if (first && typeof first.focus === 'function') { first.focus(); }
  }

  function closeModal() {
    closeSlotPopup();
    var overlay = byId('ca-overlay');
    if (overlay) { setHidden(overlay, true); }
    if (typeof document !== 'undefined' && document.body && document.body.classList) {
      document.body.classList.remove('cf-modal-open');
    }
  }

  /* ───────────────────── 이벤트 ───────────────────── */

  var bound = false;
  function bindOnce() {
    if (bound || typeof document === 'undefined') { return; }
    bound = true;
    var overlay = byId('ca-overlay');
    var bClose = byId('ca-close');
    var bCancel = byId('ca-cancel');
    if (bClose) { bClose.addEventListener('click', closeModal); }
    if (bCancel) { bCancel.addEventListener('click', closeModal); }
    if (overlay) {
      overlay.addEventListener('click', function (e) {
        if (!e || e.target !== overlay) { return; }
        if (popupOpen()) { closeSlotPopup(); return; } /* ESC·바깥 클릭 = 확인 팝업 CANCEL */
        closeModal();
      });
    }
    var popup = byId('ca-confirm');
    if (popup) {
      popup.addEventListener('click', function (e) {
        if (e && e.target === popup) { closeSlotPopup(); } /* 팝업 카드 바깥 클릭 = CANCEL */
      });
    }
    document.addEventListener('keydown', function (e) {
      if (e && (e.key === 'Escape' || e.key === 'Esc')) {
        if (popupOpen()) { closeSlotPopup(); return; }
        var ov = byId('ca-overlay');
        if (ov && ov.getAttribute('hidden') === null) { closeModal(); }
      }
    });
    var mTraqo = byId('ca-mode-traqo');
    var mFollow = byId('ca-mode-follow');
    if (mTraqo) { mTraqo.addEventListener('change', function () { setMode('traqo'); }); }
    if (mFollow) { mFollow.addEventListener('change', function () { setMode('follow'); }); }
    var booking = byId('ca-booking');
    if (booking) { booking.addEventListener('input', function () { booking.value = String(booking.value).toUpperCase(); }); }
    var addPo = byId('ca-add-po');
    if (addPo) { addPo.addEventListener('click', function () { addInputRow('ca-po-rows', '', 'PO'); }); }
    var manual = byId('ca-manual');
    if (manual) {
      manual.addEventListener('click', function () {
        /* 창을 닫고 기존 수동 입력 창을 연다(지시서 1절) */
        closeModal();
        var f = getCountryForm();
        if (f && typeof f.open === 'function') {
          try { f.open(); } catch (e) { /* 무시 */ }
        }
      });
    }
    var saveBtn = byId('ca-save');
    if (saveBtn) { saveBtn.addEventListener('click', save); }
    var confCancel = byId('ca-conf-cancel');
    if (confCancel) { confCancel.addEventListener('click', closeSlotPopup); }
    var confOk = byId('ca-conf-ok');
    if (confOk) { confOk.addEventListener('click', continueSubmit); }
  }

  /* ───────────────────── 공개 API ───────────────────── */

  return {
    validate: validate,
    buildPayload: buildPayload,
    describeResult: describeResult,
    slotConfirmHtml: slotConfirmHtml,
    followLabel: followLabel,
    followChoices: followChoices,
    eligibleFollowPlans: eligibleFollowPlans,
    open: open,
    close: closeModal,
    reset: reset /* Node 테스트용 — 브라우저에서는 쓰지 않는다 */
  };
});
