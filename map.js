/* ── PS3 / PS5 고정 항로 좌표
   출처: HMM Tracking Map 실제 항로 기반
   PS3: PKG → SIN → VUNG TAU → YANTIAN → 대만동쪽 → 일본근해 → 태평양 → LA
   PS5: PKG → SIN → VUNG TAU → HAI PHONG → 중국해안 → 대만해협 → 일본근해 → 태평양 → LA ── */
const ROUTE_PS3 = [
  [2.937, 101.301],   /* PORT KLANG */
  [1.251, 103.727],   /* SINGAPORE */
  [10.33, 107.07],    /* BA RIA VUNG TAU */
  [16.0,  111.5],     /* 남중국해 */
  [22.28, 114.17],    /* YANTIAN, SHENZHEN */
  [24.0,  119.5],     /* 대만 동쪽 */
  [28.0,  130.0],     /* 일본 규슈 남쪽 */
  [35.0,  141.0],     /* 일본 근해 */
  [40.0,  155.0],     /* 북태평양 진입 */
  [47.0,  175.0],     /* 북태평양 중간 */
  [47.0, -170.0],     /* 날짜변경선 통과 */
  [43.0, -150.0],     /* 태평양 동부 */
  [36.0, -130.0],     /* LA 접근 */
  [33.76, -118.27],   /* LOS ANGELES */
];

const ROUTE_PS5 = [
  [2.937, 101.301],   /* PORT KLANG */
  [1.251, 103.727],   /* SINGAPORE */
  [10.33, 107.07],    /* BA RIA VUNG TAU */
  [16.5,  107.5],     /* 베트남 해안 북상 */
  [20.93, 107.08],    /* HAI PHONG */
  [21.5,  108.5],     /* 통킹만 */
  [22.5,  113.5],     /* 중국 광둥 해안 */
  [24.0,  118.0],     /* 대만 해협 */
  [26.0,  121.5],     /* 대만 북쪽 */
  [30.0,  130.0],     /* 일본 규슈 */
  [35.0,  141.0],     /* 일본 근해 */
  [40.0,  155.0],     /* 북태평양 진입 */
  [47.0,  175.0],     /* 북태평양 중간 */
  [47.0, -170.0],     /* 날짜변경선 통과 */
  [43.0, -150.0],     /* 태평양 동부 */
  [36.0, -130.0],     /* LA 접근 */
  [33.76, -118.27],   /* LOS ANGELES */
];

/* 노선 판별: svc 우선, 없으면 names 기반 추정
   반환: { svc: 'PS3'|'PS5'|null, inferred: true|false } */
function detectService(s) {
  if (s.svc === 'PS3' || s.svc === 'PS5') return { svc: s.svc, inferred: false };
  const names = Array.isArray(s.names) ? s.names.join(',').toUpperCase() : '';
  if (names.includes('HAI PHONG')) return { svc: 'PS5', inferred: true };
  if (names.includes('YANTIAN'))   return { svc: 'PS3', inferred: true };
  return { svc: null, inferred: false };
}

/* 노선별 항로 좌표 반환 (경도 래핑 포함) */
function getServiceRoute(svc) {
  const r = svc === 'PS3' ? ROUTE_PS3 : svc === 'PS5' ? ROUTE_PS5 : null;
  if (!r) return null;
  return r.map(p => p[1] < -30 ? [p[0], p[1] + 360] : p);
}

/* ===== map.js — 지도 · 좌표 · 위치 계산 ===== */

/* ---------- 안전한 timestamp 파싱 ----------
   v가 이미 timezone 정보를 포함하면 Z를 붙이지 않는다 */
function safeDate(v) {
  if (!v) return null;
  const s = String(v).trim();
  const hasZone = /(?:Z|[+-]\d{2}:\d{2})$/i.test(s);
  const iso = hasZone ? s : s.replace(" ", "T") + "Z";
  const t = Date.parse(iso);
  return Number.isFinite(t) ? new Date(t) : null;
}
const safeT = v => { const d = safeDate(v); return d ? d.getTime() : null; };

/* ---------- 진행바(rail) ---------- */
function railInfo(s){
  const legs = Array.isArray(s.legs) ? s.legs : [];
  if(!legs.length) return null;
  const nodes = [{ name: shortPort(legs[0].pol), arr: null, dep: legs[0].etd }];
  legs.forEach((l,i)=>{ nodes.push({ name: shortPort(l.pod), arr: l.eta, dep: legs[i+1] ? legs[i+1].etd : null }); });
  const merged = [];
  nodes.forEach(n=>{
    const prev = merged[merged.length-1];
    if(prev && prev.name === n.name){ prev.dep = n.dep || prev.dep; prev.arr = prev.arr || n.arr; }
    else merged.push({...n});
  });
  if(merged.length < 2) return null;
  const now = Date.now();
  const T = safeT;
  const last = merged.length-1;
  let i = 0, f = 0, atPort = true;
  for(let k=0;k<merged.length;k++){
    const dep = T(merged[k].dep), nextArr = T(merged[k+1] && merged[k+1].arr);
    const arr = T(merged[k].arr);
    if(arr && now < arr){ i = Math.max(0,k-1); f = 1; atPort = true; break; }
    if(dep && now < dep){ i = k; f = 0; atPort = true; break; }
    if(dep && nextArr && now >= dep && now < nextArr){ i = k; f = Math.min(1,(now-dep)/(nextArr-dep)); atPort = false; break; }
    i = k; f = 0; atPort = true;
  }
  if(i >= last){ i = last-1; f = 1; atPort = true; }
  const names = merged.map(n=>n.name);
  return {
    nodes: merged, names, i, f, atPort,
    pct: (i + f) / last,
    phase: atPort ? `${names[Math.min(i + (f>=1?1:0), last)]} — berthed` : `${names[i]} → ${names[i+1]}`
  };
}

/* ---------- 항로 합성 ---------- */
function synthRoute(s){
  if(Array.isArray(s.route) && s.route.length>=2) return false;
  const legs = Array.isArray(s.legs) ? s.legs : [];
  if(!legs.length) return false;
  const names = [shortPort(legs[0].pol)];
  legs.forEach(l=> names.push(shortPort(l.pod)));
  const merged=[], route=[];
  for(const n of names){
    if(merged.length && merged[merged.length-1]===n) continue;
    const xy = PORTXY[n];
    if(!xy) return false;
    merged.push(n); route.push(xy);
  }
  if(route.length<2) return false;
  const T = safeT;
  const now = Date.now();
  let idx=0, ratio=0;
  for(let k=0;k<legs.length;k++){
    const dep=T(legs[k].etd), arr=T(legs[k].eta);
    if(dep && arr && now>=dep && now<arr){ idx=k; ratio=Math.min(1,(now-dep)/(arr-dep)); break; }
    if(arr && now>=arr) idx=Math.min(k+1, route.length-2);
  }
  s.route=route; s.names=merged; s.idx=idx; s.ratio=ratio; s.routeSynth=true;
  return true;
}

/* ---------- 좌표 유틸 ---------- */
const wrap = p => [p[0], p[1] < -30 ? p[1] + 360 : p[1]];
const unwrap = l => ((l + 180) % 360) - 180;

function locate(s){
  if(!Array.isArray(s.route) || s.route.length < 2) return null;
  const nm = portNames(s);
  const r = s.route.map(wrap);
  if(s.etaActual){
    const last = r[r.length - 1];
    return { pos: last, i: r.length - 2, f: 1, names: nm,
      from: nm[nm.length - 2] || nm[0], to: nm[nm.length - 1],
      phase: `${nm[nm.length - 1]} — berthed`, atPort: true, pct: 1 };
  }
  const idx = Number.isFinite(s.idx) ? s.idx : 0;
  const i = Math.max(0, Math.min(idx, r.length - 2));
  const f = Number.isFinite(s.ratio) ? Math.max(0, Math.min(1, s.ratio)) : 0;
  const a = r[i], b = r[i+1];
  if(!a || !b) return null;
  const pos = [a[0] + (b[0]-a[0])*f, a[1] + (b[1]-a[1])*f];
  const atPort = f < 0.01;
  const done = i + f, total = Math.max(1, r.length - 1);
  return { pos, i, f, names: nm, from: nm[i], to: nm[i+1],
    phase: atPort ? `${nm[i]} — berthed` : `${nm[i]} → ${nm[i+1]}`, atPort, pct: done / total };
}

/* ---------- MAP ---------- */
let map, markers=[], tileLayer;

function initMap(data){
  if(map){ try{ map.remove(); }catch(_){} map = null; tileLayer = null; }
  markers = [];
  map = L.map('map',{worldCopyJump:false,minZoom:2}).setView([25,175],3);
  tileLayer = L.tileLayer(TILE[THEME],
    {attribution:'&copy; OpenStreetMap &copy; CARTO', subdomains:'abcd', maxZoom:10}).addTo(map);

  const portSeen = {};
  data.shipments.forEach(s=>{
    if(!Array.isArray(s.route) || s.route.length<2){ markers.push(null); return; }
    const det = detectService(s);
    const svcRoute = det.svc ? getServiceRoute(det.svc) : null;

    if (svcRoute) {
      /* PS3/PS5 실제 항로 표시 */
      const lineColor = det.inferred ? '#B8860B' : '#1E3A4C';
      L.polyline(svcRoute, {
        color: lineColor, weight: 1.5,
        dashArray: det.inferred ? '4,4' : null, opacity: 0.9
      }).addTo(map);
      /* 기항지 마커 (실제 route 좌표 기반) */
      const r = s.route.map(wrap);
      r.forEach((p,k)=>{
        const key = p[0].toFixed(2)+","+p[1].toFixed(2);
        if(portSeen[key]) return; portSeen[key]=1;
        L.circleMarker(p,{radius:4,color:cssVar('--fog','#8AA4B5'),weight:1.5,
                          fillColor:cssVar('--ink','#07141C'),fillOpacity:1})
          .bindTooltip(s.names[k] || ("P"+(k+1)),{className:'vsl-tip',direction:'top'}).addTo(map);
      });
    } else {
      /* UNKNOWN — 항로 라인 없음, 기항지 마커만 */
      const r = s.route.map(wrap);
      r.forEach((p,k)=>{
        const key = p[0].toFixed(2)+","+p[1].toFixed(2);
        if(portSeen[key]) return; portSeen[key]=1;
        L.circleMarker(p,{radius:4,color:'#E53935',weight:1.5,
                          fillColor:cssVar('--ink','#07141C'),fillOpacity:1})
          .bindTooltip(s.names[k] || ("P"+(k+1)),{className:'vsl-tip',direction:'top'}).addTo(map);
      });
    }
  });

  /* 0.05도 이내 같은 위치 → 클러스터링 */
  const CLUSTER_D = 0.05;
  const located = data.shipments.map((s, idx) => {
    const L2 = locate(s);
    if (!L2) return null;
    return { s, idx, L2, lat: L2.pos[0], lng: L2.pos[1] };
  });

  /* 클러스터 그룹 생성 */
  const clusters = [];
  const assigned = new Array(located.length).fill(false);
  for (let i = 0; i < located.length; i++) {
    if (!located[i] || assigned[i]) continue;
    const grp = [i];
    for (let j = i + 1; j < located.length; j++) {
      if (!located[j] || assigned[j]) continue;
      const dlat = Math.abs(located[i].lat - located[j].lat);
      const dlng = Math.abs(located[i].lng - located[j].lng);
      if (dlat <= CLUSTER_D && dlng <= CLUSTER_D) { grp.push(j); assigned[j] = true; }
    }
    assigned[i] = true;
    clusters.push(grp);
  }

  /* 클러스터별 마커 생성 */
  clusters.forEach(grp => {
    const first = located[grp[0]];
    const lat = first.lat, lng = first.lng;
    const count = grp.length;
    const atPort = grp.every(i => located[i].L2.atPort);

    if (count === 1) {
      /* 단독 마커 */
      const { s, idx, L2 } = first;
      const m = L.circleMarker([lat, lng], {
        radius: 8, color: cssVar('--buoy','#FF6B35'), weight: 2,
        fillColor: '#FF6B35', fillOpacity: L2.atPort ? 1 : 0.45
      }).addTo(map);
      m.bindTooltip(`${s.vessel} ${s.voyage}`, {className:'vsl-tip', direction:'top', offset:[0,-6]});
      m.on('click', () => { select(s, idx, false); showPO(s, idx); });
      markers.push(m);
    } else {
      /* 클러스터 마커 — 숫자 표시 */
      const vessels = grp.map(i => `${located[i].s.vessel} ${located[i].s.voyage}`).join('<br>');
      const icon = L.divIcon({
        className: '',
        html: `<div style="width:28px;height:28px;border-radius:50%;background:#FF6B35;border:2px solid #FF6B35;opacity:${atPort?1:0.7};display:flex;align-items:center;justify-content:center;font-family:'IBM Plex Mono',monospace;font-size:11px;font-weight:600;color:#07141C;line-height:1">${count}</div>`,
        iconSize: [28, 28], iconAnchor: [14, 14]
      });
      const m = L.marker([lat, lng], { icon }).addTo(map);
      m.bindTooltip(vessels, {className:'vsl-tip', direction:'top', offset:[0,-14]});
      m.on('click', () => {
        const { s, idx } = located[grp[0]];
        select(s, idx, false); showPO(s, idx);
      });
      markers.push(m);
    }
  });
  if(markers.filter(Boolean).length) map.fitBounds(L.featureGroup(markers.filter(Boolean)).getBounds().pad(0.35));
}
