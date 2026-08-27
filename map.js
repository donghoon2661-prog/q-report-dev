/* ===== map.js — 지도 · 좌표 · 위치 계산 ===== */

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
  const T = v => v ? new Date(v+"Z").getTime() : null;
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
  const T = v => v ? new Date(v+"Z").getTime() : null;
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
    const r = s.route.map(wrap);
    L.polyline(r,{color:'#1E3A4C',weight:s.routeSynth?1:1.5,
      dashArray:s.routeSynth?'2,8':'4,6',opacity:s.routeSynth?.7:1}).addTo(map);
    r.forEach((p,k)=>{
      const key = p[0].toFixed(2)+","+p[1].toFixed(2);
      if(portSeen[key]) return; portSeen[key]=1;
      L.circleMarker(p,{radius:4,color:cssVar('--fog','#8AA4B5'),weight:1.5,
                        fillColor:cssVar('--ink','#07141C'),fillOpacity:1})
        .bindTooltip(s.names[k],{className:'vsl-tip',direction:'top'}).addTo(map);
    });
  });

  const seen={};
  data.shipments.forEach((s,idx)=>{
    const L2 = locate(s);
    if(!L2){ markers.push(null); return; }
    let [lat,lng] = L2.pos;
    const key = lat.toFixed(1)+","+lng.toFixed(1);
    seen[key]=(seen[key]||0)+1;
    if(seen[key]>1){ lat += 0.9*(seen[key]-1); lng += 1.4*(seen[key]-1); }
    const m = L.circleMarker([lat,lng],{radius:8,color:cssVar('--buoy','#FF6B35'),weight:2,
      fillColor:'#FF6B35',fillOpacity:L2.atPort?1:0.45}).addTo(map);
    m.bindTooltip(`${s.vessel} ${s.voyage}`,{className:'vsl-tip',direction:'top',offset:[0,-6]});
    m.on('click',()=>{ select(s,idx,false); showPO(s,idx); });
    markers.push(m);
  });
  if(markers.filter(Boolean).length) map.fitBounds(L.featureGroup(markers.filter(Boolean)).getBounds().pad(0.35));
}
