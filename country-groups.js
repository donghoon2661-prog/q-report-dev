/* ═════════════════════════════════════════════════════════════════
 * country-groups.js — 국가별 그룹 바 + 호주 노선 표 (모듈 2)
 *
 * - 전역 노출: window.CountryGroups (브라우저) / module.exports (Node)
 * - UMD. 빌드 도구·외부 라이브러리 없음. 모듈 1(선박 레이어)에 의존하지 않는다(독립 구현).
 * - 11B: 행 모델에 po/bookingText/scheduleInherited/followsText 추가, bk 줄은
 *   승인 목업 형식(<booking> · <container> · PO <po1>, <po2>), 호주 그룹 제목줄에
 *   관리자용 ADMIN 태그 + ADD 버튼(CSS 로 관리자에게만 표시).
 * - 12차: 선적 0건인 호주를 위해 auEmptyGroup() 이 빈 그룹(제목줄 + ADD 버튼 +
 *   빈 상태 카드)을 그린다. 섹션에 cg-group-empty 를 줘서 CSS 로
 *   관리자(html[data-cg-admin="1"])에게만 표시한다.
 * - 13차: VESSEL 칸 첫 줄 항차 뒤에 PO 괄호(<span class="vy">(PO1, PO2)</span>),
 *   bk 줄은 <부킹> · <N> CNTR(컨테이너 번호·'PO …' 조각 삭제, 부킹 없으면
 *   부킹 자리 비움, 둘 다 없으면 &nbsp;). 행 모델에 cntrQty 추가.
 * - 14차: 호주 표 4번째 칸 GATE IN / RETURN 복원 — traqo.events 의 equipment
 *   이벤트에서 출발지(MYPKG)는 정규식 gate in 중 가장 이른 것, 도착지(AUSYD)는
 *   return 이 걸린 것 중 가장 늦은 것({ text, est } | null). 날짜는 locode 현지
 *   시각(모르는 locode 는 UTC 접미사, fmtLocal). traqo.atdUtc/ataUtc(따라오는
 *   선적은 inherited 객체의 값)가 있으면 ETD/ETA 줄을 실제(actual) 로 표시하고
 *   수동 예정값은 덮어쓰지 않는다. 표 아래 푸터에 선적별 TRAQO 동기화 줄 1개씩.
 * - 15차: VESSEL 칸 첫 줄 끝에 단계 배지(순수 함수 auPhase — 도착지 실제 이벤트
 *   RETURN/GATE OUT/DISCHARG → ATA → 출항(traqo.atdUtc 또는 수동 etd, PK UTC+8)
 *   → BOOKED. 클래스는 style.css 의 ph book/sail/dock/done/out/rtn 재사용).
 *   RETURN 줄 끝에 관리자용 EDIT 버튼(data-cg-action="edit-au", 표시는 CSS).
 *
 * 호출하는 쪽 규칙 (문서화):
 *   1) 데이터가 있는 국가만 그룹을 그린다.
 *   2) 행이 0건인 국가는 그룹을 아예 그리지 않는다.
 *      (renderGroup 대신 아무것도 그리지 않거나, 데이터가 아직
 *       한 번도 없던 국가라면 renderEmpty(key)를 쓴다.
 *       12차 예외: 호주 0건은 auEmptyGroup() 으로 빈 그룹을 그린다 — 관리자 전용.)
 *   3) renderBar(container, state, onChange)의 state.filter가 바뀌면
 *      국가 그룹 표시 여부는 CountryGroups.visible(filter, key)로 판단한다.
 *   4) renderAuTable이 반환하는 HTML에는 사용자 입력이 이스케이프되어 들어간다.
 * ═════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.CountryGroups = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ───────────────────────── 상수 ───────────────────────── */

  /* Korea is disabled for now — re-add later */
  var COUNTRIES = {
    usa: { key: 'usa', name: 'USA',       color: '#FF6B35', route: 'PORT KLANG → LA' },
    au:  { key: 'au',  name: 'Australia', color: '#EAF2F6', route: 'PORT KLANG → SYDNEY' }
  };

  /* 필터 바 버튼 순서: ALL → USA → Australia */
  var BAR_ITEMS = [
    { key: 'all', label: 'ALL' },
    { key: 'usa', label: COUNTRIES.usa.name },
    { key: 'au',  label: COUNTRIES.au.name }
  ];

  var MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  /* ───────────────────────── 내부 유틸 (독립 구현) ───────────────────────── */

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  /* HTML 이스케이프 (& < > " ') — XSS 방지 필수 */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /* "2026-10-09 14:22:10.123456789 +0000 UTC" → "2026-10-09T14:22:10Z"
     앞 19자를 UTC로 해석. (ais-layer.js와 같은 로직 — 모듈 간 의존을 피하려고 복사) */
  var AIS_TIME_RE = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})/;

  function parseAisTime(str) {
    if (typeof str !== 'string') return null;
    var m = AIS_TIME_RE.exec(str);
    if (!m) return null;
    var Y = +m[1], Mo = +m[2], D = +m[3], H = +m[4], Mi = +m[5], S = +m[6];
    if (Mo < 1 || Mo > 12 || D < 1 || D > 31 || H > 23 || Mi > 59 || S > 59) return null;
    var t = Date.UTC(Y, Mo - 1, D, H, Mi, S);
    if (!isFinite(t)) return null;
    var d = new Date(t);
    if (d.getUTCFullYear() !== Y || d.getUTCMonth() !== Mo - 1 || d.getUTCDate() !== D ||
        d.getUTCHours() !== H || d.getUTCMinutes() !== Mi || d.getUTCSeconds() !== S) return null;
    return d.toISOString().replace('.000Z', 'Z');
  }

  /* ISO → "Oct/09 14:22". null/잘못된 값 → null */
  function formatLast(iso) {
    var t = (typeof iso === 'string') ? Date.parse(iso) : NaN;
    if (!isFinite(t)) return null;
    var d = new Date(t);
    return MONTHS[d.getUTCMonth()] + '/' + pad2(d.getUTCDate()) +
           ' ' + pad2(d.getUTCHours()) + ':' + pad2(d.getUTCMinutes());
  }

  /* 'YYYY-MM-DD' 또는 'YYYY-MM-DDTHH:MM' → 'Oct/12' 또는 'Oct/12 07:00'.
     월은 영문 3글자, 시각은 입력값 그대로(시간대 변환 없음). 못 읽으면 null */
  function fmtDay(v) {
    if (typeof v !== 'string') return null;
    var m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(v);
    if (!m) return null;
    var mo = +m[2], d = +m[3];
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    var out = MONTHS[mo - 1] + '/' + pad2(d);
    if (m[4] != null && m[5] != null) {
      var h = +m[4], mi = +m[5];
      if (h > 23 || mi > 59) return null;
      out += ' ' + m[4] + ':' + m[5]; /* 시각은 입력값 그대로 */
    }
    return out;
  }

  /* 상대시간: 1시간 미만 "N min ago", 48시간 미만 "N h ago", 그 이상 "N d ago"
     (59분→59 min ago, 60분→1 h ago, 47시간→47 h ago, 48시간→2 d ago) */
  function relTime(lastDataIso, nowMs) {
    if (typeof lastDataIso !== 'string') return null;
    var t = Date.parse(lastDataIso);
    if (!isFinite(t)) return null;
    var now = (typeof nowMs === 'number' && isFinite(nowMs)) ? nowMs : Date.now();
    var diff = now - t;
    if (diff < 0) diff = 0; /* 시계 오차로 미래 시각이 오면 0분 취급 */
    var min = Math.floor(diff / 60000);
    if (min < 60) return min + ' min ago';
    var hr = Math.floor(diff / 3600000);
    if (hr < 48) return hr + ' h ago';
    return Math.floor(diff / 86400000) + ' d ago';
  }

  /* COUNTRIES의 색은 안전한 hex만 inline style로 쓴다 */
  function safeColor(c) {
    return typeof c === 'string' && /^#[0-9A-Fa-f]{3,8}$/.test(c) ? c : '#8AA4B5';
  }

  /* cntrQty(13차): 컨테이너 대수. plan.cntrQty 가 1~99 정수(문자열 숫자 허용)면
     그 값을 쓰고, 아니면 plan.container 를 ',' 로 쪼개 빈 항목을 제외한 개수,
     그것도 없으면 null. 범위 밖(0·100·소수 등)은 필드를 무시하고 번호 개수로 대체한다.
     (ais-layer.js 와 같은 로직 — 모듈 간 의존을 피하려고 복사) */
  function cntrQtyOf(plan) {
    var n = plan.cntrQty;
    if (typeof n === 'number' && isFinite(n) && n % 1 === 0 && n >= 1 && n <= 99) return n;
    if (typeof n === 'string' && /^\d{1,2}$/.test(n.trim())) {
      var p = parseInt(n, 10);
      if (p >= 1 && p <= 99) return p;
    }
    var raw = plan.container != null ? String(plan.container) : '';
    var parts = raw.split(',');
    var count = 0;
    for (var i = 0; i < parts.length; i++) {
      if (parts[i].trim() !== '') count++;
    }
    return count > 0 ? count : null;
  }

  /* ─────────────────── 14차: Traqo GATE IN / RETURN ─────────────────── */

  /* Traqo 이벤트 locode 계약: 출발지(포트클랑)/도착지(시드니) 는 서버가 이 값을 쓴다 */
  var PKG_LOCODE = 'MYPKG';
  var SYD_LOCODE = 'AUSYD';

  /* locode 별 표시 시간대. 여기 없는 locode 는 UTC 로 두고 접미사 ' UTC' 를 붙인다 */
  var TZ_BY_LOCODE = {
    MYPKG: 'Asia/Kuala_Lumpur',
    AUSYD: 'Australia/Sydney'
  };

  /* 이벤트 판정 정규식(14차 계약) — code + ' ' + description 결합 문자열에 검사 */
  var GATE_IN_RE = /gate[\s_-]*in/i;
  var RETURN_RE = /empty[\s_-]*(return|gate[\s_-]*in)|return/i;

  /* [15차] 단계 배지 판정 정규식 — 도착지(AUSYD) equipment 이벤트 대상.
     code + ' ' + description 결합 문자열에 검사(14차와 같은 방식) */
  var GATE_OUT_RE = /gate[\s_-]*out/i;
  var DISCH_RE = /discharg/i;

  /* 'Oct' 형태(month 약어, 첫 글자만 대문자)로 정규화 */
  function monthAbbr(s) {
    var m = String(s == null ? '' : s).slice(0, 3);
    return m.charAt(0).toUpperCase() + m.slice(1).toLowerCase();
  }

  /* ISO → "Oct/07 04:21" — locode 현지 시각(MYPKG +8 / AUSYD +(+11 등)).
     모르는 locode 는 UTC 로 두고 "Oct/06 20:21 UTC" 처럼 접미사를 붙인다.
     읽을 수 없는 값은 null. (Intl.DateTimeFormat — en-GB, hourCycle h23) */
  function fmtLocal(iso, locode) {
    if (typeof iso !== 'string') return null;
    var t = Date.parse(iso);
    if (!isFinite(t)) return null;
    var tz = TZ_BY_LOCODE[locode] || null;
    if (tz && typeof Intl !== 'undefined' && typeof Intl.DateTimeFormat === 'function') {
      try {
        var parts = new Intl.DateTimeFormat('en-GB', {
          timeZone: tz, year: 'numeric', month: 'short', day: '2-digit',
          hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
        }).formatToParts(new Date(t));
        var get = {};
        parts.forEach(function (p) { get[p.type] = p.value; });
        if (get.month && get.day && get.hour && get.minute) {
          return monthAbbr(get.month) + '/' + get.day + ' ' + get.hour + ':' + get.minute;
        }
      } catch (e) { /* 시간대를 못 읽으면 UTC 폴백으로 간다 */ }
    }
    var d = new Date(t);
    return MONTHS[d.getUTCMonth()] + '/' + pad2(d.getUTCDate()) +
           ' ' + pad2(d.getUTCHours()) + ':' + pad2(d.getUTCMinutes()) + ' UTC';
  }

  /* traqo 계약 검증(14차) — ais-layer.js 의 traqoOf 와 같은 로직
     (모듈 간 의존을 피하려고 복사). 계약 모양이 아니면 null. */
  function traqoOf(plan) {
    var t = plan ? plan.traqo : null;
    if (!t || typeof t !== 'object' || Array.isArray(t)) return null;
    if (t.inherited === true) return t; /* inherited: 위 4개 시각 필드뿐이어도 계약 */
    if (t.enabled !== true) return null;
    if (t.status !== 'ok' && t.status !== 'error') return null;
    if (t.events != null && !Array.isArray(t.events)) return null;
    if (t.containers != null && !Array.isArray(t.containers)) return null;
    return t;
  }

  /* equipment 이벤트 가운데 정규식(re)이 code+description 결합 문자열에 맞고
     locode 가 지정 항구인 것, date 를 읽을 수 있는 것 중
     earliest=true 면 가장 이른 것 / false 면 가장 늦은 것을 골라
     { text: 'Oct/07 04:21', est: 'actual'|'scheduled' } 로. 없으면 null.
     (traqo 가 없거나 inherited 이어도 없는 것과 같다 — inherited 에는 events 가 없다) */
  function pickTqEvent(traqo, re, locode, earliest) {
    if (!traqo || traqo.inherited === true || !Array.isArray(traqo.events)) return null;
    var best = null;
    traqo.events.forEach(function (ev) {
      if (!ev || typeof ev !== 'object') return;
      if (ev.kind !== 'equipment') return;
      if (ev.locode !== locode) return;
      var hay = String(ev.code == null ? '' : ev.code) + ' ' +
                String(ev.description == null ? '' : ev.description);
      if (!re.test(hay)) return;
      var t = typeof ev.date === 'string' ? Date.parse(ev.date) : NaN;
      if (!isFinite(t)) return;
      if (!best || (earliest ? t < best.t : t > best.t)) {
        best = { t: t, ev: ev };
      }
    });
    if (!best) return null;
    var text = fmtLocal(best.ev.date, locode);
    if (!text) return null;
    return { text: text, est: best.ev.isActual === true ? 'actual' : 'scheduled' };
  }

  /* [15차] equipment 이벤트 중 re 가 code+' '+description 결합 문자열에 맞고
     locode 가 일치하고 실제(isActual===true)인 것이 하나라도 있으면 true.
     (auPhase 단계 판정용 — pickTqEvent 와 같은 결합 문자열 규칙) */
  function hasActualTqEvent(traqo, re, locode) {
    if (!traqo || traqo.inherited === true || !Array.isArray(traqo.events)) return false;
    var found = false;
    traqo.events.forEach(function (ev) {
      if (found || !ev || typeof ev !== 'object') return;
      if (ev.kind !== 'equipment') return;
      if (ev.locode !== locode) return;
      if (ev.isActual !== true) return;
      var hay = String(ev.code == null ? '' : ev.code) + ' ' +
                String(ev.description == null ? '' : ev.description);
      if (re.test(hay)) found = true;
    });
    return found;
  }

  /* [15차] 'YYYY-MM-DD HH:MM'(포트클랑 현지 시각) → ms. 포트클랑은 UTC+8 고정
     (서머타임 없음, Intl 없이 계산 — 테스트 가능한 순수 계산). 못 읽으면 null */
  function pkLocalMs(s) {
    if (typeof s !== 'string') return null;
    var m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(s.trim());
    if (!m) return null;
    var mo = +m[2], d = +m[3], h = m[4] != null ? +m[4] : 0, mi = m[5] != null ? +m[5] : 0;
    if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
    var t = Date.UTC(+m[1], mo - 1, d, h, mi) - 8 * 3600000; /* +8 → UTC */
    return isFinite(t) ? t : null;
  }

  /* ─────────────────── [15차] 단계 배지 판정(순수 함수) ───────────────────
     row(auRows 의 행)와 nowMs 로 표에 붙일 단계를 정한다. 우선순위 위→아래:
       RETURNED(ph rtn) > GATED OUT(ph out) > DISCHARGED(ph done) >
       BERTHED(ph dock) > AT SEA(ph sail) > BOOKED(ph book)
     1~3: 도착지(AUSYD) equipment 실제(isActual) 이벤트(14차와 같은 결합 문자열 규칙).
     4: traqo.ataUtc(자기 것 또는 inherited)가 있을 때만 — 정박 반경 조건은 쓰지 않음.
     5: traqo.atdUtc 가 있거나 수동 etd(포트클랑 현지, UTC+8)가 nowMs 이전이면 출항.
     따라오는 선적(inherited)은 1~3을 건너뛰고 4·5만 판정한다(inherited 에는
     events 가 없으므로 사실상 같은 결과지만 contract 이전에 명시적으로 건너뛴다). */
  function auPhase(row, nowMs) {
    var PHASES = {
      RETURNED: 'ph rtn', GATED_OUT: 'ph out', DISCHARGED: 'ph done',
      BERTHED: 'ph dock', AT_SEA: 'ph sail', BOOKED: 'ph book'
    };
    var LABELS = {
      RETURNED: 'RETURNED', GATED_OUT: 'GATED OUT', DISCHARGED: 'DISCHARGED',
      BERTHED: 'BERTHED', AT_SEA: 'AT SEA', BOOKED: 'BOOKED'
    };
    var r = row || {};
    var tq = (r.traqo && typeof r.traqo === 'object') ? r.traqo : null;
    var inherited = !!(tq && tq.inherited === true);

    if (!inherited) {
      if (hasActualTqEvent(tq, RETURN_RE, SYD_LOCODE)) return { phase: 'RETURNED', cls: PHASES.RETURNED, label: LABELS.RETURNED };
      if (hasActualTqEvent(tq, GATE_OUT_RE, SYD_LOCODE)) return { phase: 'GATED OUT', cls: PHASES.GATED_OUT, label: LABELS.GATED_OUT };
      if (hasActualTqEvent(tq, DISCH_RE, SYD_LOCODE)) return { phase: 'DISCHARGED', cls: PHASES.DISCHARGED, label: LABELS.DISCHARGED };
    }

    var ata = tq && typeof tq.ataUtc === 'string' ? tq.ataUtc : '';
    if (ata && Date.parse(ata)) return { phase: 'BERTHED', cls: PHASES.BERTHED, label: LABELS.BERTHED };

    var depart = false;
    var atd = tq && typeof tq.atdUtc === 'string' ? tq.atdUtc : '';
    if (atd && Date.parse(atd)) depart = true;
    if (!depart) {
      var etdMs = pkLocalMs(r.etd != null ? String(r.etd) : '');
      var now = (typeof nowMs === 'number' && isFinite(nowMs)) ? nowMs : Date.now();
      if (etdMs != null && etdMs <= now) depart = true;
    }
    if (depart) return { phase: 'AT SEA', cls: PHASES.AT_SEA, label: LABELS.AT_SEA };
    return { phase: 'BOOKED', cls: PHASES.BOOKED, label: LABELS.BOOKED };
  }

  /* ───────────────────────── 공개 함수 ───────────────────────── */

  /* filter('all'|'usa'|'au') 상태에서 key 국가를 보여줄지 */
  function visible(filter, key) {
    return filter === 'all' || filter === key;
  }

  /* 필터 버튼 3개(전체/USA/Australia)를 container에 그린다.
     state.filter에 해당하는 버튼에 'on' 클래스. 클릭 시 onChange(key). */
  function renderBar(container, state, onChange) {
    if (!container || typeof container.appendChild !== 'function') return;
    if (container.classList && typeof container.classList.add === 'function') {
      container.classList.add('cg-bar');
    }
    var filter = (state && state.filter != null) ? state.filter : 'all';
    container.innerHTML = '';
    BAR_ITEMS.forEach(function (item) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'cg-btn' + (filter === item.key ? ' on' : '');
      b.textContent = item.label;
      b.addEventListener('click', function () {
        if (typeof onChange === 'function') onChange(item.key);
      });
      container.appendChild(b);
    });
  }

  /* GET /ais → 호주(시드니) 표의 행 모델 배열. 모듈 1을 쓰지 않는 독립 구현.
     행: { mmsi, vessel, voyage, mbl, container, cntrQty, booking, bookingText, po,
           scheduleInherited, followsText, etd, etb, eta,
           etdText, etbText, etaText, etdSource, lastDataIso|null, note, warn }
     11B: po(문자열 배열, 없으면 []), bookingText(booking 없으면 —),
          scheduleInherited(서버가 true 로 내려주면 따라온 일정),
          followsText('follows <scheduleFromBooking>' 또는 빈 문자열)
     13차: cntrQty(컨테이너 대수 — plan.cntrQty 1~99 정수, 아니면 번호 개수, 없으면 null)
     14차: traqo(계약 모양 검증 통과 객체 또는 null — ais-layer.traqoOf 와 같은 규칙),
           gateIn/ret(각 { text, est } | null — GATE IN/RETURN 칸 값).
     17차: gateOut({ text, est }|null — SYDNEY GATE OUT 칸 값, ret 와 같은 방식). */
  /* 'ANNU'+영문3+숫자7 이면 뒤 10자(부킹), 아니면 '' */
  function annuBooking(v) {
    var m = /^ANNU([A-Z]{3}\d{7})$/.exec(String(v == null ? '' : v).trim().toUpperCase());
    return m ? m[1] : '';
  }

  function auRows(aisJson) {
    var rows = [];
    if (!aisJson || typeof aisJson !== 'object') return rows;
    var plans = aisJson.plans && typeof aisJson.plans === 'object' ? aisJson.plans : {};
    var latest = aisJson.latest;
    var vessels = (latest && latest.vessels && typeof latest.vessels === 'object') ? latest.vessels : {};

    Object.keys(plans).forEach(function (mbl) {
      var plan = plans[mbl] || {};
      var pod = plan.pod != null ? String(plan.pod).toUpperCase() : '';
      if (pod.indexOf('SYDNEY') === -1) return; /* 호주(시드니) 노선만 */

      var mmsi = plan.mmsi != null ? String(plan.mmsi) : null;
      var v = mmsi && Object.prototype.hasOwnProperty.call(vessels, mmsi) ? vessels[mmsi] : null;
      var pos = (v && v.pos) ? v.pos : null;
      var note = plan.note != null ? String(plan.note) : '';
      var etd = plan.etd != null ? String(plan.etd) : '';
      var etb = plan.etb != null ? String(plan.etb) : '';
      var eta = plan.eta != null ? String(plan.eta) : '';
      var booking = plan.booking != null ? String(plan.booking) : '';
      /* 부킹이 저장돼 있지 않으면 ANL MBL(ANNU+부킹)에서 뒤쪽 10자를 쓴다 */
      if (!booking) booking = annuBooking(plan.mbl != null ? plan.mbl : mbl);
      var scheduleInherited = plan.scheduleInherited === true;
      var scheduleFromBooking = plan.scheduleFromBooking != null ? String(plan.scheduleFromBooking) : '';
      scheduleFromBooking = annuBooking(scheduleFromBooking) || scheduleFromBooking;
      var po = Array.isArray(plan.po)
        ? plan.po.map(function (x) { return x == null ? '' : String(x); })
          .filter(function (s) { return s !== ''; })
        : [];

      /* [14차+17차] traqo 와 GATE IN / GATE OUT / RETURN 칸 값 — 계약 객체 검증 후
         이벤트 선택. gateOut 은 ret(RETURN_RE, SYD_LOCODE, 가장 늦은 것)과 같은
         pickTqEvent 방식·선택 규칙으로 GATE_OUT_RE 를 뽑는다. */
      var tq = traqoOf(plan);
      var gateIn = pickTqEvent(tq, GATE_IN_RE, PKG_LOCODE, true);
      var gateOut = pickTqEvent(tq, GATE_OUT_RE, SYD_LOCODE, false);
      var ret = pickTqEvent(tq, RETURN_RE, SYD_LOCODE, false);

      rows.push({
        mmsi: mmsi == null ? '' : mmsi,
        vessel: plan.vessel != null ? String(plan.vessel) : '',
        voyage: plan.voyage != null ? String(plan.voyage) : '',
        mbl: plan.mbl != null ? String(plan.mbl) : String(mbl),
        container: plan.container != null ? String(plan.container) : '',
        cntrQty: cntrQtyOf(plan),
        booking: booking,
        bookingText: booking || '—',
        po: po,
        scheduleInherited: scheduleInherited,
        followsText: (scheduleInherited && scheduleFromBooking) ? 'follows ' + scheduleFromBooking : '',
        traqo: tq,
        gateIn: gateIn,
        gateOut: gateOut,
        ret: ret,
        etd: etd,
        etb: etb,
        eta: eta,
        etdText: etd ? fmtDay(etd) : null,
        etbText: etb ? fmtDay(etb) : null,
        etaText: eta ? fmtDay(eta) : null,
        etdSource: plan.source != null ? String(plan.source) : '',
        lastDataIso: parseAisTime(pos && pos.at),
        note: note,
        warn: note !== '' /* 여러 출처의 일정이 다르다는 뜻 — 표에는 칩을 그리지 않는다 */
      });
    });
    return rows;
  }

  /* 호주 표 HTML 문자열. 4컬럼(17차 — 미국 표와 같은 칸 구조로):
     VESSEL | GATE IN / ETD · PKG | SYDNEY ETB / DEST ETA | SYDNEY GATE OUT / RETURN
     (ETD 칸은 IN/ETD 두 줄 — 칸 <td> 에 white-space:nowrap, 각 줄 줄바꿈 금지.
      4번째 칸은 OUT/RTN 두 줄. AIS 수신은 표 맨 아래 오른쪽 한 줄 푸터 — .cg-ais-foot,
      선박별 1줄 + [14차] TRAQO 동기화 줄은 선적별 1줄씩 그 아래) */
  function renderAuTable(rows, nowMs) {
    var list = Array.isArray(rows) ? rows : [];

    var head = '<tr>'
      + '<th>VESSEL</th>'
      + '<th>GATE IN / ETD · PKG</th>'
      + '<th>SYDNEY ETB / DEST ETA</th>'
      + '<th>SYDNEY GATE OUT / RETURN</th>'
      + '</tr>';

    var body = list.map(function (r) {
      r = r || {};

      /* VESSEL — USA 표(#vtable)와 같은 클래스: nm(큰 컨덴스드) + vy(회색 작은 고정폭)
         + bk(블록이라 아래 줄). 13차 형식:
         첫 줄   <span class="nm">선박명</span><span class="vy">항차</span><span class="vy">(PO1, PO2)</span>
         둘째 줄 <span class="bk"><부킹> · <N> CNTR</span>
         (PO 는 부킹 유무와 무관하게 항차 뒤 괄호로 표시. 컨테이너 번호와 'PO …'
          조각은 둘째 줄에서 뺐다 — 번호는 표에 나오지 않는다. 부킹이 없으면
          부킹 자리를 비우고 N CNTR 만, N 을 모르면 부킹만, 둘 다 없으면
          &nbsp; 로 줄 높이를 유지한다.) */
      var vesselName = esc(r.vessel);
      var voyage = r.voyage ? '<span class="vy">' + esc(r.voyage) + '</span>' : '';
      var poBit = (r.po && r.po.length)
        ? '<span class="vy">(' + esc(r.po.join(', ')) + ')</span>' : '';

      /* [15차] 단계 배지 — VESSEL 칸 첫 줄(선박명·항차·PO 뒤). USA 표와 같은
         .ph 클래스(style.css 의 ph book/sail/dock/done/out/rtn — 새 색 없음,
         이 파일에서 CSS 를 만들지 않는다). 단어는 판정 결과의 고정 문구라
         동적 값이 아니지만 방어적으로 esc 를 둔다. */
      var ph = auPhase(r, nowMs);
      var badge = '<span class="' + ph.cls + '">' + esc(ph.label) + '</span>';
      var qty = (typeof r.cntrQty === 'number' && isFinite(r.cntrQty) && r.cntrQty >= 1)
        ? r.cntrQty : null;
      var bkBits = [];
      if (r.booking) bkBits.push(esc(r.booking));
      if (qty != null) bkBits.push(qty + ' CNTR');
      var bk = '<span class="bk">' + (bkBits.length ? bkBits.join(' · ') : '&nbsp;') + '</span>';

      /* [17차] GATE IN / ETD · PKG — 정확히 두 줄(칸 <td> 에 inline
         white-space:nowrap, 각 줄 줄바꿈 금지). 첫 줄 IN: 행 모델의
         gateIn({ text, est }|null — 14차, 포트클랑 MYPKG 의 가장 이른 실제 Gate in),
         없으면 pa-na —. 둘째 줄 ETD: 기존 etdCell 내용(dt + est(actual/scheduled,
         일정이 따라온 선적(scheduleInherited)이면 ' · follows <scheduleFromBooking>'
         병기) 또는 pa-na —). (칩·출처 문구는 빠짐) */
      var atdIso = (r.traqo && typeof r.traqo.atdUtc === 'string') ? r.traqo.atdUtc : null;
      var atdText = atdIso ? fmtLocal(atdIso, PKG_LOCODE) : null;
      var etdCell = (atdText || r.etdText)
        ? '<span class="dt">' + esc(atdText || r.etdText) + '</span><span class="est">'
          + (atdText ? 'actual' : 'scheduled')
          + (r.followsText ? ' · ' + esc(r.followsText) : '') + '</span>'
        : '<span class="pa-na">—</span>';
      var inLine = '<div><span class="eta-lbl">IN</span>'
        + (r.gateIn
          ? '<span class="dt">' + esc(r.gateIn.text) + '</span><span class="est">' + esc(r.gateIn.est) + '</span>'
          : '<span class="pa-na">—</span>')
        + '</div>';
      var etdLine = '<div style="margin-top:3px"><span class="eta-lbl">ETD</span>' + etdCell + '</div>';

      /* SYDNEY ETB / DEST ETA — USA 표와 같은 두 줄(div 두 개, 두 번째 줄 margin-top:3px) */
      var etbLine = '<div><span class="eta-lbl">ETB</span>'
        + (r.etbText
          ? '<span class="dt">' + esc(r.etbText) + '</span><span class="est">scheduled</span>'
          : '<span class="pa-na">—</span>')
        + '</div>';
      var ataIso = (r.traqo && typeof r.traqo.ataUtc === 'string') ? r.traqo.ataUtc : null;
      var ataText = ataIso ? fmtLocal(ataIso, SYD_LOCODE) : null;
      var etaLine = '<div style="margin-top:3px"><span class="eta-lbl">ETA</span>'
        + (ataText
          ? '<span class="dt">' + esc(ataText) + '</span><span class="est">actual</span>'
          : (r.etaText
            ? '<span class="dt">' + esc(r.etaText) + '</span><span class="est">scheduled</span>'
            : '<span class="pa-na">—</span>'))
        + '</div>';

      /* [17차] SYDNEY GATE OUT / RETURN — ETB/ETA 칸과 같은 두 줄 구조·같은 클래스.
         첫 줄 OUT: 행 모델의 gateOut({ text, est }|null — 17차, 도착지(AUSYD) Gate out
         equipment 이벤트를 ret 와 같은 pickTqEvent 방식·선택 규칙(가장 늦은 것)으로 뽑은 값),
         없으면 pa-na —(traqo 가 없거나 inherited 이면 —). 둘째 줄 RTN: 행 모델의 ret 값.
         (옛 4번째 칸의 GATE IN 줄은 2번째 칸의 IN 줄로 옮겨갔다) */
      var outLine = '<div><span class="eta-lbl">OUT</span>'
        + (r.gateOut
          ? '<span class="dt">' + esc(r.gateOut.text) + '</span><span class="est">' + esc(r.gateOut.est) + '</span>'
          : '<span class="pa-na">—</span>')
        + '</div>';
      /* [15차] RTN(RETURN) 줄 + EDIT 버튼 — 버튼은 RTN 줄 오른쪽 끝. 표시는 CSS 관리
         (기본 display:none, html[data-cg-admin="1"] 일 때만 — ADD 버튼과 같은 방식,
         새 색 없음). 클릭은 country-edit.js 의 캡처 단계 위임이 받아 행 클릭(상세)
         동작과 분리된다. 키(r.mbl)는 속성값이라 esc 로 이스케이프한다. */
      var editBtn = '<button type="button" class="cg-edit" data-cg-action="edit-au"'
        + ' data-cg-key="' + esc(r.mbl) + '">EDIT</button>';
      var retCell = '<div style="margin-top:3px"><span class="eta-lbl">RTN</span>'
        + (r.ret
          ? '<span class="dt">' + esc(r.ret.text) + '</span><span class="est">' + esc(r.ret.est) + '</span>'
          : '<span class="pa-na">—</span>')
        + editBtn + '</div>';

      return '<tr>'
        + '<td><span class="nm">' + vesselName + '</span>' + voyage + poBit + badge + bk + '</td>'
        + '<td style="white-space:nowrap">' + inLine + etdLine + '</td>'
        + '<td>' + etbLine + etaLine + '</td>'
        + '<td>' + outLine + retCell + '</td>'
        + '</tr>';
    }).join('');

    return '<div class="cg-table-wrap"><table class="cg-table">'
      + '<thead>' + head + '</thead>'
      + '<tbody>' + body + '</tbody>'
      + '</table>'
      + aisFootHtml(list, nowMs)
      + '</div>';
  }

  /* AIS 마지막 수신 푸터 — 표 맨 아래 오른쪽, 선박별 한 줄.
     선박은 고유 MMSI 로 묶고, MMSI 가 없으면 선박명으로 묶는다.
     같은 배의 선적이 여럿이면 lastDataIso 중 가장 최근 값을 쓴다.
     값 있을 때: AIS · <선박명> · Oct/09 14:22 · 37 min ago
     값 없을 때: AIS · <선박명> · —
     [14차] 그 아래 선적별 TRAQO 동기화 줄(TRAQO · …)을 같은 .cg-ais-foot 에 더한다.
     AIS 줄과 TRAQO 줄이 둘 다 없으면 빈 문자열(푸터를 만들지 않는다). 모든 값 이스케이프. */
  function aisFootHtml(rows, nowMs) {
    var list = Array.isArray(rows) ? rows : [];
    var order = [];
    var byKey = {};
    list.forEach(function (r) {
      r = r || {};
      var mmsi = r.mmsi != null ? String(r.mmsi) : '';
      var vessel = r.vessel != null ? String(r.vessel) : '';
      var key = mmsi || vessel;
      if (!key) return;
      if (!byKey[key]) {
        byKey[key] = { name: vessel, iso: null, t: NaN };
        order.push(key);
      }
      var e = byKey[key];
      if (!e.name && vessel) e.name = vessel;
      var iso = typeof r.lastDataIso === 'string' ? r.lastDataIso : '';
      if (iso) {
        var t = Date.parse(iso);
        if (isFinite(t) && !(e.t >= t)) { e.t = t; e.iso = iso; }
      }
    });
    var lines = order.map(function (key) {
      var e = byKey[key];
      var name = e.name || key;
      var val = '—';
      if (e.iso) {
        var fmt = formatLast(e.iso);
        if (fmt) {
          val = esc(fmt);
          var rel = relTime(e.iso, nowMs);
          if (rel) val += ' · ' + esc(rel);
        }
      }
      return '<div>AIS · ' + esc(name) + ' · ' + val + '</div>';
    });

    /* [14차] TRAQO 동기화 줄 — AIS 줄 아래, 선적별 한 줄(묶지 않는다).
       ok:    TRAQO · <선박명> · synced Oct/07 12:00 · 3 h ago
              (동기화 시각은 traqo.syncedAt — 기존 formatLast(UTC)/relTime 재사용)
       error: TRAQO · <선박명> · sync error — last ok Oct/07 12:00 (<error 문구 이스케이프>)
       traqo 가 없거나 inherited 인 선적(행)은 줄을 만들지 않는다. */
    var tLines = [];
    list.forEach(function (r) {
      r = r || {};
      var tq = r.traqo;
      if (!tq || typeof tq !== 'object' || tq.inherited === true) return;
      var name = (r.vessel != null && r.vessel !== '') ? String(r.vessel)
        : (r.mbl != null && r.mbl !== '' ? String(r.mbl) : '—');
      var synced = typeof tq.syncedAt === 'string' ? tq.syncedAt : '';
      var fmt = synced ? formatLast(synced) : null;
      if (tq.status === 'error') {
        var msg = 'TRAQO · ' + esc(name) + ' · sync error — last ok '
          + (fmt ? esc(fmt) : '—');
        var err = (tq.error != null && tq.error !== '') ? String(tq.error) : '';
        if (err) msg += ' (' + esc(err) + ')';
        tLines.push('<div>' + msg + '</div>');
        return;
      }
      var val = fmt ? esc(fmt) : '—';
      var rel = synced ? relTime(synced, nowMs) : null;
      if (fmt && rel) val += ' · ' + esc(rel);
      tLines.push('<div>TRAQO · ' + esc(name) + ' · synced ' + val + '</div>');
    });

    if (!lines.length && !tLines.length) return '';
    return '<div class="cg-ais-foot">' + lines.join('') + tLines.join('') + '</div>';
  }

  /* [17차] 상단 요약 바(.lane)에 붙는 호주 줄. 호주(시드니) 선적이 없으면 ''.
     <break>(한 줄 바꿈) + 6칸: CARRIER · POL · REFRESH · POD · BOOKINGS · EARLIEST ARRIVAL.
     각 칸은 data-cg-lane 속성을 달아 다시 그릴 때 쉽게 걷어낸다.
     - CARRIER: 선적들의 carrier 를 대문자·중복 제거해 ' / ' 로 잇는다(없으면 —)
     - REFRESH: 항상 '2× / DAY' (Traqo 12시간 주기)
     - BOOKINGS: 호주 선적 수
     - EARLIEST ARRIVAL: eta 중 가장 이른 날짜(fmtDay), 없으면 — */
  function auLaneModel(aisJson) {
    var plans = (aisJson && aisJson.plans && typeof aisJson.plans === 'object') ? aisJson.plans : {};
    var carriers = [], n = 0, traqoOn = false, earliest = null;
    Object.keys(plans).forEach(function (k) {
      var p = plans[k];
      if (!p || typeof p !== 'object') return;
      if (String(p.pod == null ? '' : p.pod).toUpperCase().indexOf('SYDNEY') === -1) return;
      n++;
      var c = String(p.carrier == null ? '' : p.carrier).trim().toUpperCase();
      if (c && carriers.indexOf(c) === -1) carriers.push(c);
      if (p.traqo === true || (p.traqo && p.traqo.enabled === true)) traqoOn = true;
      var e = (typeof p.eta === 'string' && /^\d{4}-\d{2}-\d{2}/.test(p.eta)) ? p.eta.slice(0, 10) : null;
      if (e && (earliest === null || e < earliest)) earliest = e;
    });
    if (!n) return null;
    return {
      carrier: carriers.length ? carriers.join(' / ') : '—',
      pol: 'PORT KLANG',
      refresh: '2× / DAY',
      pod: 'SYDNEY',
      bookings: n,
      earliest: earliest ? fmtDay(earliest) : null
    };
  }

  function auLaneHtml(aisJson) {
    var m = auLaneModel(aisJson);
    if (!m) return '';
    function cell(label, value) {
      return '<div data-cg-lane="1">' + label + '<b>' + esc(value) + '</b></div>';
    }
    return '<div data-cg-lane="1" style="flex-basis:100%;height:0;margin:0;padding:0"></div>'
      + cell('CARRIER', m.carrier)
      + cell('POL', m.pol)
      + cell('REFRESH', m.refresh)
      + cell('POD', m.pod)
      + cell('BOOKINGS', String(m.bookings))
      + cell('EARLIEST ARRIVAL', m.earliest == null ? '—' : m.earliest);
  }

  /* 하단 알림: note 가 있는 행마다 한 줄 "⚠ <VESSEL> <VOYAGE> — <note>".
     모든 값은 이스케이프. 행이 없거나 note 가 없으면 빈 문자열. */
  function auNotes(rows) {
    var list = Array.isArray(rows) ? rows : [];
    var lines = [];
    list.forEach(function (r) {
      r = r || {};
      var note = r.note != null ? String(r.note) : '';
      if (!note) return;
      lines.push('<div class="cu-note-line">⚠ ' + esc(r.vessel) + ' ' + esc(r.voyage)
        + ' — ' + esc(note) + '</div>');
    });
    if (!lines.length) return '';
    return '<div class="cu-notes"><div class="cu-notes-head">NOTES</div>' + lines.join('') + '</div>';
  }

  /* 국가 제목줄(<색 점> NAME  경로 · N건) + 카드(innerHtml) + 선택적 상단 블록(topHtml).
     topHtml 은 제목줄과 카드 사이(호주 LIST 진행도 용)에 들어간다.
     11B: 호주 그룹 제목줄 오른쪽 끝(건수 문구 옆)에 관리자용 ADMIN 태그 + ADD 버튼을
     붙인다(USA 제목줄은 변경 없음). 표시 여부는 CSS — html[data-cg-admin="1"] 일 때만.
     12차: extraClass(문자열, 생략 가능)를 섹션 클래스에 더한다
     (빈 호주 그룹의 cg-group-empty 용 — 미지정이면 기존 출력과 완전히 같다). */
  function renderGroup(key, count, innerHtml, topHtml, extraClass) {
    var c = COUNTRIES[key] || { key: key, name: String(key), color: '#8AA4B5', route: '' };
    var n = (typeof count === 'number' && isFinite(count)) ? count : 0;
    var extra = (typeof extraClass === 'string') ? esc(extraClass) : '';
    var adminBits = key === 'au'
      ? '<span class="cg-admin-tag">ADMIN</span>'
        + '<button type="button" class="cg-add" data-cg-action="add-au">+ ADD AUSTRALIA SHIPMENT</button>'
      : '';
    return '<section class="cg-root cg-group' + (extra ? ' ' + extra : '') + '">'
      + '<header class="cg-group-head">'
      +   '<span class="cg-dot" style="background:' + safeColor(c.color) + '"></span>'
      +   '<span class="cg-group-name">' + esc(c.name) + '</span>'
      +   '<span class="cg-group-route">' + esc(c.route) + '</span>'
      +   '<span class="cg-count">· ' + n + (n === 1 ? ' shipment' : ' shipments') + '</span>'
      +   adminBits
      + '</header>'
      + (topHtml == null ? '' : String(topHtml))
      + '<div class="cg-card">' + (innerHtml == null ? '' : String(innerHtml)) + '</div>'
      + '</section>';
  }

  /* 데이터가 한 번도 없던 국가의 빈 상태 안내 */
  function renderEmpty(key) {
    var c = COUNTRIES[key] || { name: String(key) };
    return '<div class="cg-empty">'
      + 'No ' + esc(c.name) + ' shipments yet. A table will appear here once data arrives.'
      + '</div>';
  }

  /* [12차] 선적 0건인 빈 호주 그룹 — 제목줄 + ADD 버튼 + 빈 상태 카드.
     관리자만 보이게 해야 하므로 섹션에 cg-group-empty 를 준다
     (CSS: 기본 display:none, html[data-cg-admin="1"] 일 때만 block —
      일반 사용자 화면은 이전과 똑같이 비어 보인다).
     ADMIN 태그·버튼(data-cg-action="add-au")은 renderGroup('au',…) 이
     원래 붙이는 것 그대로이고, 클릭 처리는 country-form.js 의
     문서 레벨 위임이 받는다(그 파일은 여기서 건드리지 않는다). */
  function auEmptyGroup() {
    var card = '<div class="cg-empty">'
      + esc('No Australia shipments yet. Use "+ ADD AUSTRALIA SHIPMENT" to register one.')
      + '</div>';
    return renderGroup('au', 0, card, '', 'cg-group-empty');
  }

  /* ───────────────────────── 공개 API ───────────────────────── */

  return {
    COUNTRIES: COUNTRIES,
    visible: visible,
    renderBar: renderBar,
    auRows: auRows,
    renderAuTable: renderAuTable,
    auNotes: auNotes,
    auPhase: auPhase,
    auLaneModel: auLaneModel,
    auLaneHtml: auLaneHtml,
    fmtDay: fmtDay,
    renderGroup: renderGroup,
    renderEmpty: renderEmpty,
    auEmptyGroup: auEmptyGroup
  };
});
