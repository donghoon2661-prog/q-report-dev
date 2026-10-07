/* ═════════════════════════════════════════════════════════════════
 * country-edit.js — 호주 선적 EDIT 창 (15차, SPEC15.md 2절)
 *
 * - 표 4번째 칸 RETURN 줄의 EDIT 버튼(data-cg-action="edit-au",
 *   data-cg-key="<선적 키>")은 country-groups.js 가 그린다. 표시는 CSS
 *   (html[data-cg-admin="1"] 일 때만 — country-groups.css).
 * - EDIT 버튼 클릭은 캡처 단계(capture) 위임이 받는다: 표 행 클릭(상세 패널)
 *   핸들러가 함께 일어나지 않게 ev.stopPropagation() 을 먼저 호출한다.
 * - 데이터는 CountryUI.getPlans() 의 해당 선적. 저장은 바뀐 필드만
 *   POST /ais-plan { mbl:<키>, … } 로 보낸다(바뀌지 않으면 전송 없음).
 *   - po: 배열, etb: 문자열(비움 = ""), cntrQty: 숫자(비움 = ""),
 *     scheduleFrom: 키 문자열(NONE = ""), traqo: boolean, note: 문자열.
 * - 꺼져 있던 TRAQO TRACKING 을 켜는 경우에만 저장 전에 ADD 와 같은 슬롯 확인
 *   팝업(작성 문구는 SPEC15 2절)을 띄운다. DELETE SHIPMENT 는 같은 팝업 형태의
 *   삭제 확인(Delete this shipment?) 후 { mbl:<키>, delete:true } 로 전송.
 *   브라우저 confirm 은 쓰지 않는다(자체 팝업 요소, id ce-confirm).
 * - 관리자 키 처리·오류 표시는 ADD(country-add.js)와 동일: sessionStorage
 *   ('cfAdminKey', 같은 탭 공유)에만 저장, X-Refresh-Key 헤더로만 전송,
 *   400 은 서버 error 문구를 그대로(followed by: … 포함), 401·네트워크는
 *   지정 문구. 검증 문구는 country-form.js 의 기존 규칙(po 형식, cntrQty 범위)
 *   을 같은 문구로 재사용한다.
 * - 전역 노출: window.CountryEdit (브라우저) / module.exports (Node — require
 *   부작용 없음). 창 오버레이 골격은 country-form.css 의 cf-* 규칙을 재사용하고
 *   이 창만의 조각은 country-edit.css 에 둔다.
 * ═════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.CountryEdit = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ───────────────────── 공통 상수 · 유틸 ───────────────────── */

  /* 문구·규칙 — country-form.js 와 동일(재사용) */
  var RE_PP = /^AU-\d{6,12}$/;
  var MSG_PO = 'PO must look like AU-1924661260.';
  var MSG_CNTR_QTY = 'Container count must be a whole number from 1 to 99.';
  var MSG_NOTE = 'Note must be 120 characters or fewer.';
  var NOTE_MAX = 120;
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

  function getPlansCopy() {
    var cui = getCountryUI();
    if (cui && typeof cui.getPlans === 'function') {
      try { return cui.getPlans() || {}; } catch (e) { return {}; }
    }
    return {};
  }

  /* po 칸들/서버 po 정규화: trim · 대문자화 · 중복 제거(빈 항목 제외) */
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

  function samePo(a, b) {
    if (a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) { if (a[i] !== b[i]) return false; }
    return true;
  }

  /* plan.cntrQty → 1~99 정수면 숫자, 아니면 ''(country-groups.js 의 규칙과 동일) */
  function cqOfPlan(plan) {
    var n = plan ? plan.cntrQty : null;
    if (typeof n === 'number' && isFinite(n) && n % 1 === 0 && n >= 1 && n <= 99) return n;
    if (typeof n === 'string' && /^\d{1,2}$/.test(n.trim())) {
      var p = parseInt(n, 10);
      if (p >= 1 && p <= 99) return p;
    }
    /* 대수가 저장돼 있지 않으면 표(N CNTR)와 같게 컨테이너 번호 개수로 채운다 */
    var list = plan && typeof plan.container === 'string'
      ? plan.container.split(',').map(function (x) { return x.trim(); }).filter(Boolean) : [];
    if (list.length >= 1 && list.length <= 99) return list.length;
    return '';
  }

  /* 입력값 → ''(비움) 또는 1~99 정수 */
  function cqOfInput(v) {
    var s = text(v);
    if (!s || !/^\d{1,2}$/.test(s)) return '';
    var n = parseInt(s, 10);
    return (n >= 1 && n <= 99) ? n : '';
  }

  /* 이 선적의 자기 Traqo 추적이 켜져 있는지(inherited 의 traqo 는 자기 스위치가
     아니다 — 켜져 있지 않은 것으로 본다) */
  function traqoEnabledOf(plan) {
    var t = plan ? plan.traqo : null;
    return !!(!t || t.inherited === true ? false : t.enabled === true);
  }

  /* ───────────────── 순수 함수 (Node 테스트 대상, DOM 접근 없음) ───────────────── */

  /* validate(values) → { errors, count } — country-form.js 의 규칙·문구 재사용.
     po 는 선택(비어 있어도 OK — 비우면 전부 지우는 뜻), 개별 칸만 형식 검사. */
  function validate(values) {
    var v = values || {};
    var errors = {};

    var rawPo = Array.isArray(v.po) ? v.po : [];
    for (var i = 0; i < rawPo.length; i++) {
      var p = text(rawPo[i]);
      if (p && !RE_PP.test(p.toUpperCase())) { errors.po = MSG_PO; break; }
    }

    var cq = text(v.cntrQty);
    if (cq && !/^\d{1,2}$/.test(cq)) errors.cntrQty = MSG_CNTR_QTY;
    else if (cq && !(parseInt(cq, 10) >= 1 && parseInt(cq, 10) <= 99)) errors.cntrQty = MSG_CNTR_QTY;

    if (text(v.note).length > NOTE_MAX) errors.note = MSG_NOTE;

    if (!text(v.adminKey)) errors.adminKey = 'Required.';

    var count = 0;
    for (var k in errors) { if (hasOwn(errors, k)) count++; }
    return { errors: errors, count: count };
  }

  /* diffPayload(plan, values, key) — 바뀐 필드만 담은 { mbl:<키>, … }.
     바뀐 게 없으면 null. plan 은 CountryUI.getPlans() 사본의 값이어도 된다
     (여기서 정규화해 비교한다). 비움 = "" (etb/note/scheduleFrom), cntrQty 는
     숫자 또는 "". po 는 배열(전부 지우면 []). */
  function diffPayload(plan, values, key) {
    var cur = values || {};
    var payload = { mbl: text(plan && plan.mbl) || text(key) };
    var nChanges = 0;

    var origPo = normalizePo(plan && plan.po);
    var curPo = normalizePo(cur.po);
    if (!samePo(origPo, curPo)) {
      payload.po = curPo; nChanges++;
    }

    var origEtb = text(plan && plan.etb);
    var curEtb = text(cur.etb);
    if (origEtb !== curEtb) { payload.etb = curEtb; nChanges++; }

    var origCq = cqOfPlan(plan);
    var curCq = cqOfInput(cur.cntrQty);
    if (origCq !== curCq) { payload.cntrQty = curCq; nChanges++; }

    var origSf = text(plan && plan.scheduleFrom);
    var curSf = text(cur.scheduleFrom != null ? cur.scheduleFrom : cur.followFrom);
    if (origSf !== curSf) { payload.scheduleFrom = curSf; nChanges++; }

    var origTq = traqoEnabledOf(plan);
    var curTq = cur.traqo === true;
    if (origTq !== curTq) { payload.traqo = curTq; nChanges++; }

    var origNote = text(plan && plan.note);
    var curNote = text(cur.note);
    if (origNote !== curNote) { payload.note = curNote; nChanges++; }

    if (nChanges === 0) return null;
    return payload; /* mbl 만 있으면 null 을 돌려준다(위에서 처리) */
  }

  /* 확인 팝업 문장들(순수 함수) — kind 'slot'(TRAQO 켬) | 'delete'.
     label 은 이스케이프해 본문에 들어간다(innerHTML 로 붙인다). */
  function confirmText(kind, label) {
    if (kind === 'delete') {
      return {
        title: 'Delete this shipment?',
        body: 'Delete ' + esc(label) + '? This cannot be undone.',
        cancel: 'CANCEL',
        ok: 'DELETE'
      };
    }
    return {
      title: 'Use 1 Traqo slot?',
      body: 'Turning on Traqo tracking for ' + esc(label) + ' looks it up on Traqo '
        + 'and uses 1 of your 4 free slots this month (unless it was already looked up). Continue?',
      cancel: 'CANCEL',
      ok: 'CONTINUE'
    };
  }

  /* 삭제 확인 문구의 식별자: PO > 부킹 > MBL 순(SPEC15: <PO 또는 부킹>) */
  function deleteLabel(plan) {
    var po = normalizePo(plan && plan.po);
    return text(po[0]) || text(plan && plan.booking) || text(plan && plan.mbl);
  }

  /* EDIT 화면 부제 '<선박명> <항차> · <부킹 또는 MBL>' (textContent 로 붙인다) */
  function planSubtitle(plan) {
    var name = (text(plan && plan.vessel) + ' ' + text(plan && plan.voyage)).trim();
    var b = text(plan && plan.booking) || text(plan && plan.mbl);
    var bits = [];
    if (name) bits.push(name);
    if (b) bits.push(b);
    return bits.join(' \u00B7 ');
  }

  /* FOLLOWS 목록 후보 — 자기 자신·이 선적을 따라오는 선적(=scheduleFrom 이 나),
     이미 다른 선적을 따라가는 선적(scheduleFrom 있음)은 제외.
     따라갈 사람이 없는(plan.scheduleFrom 이 없는) 다른 선적만 후보. */
  function followChoices(plans, editingKey) {
    var out = [];
    var skip = text(editingKey);
    for (var k in plans) {
      if (!hasOwn(plans, k)) continue;
      if (skip && k === skip) continue;
      var p = plans[k];
      if (!p || typeof p !== 'object') continue;
      if (text(p.scheduleFrom)) continue; /* 이미 따라가는 중(나를 따라오는 것 포함) */
      var label = ((text(p.booking) || text(p.mbl)) + ' \u00B7 '
        + (text(p.vessel) + ' ' + text(p.voyage)).trim()).trim();
      if (!label || label === '\u00B7') { continue; }
      out.push({ key: text(p.mbl) || k, label: label });
    }
    return out;
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
    cntrQty: 'ce-cntr-qty', note: 'ce-note', adminKey: 'ce-admin-key'
  };
  var ERR_IDS = {
    po: 'ce-err-po', cntrQty: 'ce-err-cntrQty', note: 'ce-err-note',
    adminKey: 'ce-err-admin-key'
  };

  /* 모달 골격 — 정적 문자열만. 동적 값(선박명·부킹·PO·선적 목록·서버 응답)은
     전부 textContent/value 또는 순수 함수가 esc 를 통과한 문자열로만 넣는다. */
  var MODAL_HTML = [
    '<div class="cf-modal" role="dialog" aria-modal="true" aria-labelledby="ce-title">',
    '<div class="cf-modal-head">',
    '<div>',
    '<h2 class="cf-modal-title" id="ce-title">EDIT SHIPMENT</h2>',
    '<p class="cf-modal-sub" id="ce-sub"></p>',
    '</div>',
    '<button type="button" class="cf-modal-close" id="ce-close" aria-label="Close">\u00D7</button>',
    '</div>',
    '<p class="cf-modal-alert" id="ce-alert" hidden></p>',
    '<div class="cf-modal-body">',
    '<div class="cf-form-grid">',
    '<div class="cf-field cf-span2">',
    '<span class="cf-lbl" id="ce-po-label">PO</span>',
    '<div class="cf-rows" id="ce-po-rows" role="group" aria-labelledby="ce-po-label"></div>',
    '<button type="button" class="cf-btn-addrow" id="ce-add-po">+ PO</button>',
    '<p class="cf-help">Optional. Format: AU- followed by digits.</p>',
    '<p class="cf-err" id="ce-err-po" hidden></p>',
    '</div>',
    '<div class="cf-field cf-span2">',
    '<label class="cf-lbl" for="ce-etb">ETB (SYDNEY)</label>',
    '<input class="cf-inp" type="datetime-local" id="ce-etb" autocomplete="off" spellcheck="false">',
    '<p class="cf-help">Departure berth record at Sydney. Leave empty to clear.</p>',
    '</div>',
    '<div class="cf-field cf-span2">',
    '<label class="cf-lbl" for="ce-cntr-qty">CONTAINERS (COUNT)</label>',
    '<input class="cf-inp" type="number" id="ce-cntr-qty" min="1" max="99" step="1" inputmode="numeric" autocomplete="off" spellcheck="false">',
    '<p class="cf-help">Leave empty to clear.</p>',
    '<p class="cf-err" id="ce-err-cntrQty" hidden></p>',
    '</div>',
    '<div class="cf-field cf-span2">',
    '<label class="cf-lbl" for="ce-follow">FOLLOWS</label>',
    '<select class="cf-inp" id="ce-follow"></select>',
    '<p class="cf-help">Use the schedule of another shipment. Choose NONE to keep own schedule.</p>',
    '<p class="cf-err" id="ce-err-follow" hidden></p>',
    '</div>',
    '<div class="cf-field cf-span2">',
    '<label class="cf-lbl" for="ce-traqo">TRAQO TRACKING</label>',
    '<label class="ce-check"><input type="checkbox" id="ce-traqo"><span>Keep this shipment updated from Traqo</span></label>',
    '<p class="cf-help">When on, the server refreshes the schedule from Traqo. Turning it on uses a Traqo lookup (see the prompt).</p>',
    '</div>',
    '<div class="cf-field cf-span2">',
    '<label class="cf-lbl" for="ce-note">NOTE <span class="cf-counter" id="ce-note-count">0/120</span></label>',
    '<input class="cf-inp" type="text" id="ce-note" maxlength="120" autocomplete="off" spellcheck="false">',
    '<p class="cf-help">Shown under the table (NOTES). Leave empty to clear.</p>',
    '<p class="cf-err" id="ce-err-note" hidden></p>',
    '</div>',
    '</div>',
    '</div>',
    '<div class="cf-modal-foot">',
    '<button type="button" class="ce-danger" id="ce-delete">DELETE SHIPMENT</button>',
    '<div class="cf-adminkey">',
    '<label class="cf-lbl" for="ce-admin-key">Admin key</label>',
    '<input class="cf-inp" type="password" id="ce-admin-key" autocomplete="new-password">',
    '<p class="cf-help">Same key as adding a booking.</p>',
    '<p class="cf-err" id="ce-err-admin-key" hidden></p>',
    '</div>',
    '<div class="cf-foot-actions">',
    '<button type="button" class="cf-btn cf-btn-ghost" id="ce-cancel">CANCEL</button>',
    '<button type="button" class="cf-btn cf-btn-save" id="ce-save">SAVE</button>',
    '</div>',
    '</div>',
    '<div class="ce-confirm" id="ce-confirm" hidden>',
    '<div class="ca-card" role="dialog" aria-modal="true" aria-labelledby="ce-conf-title">',
    '<h3 class="ca-conf-title" id="ce-conf-title"></h3>',
    '<p class="ca-conf-body" id="ce-conf-body"></p>',
    '<div class="ca-actions">',
    '<button type="button" class="cf-btn cf-btn-ghost" id="ce-conf-cancel">CANCEL</button>',
    '<button type="button" class="cf-btn cf-btn-save" id="ce-conf-ok">CONTINUE</button>',
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
    overlay.id = 'ce-overlay';
    setHidden(overlay, true);
    overlay.innerHTML = MODAL_HTML; /* 정적 골격만 — 사용자 값 없음 */
    document.body.appendChild(overlay);
    var toast = el('div', 'cf-toast');
    toast.id = 'ce-toast';
    setHidden(toast, true);
    document.body.appendChild(toast);
  }

  /* Node 테스트용: 가짜 DOM 을 갈아끼울 때 골격 생성·바인딩 플래그를 지운다. */
  function reset() {
    built = false;
    bound = false;
    currentKey = '';
    currentPlan = null;
    pending = null;
    busy = false;
  }

  /* PO 반복 칸 + 읽기 — country-form.js/country-add.js 와 같은 방식 */
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

  /* ───────────────── 관리자 키 보관 (country-form.js 와 같은 저장 키) ───────────────── */

  var KEY_STORE = 'cfAdminKey';
  function storeKey(key) {
    try { sessionStorage.setItem(KEY_STORE, key); } catch (e) { /* 저장 불가 환경 무시 */ }
  }
  function loadKey() {
    try { return sessionStorage.getItem(KEY_STORE) || ''; } catch (e) { return ''; }
  }

  /* ───────────────── 토스트 ───────────────── */

  var toastTimer = null;
  function showToast(msg) {
    var t = byId('ce-toast');
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

  /* ───────────────── 확인 팝업 ─────────────────
     하나의 팝업 요소(ce-confirm)를 슬롯 확인(TRAQO 켬)과 삭제 확인이 나눠 쓴다.
     문장은 항상 sortConfirm(kind, label) 순수 함수가 만든다. */

  var currentKey = '';
  var currentPlan = null;   /* open() 시점의 선적 사본(CountryUI.getPlans 복사본의 개별 항목) */
  var pending = null;       /* 팝업이 띄워진 승인 대기 요청 { kind, plan, bookingLabel, values, payload, okMsg } */
  var busy = false;

  function popupOpen() {
    var p = byId('ce-confirm');
    if (p && typeof p.getAttribute === 'function') { return p.getAttribute('hidden') === null; }
    return false;
  }

  function openPopup(kind, req) {
    pending = { kind: kind, req: req };
    var conf = confirmText(kind, kind === 'delete' ? deleteLabel(req.plan) : text(req.bookingLabel));
    var title = byId('ce-conf-title');
    var body = byId('ce-conf-body');
    if (title) { title.textContent = conf.title; }
    if (!body) { return; }
    body.innerHTML = conf.body; /* 순수 함수가 esc(label) 을 통과시켰다 */
    setHidden(byId('ce-confirm'), false);
    function dis(id) { var b = byId(id); if (b) { b.disabled = true; } }
    dis('ce-save'); dis('ce-delete'); /* 팝업이 열려 있는 동안 중복 클릭 방지 */
    var cancel = byId('ce-conf-cancel'); /* 기본 포커스 = CANCEL */
    if (cancel && typeof cancel.focus === 'function') { cancel.focus(); }
  }

  function closePopup() {
    pending = null;
    setHidden(byId('ce-confirm'), true);
    function dis(id) { var b = byId(id); if (b) { b.disabled = false; } }
    dis('ce-save'); dis('ce-delete');
  }

  /* ───────────────── 오류 표시 (ADD/country-form.js 와 같은 방식) ───────────────── */

  function showAlert(msg) {
    var a = byId('ce-alert');
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
    var box = byId('ce-po-rows');
    if (box && box.querySelectorAll) {
      var inputs = box.querySelectorAll('input');
      for (var i = 0; i < inputs.length; i++) {
        if (inputs[i].classList) { inputs[i].classList.remove('cf-invalid'); }
      }
    }
  }

  function showErrors(res) {
    clearErrors();
    var errors = (res && res.errors) || {};
    for (var k in errors) { if (hasOwn(errors, k)) { setErr(k, errors[k]); } }
    var box = byId('ce-po-rows');
    if (errors.po && box && box.querySelectorAll) {
      var inputs = box.querySelectorAll('input');
      for (var i = 0; i < inputs.length; i++) {
        var v = text(inputs[i].value);
        if (inputs[i].classList) {
          if (v && !RE_PP.test(v.toUpperCase())) { inputs[i].classList.add('cf-invalid'); }
          else { inputs[i].classList.remove('cf-invalid'); }
        }
      }
    }
  }

  /* ───────────────────── 창 열기 ───────────────────── */

  function updateNoteCount() {
    var inp = byId('ce-note');
    var count = byId('ce-note-count');
    if (inp && count) { count.textContent = inp.value.length + '/120'; }
  }

  function fillFollowOptions(plan) {
    var sel = byId('ce-follow');
    if (!sel) { return; }
    while (sel.firstChild) { sel.removeChild(sel.firstChild); }
    var selected = text(plan && plan.scheduleFrom);
    var none = document.createElement('option');
    none.value = '';
    none.textContent = 'NONE';
    sel.appendChild(none);
    var plans = getPlansCopy();
    var choices = followChoices(plans, currentKey);
    for (var i = 0; i < choices.length; i++) {
      var o = document.createElement('option');
      o.value = choices[i].key;
      o.textContent = choices[i].label;
      sel.appendChild(o);
    }
    sel.value = selected; /* 없는 키면 NONE(빈 값)으로 돌아간다 */
  }

  function open(key) {
    if (typeof document === 'undefined') { return; }
    var plans = getPlansCopy();
    var k = text(key);
    var plan = hasOwn(plans, k) ? plans[k] : null;
    if (!plan || typeof plan !== 'object') { return; } /* 목록이 바뀐 뒤 — 조용히 취소 */
    currentKey = text(plan.mbl) || k;
    if (!currentKey) { currentKey = k; }
    currentPlan = plan;
    buildOnce();
    bindOnce();
    var overlay = byId('ce-overlay');
    if (!overlay) { return; }

    var sub = byId('ce-sub');
    if (sub) { sub.textContent = planSubtitle(plan); }
    setRows('ce-po-rows', Array.isArray(plan.po) ? plan.po : (plan.po != null ? [plan.po] : null), 'PO');
    var etb = byId('ce-etb');
    if (etb) { etb.value = text(plan.etb).replace(' ', 'T').slice(0, 16); }
    var cq = byId('ce-cntr-qty');
    if (cq) { var n = cqOfPlan(plan); cq.value = n === '' ? '' : String(n); }
    fillFollowOptions(plan);
    var tq = byId('ce-traqo');
    if (tq) { tq.checked = traqoEnabledOf(plan); }
    var note = byId('ce-note');
    if (note) { note.value = text(plan.note); }
    var keyInp = byId('ce-admin-key');
    if (keyInp) { keyInp.value = loadKey(); }

    clearErrors();
    showAlert('');
    closePopup();
    busy = false;
    updateNoteCount();

    setHidden(overlay, false);
    if (document.body && document.body.classList) { document.body.classList.add('cf-modal-open'); }
    overlay.scrollTop = 0;
    /* 첫 입력칸(PO 첫 칸) 포커스 — 방어 코드(칸이 없으면 스킵) */
    var firstInp = (function () {
      var box = byId('ce-po-rows');
      if (!box || !box.querySelectorAll) { return null; }
      var list = box.querySelectorAll('input');
      return (list && list.length) ? list[0] : null;
    })();
    if (firstInp && typeof firstInp.focus === 'function') { firstInp.focus(); }
  }

  function closeModal() {
    closePopup();
    var overlay = byId('ce-overlay');
    if (overlay) { setHidden(overlay, true); }
    if (typeof document !== 'undefined' && document.body && document.body.classList) {
      document.body.classList.remove('cf-modal-open');
    }
  }

  /* ───────────────── 값 수집 · 전송 ───────────────── */

  function collectValues() {
    function val(id) { var n = byId(id); return n ? n.value : ''; }
    var tq = byId('ce-traqo');
    return {
      po: rowValues('ce-po-rows'),
      etb: val('ce-etb'),
      cntrQty: val('ce-cntr-qty'),
      scheduleFrom: val('ce-follow'),
      traqo: !!(tq && tq.checked),
      note: val('ce-note'),
      adminKey: val('ce-admin-key')
    };
  }

  /* describeResult(status, json, okMsg) — country-form.js 의 describeResult 와
     같은 모양이되, 이 창의 문구: 200 은 okMsg('Saved.'/'Deleted.'),
     400 은 서버 error 문구 그대로(followed by: … 포함), 401/네트워크는 지정 문구. */
  function describeResult(status, json, okMsg) {
    var j = (json && typeof json === 'object') ? json : {};
    if (status === 200) return text(okMsg) || 'Saved.';
    if (status === 400) return j.error != null ? String(j.error) : 'Invalid input.';
    if (status === 401) return MSG_401;
    if (status == null || status === 0) return MSG_NET;
    return 'Server error (' + status + ').';
  }

  function submit(values, payload, okMsg) {
    if (busy) { return; }
    if (typeof fetch !== 'function') { showAlert(MSG_NET); return; }
    busy = true;
    function dis(id) { var b = byId(id); if (b) { b.disabled = true; } }
    dis('ce-save'); dis('ce-delete');
    var key = text(values.adminKey);
    var base = (typeof API_ROOT === 'string') ? API_ROOT : '';
    fetch(base + '/ais-plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Refresh-Key': key },
      body: JSON.stringify(payload) /* 본문에 관리자 키를 넣지 않는다 */
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
      dis('ce-save'); dis('ce-delete');
      if (out.ok && out.status === 200) {
        storeKey(key);
        closeModal();
        showToast(describeResult(200, out.json, okMsg));
        var cui = getCountryUI();
        if (cui && typeof cui.refresh === 'function') {
          try { cui.refresh(); } catch (e) { /* 무시 */ }
        }
      } else {
        /* 실패: 문구만 표시하고 창은 유지(입력값 보존) */
        showAlert(describeResult(out.status, out.json, okMsg));
      }
    }).catch(function () {
      busy = false;
      dis('ce-save'); dis('ce-delete');
      showAlert(MSG_NET);
    });
  }

  function save() {
    if (busy || popupOpen()) { return; } /* 중복 클릭 방지 */
    if (!currentPlan || typeof currentPlan !== 'object') { return; }
    var values = collectValues();
    var res = validate(values);
    showErrors(res);
    var overlay = byId('ce-overlay');
    if (res.count > 0) {
      if (overlay) { overlay.scrollTop = 0; }
      return;
    }
    var payload = diffPayload(currentPlan, values, currentKey);
    if (!payload) {
      showAlert('Nothing changed.');
      return;
    }
    /* 꺼져 있던 TRAQO TRACKING 을 켜는 경우에만 저장 전 슬롯 확인 팝업 */
    if (payload.traqo === true) {
      openPopup('slot', {
        plan: currentPlan,
        bookingLabel: text(currentPlan.booking) || currentKey,
        values: values,
        payload: payload,
        okMsg: 'Saved.'
      });
      return;
    }
    submit(values, payload, 'Saved.');
  }

  function startDelete() {
    if (busy || popupOpen() || !currentPlan) { return; }
    openPopup('delete', {
      plan: currentPlan,
      bookingLabel: text(currentPlan.booking) || currentKey,
      values: collectValues(),
      payload: { mbl: currentKey, delete: true },
      okMsg: 'Deleted.'
    });
  }

  function continuePopup() {
    if (!popupOpen() || !pending) { return; }
    var req = pending.req;
    setHidden(byId('ce-confirm'), true); /* 팝업만 닫고 전송(입력값 보존) */
    pending = null;
    submit(req.values, req.payload, req.okMsg);
  }

  /* ───────────────── EDIT 버튼 위임 (캡처 단계 — 행 클릭보다 먼저) ───────────────── */

  function handleClick(ev) {
    var t = ev && ev.target;
    if (!t || typeof t.closest !== 'function') { return false; }
    var btn = t.closest('[data-cg-action="edit-au"]');
    if (!btn) { return false; }
    /* 행 클릭(상세 패널)이 같이 일어나지 않게 전파를 막는다 */
    if (ev && typeof ev.stopPropagation === 'function') { ev.stopPropagation(); }
    var de = (typeof document !== 'undefined') ? document.documentElement : null;
    if (de && typeof de.getAttribute === 'function' && de.getAttribute('data-cg-admin') !== '1') {
      return true; /* 관리자가 아니면 열지 않는다(버튼은 CSS 로 숨겨져 있다) */
    }
    var key = (typeof btn.getAttribute === 'function') ? btn.getAttribute('data-cg-key') : '';
    if (typeof document !== 'undefined') { open(key); }
    return true;
  }

  function initDelegation() {
    if (typeof document === 'undefined' || !document.addEventListener) { return; }
    document.addEventListener('click', handleClick, true); /* 캡처 — 행 클릭보다 먼저 */
  }

  /* ───────────────────── 이벤트 ───────────────────── */

  var bound = false;
  function bindOnce() {
    if (bound || typeof document === 'undefined') { return; }
    bound = true;
    var overlay = byId('ce-overlay');
    var bClose = byId('ce-close');
    var bCancel = byId('ce-cancel');
    if (bClose) { bClose.addEventListener('click', closeModal); }
    if (bCancel) { bCancel.addEventListener('click', closeModal); }
    if (overlay) {
      overlay.addEventListener('click', function (e) {
        if (!e || e.target !== overlay) { return; }
        if (popupOpen()) { closePopup(); return; } /* 바깥 클릭 = 확인 팝업 CANCEL */
        closeModal();
      });
    }
    var popup = byId('ce-confirm');
    if (popup) {
      popup.addEventListener('click', function (e) {
        if (e && e.target === popup) { closePopup(); } /* 팝업 카드 바깥 클릭 */
      });
    }
    document.addEventListener('keydown', function (e) {
      if (e && (e.key === 'Escape' || e.key === 'Esc')) {
        if (popupOpen()) { closePopup(); return; }
        var ov = byId('ce-overlay');
        if (ov && ov.getAttribute('hidden') === null) { closeModal(); }
      }
    });
    var addPo = byId('ce-add-po');
    if (addPo) { addPo.addEventListener('click', function () { addInputRow('ce-po-rows', '', 'PO'); }); }
    var noteIn = byId('ce-note');
    if (noteIn) { noteIn.addEventListener('input', updateNoteCount); }
    var btnSave = byId('ce-save');
    if (btnSave) { btnSave.addEventListener('click', save); }
    var btnDelete = byId('ce-delete');
    if (btnDelete) { btnDelete.addEventListener('click', startDelete); }
    var confCancel = byId('ce-conf-cancel');
    if (confCancel) { confCancel.addEventListener('click', closePopup); }
    var confOk = byId('ce-conf-ok');
    if (confOk) { confOk.addEventListener('click', continuePopup); }
  }

  /* 모듈 초기화 — 브라우저에서만 (Node require 부작용 없음) */
  if (typeof document !== 'undefined') {
    initDelegation();
  }

  /* ───────────────────── 공개 API ───────────────────── */

  return {
    validate: validate,
    diffPayload: diffPayload,
    confirmText: confirmText,
    deleteLabel: deleteLabel,
    planSubtitle: planSubtitle,
    followChoices: followChoices,
    traqoEnabledOf: traqoEnabledOf,
    handleClick: handleClick,
    initDelegation: initDelegation,
    open: open,
    close: closeModal,
    reset: reset /* Node 테스트용 — 브라우저에서는 쓰지 않는다 */
  };
});
