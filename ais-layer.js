/* ═════════════════════════════════════════════════════════════════
 * ais-layer.js — 선박 AIS 지도 레이어 (모듈 1)
 *
 * - 포트클랑 → 시드니 예상 항로(202 좌표) + 항구 마커 + 선박(AIS) 마커를 그린다.
 * - routeProgress(lat,lng) / stageOf(model) 진행도 순수 함수 제공.
 * - 11B: buildModels 가 booking/po/scheduleInherited/scheduleFromBooking 를 채우고,
 *   groupByVessel(models) 로 같은 배(같은 MMSI, 없으면 name+voyage)의 선적을 묶는다.
 *   지도 마커는 선적마다가 아니라 배(그룹)마다 하나, 클릭 시 그룹 객체를 넘긴다.
 * - 13차: buildModels 가 cntrQty(컨테이너 대수, 정수 1~99 또는 null)도 채운다.
 *   plan.cntrQty 가 유효하면 그 값, 아니면 container 번호 개수, 둘 다 없으면 null.
 * - 14차: buildModels 가 plan.traqo(계약 모양을 만족할 때만, 아니면 null)와
 *   posSource(latest.vessels[mmsi].pos.source — "aisstream"|"traqo"|없으면 null)를
 *   채운다. 툴팁의 LAST DATA 줄은 posSource가 "traqo"면 ' · via Traqo' 를 덧붙인다.
 * - 16차: isDeparted(model, nowMs)(country-groups.js auPhase 5번과 같은 규칙)로
 *   출항을 판정하고 groupByVessel 그룹에 departed 를 채운다. 출항 전(위치 있음)
 *   마커는 속을 비우고(fillOpacity 0, 테두리 그대로), 툴팁 첫 줄 아래에
 *   NOT YET DEPARTED 를 한 줄 붙인다(출항 후엔 줄 없음).
 * - 전역 노출: window.AisLayer (브라우저) / module.exports (Node)
 * - UMD. 빌드 도구·외부 라이브러리 없음. Leaflet은 create(L, map, ...)로 받는다.
 * - 좌표는 [lat, lng]. 이 모듈의 좌표는 경도가 모두 > 0 이라 wrap 불필요.
 * ═════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.AisLayer = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ───────────────────────── 상수 ───────────────────────── */

  /* 포트클랑 → 시드니 예상 항로. mock/route-au-202.json 의 202개 좌표를
     값·순서 그대로 상수로 넣는다(런타임 fetch 금지). 시작 [2.849,101.253], 끝 [-34.016,151.259]. */
  var ROUTE = [
    [2.849,101.253],[2.646,101.291],[2.531,101.493],[2.348,101.696],
    [2.194,101.904],[1.955,102.169],[1.848,102.336],[1.736,102.584],
    [1.631,102.787],[1.436,103.085],[1.247,103.329],[1.084,103.565],
    [1.147,103.783],[1.238,103.991],[1.254,104.249],[1.392,104.475],
    [1.382,104.59],[0.845,105.083],[0.611,105.218],[-0.571,105.81],
    [-1.487,106.463],[-1.967,106.877],[-2.34,107.189],[-2.624,107.183],
    [-2.914,107.273],[-3.182,107.29],[-3.326,107.379],[-3.491,107.532],
    [-3.918,107.49],[-4.82,106.657],[-5.337,106.149],[-5.601,105.986],
    [-5.836,105.833],[-6.061,105.652],[-6.227,105.469],[-6.374,105.264],
    [-6.549,105.083],[-6.8,105.126],[-6.965,105.195],[-7.405,105.389],
    [-7.629,105.492],[-7.887,105.599],[-8.322,105.805],[-8.819,106.034],
    [-9.072,106.087],[-9.45,106.118],[-9.88,106.158],[-10.192,106.209],
    [-10.423,106.235],[-10.593,106.257],[-11.193,106.347],[-11.847,106.442],
    [-12.069,106.478],[-12.568,106.543],[-12.736,106.569],[-13.151,106.636],
    [-14.031,106.759],[-14.336,106.808],[-14.609,106.836],[-14.817,106.878],
    [-15.446,106.971],[-15.648,107.005],[-15.895,107.037],[-16.606,107.146],
    [-17.15,107.222],[-17.745,107.314],[-17.964,107.394],[-18.727,107.79],
    [-18.956,107.911],[-19.282,108.081],[-19.697,108.294],[-20.016,108.464],
    [-20.11,108.517],[-20.825,108.894],[-21.315,109.162],[-21.737,109.378],
    [-22.762,109.926],[-22.964,110.03],[-23.21,110.163],[-23.468,110.308],
    [-23.808,110.491],[-24.051,110.625],[-24.343,110.781],[-24.605,110.926],
    [-26.428,111.922],[-26.705,112.078],[-27.295,112.405],[-27.426,112.48],
    [-27.75,112.66],[-28.073,112.844],[-28.339,112.99],[-28.611,113.148],
    [-28.886,113.304],[-29.139,113.466],[-29.396,113.652],[-29.629,113.809],
    [-29.902,114.003],[-30.147,114.187],[-30.337,114.321],[-30.631,114.535],
    [-30.892,114.722],[-31.163,114.921],[-31.406,115.126],[-31.634,115.339],
    [-31.871,115.552],[-31.968,115.679],[-32.041,115.748],[-31.947,115.649],
    [-32.037,115.384],[-32.303,115.261],[-32.563,115.147],[-32.837,115.02],
    [-33.354,114.776],[-33.625,114.673],[-33.917,114.591],[-34.27,114.658],
    [-34.471,114.734],[-34.632,114.952],[-34.788,115.219],[-34.951,115.504],
    [-35.281,116.065],[-35.438,116.346],[-35.567,116.662],[-35.671,116.977],
    [-35.769,117.259],[-35.9,117.617],[-36.194,118.434],[-36.354,118.865],
    [-36.444,119.112],[-36.676,119.781],[-36.933,120.499],[-37.027,120.772],
    [-37.105,121.143],[-37.167,121.512],[-37.222,121.874],[-37.333,122.566],
    [-37.383,122.906],[-37.455,123.35],[-37.543,123.94],[-37.674,124.792],
    [-37.841,125.84],[-37.883,126.126],[-37.956,126.588],[-38.049,127.202],
    [-38.091,127.456],[-38.168,127.969],[-38.219,128.295],[-38.341,129.002],
    [-38.449,129.674],[-38.645,130.855],[-38.74,131.46],[-38.789,131.758],
    [-38.862,132.178],[-38.895,132.49],[-38.946,132.884],[-38.992,133.26],
    [-39.07,133.842],[-39.117,134.186],[-39.179,134.594],[-39.216,134.858],
    [-39.296,135.391],[-39.478,136.343],[-39.552,136.797],[-39.59,137.105],
    [-39.63,137.408],[-39.692,137.85],[-39.72,138.159],[-39.744,138.515],
    [-39.78,138.99],[-39.775,139.237],[-39.77,139.587],[-39.758,140.034],
    [-39.337,143.707],[-39.319,144.064],[-39.318,144.173],[-39.307,144.731],
    [-39.308,145.494],[-39.294,145.857],[-39.276,146.573],[-39.155,146.893],
    [-39.061,147.199],[-38.882,147.867],[-38.804,148.176],[-38.694,148.48],
    [-38.613,148.814],[-38.462,149.058],[-38.111,149.577],[-37.747,150.12],
    [-37.545,150.281],[-37.31,150.372],[-37.218,150.404],[-36.816,150.554],
    [-36.558,150.659],[-36.307,150.746],[-36.052,150.846],[-35.524,151.043],
    [-35.263,151.135],[-35.025,151.195],[-34.557,151.257],[-34.323,151.291],
    [-34.073,151.325],[-34.016,151.259]
  ];

  var PORTS = {
    klang:  { name: 'PORT KLANG', latlng: [3.0007, 101.3925] },
    melbourne: { name: 'MELBOURNE', latlng: [-37.81, 144.96], via: true }, /* 중간 기항지(ANL AAXS: 시드니보다 먼저) */
    sydney: { name: 'SYDNEY',     latlng: [-33.86, 151.21] }
  };

  /* 항로/선박 마커 색: 3차 지시서 — 두 테마 공통으로 눈에 덜 띄는 톤 */
  var LINE_COLOR = '#EAF2F6';    /* 항로 폴리라인 — 다크(호주 = 흰색 점선) */
  var LINE_COLOR_LIGHT = '#5A7183'; /* 라이트 테마 슬레이트 */
  var SHIP_FILL = '#8AA4B5';     /* 선박 마커 채움 */
  var SHIP_STROKE = '#DCE8EF';   /* 선박 마커 테두리 */

  /* 시드니에서 이 거리(nm) 이내면 접안(arrived) 취급 */
  var SYDNEY_ARRIVE_NM = 15;

  /* 지구 반지름 (해리, nm) — 하버사인 거리 계산용 */
  var EARTH_R_NM = 3440.065;

  /* 마지막 수신이 이 시간(시간) 이상 지나면 마커를 흐리게 */
  var STALE_HOURS = 24;

  var MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  /* ───────────────────────── 내부 유틸 ───────────────────────── */

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  /* HTML 이스케이프 (& < > " ') — 툴팁 등에 들어가는 사용자 입력 방어 */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function isNum(v) { return typeof v === 'number' && isFinite(v); }

  /* 하버사인 거리 (nm). a, b 는 [lat, lng] */
  function havNm(a, b) {
    var rad = Math.PI / 180;
    var dLat = (b[0] - a[0]) * rad;
    var dLng = (b[1] - a[1]) * rad;
    var la1 = a[0] * rad, la2 = b[0] * rad;
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * EARTH_R_NM * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  /* ROUTE 구간별 누적 거리(nm) 합과 전체 길이. { cum:[...], total } */
  function routeCumulative() {
    var cum = [0], total = 0, i;
    for (i = 0; i < ROUTE.length - 1; i++) {
      total += havNm(ROUTE[i], ROUTE[i + 1]);
      cum.push(total);
    }
    return { cum: cum, total: total };
  }

  /* ───────────────────────── 순수 함수 ───────────────────────── */

  /* "2026-10-09 14:22:10.123456789 +0000 UTC" → "2026-10-09T14:22:10Z"
     앞 19자(YYYY-MM-DD HH:MM:SS)만 취해 UTC로 해석한다. */
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
    /* 달력 rollover(예: 2월 30일)도 잘못된 입력으로 본다 */
    if (d.getUTCFullYear() !== Y || d.getUTCMonth() !== Mo - 1 || d.getUTCDate() !== D ||
        d.getUTCHours() !== H || d.getUTCMinutes() !== Mi || d.getUTCSeconds() !== S) return null;
    return d.toISOString().replace('.000Z', 'Z');
  }

  /* ISO → "Oct/09 14:22" (UTC 기준, 영문 3글자 월). null/잘못된 값 → "—" */
  function formatLast(iso) {
    var t = (typeof iso === 'string') ? Date.parse(iso) : NaN;
    if (!isFinite(t)) return '—';
    var d = new Date(t);
    return MONTHS[d.getUTCMonth()] + '/' + pad2(d.getUTCDate()) +
           ' ' + pad2(d.getUTCHours()) + ':' + pad2(d.getUTCMinutes());
  }

  /* ISO → 경과 시간(소수). null/잘못된 값 → Infinity */
  function ageHours(iso, nowMs) {
    if (typeof iso !== 'string') return Infinity;
    var t = Date.parse(iso);
    if (!isFinite(t)) return Infinity;
    var now = isNum(nowMs) ? nowMs : Date.now();
    return (now - t) / 3600000;
  }

  /* GET /ais 응답 → 선박 모델 배열.
     선박(plan)과 위치(vessels[mmsi])는 plans[mbl].mmsi === vessels 키로 연결.
     11B: 서버가 내려주는 booking/po/scheduleInherited/scheduleFromBooking 도 모델에 넣는다.
     14차: model.traqo(계약 모양이 아니면 null), model.posSource(pos.source 문자열|null). */

  /* booking: plan.booking 이 없으면 mbl 이 ANNU+영문3+숫자7(예: ANNUABC1234567)
     형태일 때 뒤쪽(영문3+숫자7)을 booking 으로 본다(서버 saveAisPlan 규칙과 동일).
     그 외는 빈 문자열. */
  var MBL_BOOKING_RE = /^ANNU[A-Z]{3}\d{7}$/;

  function bookingOf(plan, mblKey) {
    if (plan.booking != null) return String(plan.booking);
    return MBL_BOOKING_RE.test(mblKey) ? mblKey.slice(4) : '';
  }

  /* po: 서버는 문자열 배열로 내려준다. 배열이 아니거나 없으면 빈 배열(11B 계약). */
  function poOf(plan) {
    if (!Array.isArray(plan.po)) return [];
    return plan.po.map(function (x) { return x == null ? '' : String(x); })
      .filter(function (s) { return s !== ''; });
  }

  /* cntrQty(13차): 컨테이너 대수. plan.cntrQty 가 1~99 정수(문자열 숫자 허용)면
     그 값을 쓰고, 아니면 plan.container 를 ',' 로 쪼개 빈 항목을 제외한 개수,
     그것도 없으면 null. 범위 밖(0·100·소수 등)은 필드를 무시하고 번호 개수로 대체한다. */
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

  /* traqo(14차): plan.traqo 를 계약 모양대로 통과시키거나 null 으로 정규화한다.
     - 일반: { enabled:true, status:"ok"|"error", … } — enabled 가 true 가 아니거나
       status 가 ok|error 가 아니면 계약 위반 → null.
     - 따라오는 선적: { inherited:true, from, etdUtc, atdUtc, etaUtc, ataUtc } 만
       있어도 계약이므로 inherited === true 면 통과한다.
     - events/containers 는 (있으면) 배열이어야 한다. 개별 항목의 방어는 렌더 쪽이 한다. */
  function traqoOf(plan) {
    var t = plan ? plan.traqo : null;
    if (!t || typeof t !== 'object' || Array.isArray(t)) return null;
    if (t.inherited === true) return t;
    if (t.enabled !== true) return null;
    if (t.status !== 'ok' && t.status !== 'error') return null;
    if (t.events != null && !Array.isArray(t.events)) return null;
    if (t.containers != null && !Array.isArray(t.containers)) return null;
    return t;
  }

  function buildModels(aisJson) {
    var out = [];
    if (!aisJson || typeof aisJson !== 'object') return out;
    var plans = aisJson.plans && typeof aisJson.plans === 'object' ? aisJson.plans : {};
    var latest = aisJson.latest;
    var vessels = (latest && latest.vessels && typeof latest.vessels === 'object') ? latest.vessels : {};

    Object.keys(plans).forEach(function (mbl) {
      var plan = plans[mbl] || {};
      var mmsi = plan.mmsi != null ? String(plan.mmsi) : null;
      var v = mmsi && Object.prototype.hasOwnProperty.call(vessels, mmsi) ? vessels[mmsi] : null;
      var pos = (v && v.pos) ? v.pos : null;
      var hasPos = !!pos && isNum(pos.lat) && isNum(pos.lon);
      var stat = (v && v.stat) ? v.stat : null;

      out.push({
        mmsi: mmsi,
        name: plan.vessel != null ? String(plan.vessel) : (v && v.name != null ? String(v.name) : ''),
        voyage: plan.voyage != null ? String(plan.voyage) : '',
        mbl: plan.mbl != null ? String(plan.mbl) : String(mbl),
        container: plan.container != null ? String(plan.container) : '',
        cntrQty: cntrQtyOf(plan),
        traqo: traqoOf(plan),
        booking: bookingOf(plan, String(mbl)),
        po: poOf(plan),
        scheduleInherited: plan.scheduleInherited === true,
        scheduleFromBooking: plan.scheduleFromBooking != null ? String(plan.scheduleFromBooking) : '',
        pol: plan.pol != null ? String(plan.pol) : '',
        pod: plan.pod != null ? String(plan.pod) : '',
        etd: plan.etd != null ? String(plan.etd) : '',
        etb: plan.etb != null ? String(plan.etb) : '',
        eta: plan.eta != null ? String(plan.eta) : '',
        podTerminal: plan.podTerminal != null ? String(plan.podTerminal) : '',
        source: plan.source != null ? String(plan.source) : '',
        note: plan.note != null ? String(plan.note) : '',
        lastDataIso: parseAisTime(pos && pos.at),
        posSource: pos && pos.source != null ? String(pos.source) : null,
        lat: hasPos ? pos.lat : null,
        lng: hasPos ? pos.lon : null,
        sog: pos && isNum(pos.sog) ? pos.sog : null,
        cog: pos && isNum(pos.cog) ? pos.cog : null,
        distPklNm: v && isNum(v.distPklNm) ? v.distPklNm : null,
        destination: stat && stat.destination != null ? String(stat.destination) : null
      });
    });
    return out;
  }

  /* ─────────────────── 배(선박) 단위 묶음 (11B) ─────────────────── */

  /* 같은 배의 선적 모델들을 하나로 묶는 순수 함수.
     - 묶음 기준: mmsi (mmsi 가 없으면 name+voyage)
     - 위치·수신 정보(lat/lng/lastDataIso/posSource/sog/cog/distPklNm/destination)는
       lastDataIso 가 가장 최근인 모델의 값(못 읽는 값은 후보 제외,
       읽을 수 있는 값이 하나도 없으면 첫 번째 모델)
     - shipments 는 묶인 모델 전부(입력 순서 유지)
     - [16차] departed: 묶인 선적 중 하나라도 isDeparted 면 true(아니면 false)
     - mbl/container/etd/etb/eta/podTerminal/source/note 는 첫 번째 선적 모델의
       값을 그룹 최상위에 복사해 기존 detailHtml 이 계속 동작하게 한다. */
  var GROUP_COPY_FIELDS = ['mbl', 'container', 'etd', 'etb', 'eta', 'podTerminal', 'source', 'note'];
  /* [14차] posSource 도 위치 정보라 "가장 최근 lastDataIso 모델"의 값으로 묶음 최상위에 둔다 */
  var GROUP_LATEST_FIELDS = ['name', 'voyage', 'lat', 'lng', 'lastDataIso', 'posSource',
                             'sog', 'cog', 'distPklNm', 'destination'];

  function vesselKey(model) {
    var mmsi = model.mmsi != null && model.mmsi !== '' ? String(model.mmsi) : '';
    if (mmsi) return 'm:' + mmsi;
    return 'n:' + String(model.name == null ? '' : model.name) + '|' + String(model.voyage == null ? '' : model.voyage);
  }

  function groupByVessel(models) {
    var out = [];
    if (!Array.isArray(models)) return out;
    var byKey = {};
    models.forEach(function (m) {
      var model = m || {};
      var key = vesselKey(model);
      var g = byKey[key];
      if (!g) {
        g = { mmsi: null, name: '', voyage: '', lat: null, lng: null, lastDataIso: null,
              sog: null, cog: null, distPklNm: null, destination: null, departed: false,
              shipments: [] };
        byKey[key] = g;
        out.push(g);
      }
      if (g.mmsi == null && model.mmsi != null && model.mmsi !== '') g.mmsi = String(model.mmsi);
      g.shipments.push(model);
    });
    out.forEach(function (g) {
      var first = g.shipments[0] || {};
      GROUP_COPY_FIELDS.forEach(function (f) { g[f] = first[f] != null ? first[f] : ''; });
      var best = null, bestT = null;
      g.shipments.forEach(function (s) {
        var t = (typeof s.lastDataIso === 'string') ? Date.parse(s.lastDataIso) : NaN;
        if (isFinite(t) && (bestT == null || t > bestT)) { bestT = t; best = s; }
      });
      var src = best || first;
      GROUP_LATEST_FIELDS.forEach(function (f) { g[f] = src[f] != null ? src[f] : null; });
      /* [16차] 묶인 선적 중 하나라도 출항했으면 그 배는 출항(departed) */
      g.departed = false;
      g.shipments.forEach(function (s) {
        if (g.departed) return;
        if (isDeparted(s)) g.departed = true;
      });
    });
    return out;
  }

  /* [lat,lng] 점이 ROUTE 폴리라인에서 가장 가까운 지점까지의
     누적 거리 비율(0~1, 하버사인 거리 합 기준)과 그 지점까지의 거리(nm, 정수).
     숫자가 아니면 null. 각 구간은 구간 중심 위도의 등장투영(equirectangular)
     평면에 사영해 최근접점을 구한 뒤, 거리는 하버사인으로 재계산한다. */
  function routeProgress(lat, lng) {
    if (!isNum(lat) || !isNum(lng)) return null;
    if (!Array.isArray(ROUTE) || ROUTE.length < 2) return null;
    var cumInfo = routeCumulative();
    if (!(cumInfo.total > 0)) return { frac: 0, distNm: 0 };

    var best = null, i;
    for (i = 0; i < ROUTE.length - 1; i++) {
      var A = ROUTE[i], B = ROUTE[i + 1];
      var midLat = (A[0] + B[0]) / 2;
      var k = Math.cos(midLat * Math.PI / 180) || 1e-9;
      var ax = A[1] * k, ay = A[0];
      var bx = B[1] * k, by = B[0];
      var px = lng * k, py = lat;
      var dx = bx - ax, dy = by - ay;
      var len2 = dx * dx + dy * dy;
      var t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
      t = t < 0 ? 0 : (t > 1 ? 1 : t);
      var qLat = ay + t * dy;
      var qLng = (ax + t * dx) / k;
      var d = havNm([lat, lng], [qLat, qLng]);
      var frac = (cumInfo.cum[i] + t * (cumInfo.cum[i + 1] - cumInfo.cum[i])) / cumInfo.total;
      if (!best || d < best.d) best = { d: d, frac: frac };
    }
    var f = best.frac;
    if (f < 0) f = 0;
    if (f > 1) f = 1;
    return { frac: f, distNm: Math.round(best.d) };
  }

  /* 선박 모델 → 진행 단계.
     - 위치 없음 → { stage:'booked', frac:0 }
     - 시드니(PORTS.sydney)까지 SYDNEY_ARRIVE_NM(15nm) 이내 → { stage:'arrived', frac:1 }
     - 그 외 → { stage:'transit', frac: routeProgress().frac } */
  function stageOf(model) {
    var m = model || {};
    if (!isNum(m.lat) || !isNum(m.lng)) return { stage: 'booked', frac: 0 };
    var syd = PORTS.sydney && PORTS.sydney.latlng;
    if (syd && havNm([m.lat, m.lng], syd) <= SYDNEY_ARRIVE_NM) {
      return { stage: 'arrived', frac: 1 };
    }
    var rp = routeProgress(m.lat, m.lng);
    return { stage: 'transit', frac: rp ? rp.frac : 0 };
  }

  /* ─────────────── [16차] 출항 판정(순수 함수) ─────────────── */

  /* 'YYYY-MM-DD HH:MM' 또는 'YYYY-MM-DDTHH:MM'(포트클랑 현지 시각) → ms.
     포트클랑은 UTC+8 고정(서머타임 없음, Intl 없이 계산 — 테스트 가능한 순수 계산).
     country-groups.js 의 pkLocalMs 와 같은 계산(모듈이 분리되어 여기에도 둔다).
     못 읽으면 null. */
  function pkLocalMs(s) {
    if (typeof s !== 'string') return null;
    var m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(s.trim());
    if (!m) return null;
    var mo = +m[2], d = +m[3], h = m[4] != null ? +m[4] : 0, mi = m[5] != null ? +m[5] : 0;
    if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
    var t = Date.UTC(+m[1], mo - 1, d, h, mi) - 8 * 3600000; /* +8 → UTC */
    return isFinite(t) ? t : null;
  }

  /* [16차] 선적 모델이 출항했는지. country-groups.js auPhase 5번과 같은 규칙:
     - traqo.atdUtc(문자열, Date.parse 가능)가 있으면 출항(true).
     - 아니면 수동 etd(포트클랑 현지, UTC+8)를 UTC ms 로 바꿔
       nowMs(없으면 Date.now()) 이전(같은 시각 포함)이면 true.
     - inherited 선적은 traqo.atdUtc/etd 에 원본에서 상속된 값이 이미 모델에
       들어오므로 그 값을 그대로 같은 경로로 판정한다(특별 분기 없음).
     - 입력이 이상하면(null 등) false. 예외를 던지지 않는다. */
  function isDeparted(model, nowMs) {
    var m = (model && typeof model === 'object') ? model : {};
    var tq = (m.traqo && typeof m.traqo === 'object') ? m.traqo : null;
    var atd = tq && typeof tq.atdUtc === 'string' ? tq.atdUtc : '';
    if (atd && Date.parse(atd)) return true;
    var etdMs = pkLocalMs(m.etd != null ? String(m.etd) : '');
    var now = (typeof nowMs === 'number' && isFinite(nowMs)) ? nowMs : Date.now();
    if (etdMs != null && etdMs <= now) return true;
    return false;
  }

  /* ───────────────────────── 지도 컨트롤러 ───────────────────────── */

  function create(L, map, opts) {
    if (!L || typeof L.circleMarker !== 'function' || !map || typeof map.addLayer !== 'function') {
      throw new Error('AisLayer.create(L, map, opts): Leaflet instance (L) and map are required.');
    }
    opts = opts || {};
    var theme = opts.theme === 'light' ? 'light' : 'dark'; /* 호환용으로만 해석 — 색은 두 테마 공통 */
    var onSelect = typeof opts.onSelect === 'function' ? opts.onSelect : function () {};

    var group = L.layerGroup();
    var onMap = false;

    var baseReady = false;
    var shipMarkers = {}; /* mmsi → 배(그룹) circleMarker (update() 재사용 대상) */

    /* 항로 폴리라인 + 항구 마커. 딱 한 번만 만든다.
       항로 색: 다크 #EAF2F6 / 라이트 #5A7183(나라 색 점선), weight 1.5, opacity 0.9, dashArray 4,4 */
    function ensureBase() {
      if (baseReady) return;
      group.addLayer(L.polyline(ROUTE, {
        color: theme === 'light' ? LINE_COLOR_LIGHT : LINE_COLOR, weight: 1.5, opacity: 0.9, dashArray: '4,4', interactive: false
      }));
      Object.keys(PORTS).forEach(function (k) {
        var p = PORTS[k];
        var m = L.circleMarker(p.latlng, {
          radius: 4, color: '#8AA4B5', weight: 1.5,
          fillColor: '#07141C', fillOpacity: 1
        });
        m.bindTooltip(p.name, { className: 'vsl-tip', direction: 'top' });
        group.addLayer(m);
      });
      baseReady = true;
    }

    /* 위치가 있으면 실제 좌표, 없으면 포트클랑에 대기 마커 */
    function markerLatLng(model) {
      return (model.lat != null && model.lng != null)
        ? [model.lat, model.lng]
        : PORTS.klang.latlng;
    }

    function markerStyle(model) {
      var hasPos = model.lat != null && model.lng != null;
      var stale = ageHours(model.lastDataIso) >= STALE_HOURS;
      /* [16차] 선박 마커: 테두리(#DCE8EF weight 2)·채움(#8AA4B5)은 그대로.
         출항 전(위치 있음)이면 속을 비운다(fillOpacity 0, 점선 없음).
         출항 후(위치 있음)는 기존 규칙(stale 면 0.45, 아니면 1).
         위치 없음 대기 마커는 기존처럼 점선 테두리·fillOpacity 0.5. */
      var fillOpacity;
      if (hasPos) {
        fillOpacity = model.departed === true ? (stale ? 0.45 : 1) : 0;
      } else {
        fillOpacity = 0.5;
      }
      return {
        radius: 8,
        color: SHIP_STROKE,
        weight: 2,
        fillColor: SHIP_FILL,
        fillOpacity: fillOpacity,
        dashArray: hasPos ? null : '3,3'
      };
    }

    /* 상태 단어는 쓰지 않고 시각만 표시한다.
       배 단위 그룹(11B): 선박명 항차 + (선적 둘 이상이면) N shipments + LAST DATA
       [14차] 위치 출처(posSource)가 "traqo"면 LAST DATA 줄 끝에 ' · via Traqo' 를
       덧붙인다("aisstream" 등 그 외 출처는 변화 없다).
       [16차] 출항 전이면 첫 줄 아래에 NOT YET DEPARTED 를 한 줄 추가하고
       출항 후엔 그 줄을 넣지 않는다. 기존 줄(LAST DATA 등)은 그대로. */
    function markerTooltip(group) {
      var name = esc(group.name);
      var title = group.voyage ? name + ' ' + esc(group.voyage) : name;
      var lines = [title];
      if (!group.departed) lines.push('NOT YET DEPARTED');
      if (group.shipments && group.shipments.length > 1) {
        lines.push(group.shipments.length + ' shipments');
      }
      var hasPos = group.lat != null && group.lng != null;
      var lastLine = 'LAST DATA ' + (hasPos ? formatLast(group.lastDataIso) : '—');
      if (group.posSource === 'traqo') lastLine += ' · via Traqo';
      lines.push(lastLine);
      return lines.join('<br>');
    }

    function update(aisJson) {
      ensureBase();
      var groups = groupByVessel(buildModels(aisJson));
      var seen = {};

      /* [14차 수정] 루프 변수가 바깥 Leaflet layerGroup(group)을 가려
         group.addLayer(marker) 가 TypeError 로 죽는 11B 잠재 버그 수정.
         배 묶음 객체는 g 로 받고,Leaflet 그룹은 그대로 group 이다. */
      groups.forEach(function (g) {
        /* mmsi 가 없는 그룹은 AIS 위치 조회가 불가능하므로 지도에 놓지 않는다(기존 규칙) */
        if (g.mmsi == null || g.mmsi === '') return;
        seen[g.mmsi] = true;

        var marker = shipMarkers[g.mmsi];
        if (!marker) {
          marker = L.circleMarker(markerLatLng(g), markerStyle(g));
          marker.bindTooltip(markerTooltip(g), { className: 'vsl-tip', direction: 'top', offset: [0, -6] });
          marker.on('click', function () { onSelect(marker._aisGroup); });
          group.addLayer(marker);
          shipMarkers[g.mmsi] = marker;
        } else {
          /* 새로 만들지 않고 갱신 */
          marker.setLatLng(markerLatLng(g));
          marker.setStyle(markerStyle(g));
          marker.setTooltipContent(markerTooltip(g));
        }
        marker._aisGroup = g; /* 클릭 핸들러는 항상 최신 그룹 객체를 넘긴다 */
      });

      /* plans에서 사라진 선박의 마커 정리 */
      Object.keys(shipMarkers).forEach(function (mmsi) {
        if (!seen[mmsi]) {
          group.removeLayer(shipMarkers[mmsi]);
          delete shipMarkers[mmsi];
        }
      });
    }

    function setVisible(v) {
      var want = !!v;
      if (want === onMap) return;
      if (want) { group.addTo(map); onMap = true; }
      else { map.removeLayer(group); onMap = false; }
    }

    function destroy() {
      if (onMap) {
        try { map.removeLayer(group); } catch (e) { /* 이미 제거된 경우 무시 */ }
        onMap = false;
      }
      shipMarkers = {};
      baseReady = false;
    }

    ensureBase();
    setVisible(true);

    return { update: update, setVisible: setVisible, destroy: destroy };
  }

  /* ───────────────────────── 공개 API ───────────────────────── */

  return {
    ROUTE: ROUTE,
    PORTS: PORTS,
    create: create,
    parseAisTime: parseAisTime,
    formatLast: formatLast,
    ageHours: ageHours,
    buildModels: buildModels,
    groupByVessel: groupByVessel,
    routeProgress: routeProgress,
    stageOf: stageOf,
    isDeparted: isDeparted
  };
});
