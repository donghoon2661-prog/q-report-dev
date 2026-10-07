/* ═════════════════════════════════════════════════════════════════
 * country-form.js — 호주 선적 등록 창 (11A)
 *
 * - SPEC11A.md 1절. 승인된 목업(ref/form-mockup.html)의 항목·문구·
 *   검증 규칙·모양을 그대로 따른다.
 * - 서버 규칙은 ref/worker-ais-block.reference.js 의 saveAisPlan 을 따른다.
 * - 13차: SHIPMENT 구역의 번호 목록 위에 CONTAINERS (COUNT) 숫자 입력칸
 *   (id cf-cntr-qty, 선택, 1~99 정수) 추가, 번호 목록 라벨은 CONTAINER NUMBERS.
 *   validate 은 1~99 정수 검사, buildPayload 은 값이 있을 때 cntrQty(숫자) 전송,
 *   prefill 은 cntrQty 도 채운다.
 * - 전역 노출: window.CountryForm (브라우저) / module.exports (Node,
 *   require 부작용 없음 — DOM 은 브라우저에서만 만든다)
 * - 런타임 전역(API_ROOT, ACCESS_ROLE, CountryUI)은 이 파일이 정의하지
 *   않고 typeof 로 방어해서 읽기만 한다.
 * - 관리자 키는 sessionStorage(같은 탭)에만 보관한다. localStorage 는
 *   쓰지 않고, 키를 화면·오류 메시지에 노출하지 않는다.
 * - 15차: data-cg-action="add-au" 클릭 시 CountryAdd.open()(새 ADD 창)을 먼저
 *   시도하고, 없거나 실패하면 기존 수동 입력 창(open)으로 폴백한다.
 *   수동 입력 창 자체는 그대로 유지된다.
 * ═════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.CountryForm = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ───────────────────── 공통 상수 · 유틸 ───────────────────── */

  /* 검증 규칙 — 목업과 동일 */
  var RE_BOOKING = /^[A-Z]{3}\d{7}$/;
  var RE_PO = /^AU-\d{6,12}$/;
  var RE_MMSI = /^\d{9}$/;
  var RE_IMO = /^\d{7}$/;
  var RE_DT = /^\d{4}-\d{2}-\d{2}( \d{2}:\d{2})?$/;
  var MSG_DATE = 'Use YYYY-MM-DD HH:MM (e.g. 2026-10-12 13:00).';
  var MSG_CNTR_QTY = 'Container count must be a whole number from 1 to 99.';
  var NOTE_MAX = 120;
  var CONTAINER_MAX = 120;

  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
             'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function text(v) { return (v == null ? '' : String(v)).trim(); }

  function hasOwn(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }

  /* CountryUI 전역 (브라우저) — Node 에서는 null */
  function getCountryUI() {
    if (typeof self !== 'undefined' && self && self.CountryUI) return self.CountryUI;
    if (typeof global !== 'undefined' && global && global.CountryUI) return global.CountryUI;
    return null;
  }

  /* [15차] CountryAdd 전역(브라우저) — ADD 버튼이 새 ADD 창을 열 때 쓴다.
     있을 때만 쓰고, 아니면 기존 open()(수동 입력 창)으로 폴백한다. */
  function getCountryAdd() {
    if (typeof self !== 'undefined' && self && self.CountryAdd) return self.CountryAdd;
    if (typeof global !== 'undefined' && global && global.CountryAdd) return global.CountryAdd;
    return null;
  }

  /* 저장된 선적 목록 (CountryUI.getPlans 복사본). 없으면 빈 객체 */
  function getPlans() {
    var cui = getCountryUI();
    if (cui && typeof cui.getPlans === 'function') {
      try { return cui.getPlans() || {}; } catch (e) { return {}; }
    }
    return {};
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

  /* ANL 이면 키(mbl)가 ANNU+부킹, 아니면 부킹이 곧 키 */
  function mblOf(booking, carrier) {
    var b = text(booking).toUpperCase();
    if (!b) return '';
    return text(carrier).toUpperCase() === 'ANL' ? 'ANNU' + b : b;
  }

  /* ───────────────── 순수 함수 (Node 테스트 대상, DOM 접근 없음) ───────────────── */

  /* validate(values) → { errors: {필드: 문구}, count }
     문구는 승인 목업과 동일. 필수가 비어 있으면 Required. */
  function validate(values) {
    var v = values || {};
    var errors = {};

    /* BOOKING: 소문자는 대문자로 바꿔 검사 */
    var booking = text(v.booking).toUpperCase();
    if (!booking) errors.booking = 'Required.';
    else if (!RE_BOOKING.test(booking)) {
      errors.booking = 'Booking must be 3 letters + 7 digits (e.g. CDB0585621).';
    }

    /* PO: 최소 1개, 비어 있는 칸은 무시, 형식은 칸마다 검사 */
    var po = normalizePo(v.po);
    var rawPo = Array.isArray(v.po) ? v.po : [];
    var poBad = false;
    for (var i = 0; i < rawPo.length; i++) {
      var p = text(rawPo[i]);
      if (p && !RE_PO.test(p.toUpperCase())) poBad = true;
    }
    if (po.length === 0) errors.po = 'Required.';
    else if (poBad) errors.po = 'PO must look like AU-1924661260.';

    if (!text(v.vessel)) errors.vessel = 'Required.';
    if (!text(v.voyage)) errors.voyage = 'Required.';

    var mmsi = text(v.mmsi);
    if (!mmsi) errors.mmsi = 'Required.';
    else if (!RE_MMSI.test(mmsi)) errors.mmsi = 'MMSI must be exactly 9 digits.';

    var imo = text(v.imo);
    if (imo && !RE_IMO.test(imo)) errors.imo = 'IMO must be exactly 7 digits.';

    /* 컨테이너 대수(13차): 선택. 비어 있지 않으면 1~99 정수(^\d{1,2}$) */
    var cq = text(v.cntrQty);
    if (cq && !/^\d{1,2}$/.test(cq)) {
      errors.cntrQty = MSG_CNTR_QTY;
    } else if (cq && !(parseInt(cq, 10) >= 1 && parseInt(cq, 10) <= 99)) {
      errors.cntrQty = MSG_CNTR_QTY;
    }

    /* 일정 모드: manual 은 ETD·ETA 필수·ETB 선택, follow 는 scheduleFrom 필수 */
    if (v.mode === 'follow') {
      if (!text(v.scheduleFrom)) errors.scheduleFrom = 'Required.';
    } else {
      var etd = text(v.etd);
      if (!etd) errors.etd = 'Required.';
      else if (!RE_DT.test(etd)) errors.etd = MSG_DATE;

      var etb = text(v.etb);
      if (etb && !RE_DT.test(etb)) errors.etb = MSG_DATE;

      var eta = text(v.eta);
      if (!eta) errors.eta = 'Required.';
      else if (!RE_DT.test(eta)) errors.eta = MSG_DATE;
    }

    if (text(v.note).length > NOTE_MAX) errors.note = 'Note must be 120 characters or fewer.';

    /* 관리자 키 필수 */
    if (!text(v.adminKey)) errors.adminKey = 'Required.';

    var count = 0;
    for (var k in errors) { if (hasOwn(errors, k)) count++; }
    return { errors: errors, count: count };
  }

  /* buildPayload(values) → 서버 POST 본문. 관리자 키는 본문에 넣지 않는다. */
  function buildPayload(values) {
    var v = values || {};
    var booking = text(v.booking).toUpperCase();
    var payload = {};

    /* 키(mbl): ANL 이면 ANNU+부킹, 아니면 부킹 */
    payload.mbl = mblOf(booking, v.carrier) || booking;
    payload.booking = booking;
    payload.pol = 'PORT KLANG';
    payload.pod = 'SYDNEY';

    var po = normalizePo(v.po);
    if (po.length) payload.po = po;

    /* container: 빈 칸이 아닌 값만 ', ' 로 이어 붙이고 최대 120자 */
    var conts = [];
    var rawCont = Array.isArray(v.containers) ? v.containers : [];
    for (var i = 0; i < rawCont.length; i++) {
      var c = text(rawCont[i]);
      if (c) conts.push(c);
    }
    if (conts.length) payload.container = conts.join(', ').slice(0, CONTAINER_MAX);

    /* cntrQty(13차): 값이 있으면 숫자로 보낸다(1~99 정수만). 없으면 보내지 않는다. */
    var cqText = text(v.cntrQty);
    if (cqText && /^\d{1,2}$/.test(cqText)) {
      var cntrN = parseInt(cqText, 10);
      if (cntrN >= 1 && cntrN <= 99) payload.cntrQty = cntrN;
    }

    /* 나머지는 값이 있을 때만 보낸다 */
    var carrier = text(v.carrier);
    if (carrier) payload.carrier = carrier;
    var vessel = text(v.vessel);
    if (vessel) payload.vessel = vessel;
    var voyage = text(v.voyage);
    if (voyage) payload.voyage = voyage;
    var imo = text(v.imo);
    if (imo) payload.imo = imo;
    var mmsi = text(v.mmsi);
    if (mmsi) payload.mmsi = mmsi;
    var source = text(v.source);
    if (source) payload.source = source;
    var note = text(v.note);
    if (note) payload.note = note;

    /* 일정: manual 은 T 결합 형식으로 변환, follow 는 scheduleFrom 만.
       follow 때는 etd/etb/eta/podTerminal 을 보내지 않는다. */
    if (v.mode === 'follow') {
      payload.scheduleFrom = text(v.scheduleFrom).toUpperCase();
    } else {
      var dts = ['etd', 'etb', 'eta'];
      for (var d = 0; d < dts.length; d++) {
        var s = text(v[dts[d]]);
        if (!s) continue;
        payload[dts[d]] = s.replace(' ', 'T'); /* YYYY-MM-DD HH:MM → T 결합, 시각 없으면 날짜만 */
      }
      var term = text(v.podTerminal);
      if (term) payload.podTerminal = term;
    }

    return payload; /* adminKey 는 절대 본문에 넣지 않는다(헤더로만) */
  }

  /* describeResult(status, json) → 모달 상단 영문 문구 */
  function describeResult(status, json) {
    var j = (json && typeof json === 'object') ? json : {};
    if (status === 200) {
      var plan = (j.plan && typeof j.plan === 'object') ? j.plan : {};
      var b = plan.booking || j.booking || plan.mbl || j.mbl || '';
      return b ? 'Shipment ' + b + ' saved.' : 'Shipment saved.';
    }
    if (status === 400) return j.error != null ? String(j.error) : 'Invalid input.';
    if (status === 401) return 'Admin key rejected.';
    if (status == null || status === 0) return 'Network error. Nothing was saved.';
    return 'Server error (' + status + ').';
  }

  /* ───────────────────── 관리자 버튼 동기화 ─────────────────────
     관리자(ACCESS_ROLE === 'admin')일 때만 <html data-cg-admin="1">.
     버튼 자체는 11B 가 data-cg-action="add-au" 로 만든다. */
  function syncAdmin() {
    if (typeof document === 'undefined') return;
    var de = document.documentElement;
    if (!de || typeof de.setAttribute !== 'function') return;
    var admin = (typeof ACCESS_ROLE !== 'undefined' && ACCESS_ROLE === 'admin');
    if (admin) de.setAttribute('data-cg-admin', '1');
    else if (typeof de.removeAttribute === 'function') de.removeAttribute('data-cg-admin');
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

  /* 필드 → 입력칸 / 오류 문구 칸 id 대응 */
  var INPUT_IDS = {
    booking: 'cf-booking', vessel: 'cf-vessel', voyage: 'cf-voyage',
    mmsi: 'cf-mmsi', imo: 'cf-imo', etd: 'cf-etd', etb: 'cf-etb',
    eta: 'cf-eta', note: 'cf-note', adminKey: 'cf-admin-key',
    scheduleFrom: 'cf-follow', cntrQty: 'cf-cntr-qty'
  };
  var ERR_IDS = {
    booking: 'cf-err-booking', po: 'cf-err-po', vessel: 'cf-err-vessel',
    voyage: 'cf-err-voyage', mmsi: 'cf-err-mmsi', imo: 'cf-err-imo',
    etd: 'cf-err-etd', etb: 'cf-err-etb', eta: 'cf-err-eta',
    note: 'cf-err-note', adminKey: 'cf-err-admin-key',
    scheduleFrom: 'cf-err-follow', cntrQty: 'cf-err-cntrQty'
  };

  /* 모달 골격 — 정적 문자열만. 동적 값(사용자 입력·선적 목록·서버 응답)은
     전부 textContent/value 로만 넣는다. */
  var MODAL_HTML = [
    '<div class="cf-modal" role="dialog" aria-modal="true" aria-labelledby="cf-title">',
    '<div class="cf-modal-head">',
    '<div>',
    '<h2 class="cf-modal-title" id="cf-title">ADD AUSTRALIA SHIPMENT</h2>',
    '<p class="cf-modal-sub">Port Klang \u2192 Sydney</p>',
    '</div>',
    '<button type="button" class="cf-modal-close" id="cf-close" aria-label="Close">\u00D7</button>',
    '</div>',
    '<p class="cf-modal-alert" id="cf-alert" hidden></p>',
    '<div class="cf-modal-body">',
    '<section class="cf-sect">',
    '<h3 class="cf-sect-title">Shipment <span class="cf-chip cf-chip-req">Required</span></h3>',
    '<div class="cf-form-grid">',
    '<div class="cf-field cf-span2">',
    '<label class="cf-lbl" for="cf-booking">Booking / MBL <span class="cf-req">*</span></label>',
    '<input class="cf-inp" type="text" id="cf-booking" placeholder="CDB0585621" autocomplete="off" spellcheck="false">',
    '<p class="cf-help">Carrier booking number (3 letters + 7 digits). The carrier site uses the same number as the MBL.</p>',
    '<p class="cf-err" id="cf-err-booking" hidden></p>',
    '</div>',
    '<p class="cf-notice-warn cf-span2" id="cf-dup-booking" hidden></p>',
    '<div class="cf-field cf-span2">',
    '<span class="cf-lbl" id="cf-po-label">PO <span class="cf-req">*</span></span>',
    '<div class="cf-rows" id="cf-po-rows" role="group" aria-labelledby="cf-po-label"></div>',
    '<button type="button" class="cf-btn-addrow" id="cf-add-po">+ ADD PO</button>',
    '<p class="cf-help">Format: AU- followed by digits.</p>',
    '<p class="cf-err" id="cf-err-po" hidden></p>',
    '</div>',
    '<div class="cf-field cf-span2">',
    '<label class="cf-lbl" for="cf-cntr-qty">CONTAINERS (COUNT)</label>',
    '<input class="cf-inp" type="number" id="cf-cntr-qty" min="1" max="99" step="1" inputmode="numeric" autocomplete="off" spellcheck="false">',
    '<p class="cf-help">Number of containers for this booking. If empty, the number of container numbers below is used.</p>',
    '<p class="cf-err" id="cf-err-cntrQty" hidden></p>',
    '</div>',
    '<div class="cf-field cf-span2">',
    '<span class="cf-lbl" id="cf-cont-label">CONTAINER NUMBERS</span>',
    '<div class="cf-rows" id="cf-cont-rows" role="group" aria-labelledby="cf-cont-label"></div>',
    '<button type="button" class="cf-btn-addrow" id="cf-add-cont">+ ADD CONTAINER</button>',
    '<p class="cf-help">Optional. Add each container number if known.</p>',
    '</div>',
    '<div class="cf-field">',
    '<label class="cf-lbl" for="cf-carrier">Carrier</label>',
    '<select class="cf-inp" id="cf-carrier">',
    '<option selected>ANL</option>',
    '<option>MAERSK</option>',
    '<option>CMA CGM</option>',
    '<option>MSC</option>',
    '<option>ONE</option>',
    '</select>',
    '</div>',
    '</div>',
    '</section>',
    '<section class="cf-sect">',
    '<h3 class="cf-sect-title">Vessel <span class="cf-chip cf-chip-req">Required</span></h3>',
    '<div class="cf-form-grid">',
    '<div class="cf-field">',
    '<label class="cf-lbl" for="cf-vessel">Vessel name <span class="cf-req">*</span></label>',
    '<input class="cf-inp" type="text" id="cf-vessel" placeholder="CONTI CRYSTAL" autocomplete="off" spellcheck="false">',
    '<p class="cf-err" id="cf-err-vessel" hidden></p>',
    '</div>',
    '<div class="cf-field">',
    '<label class="cf-lbl" for="cf-voyage">Voyage <span class="cf-req">*</span></label>',
    '<input class="cf-inp" type="text" id="cf-voyage" placeholder="V.641S" autocomplete="off" spellcheck="false">',
    '<p class="cf-err" id="cf-err-voyage" hidden></p>',
    '</div>',
    '<div class="cf-field">',
    '<label class="cf-lbl" for="cf-mmsi">MMSI <span class="cf-req">*</span></label>',
    '<input class="cf-inp" type="text" id="cf-mmsi" placeholder="636093094" inputmode="numeric" autocomplete="off" spellcheck="false">',
    '<p class="cf-help">Needed for AIS tracking. Ask Claude to look it up by vessel name.</p>',
    '<p class="cf-err" id="cf-err-mmsi" hidden></p>',
    '</div>',
    '<div class="cf-field">',
    '<label class="cf-lbl" for="cf-imo">IMO</label>',
    '<input class="cf-inp" type="text" id="cf-imo" placeholder="9293820" inputmode="numeric" autocomplete="off" spellcheck="false">',
    '<p class="cf-err" id="cf-err-imo" hidden></p>',
    '</div>',
    '<p class="cf-notice-warn cf-span2" id="cf-dup-vessel" hidden></p>',
    '</div>',
    '</section>',
    '<section class="cf-sect">',
    '<h3 class="cf-sect-title">Schedule</h3>',
    '<div class="cf-seg" role="radiogroup" aria-label="Schedule mode">',
    '<label class="cf-seg-opt"><input type="radio" name="cf-sched-mode" id="cf-mode-manual" value="manual" checked><span>Enter schedule manually</span></label>',
    '<label class="cf-seg-opt"><input type="radio" name="cf-sched-mode" id="cf-mode-follow" value="follow"><span>Follow another shipment&#39;s schedule</span></label>',
    '</div>',
    '<div id="cf-sched-manual">',
    '<div class="cf-form-grid">',
    '<div class="cf-field">',
    '<label class="cf-lbl" for="cf-etd">ETD \u00B7 Port Klang <span class="cf-req">*</span></label>',
    '<input class="cf-inp" type="text" id="cf-etd" placeholder="2026-10-12 13:00" autocomplete="off" spellcheck="false">',
    '<p class="cf-err" id="cf-err-etd" hidden></p>',
    '</div>',
    '<div class="cf-field">',
    '<label class="cf-lbl" for="cf-etb">ETB \u00B7 Sydney</label>',
    '<input class="cf-inp" type="text" id="cf-etb" placeholder="2026-11-02 08:00" autocomplete="off" spellcheck="false">',
    '<p class="cf-err" id="cf-err-etb" hidden></p>',
    '</div>',
    '<div class="cf-field">',
    '<label class="cf-lbl" for="cf-eta">ETA \u00B7 Sydney <span class="cf-req">*</span></label>',
    '<input class="cf-inp" type="text" id="cf-eta" placeholder="2026-11-01 22:00" autocomplete="off" spellcheck="false">',
    '<p class="cf-err" id="cf-err-eta" hidden></p>',
    '</div>',
    '<div class="cf-field">',
    '<label class="cf-lbl" for="cf-terminal">POD terminal</label>',
    '<input class="cf-inp" type="text" id="cf-terminal" placeholder="PATRICK PORT BOTANY" autocomplete="off" spellcheck="false">',
    '</div>',
    '<div class="cf-field cf-span2">',
    '<label class="cf-lbl" for="cf-source">Source</label>',
    '<input class="cf-inp" type="text" id="cf-source" placeholder="ANL website" autocomplete="off" spellcheck="false">',
    '</div>',
    '</div>',
    '</div>',
    '<div id="cf-sched-follow" hidden>',
    '<div class="cf-follow-box">',
    '<label class="cf-lbl" for="cf-follow">Follow schedule of</label>',
    '<select class="cf-inp" id="cf-follow"></select>',
    '<p class="cf-sched-preview" id="cf-follow-preview"></p>',
    '<p class="cf-help">If the other shipment&#39;s schedule changes, this one changes too.</p>',
    '<p class="cf-err" id="cf-err-follow" hidden></p>',
    '</div>',
    '</div>',
    '</section>',
    '<section class="cf-sect">',
    '<h3 class="cf-sect-title">Notes <span class="cf-chip cf-chip-opt">Optional</span></h3>',
    '<div class="cf-form-grid">',
    '<div class="cf-field cf-span2">',
    '<label class="cf-lbl" for="cf-note">Note <span class="cf-counter" id="cf-note-count">0/120</span></label>',
    '<input class="cf-inp" type="text" id="cf-note" maxlength="120" autocomplete="off" spellcheck="false">',
    '<p class="cf-help">Shown under the table (NOTES). Use it when sources disagree.</p>',
    '<p class="cf-err" id="cf-err-note" hidden></p>',
    '</div>',
    '</div>',
    '</section>',
    '</div>',
    '<div class="cf-modal-foot">',
    '<div class="cf-adminkey">',
    '<label class="cf-lbl" for="cf-admin-key">Admin key</label>',
    '<input class="cf-inp" type="password" id="cf-admin-key" autocomplete="new-password">',
    '<p class="cf-help">Same key as adding a booking.</p>',
    '<p class="cf-err" id="cf-err-admin-key" hidden></p>',
    '</div>',
    '<div class="cf-foot-actions">',
    '<button type="button" class="cf-btn cf-btn-ghost" id="cf-cancel">CANCEL</button>',
    '<button type="button" class="cf-btn cf-btn-save" id="cf-save">SAVE SHIPMENT</button>',
    '</div>',
    '</div>',
    '</div>'
  ].join('');

  var built = false;
  function buildOnce() {
    if (built || typeof document === 'undefined' || !document.body) { return; }
    built = true;
    var overlay = el('div', 'cf-overlay');
    overlay.id = 'cf-overlay';
    setHidden(overlay, true);
    overlay.innerHTML = MODAL_HTML; /* 정적 골격만 — 사용자 값 없음 */
    document.body.appendChild(overlay);
    var toast = el('div', 'cf-toast');
    toast.id = 'cf-toast';
    setHidden(toast, true);
    document.body.appendChild(toast);
  }

  /* PO / 컨테이너 반복 칸 */
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
      else { inp.value = ''; } /* 마지막 칸은 지우지 않고 비운다 */
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

  /* 따라가기 드롭다운 — 현재 저장된 선적 목록에서 만든다.
     이미 다른 선적을 따라가는 중인 선적은 제외(한 단계만 허용). */
  function eligibleFollowPlans() {
    var plans = getPlans();
    var out = [];
    for (var k in plans) {
      if (!hasOwn(plans, k)) { continue; }
      var p = plans[k];
      if (!p || typeof p !== 'object' || p.scheduleFrom) { continue; }
      out.push(p);
    }
    return out;
  }

  /* 2026-10-12T13:00 / 2026-10-12 → Oct/12 13:00 / Oct/12 */
  function fmtFollowDt(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(text(s));
    if (!m) { return null; }
    var mo = +m[2];
    if (mo < 1 || mo > 12) { return null; }
    var out = MON[mo - 1] + '/' + m[3];
    if (m[4] != null) { out += ' ' + m[4] + ':' + m[5]; }
    return out;
  }

  /* 옵션 표시: 키 · 선박 항차 */
  function fillFollowOptions(selected) {
    var sel = byId('cf-follow');
    if (!sel) { return; }
    while (sel.firstChild) { sel.removeChild(sel.firstChild); }
    var plans = eligibleFollowPlans();
    if (!plans.length) {
      var empty = el('option', null, 'No saved shipment to follow');
      empty.value = '';
      sel.appendChild(empty);
      return;
    }
    for (var i = 0; i < plans.length; i++) {
      var p = plans[i];
      var o = document.createElement('option');
      o.value = text(p.mbl);
      o.textContent = text(p.mbl) + ' \u00B7 ' + (text(p.vessel) + ' ' + text(p.voyage)).trim();
      if (selected && o.value === String(selected)) { o.selected = true; }
      sel.appendChild(o);
    }
  }

  /* 따라올 값 읽기 전용 표시: ETD Oct/12 13:00 · ETA Nov/01 22:00 */
  function updateFollowPreview() {
    var sel = byId('cf-follow');
    var prev = byId('cf-follow-preview');
    if (!sel || !prev) { return; }
    var p = getPlans()[sel.value] || null;
    var etd = (p && fmtFollowDt(p.etd)) || '\u2014';
    var eta = (p && fmtFollowDt(p.eta)) || '\u2014';
    prev.textContent = 'ETD ' + etd + ' \u00B7 ETA ' + eta;
  }

  /* 이미 추적 중인 배 안내 (선박명 또는 MMSI 가 저장된 선적과 같을 때) */
  function updateDupVessel() {
    var box = byId('cf-dup-vessel');
    if (!box) { return; }
    var vName = text(byId('cf-vessel') ? byId('cf-vessel').value : '').toUpperCase();
    var vMmsi = text(byId('cf-mmsi') ? byId('cf-mmsi').value : '');
    var hit = null;
    if (vName || vMmsi) {
      var plans = getPlans();
      for (var k in plans) {
        if (!hasOwn(plans, k)) { continue; }
        var p = plans[k];
        if (!p || typeof p !== 'object') { continue; }
        if (vMmsi && text(p.mmsi) === vMmsi) { hit = p; break; }
        if (vName && text(p.vessel).toUpperCase() === vName) { hit = p; break; }
      }
    }
    if (hit) {
      box.textContent = 'This vessel is already tracked (' + (text(hit.vessel) || '\u2014')
        + ' \u00B7 ' + (text(hit.mmsi) || '\u2014') + '). Position is shared.';
      setHidden(box, false);
    } else {
      setHidden(box, true);
    }
  }

  /* 이미 있는 부킹 안내 (저장은 허용) */
  function updateDupBooking() {
    var box = byId('cf-dup-booking');
    if (!box) { return; }
    var mbl = mblOf(byId('cf-booking') ? byId('cf-booking').value : '',
                    byId('cf-carrier') ? byId('cf-carrier').value : '');
    var exists = !!(mbl && getPlans()[mbl]);
    if (exists) {
      box.textContent = 'This booking already exists. Saving will update it.';
      setHidden(box, false);
    } else {
      setHidden(box, true);
    }
  }

  function updateNoteCount() {
    var inp = byId('cf-note');
    var count = byId('cf-note-count');
    if (inp && count) { count.textContent = inp.value.length + '/' + NOTE_MAX; }
  }

  function setMode(mode) {
    var m = byId('cf-mode-manual');
    var f = byId('cf-mode-follow');
    if (m) { m.checked = (mode !== 'follow'); }
    if (f) { f.checked = (mode === 'follow'); }
    setHidden(byId('cf-sched-manual'), mode === 'follow');
    setHidden(byId('cf-sched-follow'), mode !== 'follow');
    if (mode === 'follow') {
      fillFollowOptions();
      updateFollowPreview();
    }
  }

  /* ───────────────── 오류 표시 · 안내 문구 ───────────────── */

  function fixMsg(n) { return 'Fix ' + n + ' field' + (n === 1 ? '' : 's') + ' to continue.'; }

  function showAlert(msg) {
    var a = byId('cf-alert');
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

  /* 칸 아래 빨간 문구 + 대상 칸에 cf-invalid */
  function showErrors(res) {
    clearErrors();
    var errors = (res && res.errors) || {};
    for (var k in errors) { if (hasOwn(errors, k)) { setErr(k, errors[k]); } }
    var box = byId('cf-po-rows');
    if (box && box.querySelectorAll) {
      var inputs = box.querySelectorAll('input');
      var filled = 0;
      var i, v;
      for (i = 0; i < inputs.length; i++) { if (text(inputs[i].value)) { filled++; } }
      for (i = 0; i < inputs.length; i++) {
        v = text(inputs[i].value);
        var bad = v ? !RE_PO.test(v.toUpperCase()) : false;
        var mark = bad || (errors.po && !filled && i === 0);
        if (inputs[i].classList) {
          if (mark) { inputs[i].classList.add('cf-invalid'); }
          else { inputs[i].classList.remove('cf-invalid'); }
        }
      }
    }
    showAlert(res && res.count ? fixMsg(res.count) : '');
  }

  /* ───────────────── 관리자 키 보관 (같은 탭에서만) ───────────────── */

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
    var t = byId('cf-toast');
    if (!t) { return; }
    t.textContent = msg;
    setHidden(t, false);
    if (t.classList) {
      t.classList.remove('cf-show');
      void t.offsetWidth; /* 애니메이션 재시작용 리플로우 */
      t.classList.add('cf-show');
    }
    if (toastTimer) { clearTimeout(toastTimer); }
    toastTimer = setTimeout(function () {
      setHidden(t, true);
      if (t.classList) { t.classList.remove('cf-show'); }
    }, 3000); /* 지시서: 3초 */
  }

  /* ───────────────── 값 수집 · 폼 초기화 · 프리필 ───────────────── */

  function collectValues() {
    function val(id) { var n = byId(id); return n ? n.value : ''; }
    var manual = byId('cf-mode-manual');
    var follow = !(manual && manual.checked);
    var v = {
      booking: val('cf-booking'),
      po: rowValues('cf-po-rows'),
      cntrQty: val('cf-cntr-qty'),
      containers: rowValues('cf-cont-rows'),
      carrier: val('cf-carrier'),
      vessel: val('cf-vessel'),
      voyage: val('cf-voyage'),
      mmsi: val('cf-mmsi'),
      imo: val('cf-imo'),
      note: val('cf-note'),
      adminKey: val('cf-admin-key'),
      mode: follow ? 'follow' : 'manual'
    };
    if (follow) {
      v.scheduleFrom = val('cf-follow');
    } else {
      v.etd = val('cf-etd');
      v.etb = val('cf-etb');
      v.eta = val('cf-eta');
      v.podTerminal = val('cf-terminal');
      v.source = val('cf-source');
    }
    return v;
  }

  function resetForm() {
    var b = byId('cf-booking');
    if (b) { b.value = ''; }
    setRows('cf-po-rows', null, 'PO');
    setRows('cf-cont-rows', null, 'Container');
    var c = byId('cf-carrier');
    if (c) { c.value = 'ANL'; }
    ['cf-vessel', 'cf-voyage', 'cf-mmsi', 'cf-imo', 'cf-etd', 'cf-etb', 'cf-eta',
     'cf-terminal', 'cf-source', 'cf-note', 'cf-cntr-qty'].forEach(function (id) {
      var n = byId(id);
      if (n) { n.value = ''; }
    });
    var key = byId('cf-admin-key');
    if (key) { key.value = loadKey(); } /* 같은 탭에서 저장 성공했던 키 자동 채움 */
    setMode('manual');
    updateNoteCount();
    clearErrors();
    showAlert('');
    updateDupVessel();
    updateDupBooking();
  }

  function applyPrefill(p) {
    if (!p || typeof p !== 'object') { return; }
    function set(id, v) {
      var n = byId(id);
      if (n && v != null) { n.value = String(v); }
    }
    set('cf-booking', p.booking);
    if (p.po != null) { setRows('cf-po-rows', Array.isArray(p.po) ? p.po : [p.po], 'PO'); }
    if (p.containers != null) {
      setRows('cf-cont-rows', Array.isArray(p.containers) ? p.containers : [p.containers], 'Container');
    }
    set('cf-cntr-qty', p.cntrQty);
    set('cf-carrier', p.carrier);
    set('cf-vessel', p.vessel);
    set('cf-voyage', p.voyage);
    set('cf-mmsi', p.mmsi);
    set('cf-imo', p.imo);
    set('cf-etd', p.etd);
    set('cf-etb', p.etb);
    set('cf-eta', p.eta);
    set('cf-terminal', p.podTerminal);
    set('cf-source', p.source);
    set('cf-note', p.note);
    if (p.mode === 'follow') {
      setMode('follow');
      if (p.scheduleFrom != null) {
        fillFollowOptions(String(p.scheduleFrom));
        updateFollowPreview();
      }
    } else if (p.mode === 'manual') {
      setMode('manual');
    }
    updateNoteCount();
    updateDupVessel();
    updateDupBooking();
  }

  /* ───────────────── 저장 (이 작업에서 허용되는 유일한 외부 호출) ───────────────── */

  function save() {
    var values = collectValues();
    var res = validate(values);
    showErrors(res);
    var overlay = byId('cf-overlay');
    if (res.count > 0) {
      if (overlay) { overlay.scrollTop = 0; }
      return;
    }
    if (typeof fetch !== 'function') {
      showAlert(describeResult(null, null));
      return;
    }
    var payload = buildPayload(values); /* 본문은 buildPayload 결과 — 관리자 키는 헤더로만 */
    var btn = byId('cf-save');
    if (btn) { btn.disabled = true; }
    var base = (typeof API_ROOT === 'string') ? API_ROOT : '';
    fetch(base + '/ais-plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Refresh-Key': text(values.adminKey) },
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
      if (btn) { btn.disabled = false; }
      if (out.ok && out.status === 200) {
        storeKey(text(values.adminKey));
        closeModal();
        var booking = text(values.booking).toUpperCase();
        showToast(describeResult(200, (out.json && out.json.plan) ? out.json : { booking: booking }));
        var cui = getCountryUI();
        if (cui && typeof cui.refresh === 'function') {
          try { cui.refresh(); } catch (e) { /* 무시 */ }
        }
      } else {
        /* 실패: 문구만 표시하고 모달은 유지(입력값 보존) */
        showAlert(describeResult(out.status, out.json));
      }
    }).catch(function () {
      if (btn) { btn.disabled = false; }
      showAlert(describeResult(null, null));
    });
  }

  /* ───────────────── 모달 열기/닫기 ───────────────── */

  function open(opts) {
    if (typeof document === 'undefined') { return; }
    buildOnce();
    bindOnce();
    var overlay = byId('cf-overlay');
    if (!overlay) { return; }
    resetForm();
    applyPrefill(opts && opts.prefill);
    setHidden(overlay, false);
    if (document.body && document.body.classList) { document.body.classList.add('cf-modal-open'); }
    overlay.scrollTop = 0;
    var first = byId('cf-booking');
    if (first && typeof first.focus === 'function') { first.focus(); }
  }

  function closeModal() {
    var overlay = byId('cf-overlay');
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
    var overlay = byId('cf-overlay');
    var bClose = byId('cf-close');
    var bCancel = byId('cf-cancel');
    if (bClose) { bClose.addEventListener('click', closeModal); }
    if (bCancel) { bCancel.addEventListener('click', closeModal); }
    if (overlay) {
      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) { closeModal(); } /* 바깥 클릭 */
      });
    }
    document.addEventListener('keydown', function (e) {
      if (e && (e.key === 'Escape' || e.key === 'Esc')) {
        var ov = byId('cf-overlay');
        if (ov && !ov.hidden) { closeModal(); }
      }
    });
    var addPo = byId('cf-add-po');
    var addCont = byId('cf-add-cont');
    if (addPo) { addPo.addEventListener('click', function () { addInputRow('cf-po-rows', '', 'PO'); }); }
    if (addCont) { addCont.addEventListener('click', function () { addInputRow('cf-cont-rows', '', 'Container'); }); }
    var mManual = byId('cf-mode-manual');
    var mFollow = byId('cf-mode-follow');
    if (mManual) { mManual.addEventListener('change', function () { setMode('manual'); }); }
    if (mFollow) { mFollow.addEventListener('change', function () { setMode('follow'); }); }
    var vessel = byId('cf-vessel');
    var mmsiIn = byId('cf-mmsi');
    if (vessel) { vessel.addEventListener('input', updateDupVessel); }
    if (mmsiIn) { mmsiIn.addEventListener('input', updateDupVessel); }
    var booking = byId('cf-booking');
    if (booking) { booking.addEventListener('input', updateDupBooking); }
    var carrier = byId('cf-carrier');
    if (carrier) { carrier.addEventListener('change', updateDupBooking); }
    var noteIn = byId('cf-note');
    if (noteIn) { noteIn.addEventListener('input', updateNoteCount); }
    var followSel = byId('cf-follow');
    if (followSel) { followSel.addEventListener('change', updateFollowPreview); }
    var btnSave = byId('cf-save');
    if (btnSave) { btnSave.addEventListener('click', save); }
  }

  /* 11B 버튼(data-cg-action="add-au") 클릭 위임 — 문서 레벨 1회.
     관리자가 아니면 열지 않는다. */
  function initDelegation() {
    if (typeof document === 'undefined' || !document.addEventListener) { return; }
    document.addEventListener('click', function (ev) {
      var t = ev && ev.target;
      if (!t || typeof t.closest !== 'function') { return; }
      var btn = t.closest('[data-cg-action="add-au"]');
      if (!btn) { return; }
      syncAdmin();
      var de = document.documentElement;
      if (!de || typeof de.getAttribute !== 'function' ||
          de.getAttribute('data-cg-admin') !== '1') { return; }
      /* [15차] 새 ADD 창(부킹 번호만, Traqo 슬롯 확인 팝업) 우선 — 없거나
         열 때 오류가 나면 기존 수동 입력 창으로 폴백한다. */
      var ca = getCountryAdd();
      if (ca && typeof ca.open === 'function') {
        try { ca.open(); return; } catch (e) { /* 폴백으로 내려간다 */ }
      }
      open();
    });
  }

  /* 모듈 초기화 — 브라우저에서만 (Node require 부작용 없음) */
  if (typeof document !== 'undefined') {
    syncAdmin();
    initDelegation();
  }

  /* ───────────────────── 공개 API ───────────────────── */

  return {
    validate: validate,
    buildPayload: buildPayload,
    describeResult: describeResult,
    syncAdmin: syncAdmin,
    open: open,
    close: closeModal
  };
});
