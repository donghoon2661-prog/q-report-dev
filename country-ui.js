/* ═════════════════════════════════════════════════════════════════
 * country-ui.js — 국가 필터 버튼 + 호주(AIS) 레이어 통합 로직
 *
 * - SPEC.md 3절 구현. 기존 USA 표/요약/카드 렌더링은 건드리지 않는다.
 * - [6차 지시서] 필터는 탭별로 따로 둔다: state.filterMap / state.filterList
 *   (MAP=#cbar-map, LIST=#cbar-list 가 각자의 값을 가진다. 시작값은 둘 다 'all')
 * - [12차] 호주 0건 → auContentFor 가 빈 호주 그룹(제목줄 + ADD 버튼 + 빈 상태
 *   카드, auEmptyGroup — CSS 로 관리자에게만 표시)을 그린다. 'au' 필터 0건에는
 *   기존 renderEmpty('au') 를 cg-empty-public 으로 감싸 함께 넣는다
 *   (관리자 화면에서는 CSS 로 안내만 숨긴다).
 * - [14차] 선적 블록에 MOVES 구역(traqo.events 날짜 오름차순, locode 현지 시각,
 *   예정 이벤트는 뒤에 ' (scheduled)')을 더하고, traqo.containers 번호를
 *   CONTAINERS 줄에 중복 없이 합친다. traqo.inherited 면 MOVES 없이
 *   'Schedule follows <원본>' 한 줄.
 * - 전역 노출: window.CountryUI (브라우저) / module.exports (Node)
 *   + window.onMapReady (work/map.js 의 initMap 이 호출)
 * - 의존: ais-layer.js (window.AisLayer), country-groups.js
 *   (window.CountryGroups) — 없으면 해당 기능만 조용히 건너뛴다.
 * - 런타임 전역(API_ROOT, L, map, THEME, setView, CUR)은 이 파일이
 *   정의하지 않고 typeof 로 방어해서 읽기만 한다.
 * ═════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.CountryUI = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ───────────────────────── 내부 유틸 ───────────────────────── */

  /* HTML 이스케이프 (& < > " ') — XSS 방지 */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function isNum(v) { return typeof v === 'number' && isFinite(v); }

  /* 전역 모듈 참조 (브라우저 전역 또는 Node require 폴백) */
  function getAisLayer() {
    if (typeof self !== 'undefined' && self && self.AisLayer) return self.AisLayer;
    if (typeof global !== 'undefined' && global && global.AisLayer) return global.AisLayer;
    if (typeof require === 'function') {
      try { return require('./ais-layer.js'); } catch (e) { /* 없으면 null */ }
    }
    return null;
  }

  function getCountryGroups() {
    if (typeof self !== 'undefined' && self && self.CountryGroups) return self.CountryGroups;
    if (typeof global !== 'undefined' && global && global.CountryGroups) return global.CountryGroups;
    if (typeof require === 'function') {
      try { return require('./country-groups.js'); } catch (e) { /* 없으면 null */ }
    }
    return null;
  }

  /* 'YYYY-MM-DD' 또는 'YYYY-MM-DDTHH:MM' → 'Oct/12' 또는 'Oct/12 07:00'.
     country-groups.js 의 fmtDay 와 같은 규칙(모듈 간 의존을 피하려고 복사).
     월은 영문 3글자, 시각은 입력값 그대로(시간대 변환 없음). 못 읽으면 null */
  var MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

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
      out += ' ' + m[4] + ':' + m[5];
    }
    return out;
  }

  /* ──────────────── 14차: Traqo 현지 시각 (MOVES 줄용) ────────────────
     country-groups.js 의 fmtLocal 과 같은 규칙(모듈 간 의존을 피하려고 복사).
     ISO → "Oct/07 04:21" locode 현지 시각(MYPKG → Asia/Kuala_Lumpur,
     AUSYD → Australia/Sydney). 모르는 locode 는 UTC 로 두고 "Oct/06 20:21 UTC"
     처럼 접미사를 붙인다. 읽을 수 없는 값은 null. */
  var TZ_BY_LOCODE = {
    MYPKG: 'Asia/Kuala_Lumpur',
    AUSYD: 'Australia/Sydney'
  };

  function monthAbbr(s) {
    var m = String(s == null ? '' : s).slice(0, 3);
    return m.charAt(0).toUpperCase() + m.slice(1).toLowerCase();
  }

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

  /* ───────────────────────── 상태 ───────────────────────── */

  /* [6차 지시서] 필터는 MAP(#cbar-map) 과 LIST(#cbar-list) 가 각자 가진다.
     시작값은 둘 다 'all'. 구 state.filter 는 두 탭이 공유하던 값이라 제거했다. */
  var state = { filterMap: 'all', filterList: 'all' };
  var ais = null;                  /* 최근 GET /ais 응답 */
  var inited = false;

  /* 지도 관련 — window.onMapReady 를 통해 채워진다 */
  var mapCtl = { map: null, usaGroup: null, controller: null };
  var themeObserver = null;

  var REFRESH_MS = 5 * 60 * 1000;  /* /ais 재요청 주기 (5분) */

  /* [6차 지시서] USA 숨김 대상을 MAP 용 / LIST 용 두 목록으로 나눈다.
     각 목록은 그 탭 필터의 visibilityFor(...).usa === false('au') 일 때 cu-hide. */
  var MAP_USA_HIDE_IDS = ['usa-head-map', 'vtable', 'vremark'];
  var LIST_USA_HIDE_IDS = ['overview', 'usa-head-list', 'otable', 'oremark', 'cardlist'];
  /* 호주 영역은 반대로 그 탭 필터의 visibilityFor(...).au === false('usa') 일 때 cu-hide */
  var MAP_AU_HIDE_IDS = ['au-map', 'cu-notes-map'];
  var LIST_AU_HIDE_IDS = ['au-list', 'cu-notes-list'];

  /* ─────────────────────── 순수 함수 (Node 테스트용) ─────────────────────── */

  /* filter('all'|'usa'|'au') → 국가별 표시 여부. 알 수 없는 값('kr' 포함)은 'all' 취급. */
  function visibilityFor(filter) {
    if (filter === 'usa') return { usa: true,  au: false };
    if (filter === 'au')  return { usa: false, au: true  };
    return { usa: true, au: true }; /* 'all' 및 알 수 없는 값 */
  }

  /* [6차 지시서] 탭('map'|'list') + 해당 탭 필터 → cu-hide 할 요소 id 배열.
     USA 블록은 vis.usa 가 false('au' 필터)일 때, 호주 영역은 vis.au 가
     false('usa' 필터)일 때 숨긴다. 'all'(및 알 수 없는 값)은 하나도 숨기지 않는다. */
  function hideIdsFor(tab, filter) {
    var vis = visibilityFor(filter);
    var isMap = tab === 'map';
    var out = [];
    if (!vis.usa) out = out.concat(isMap ? MAP_USA_HIDE_IDS : LIST_USA_HIDE_IDS);
    if (!vis.au) out = out.concat(isMap ? MAP_AU_HIDE_IDS : LIST_AU_HIDE_IDS);
    return out;
  }

  /* 탭별 전체 후보 id — 숨김 해제(cu-hide 제거) 대상 전부 */
  var TAB_ALL_IDS = {
    map: MAP_USA_HIDE_IDS.concat(MAP_AU_HIDE_IDS),
    list: LIST_USA_HIDE_IDS.concat(LIST_AU_HIDE_IDS)
  };

  /* AisLayer.ROUTE 의 [lat,lng] 배열 (없으면 []) */
  function routePoints() {
    var AL = getAisLayer();
    if (!AL || !Array.isArray(AL.ROUTE)) return [];
    return AL.ROUTE.filter(function (p) { return Array.isArray(p) && isNum(p[0]) && isNum(p[1]); });
  }

  function validPoint(p) { return Array.isArray(p) && isNum(p[0]) && isNum(p[1]); }

  /* fitBounds 에 쓸 [lat,lng] 배열만 계산한다(DOM/지도 접근 없음).
     all → ROUTE + usaPoints, usa → usaPoints, au → ROUTE
     (all 과 알 수 없는 값은 visibilityFor 기준으로 usa/au 를 합친다) */
  function boundsPoints(filter, usaPoints) {
    var vis = visibilityFor(filter);
    var out = [];
    if (vis.usa) {
      var usa = Array.isArray(usaPoints) ? usaPoints : [];
      out = out.concat(usa.filter(validPoint));
    }
    if (vis.au) out = out.concat(routePoints());
    return out;
  }

  /* 호주 표 HTML(그룹 제목줄 포함)만 만들어 돌려준다. DOM 접근 없음.
     opts.overview === true 이면 제목줄과 표 카드 사이에 호주 진행도(.cu-overview)를 넣는다.
     반환: { auCount: 행 수, auHtml: 0건이면 '' , 아니면 renderGroup('au',…) HTML }
     [12차] 0건일 때의 빈 호주 그룹(관리자 전용)은 auContentFor 가 붙인다. */
  function buildAuLists(aisJson, nowMs, opts) {
    var o = opts || {};
    var CG = getCountryGroups();
    var AL = getAisLayer();
    var rows = (CG && typeof CG.auRows === 'function') ? CG.auRows(aisJson) : [];
    var count = rows.length;
    var html = '';
    if (count > 0 && CG && typeof CG.renderGroup === 'function' &&
        typeof CG.renderAuTable === 'function') {
      var topHtml = '';
      if (o.overview && AL && typeof AL.buildModels === 'function') {
        var models = AL.buildModels(aisJson).filter(function (m) {
          return m && m.pod != null && String(m.pod).toUpperCase().indexOf('SYDNEY') !== -1;
        });
        topHtml = overviewHtml(models, nowMs);
      }
      html = CG.renderGroup('au', count, CG.renderAuTable(rows, nowMs), topHtml);
    }
    return { auCount: count, auHtml: html };
  }

  /* [2차 수정·버그 1] 필터별 호주 영역 내용을 만드는 순수 함수(DOM 접근 없음).
     renderAuLists() 는 이 결과를 #au-map/#au-list 에 넣는다.
     - all: 호주 표 그룹 HTML, 행이 0건이면 빈 호주 그룹 [12차]
     - au: 호주 표 그룹 HTML, 행이 0건이면 빈 호주 그룹 + renderEmpty('au')
       (공개 안내는 cg-empty-public 으로 감싼다 — 관리자 화면에선 CSS 로 숨김) [12차]
     - usa: 빈 문자열(호주 표 숨김) — visibilityFor(filter).au === false
     - 알 수 없는 값(Korea 제거 후 남은 'kr' 등)은 all 취급
     - opts.overview === true: 제목줄 → 진행도 → 표 카드 순서(3차 지시서, LIST 전용) */
  function auContentFor(filter, aisJson, nowMs, opts) {
    var o = opts || {};
    var vis = visibilityFor(filter);
    var CG = getCountryGroups();
    var lists = buildAuLists(aisJson, nowMs, o);

    function emptyOf(key) {
      return (CG && typeof CG.renderEmpty === 'function') ? CG.renderEmpty(key) : '';
    }

    if (!vis.au) return '';
    if (lists.auCount > 0) return lists.auHtml;

    /* [12차] 0건: 빈 호주 그룹(제목줄 + ADD 버튼 + 빈 상태 카드)을 그린다.
       그룹은 cg-group-empty(CSS 기본 숨김 — html[data-cg-admin="1"] 일 때만 표시)
       이므로 일반 사용자 화면은 이전과 똑같이 비어 보인다. 'au' 필터면 기존 안내
       (renderEmpty('au'))를 cg-empty-public 으로 감싸 함께 넣어 일반 사용자에게
       계속 보이게 하고, 관리자가 빈 그룹을 볼 때는 CSS 로 공개 안내를 숨긴다. */
    var emptyGroup = (CG && typeof CG.auEmptyGroup === 'function') ? CG.auEmptyGroup() : '';
    var publicWrap = '';
    if (filter === 'au') {
      var notice = emptyOf('au');
      if (notice) publicWrap = '<div class="cg-empty-public">' + notice + '</div>';
    }
    return emptyGroup + publicWrap;
  }

  /* ───────────────── 호주 진행도 (LIST 전용, 3차 지시서 3절) ─────────────────
     USA 진행도(ref/overview-ref.txt 의 buildOverview)와 같은 시각 구조·클래스를
     문자열로 만든다. DOM 접근 없음, 층 배치 없이 한 층(top 0)에 고정.
     [9차 지시서] 반출·반납 단계가 없어 레일은 PORT KLANG(0%) → SYDNEY(100%)
     하나의 구간. transit x = frac×100%, arrived(BERTHED) = 100%. */
  var OV_DOT_Y = 115, OV_LINE_H = 17, OV_SHOW = 3;

  function ovDataB(m) {
    return (m.booking != null && m.booking !== '') ? String(m.booking)
         : (m.mbl != null ? String(m.mbl) : '');
  }

  /* [17차] 중간 기항지(멜버른) 눈금 — 항로(ROUTE)상 가장 가까운 지점의 진행 비율에 작은 점 + 이름.
     AisLayer 가 PORTS.melbourne 과 routeProgress 를 줄 때만 그린다. */
  function viaTick(AL) {
    try {
      var p = AL && AL.PORTS && AL.PORTS.melbourne;
      if (!p || typeof AL.routeProgress !== 'function') return '';
      var rp = AL.routeProgress(p.latlng[0], p.latlng[1]);
      if (!rp || typeof rp.frac !== 'number' || !isFinite(rp.frac)) return '';
      var x = Math.max(2, Math.min(98, rp.frac * 100));
      return '<div class="cap via" style="left:' + x + '%"></div>'
        + '<div class="cap-lb via" style="left:' + x + '%">' + esc(p.name) + '</div>';
    } catch (e) { return ''; }
  }

  function overviewHtml(models, nowMs) {
    var AL = getAisLayer();
    if (!AL || typeof AL.stageOf !== 'function') return '';
    var list = Array.isArray(models) ? models : [];

    var booked = [], marks0 = [];
    list.forEach(function (m) {
      m = m || {};
      var st = AL.stageOf(m);
      if (st.stage === 'booked') { booked.push(m); return; } /* 선 위에 찍지 않는다 */
      if (st.stage === 'arrived') {
        marks0.push({ m: m, x: 100, cls: 's-berth', sub: 'BERTHED' });
        return;
      }
      var frac = (typeof st.frac === 'number' && isFinite(st.frac)) ? st.frac : 0;
      marks0.push({ m: m, x: frac * 100, cls: '', sub: Math.round(frac * 100) + '%' });
    });

    /* 가까운 점(해상 3% 이내)은 한 줄기로 묶고 이름을 위아래로 쌓는다.
       도착(s-berth) 점은 같은 단계 지점끼리만 묶는다. */
    marks0.sort(function (a, b) { return a.x - b.x; });
    var clusters = [];
    marks0.forEach(function (mk) {
      var c = clusters[clusters.length - 1];
      var sea = !mk.cls;
      var same = c && (sea ? !c.items[0].cls && (mk.x - c.x) < 3
                           : !!c.items[0].cls && c.x === mk.x);
      if (same) c.items.push(mk);
      else clusters.push({ x: mk.x, items: [mk] });
    });

    var marks = clusters.map(function (c) {
      var shown = c.items.slice(0, OV_SHOW);
      var more = c.items.length - shown.length;
      var lines = shown.map(function (mk) {
        return '<div class="ol" data-b="' + esc(ovDataB(mk.m)) + '">' + esc(mk.m.name || '')
          + '<span class="pc ' + mk.cls + '">' + esc(mk.sub) + '</span></div>';
      }).join('')
        + (more ? '<div class="ol-more">+' + more + ' more</div>' : '');
      var n = shown.length + (more ? 1 : 0);
      var stem = Math.max(8, OV_DOT_Y - n * OV_LINE_H);
      var x = Math.max(0, Math.min(100, c.x));
      var edge = x < 8 ? ' edge-l' : (x > 92 ? ' edge-r' : '');
      return '<div class="ov' + edge + '" style="left:' + x + '%;top:0px">' + lines
        + '<div class="stem" style="height:' + stem + 'px"></div>'
        + '<div class="dot ' + c.items[0].cls + '"></div>'
        + (c.items.length > 1 ? '<span class="ov-n">×' + c.items.length + '</span>' : '')
        + '</div>';
    }).join('');

    var transit = 0, atSyd = 0;
    marks0.forEach(function (mk) { if (mk.cls) atSyd++; else transit++; });

    /* BOOKED 상자(위치 없음) — 같은 선박·항차는 ×N 으로 합쳐 이름만 나열.
       [4차 수정] models 는 buildModels 결과이므로 이름 필드는 name 이다. */
    var bkMerged = [];
    booked.forEach(function (m) {
      var hit = null;
      for (var i = 0; i < bkMerged.length; i++) {
        if (bkMerged[i].name === (m.name || '') && bkMerged[i].voyage === (m.voyage || '')) { hit = bkMerged[i]; break; }
      }
      if (hit) hit.n++;
      else bkMerged.push({ name: m.name || '', voyage: m.voyage || '', b: ovDataB(m), n: 1 });
    });
    var bookedBox = booked.length
      ? '<div class="obooked"><b>BOOKED · ' + booked.length + '</b>'
        + bkMerged.map(function (o) {
            return '<span class="ol" data-b="' + esc(o.b) + '">' + esc(o.name)
              + (o.n > 1 ? ' ×' + o.n : '') + '</span>';
          }).join(' · ')
        + '</div>'
      : '';

    var sub = 'In transit ' + transit + ' · At Sydney ' + atSyd
      + (booked.length ? ' · Booked ' + booked.length : '')
      + ' · of ' + list.length;

    return '<div class="cu-overview">'
      + '<h2>ALL SHIPMENTS · PORT KLANG → SYDNEY</h2>'
      + '<div class="sub">' + esc(sub) + '</div>'
      + bookedBox
      + '<div class="orail">'
      +   '<div class="base"></div>'
      +   '<div class="cap" style="left:0"></div><div class="cap-lb l" style="left:0">PORT KLANG</div>'
      +   '<div class="cap" style="left:100%"></div><div class="cap-lb r" style="left:100%"><span class="full">SYDNEY</span><span class="short">SYD</span></div>'
      +   viaTick(AL)
      +   marks
      + '</div></div>';
  }

  /* [13차] 선적 한 개(블록)의 BOOKING 줄 — 부킹이 있을 때만 부킹 번호만.
     없으면 null(BOOKING 줄 생략). 컨테이너 번호는 CONTAINERS 줄로 옮겨졌다. */
  function bookingDd(s) {
    var m = s || {};
    var b = (m.booking != null && m.booking !== '') ? String(m.booking) : '';
    return b ? esc(b) : null;
  }

  /* [13차] 선적 한 개(블록)의 CONTAINERS 줄 — 'N CNTR' + 번호가 있으면 ' · 번호, …'.
     N 은 모델의 cntrQty(번호를 모르면 번호 개수). 대수·번호 둘 다 없으면 null(줄 생략).
     컨테이너 번호는 상세 패널에만 나온다(표에는 없음).
     [14차] traqo.containers 의 번호도(있으면) 뒤에 중복 없이 합친다
     (inherited 는 containers 자체가 없으므로 영향 없다). */
  function containersDd(s) {
    var m = s || {};
    var conts = [];
    var raw = (m.container != null && m.container !== '') ? String(m.container).split(',') : [];
    for (var i = 0; i < raw.length; i++) {
      var t = raw[i].trim();
      if (t) conts.push(t);
    }
    var tq = m.traqo;
    if (tq && typeof tq === 'object' && tq.inherited !== true && Array.isArray(tq.containers)) {
      tq.containers.forEach(function (c) {
        var n = (c && c.number != null) ? String(c.number).trim() : '';
        if (n && conts.indexOf(n) === -1) conts.push(n);
      });
    }
    var qty = (typeof m.cntrQty === 'number' && isFinite(m.cntrQty) &&
               m.cntrQty % 1 === 0 && m.cntrQty >= 1)
      ? m.cntrQty
      : (conts.length ? conts.length : null);
    if (qty == null && !conts.length) return null;
    var bits = [];
    if (qty != null) bits.push(qty + ' CNTR');
    if (conts.length) bits.push(conts.join(', '));
    return esc(bits.join(' · '));
  }

  /* [14차] 선적 한 개(블록)의 MOVES 구역 — traqo.events 를 날짜 오름차순으로
     한 줄씩: 'Oct/07 04:21 · Gate in at origin yard · MYPKG · TEST1234567'
     (date · description · locode · container 순서, 없는 조각은 생략, 모두
     이스케이프 — 현지 시각은 fmtLocal 규칙). isActual 이 거짓이면 줄 뒤에
     ' (scheduled)'. 날짜를 읽을 수 없는 이벤트는 뺀다. 이벤트가 없으면
     구역 자체를 생략. traqo.inherited 면 MOVES 대신 한 줄
     'Schedule follows <원본(traqo.from)>'. */
  function movesBlockHtml(s) {
    var tq = s ? s.traqo : null;
    if (!tq || typeof tq !== 'object') return '';
    if (tq.inherited === true) {
      var from = (tq.from != null && tq.from !== '') ? String(tq.from) : '';
      if (!from) return ''; /* 표기할 원본이 없으면 줄을 만들지 않는다 */
      return '<dt>SCHEDULE</dt><dd>Schedule follows ' + esc(from) + '</dd>';
    }
    var items = [];
    (Array.isArray(tq.events) ? tq.events : []).forEach(function (ev) {
      if (!ev || typeof ev !== 'object') return;
      var f = fmtLocal(ev.date, ev.locode);
      if (!f) return;
      var bits = [f];
      if (ev.description != null && String(ev.description) !== '') {
        bits.push(esc(String(ev.description)));
      }
      if (ev.locode != null && String(ev.locode) !== '') {
        bits.push(esc(String(ev.locode)));
      }
      if (ev.container != null && String(ev.container) !== '') {
        bits.push(esc(String(ev.container)));
      }
      var line = bits.join(' · ');
      if (ev.isActual !== true) line += ' (scheduled)';
      items.push({ t: Date.parse(ev.date), line: line });
    });
    items.sort(function (a, b) { return a.t - b.t; }); /* 날짜 오름차순 */
    if (!items.length) return '';
    var lines = items.map(function (x) { return x.line; }).join('<br>');
    return '<dt>MOVES</dt><dd>' + lines + '</dd>';
  }

  /* [13차] 선적 한 개(블록) — BOOKING(부킹 있을 때만) / CONTAINERS / PO 줄.
     [14차] traqo 가 있으면 뒤에 MOVES 구역(또는 inherited 한 줄)을 더한다. */
  function shipmentBlockHtml(s) {
    var out = '';
    var b = bookingDd(s);
    if (b != null) out += '<dt>BOOKING</dt><dd>' + b + '</dd>';
    var c = containersDd(s);
    if (c != null) out += '<dt>CONTAINERS</dt><dd>' + c + '</dd>';
    out += poDd(s);
    out += movesBlockHtml(s);
    return out;
  }

  function poDd(s) {
    var po = (s && Array.isArray(s.po)) ? s.po : [];
    if (!po.length) return '';
    return '<dt>PO</dt><dd>' + esc(po.join(', ')) + '</dd>';
  }

  /* 호주 선박 상세 HTML (문자열 생성만, DOM 접근 없음).
     [11A] detailHtml(modelOrGroup):
     - 11B 가 마커 클릭 때 넘기는 그룹 객체(shipments 배열 포함, 그룹 최상위에
       기존 모델 필드가 복사돼 있음)면 sb 줄은 선박·항차만 두고 선적마다
       BOOKING·PO 블록을 한 개씩 넣는다.
     - shipments 가 없으면(단일 모델) 기존처럼 + BOOKING·PO 줄을 추가한다.
     - 항목: MBL / ETD PKG / SYD ETB / SYD ETA / LAST DATA / SPEED /
       TO PORT KLANG / AIS DEST / NOTE (기존 줄 유지)
     - [13차] 선적 블록은 BOOKING(부킹 있을 때만, 없으면 줄 생략) /
       CONTAINERS(N CNTR + 번호 — 번호는 상세 패널에만 남는다) / PO 줄.
     - 상태 단어는 쓰지 않는다. 모든 값은 HTML 이스케이프. */
  function detailHtml(modelOrGroup) {
    var AL = getAisLayer();
    var m = modelOrGroup || {};
    var list = Array.isArray(m.shipments) ? m.shipments : null;

    var name = esc(m.name || '');
    var title = m.voyage ? name + ' ' + esc(m.voyage) : name;
    var html = '<h3>' + title + '</h3>';

    if (list) {
      /* 그룹: sb 줄은 선박·항차만 두고, 선적마다 BOOKING·PO 블록 */
      html += '<div class="sb">' + (name || '—')
        + (m.voyage ? ' · ' + esc(m.voyage) : '') + '</div>'
        + '<dl>';
      for (var i = 0; i < list.length; i++) {
        html += shipmentBlockHtml(list[i]);
      }
    } else {
      html += '<div class="sb">' + esc(m.booking || '—') + ' · ' + esc(m.container || '—')
        + ' · 1 CNTR</div>'
        + '<dl>'
        /* 단일 모델: 기존 출력 + BOOKING/CONTAINERS/PO 블록 */
        + shipmentBlockHtml(m);
    }

    /* MBL: 표에서는 빠지고 상세 패널에만 남는다 */
    html += '<dt>MBL</dt><dd>' + esc(m.mbl || '—') + '</dd>';

    /* ETD PKG: 날짜+시각 형식 + 출처 */
    var etdText = fmtDay(m.etd) || (m.etd ? esc(m.etd) : '—');
    html += '<dt>ETD PKG</dt><dd>' + etdText
      + (m.source ? ' (' + esc(m.source) + ')' : '') + '</dd>';

    /* SYD ETB: 날짜+시각 형식 (없으면 —) */
    html += '<dt>SYD ETB</dt><dd>' + (fmtDay(m.etb) || (m.etb ? esc(m.etb) : '—')) + '</dd>';

    /* SYD ETA: 날짜+시각 형식 + podTerminal */
    var etaText = fmtDay(m.eta) || (m.eta ? esc(m.eta) : '—');
    html += '<dt>SYD ETA</dt><dd>' + etaText
      + (m.podTerminal ? ' (' + esc(m.podTerminal) + ')' : '') + '</dd>';

    /* LAST DATA: AisLayer.formatLast (없으면 '—') */
    var last = '—';
    if (AL && typeof AL.formatLast === 'function') last = AL.formatLast(m.lastDataIso);
    html += '<dt>LAST DATA</dt><dd>' + esc(last) + '</dd>';

    /* SPEED: sog kn, 방향 cog° — 있을 때만 */
    if (isNum(m.sog) || isNum(m.cog)) {
      var speed = [];
      if (isNum(m.sog)) speed.push(m.sog + ' kn');
      if (isNum(m.cog)) speed.push(m.cog + '°');
      html += '<dt>SPEED</dt><dd>' + esc(speed.join(' / ')) + '</dd>';
    }

    /* TO PORT KLANG: distPklNm nm — 있을 때만 */
    if (isNum(m.distPklNm)) {
      html += '<dt>TO PORT KLANG</dt><dd>' + esc(m.distPklNm + ' nm') + '</dd>';
    }

    /* AIS DEST: destination + (reference only) — 있을 때만 */
    if (m.destination != null && m.destination !== '') {
      html += '<dt>AIS DEST</dt><dd>' + esc(m.destination) + ' (reference only)</dd>';
    }

    /* NOTE: note 가 있으면 ⚠ 와 함께 */
    if (m.note != null && m.note !== '') {
      html += '<dt>NOTE</dt><dd>⚠ ' + esc(m.note) + '</dd>';
    }

    html += '</dl>';
    return html;
  }

  /* ─────────────────────── DOM 로직 (브라우저) ─────────────────────── */

  function byId(id) { return typeof document !== 'undefined' ? document.getElementById(id) : null; }

  /* 필터 바 2개(지도 위 / 목록 위)를 각자의 상태로 다시 그린다.
     [6차 지시서] renderBar 는 state.filter 를 읽으므로 막대마다
     { filter: 해당 탭 값 } 을 새로 만들어 넘긴다. */
  function renderBars() {
    var CG = getCountryGroups();
    if (!CG || typeof CG.renderBar !== 'function') return;
    var a = byId('cbar-map');
    var b = byId('cbar-list');
    if (a) CG.renderBar(a, { filter: state.filterMap }, onFilterMap);
    if (b) CG.renderBar(b, { filter: state.filterList }, onFilterList);
  }

  /* USA 제목줄(.cg-group-head)만 #usa-head-* 에 넣는다. 기존 표는 건드리지 않는다. */
  function renderUsaHeads() {
    var CG = getCountryGroups();
    if (!CG || typeof CG.renderGroup !== 'function') return;
    var count = (typeof CUR !== 'undefined' && CUR && CUR.shipments) ? CUR.shipments.length : 0;
    var full = CG.renderGroup('usa', count, '');
    var m = /<header class="cg-group-head">[\s\S]*?<\/header>/.exec(full);
    var head = m ? m[0] : full;
    var a = byId('usa-head-map');
    var b = byId('usa-head-list');
    if (a) a.innerHTML = head;
    if (b) b.innerHTML = head;
  }

  /* #au-map / #au-list 내용 갱신 — [2차 수정·버그 1]
     visibilityFor 를 반영한 auContentFor 의 결과를 그대로 넣는다.
     [3차 지시서 3절] LIST 쪽(#au-list)만 진행도를 포함한다(MAP 쪽은 제목줄+표).
     [3차 지시서 4절] 알림(auNotes)은 표 영역 뒤의 #cu-notes-map/#cu-notes-list 에 넣는다.
     [6차 지시서] #au-map/#cu-notes-map 은 filterMap 으로, #au-list/#cu-notes-list 는
     filterList 로 각각 auContentFor 를 따로 계산한다. */
  function renderAuLists() {
    var now = Date.now();
    var contentMap = auContentFor(state.filterMap, ais, now);
    var contentList = auContentFor(state.filterList, ais, now, { overview: true });
    var a = byId('au-map');
    var b = byId('au-list');
    if (a) a.innerHTML = contentMap;
    if (b) b.innerHTML = contentList;
    renderAuNotes();
    renderAuLane();
    /* [11A] 호주 영역을 다시 그릴 때마다 관리자 버튼 상태를 동기화한다.
       (버튼 자체는 11B 가 data-cg-action="add-au" 로 만든다) */
    if (typeof window !== 'undefined' && window.CountryForm &&
        typeof window.CountryForm.syncAdmin === 'function') {
      try { window.CountryForm.syncAdmin(); } catch (e) { /* 무시 */ }
    }
  }

  /* [17차] 상단 요약 바(.lane) 맨 뒤에 호주 줄을 붙인다(한 줄 바꿈 + 6칸).
     이미 붙은 호주 칸(data-cg-lane)은 먼저 걷어낸다. 호주 선적이 없으면 아무것도 안 붙인다. */
  function renderAuLane() {
    if (typeof document === 'undefined' || !document.querySelector) return;
    var CG = getCountryGroups();
    if (!CG || typeof CG.auLaneHtml !== 'function') return;
    var lane = document.querySelector('.lane');
    if (!lane) return;
    var old = lane.querySelectorAll ? lane.querySelectorAll('[data-cg-lane]') : [];
    for (var i = 0; i < old.length; i++) {
      if (old[i].parentNode) old[i].parentNode.removeChild(old[i]);
    }
    var html = CG.auLaneHtml(ais);
    if (html) lane.insertAdjacentHTML('beforeend', html);
  }

  /* 하단 알림 — 항상 가장 아래 표 밑에 나온다. 해당 탭 필터가 usa 면 비운다. */
  function renderAuNotes() {
    var CG = getCountryGroups();
    function notesFor(filter) {
      if (!CG || typeof CG.auNotes !== 'function' || typeof CG.auRows !== 'function') return '';
      return visibilityFor(filter).au ? CG.auNotes(CG.auRows(ais)) : '';
    }
    var a = byId('cu-notes-map');
    var b = byId('cu-notes-list');
    if (a) a.innerHTML = notesFor(state.filterMap);
    if (b) b.innerHTML = notesFor(state.filterList);
  }

  /* 탭별 표시/숨김 — style.display 대신 cu-hide 클래스만 사용.
     [6차 지시서] MAP 쪽은 filterMap, LIST 쪽은 filterList 로 따로 계산한다. */
  function applyTabVisibility(tab) {
    var filter = (tab === 'map') ? state.filterMap : state.filterList;
    var hidden = {};
    hideIdsFor(tab, filter).forEach(function (id) { hidden[id] = true; });
    TAB_ALL_IDS[tab].forEach(function (id) {
      var el = byId(id);
      if (!el) return;
      if (hidden[id]) el.classList.add('cu-hide');
      else el.classList.remove('cu-hide');
    });
  }

  function applyVisibility() {
    applyTabVisibility('map');
    applyTabVisibility('list');
  }

  /* AisLayer 컨트롤러 생성 (테마는 런타임 전역 THEME 을 읽는다) */
  function createController(map) {
    var AL = getAisLayer();
    if (!AL || typeof AL.create !== 'function' ||
        typeof L === 'undefined' || !L || typeof L.circleMarker !== 'function') return null;
    var theme = (typeof THEME !== 'undefined' && THEME === 'light') ? 'light' : 'dark';
    return AL.create(L, map, { theme: theme, onSelect: showAuDetail });
  }

  /* 컨트롤러 재생성 (지도 교체·테마 변경 시) */
  function recreateController() {
    if (!mapCtl.map) return;
    if (mapCtl.controller && typeof mapCtl.controller.destroy === 'function') {
      try { mapCtl.controller.destroy(); } catch (e) { /* 이미 제거된 경우 무시 */ }
      mapCtl.controller = null;
    }
    mapCtl.controller = createController(mapCtl.map);
    if (mapCtl.controller && ais && typeof mapCtl.controller.update === 'function') {
      try { mapCtl.controller.update(ais); } catch (e) { /* 데이터 오류는 조용히 무시 */ }
    }
  }

  /* 필터 → 지도 레이어 표시 여부 — [6차 지시서] MAP 필터(filterMap)를 쓴다 */
  function applyMapVisibility() {
    var vis = visibilityFor(state.filterMap);
    var map = mapCtl.map;

    if (mapCtl.controller && typeof mapCtl.controller.setVisible === 'function') {
      try { mapCtl.controller.setVisible(vis.au); } catch (e) { /* 무시 */ }
    }
    if (map && mapCtl.usaGroup) {
      try {
        if (vis.usa) mapCtl.usaGroup.addTo(map);
        else map.removeLayer(mapCtl.usaGroup);
      } catch (e) { /* 무시 */ }
    }
  }

  /* usaGroup 레이어에서 [lat,lng] 좌표를 수집한다 (boundsPoints 입력용) */
  function collectUsaPoints() {
    var g = mapCtl.usaGroup;
    if (!g || typeof g.getLayers !== 'function') return [];
    var pts = [];
    function pushLatLngs(list) {
      (Array.isArray(list) ? list : []).forEach(function (item) {
        if (Array.isArray(item) && isNum(item[0]) && isNum(item[1])) pts.push([item[0], item[1]]);
        else if (item && isNum(item.lat) && isNum(item.lng)) pts.push([item.lat, item.lng]);
        else if (Array.isArray(item)) pushLatLngs(item);
      });
    }
    g.getLayers().forEach(function (layer) {
      if (!layer) return;
      if (typeof layer.getLatLng === 'function') {
        var ll = layer.getLatLng();
        if (ll && isNum(ll.lat) && isNum(ll.lng)) pts.push([ll.lat, ll.lng]);
      } else if (typeof layer.getLatLngs === 'function') {
        pushLatLngs(layer.getLatLngs());
      }
    });
    return pts;
  }

  /* fitBounds — MAP 필터 변경 때만 호출한다(주기 갱신 때는 시점을 바꾸지 않는다).
     [6차 지시서] MAP 필터(filterMap)를 쓰고, LIST 필터 변경 때는 호출하지 않는다. */
  function applyFitBounds() {
    var map = mapCtl.map;
    if (!map || typeof map.fitBounds !== 'function' ||
        typeof L === 'undefined' || !L || typeof L.latLngBounds !== 'function') return;
    var pts = boundsPoints(state.filterMap, collectUsaPoints());
    if (!pts.length) return; /* 경계 점이 없으면(예: usa 만 + usaPoints 비었음) → 변경 없음 */
    try { map.fitBounds(L.latLngBounds(pts).pad(0.15)); } catch (e) { /* 무시 */ }
  }

  /* 필터 상태 갱신 — 해당 탭 값만 바꾼다(상태 변경만 하고 DOM/지도는 건드리지 않는다).
     [6차 지시서] 한 쪽 탭 필터 변경이 다른 쪽 값에 영향을 주지 않는다. */
  function setFilter(tab, key) {
    if (tab === 'map') state.filterMap = key;
    else if (tab === 'list') state.filterList = key;
    return state;
  }

  /* 필터 변경 (버튼 클릭) — MAP 막대(#cbar-map) */
  function onFilterMap(key) {
    setFilter('map', key);
    renderBars();
    renderAuLists();
    applyTabVisibility('map');
    applyMapVisibility();
    applyFitBounds();  /* fitBounds 는 MAP 필터가 바뀔 때만 호출 */
  }

  /* 필터 변경 (버튼 클릭) — LIST 막대(#cbar-list). 지도(map)는 건드리지 않는다. */
  function onFilterList(key) {
    setFilter('list', key);
    renderBars();
    renderAuLists();
    applyTabVisibility('list');
    /* [6차 지시서 6절] LIST 필터 변경 때는 지도 이동(setView/fitBounds)·레이어 변경 없음 */
  }

  /* 호주 상세 표시 (#side 내용 교체) */
  function showAuDetail(model) {
    var side = byId('side');
    if (!side) return;
    side.innerHTML = detailHtml(model);
  }

  /* 호주 표 행 클릭 → 같은 순서(인덱스)의 auRows 행을 찾고,
     그 MBL 로 buildModels 모델을 매핑해 상세를 연다. */
  function pickAuRow(idx) {
    var CG = getCountryGroups();
    var AL = getAisLayer();
    if (!ais || !CG || !AL) return;
    var rows = CG.auRows(ais);
    var row = rows[idx];
    if (!row) return;
    var models = AL.buildModels(ais);
    var model = null;
    for (var i = 0; i < models.length; i++) {
      if (String(models[i].mbl) === String(row.mbl)) { model = models[i]; break; }
    }
    if (!model) return;
    showAuDetail(model);
    if (typeof setView === 'function') {
      try { setView('map'); } catch (e) { /* 무시 */ }
    }
    if (isNum(model.lat) && isNum(model.lng) && mapCtl.map &&
        typeof mapCtl.map.panTo === 'function') {
      try { mapCtl.map.panTo([model.lat, model.lng]); } catch (e) { /* 무시 */ }
    }
  }

  /* 표 컨테이너에 클릭 위임 바인딩 (innerHTML 교체와 무관하게 1회만) */
  function bindAuRowClicks() {
    ['au-map', 'au-list'].forEach(function (id) {
      var el = byId(id);
      if (!el || el._cuBound) return;
      el._cuBound = true;
      el.addEventListener('click', function (ev) {
        var target = ev.target || ev.srcElement;
        if (!target || typeof target.closest !== 'function') return;
        var tr = target.closest('tr');
        if (!tr || !el.contains(tr)) return;
        var tbody = tr.parentNode;
        if (!tbody || (tbody.tagName || '').toUpperCase() !== 'TBODY') return;
        var trs = tbody.rows || tbody.getElementsByTagName('tr');
        var idx = -1;
        for (var i = 0; i < trs.length; i++) { if (trs[i] === tr) { idx = i; break; } }
        if (idx < 0) return;
        pickAuRow(idx);
      });
    });
  }

  /* GET /ais — GET 만 쓴다. 실패하면 조용히 무시(이전 ais 유지). */
  function fetchAis() {
    if (typeof fetch !== 'function') return;
    var base = (typeof API_ROOT === 'string') ? API_ROOT : '';
    fetch(base + '/ais', { cache: 'no-store' })
      .then(function (res) {
        if (!res || !res.ok) throw new Error('HTTP ' + (res ? res.status : '?'));
        return res.json();
      })
      .then(function (json) {
        ais = json;
        renderAuLists();  /* 표만 갱신 — 지도 시점은 바꾸지 않는다 */
        if (mapCtl.controller && typeof mapCtl.controller.update === 'function') {
          try { mapCtl.controller.update(ais); } catch (e) { /* 무시 */ }
        }
      })
      .catch(function () { /* 조용히 무시 — 콘솔 에러 없음 */ });
  }

  /* [11A] /ais 즉시 재조회(즉시 /ais 재조회 후 표·지도 갱신).
     저장 성공 후 CountryForm 이 호출한다(있을 때만). */
  function refresh() {
    fetchAis();
  }

  /* [11A] 최근 /ais 응답의 plans 객체 복사본(없으면 {})을 돌려준다.
     src 인자는 테스트용 — 생략하면 내부 최신 응답을 쓴다.
     각 plan 을 복사하고 po 배열도 잘라 주므로 외부에서 바꿔도 내부 상태가
     변하지 않는다. */
  function getPlans(src) {
    var s = (src && typeof src === 'object') ? src : ais;
    var plans = (s && s.plans && typeof s.plans === 'object') ? s.plans : {};
    var out = {};
    for (var k in plans) {
      if (!Object.prototype.hasOwnProperty.call(plans, k)) continue;
      var p = plans[k];
      if (!p || typeof p !== 'object') continue;
      var copy = {};
      for (var f in p) {
        if (Object.prototype.hasOwnProperty.call(p, f)) copy[f] = p[f];
      }
      if (Array.isArray(p.po)) copy.po = p.po.slice();
      out[k] = copy;
    }
    return out;
  }

  /* 테마(data-theme) 변경 감지 → 컨트롤러를 새 테마로 다시 만든다 */
  function watchTheme() {
    if (typeof MutationObserver === 'undefined') return;
    if (themeObserver) themeObserver.disconnect();
    themeObserver = new MutationObserver(function () {
      if (mapCtl.map) recreateController();
    });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  }

  /* ─────────────────────── 초기화 ─────────────────────── */

  function init() {
    if (inited) return;
    inited = true;

    /* map.js 가 initMap 때 호출할 훅. init 보다 늦게 지도가 만들어져도 받는다. */
    if (typeof window !== 'undefined') {
      window.onMapReady = function (map, usaGroup) {
        mapCtl.map = map;
        mapCtl.usaGroup = usaGroup;
        recreateController();
        applyMapVisibility();
        /* [2차 수정·버그 2] 지도가 만들어졌다는 것은 CUR(데이터)가 이미
           로드된 뒤라는 뜻 — 초기화 시 0건으로 굳었던 USA 제목줄 건수를 다시 계산한다. */
        renderUsaHeads();
      };

      /* [2차 수정·버그 3] country-ui.js 실행 전에 앱이 이미 initMap 을 끝냈다면
         onMapReady 호출 기회가 없어 호주 레이어가 지도에 안 붙는다.
         전역 map/usaGroup 이 이미 있으면 즉시 1회 호출한다(없으면 아무것도 안 함).
         같은 지도에 두 번 호출돼도 recreateController 가 이전 컨트롤러를
         destroy 하므로 마커가 중복되지 않는다. */
      if (typeof map !== 'undefined' && map &&
          typeof usaGroup !== 'undefined' && usaGroup) {
        try { window.onMapReady(map, usaGroup); } catch (e) { /* 조용히 무시 */ }
      }
    }

    renderBars();
    renderUsaHeads();
    renderAuLists();
    bindAuRowClicks();
    applyVisibility();
    watchTheme();
    fetchAis();
    if (typeof setInterval === 'function') setInterval(fetchAis, REFRESH_MS);
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  }

  /* ─────────────────────── 공개 API ─────────────────────── */

  return {
    state: state,
    visibilityFor: visibilityFor,
    hideIdsFor: hideIdsFor,
    setFilter: setFilter,
    detailHtml: detailHtml,
    buildAuLists: buildAuLists,
    auContentFor: auContentFor,
    overviewHtml: overviewHtml,
    boundsPoints: boundsPoints,
    showAuDetail: showAuDetail,
    refresh: refresh,
    getPlans: getPlans,
    init: init
  };
});
