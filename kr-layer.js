/* kr-layer.js — 포트클랑 → 부산 지도 레이어.
 * 항로는 실제 항적(MUMBAI BRIDGE 2605E, Sinokor 추적 화면의 선박 경로)을 줄인 22점이다.
 * 선박 위치는 폰 tracker 가 올린 plan.tracker[컨테이너].ais 를 쓰고, 1도 단위로 뭉툭한 값이라
 * 항로 위 가장 가까운 지점에 붙인다. 도착 등록 건과 위치 없는 건은 그리지 않는다.
 * 전역 window.KrLayer / module.exports. Leaflet 은 create(L, map, opts) 로 받는다. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.KrLayer = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var COLOR = '#7FD8FF';
  var COLOR_LIGHT = '#2F8FC0';   /* 밝은 지도에서는 하늘색이 안 보여 진하게 */
  var ROUTE = [
    [2.931,101.288],[2.688,101.234],[2.08,102.002],[1.054,103.668],[1.599,104.78],[4.371,106.075],
    [11.737,111.189],[13.063,112.487],[13.633,113.435],[14.334,114.261],[18.227,117.868],[20.441,119.501],
    [21.664,120.945],[22.64,121.767],[25.679,123.182],[27.233,124.031],[27.446,124.279],[29.205,125.157],
    [33.437,127.932],[34.374,128.821],[35.077,128.787],[35.18,129.076]
  ];
  var PORTS = [
    { name: 'PORT KLANG', latlng: ROUTE[0], dir: 'left' },
    { name: 'BUSAN', latlng: ROUTE[ROUTE.length - 1], dir: 'right' }
  ];

  function isNum(v) { return typeof v === 'number' && isFinite(v); }

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* 항로 위 가장 가까운 지점 { lat, lng, seg, t }. 경도는 위도에 맞춰 줄여서 거리를 잰다 */
  function snap(lat, lng) {
    var best = null;
    for (var i = 0; i < ROUTE.length - 1; i++) {
      var a = ROUTE[i], b = ROUTE[i + 1];
      var k = Math.cos((a[0] + b[0]) / 2 * Math.PI / 180);
      var dx = (b[1] - a[1]) * k, dy = b[0] - a[0];
      var px = (lng - a[1]) * k, py = lat - a[0];
      var len = dx * dx + dy * dy;
      var t = len > 0 ? Math.max(0, Math.min(1, (px * dx + py * dy) / len)) : 0;
      var ex = px - t * dx, ey = py - t * dy;
      var d = ex * ex + ey * ey;
      if (!best || d < best.d) {
        best = { d: d, seg: i, t: t, lat: a[0] + t * (b[0] - a[0]), lng: a[1] + t * (b[1] - a[1]) };
      }
    }
    return best;
  }

  /* /ais → 배(선박명+항차)마다 하나. 위치가 없거나 도착 등록된 건은 뺀다 */
  function ships(aisJson) {
    var plans = aisJson && aisJson.plans && typeof aisJson.plans === 'object' ? aisJson.plans : {};
    var byKey = {};
    Object.keys(plans).forEach(function (k) {
      var p = plans[k];
      if (!p || typeof p !== 'object' || p.arrived === true) return;
      if (String(p.pod == null ? '' : p.pod).toUpperCase().indexOf('BUSAN') === -1) return;
      if (p.traqo && typeof p.traqo.ataUtc === 'string' && p.traqo.ataUtc) return;
      var trk = p.tracker && typeof p.tracker === 'object' ? p.tracker : {};
      var fix = null;
      Object.keys(trk).forEach(function (c) {
        var a = trk[c] && trk[c].ais;
        if (!a || !isNum(a.lat) || !isNum(a.lon)) return;
        if (!fix || String(a.at || '') > String(fix.at || '')) fix = a;
      });
      if (!fix) return;
      var key = String(p.vessel || k) + '|' + String(p.voyage || '');
      var cur = byKey[key];
      if (!cur) cur = byKey[key] = { key: key, name: p.vessel || '', voyage: p.voyage || '', fix: fix, mbl: [] };
      else if (String(fix.at || '') > String(cur.fix.at || '')) cur.fix = fix;
      cur.mbl.push(k);
    });
    return Object.keys(byKey).map(function (key) {
      var s = byKey[key];
      s.pos = snap(s.fix.lat, s.fix.lon);
      return s;
    });
  }

  /* 포트클랑부터 그 지점까지의 항로 좌표(지나온 구간) */
  function traveled(pos) {
    return ROUTE.slice(0, pos.seg + 1).concat([[pos.lat, pos.lng]]);
  }

  function create(L, map, opts) {
    opts = opts || {};
    var color = opts.theme === 'light' ? COLOR_LIGHT : COLOR;
    var group = L.layerGroup();
    var dynamic = L.layerGroup().addTo(group);
    var onMap = false;

    group.addLayer(L.polyline(ROUTE, { color: color, weight: 2, opacity: 0.8, dashArray: '6 5', interactive: false }));
    PORTS.forEach(function (p) {
      var m = L.circleMarker(p.latlng, { radius: 4, color: '#8AA4B5', weight: 1.5, fillColor: '#07141C', fillOpacity: 1 });
      m.bindTooltip(p.name, { className: 'vsl-tip', direction: p.dir });
      group.addLayer(m);
    });

    function update(aisJson) {
      dynamic.clearLayers();
      var list = ships(aisJson);
      /* 지나온 구간은 가장 앞선 배까지 한 줄로 */
      var lead = null;
      list.forEach(function (s) {
        if (!lead || s.pos.seg > lead.seg || (s.pos.seg === lead.seg && s.pos.t > lead.t)) lead = s.pos;
      });
      if (lead) dynamic.addLayer(L.polyline(traveled(lead), { color: color, weight: 3.5, interactive: false }));
      list.forEach(function (s) {
        var m = L.circleMarker([s.pos.lat, s.pos.lng], { radius: 7, color: '#DCE8EF', weight: 2, fillColor: color, fillOpacity: 1 });
        m.bindTooltip(esc(s.name) + (s.voyage ? ' ' + esc(s.voyage) : '')
          + '<br>LAST DATA ' + esc(String(s.fix.at || '—').slice(0, 16).replace('T', ' ')),
          { className: 'vsl-tip', direction: 'top', offset: [0, -6] });
        if (typeof opts.onSelect === 'function') m.on('click', function () { opts.onSelect(s.mbl[0]); });
        dynamic.addLayer(m);
      });
    }

    function setVisible(on) {
      if (on && !onMap) { group.addTo(map); onMap = true; }
      else if (!on && onMap) { map.removeLayer(group); onMap = false; }
    }

    function destroy() {
      if (onMap) map.removeLayer(group);
      onMap = false;
    }

    return { update: update, setVisible: setVisible, destroy: destroy };
  }

  return { ROUTE: ROUTE, snap: snap, ships: ships, traveled: traveled, create: create };
});
