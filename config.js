/* ===== config.js — 상수 · 유틸 · 날짜 포맷 ===== */
const APP_VERSION = 'v1.1.1';
const QUALITY_URL = "quality.html";
const API_ROOT = "https://kossan-oqc-dev.dhoqc.workers.dev";
const API = API_ROOT + "/data";
const HISTORY_API = API_ROOT + "/delayhistory";
const BOOKINGS_API = API_ROOT + "/bookings";
const LOOKUP_API = API_ROOT + "/lookup";
const COLLECT_API = API_ROOT + "/collect";
const DEBUG_API = API_ROOT + "/debug";
const SYSTEM_API = API_ROOT + "/lastrun";
const source = () => API || "shipments.json";

/* Worker와 프론트 공통 지연 기준 */
const DELAY_WATCH_D = 3;
const DELAY_ALERT_D = 7;

const FALLBACK = {
  updated:"2026-08-03 10:12",
  shipments:[
    { booking:"KULM68088700", vessel:"CONTI CONQUEST", voyage:"0036E", svc:"PS3",
      feeder:"HMM MONGLA 0033N", imo:9293818,
      polDep:"2026-07-06T00:56", tsArr:"2026-07-07T23:13", tsDep:"2026-07-14T11:28", eta:"2026-08-08T07:00",
      names:["PORT KLANG","SINGAPORE","BA RIA VUNG TAU","YANTIAN","LOS ANGELES"],
      route:[[2.9372384,101.3007552],[1.2511247,103.7272898],[10.5372748,107.0315867],
             [22.5703753,114.2596394],[33.76478926,-118.2680205]],
      idx:3, ratio:0.6826,
      pos:["FNG031006 (Container 2 of 18)","FNG031006 (Container 3 of 18)","FNG031006 (Container 4 of 18)","FNG031006 (Container 5 of 18)","FNG031006 (Container 6 of 18)","FNG031006 (Container 7 of 18)","FNG031006 (Container 8 of 18)","FNG031006 (Container 9 of 18)","FNG031006 (Container 10 of 18)","FNG031006 (Container 11 of 18)","FNG031006 (Container 12 of 18)","FNG031006 (Container 13 of 18)","FNG031006 (Container 14 of 18)","FNG031006 (Container 15 of 18)"], poEta:"2026-08-09",
      last:"Jul 14 departed Singapore · Jul 22 departed Yantian" },
    { booking:"KULM75953600", vessel:"HYUNDAI PLUTO", voyage:"0047E", svc:"PS3",
      feeder:"HR RHEA 0110N", imo:9725160,
      polDep:"2026-07-22T20:30", tsArr:"2026-07-26T02:53", tsDep:"2026-07-29T06:59", eta:"2026-08-24T07:00",
      names:["PORT KLANG","SINGAPORE","BA RIA VUNG TAU","YANTIAN","LOS ANGELES"],
      route:[[2.9372384,101.3007552],[1.2511247,103.7272898],[10.5372748,107.0315867],
             [22.5703753,114.2596394],[33.76478926,-118.2680205]],
      idx:2, ratio:0.2374,
      pos:["FNG031006 (Container 16 of 18)","FNG031006 (Container 17 of 18)","FNG031006 (Container 18 of 18)","FNG031007 (Container 1 of 18)","FNG031007 (Container 2 of 18)","FNG031007 (Container 3 of 18)","FNG031007 (Container 4 of 18)","FNG031007 (Container 5 of 18)","FNG031007 (Container 6 of 18)","FNG031007 (Container 7 of 18)","FNG031007 (Container 8 of 18)","FNG031007 (Container 9 of 18)","FNG031007 (Container 10 of 18)","FNG031007 (Container 11 of 18)"], poEta:"2026-08-16",
      last:"Jul 29 departed Singapore · Cai Mep → Yantian leg" },
    { booking:"KULM40326600", vessel:"HANS SCHULTE", voyage:"0001E", svc:"PS5",
      feeder:"HR HERA 0110N", imo:9531909,
      polDep:"2026-07-29T12:00", tsArr:"2026-07-31T11:03", tsDep:"2026-08-07T09:30", eta:"2026-08-26T17:00",
      names:["PORT KLANG","SINGAPORE","BA RIA VUNG TAU","LOS ANGELES"],
      route:[[2.9372384,101.3007552],[1.2511247,103.7272898],[10.5372748,107.0315867],
             [33.76478926,-118.2680205]],
      idx:1, ratio:0,
      pos:["FNG031007 (Container 12 of 18)","FNG031007 (Container 13 of 18)","FNG031007 (Container 14 of 18)","FNG031007 (Container 15 of 18)","FNG031007 (Container 16 of 18)","FNG031007 (Container 17 of 18)","FNG031007 (Container 18 of 18)","FNG031008 (Container 1 of 15)","FNG031008 (Container 2 of 15)","FNG031008 (Container 3 of 15)","FNG031008 (Container 4 of 15)","FNG031008 (Container 5 of 15)","FNG031008 (Container 6 of 15)","FNG031008 (Container 7 of 15)"], poEta:"2026-08-23",
      poNote:"Source lists two ETAs for this lot (23-Aug and 27-Aug). The earlier date is shown.",
      last:"Jul 31 feeder discharged at Singapore · awaiting mother vessel" },
    { booking:"KULM85176300", vessel:"HMM JAKARTA", voyage:"0145E", svc:"PS5",
      feeder:"HR HERA 0110N", imo:9323522,
      polDep:"2026-07-29T12:00", tsArr:"2026-07-31T11:11", tsDep:"2026-08-08T03:00", eta:"2026-09-01T04:30",
      names:["PORT KLANG","SINGAPORE","BA RIA VUNG TAU","HAI PHONG","LOS ANGELES"],
      route:[[2.9372384,101.3007552],[1.2511247,103.7272898],[10.5372748,107.0315867],
             [20.796246,106.9065732],[33.76478926,-118.2680205]],
      idx:1, ratio:0,
      pos:["FNG031008 (Container 8 of 15)","FNG031008 (Container 9 of 15)","FNG031008 (Container 10 of 15)","FNG031008 (Container 11 of 15)","FNG031008 (Container 12 of 15)","FNG031008 (Container 13 of 15)","FNG031008 (Container 14 of 15)","FNG031008 (Container 15 of 15)","FNG031009 (Container 1 of 15)","FNG031009 (Container 2 of 15)","FNG031009 (Container 3 of 15)","FNG031009 (Container 4 of 15)","FNG031009 (Container 5 of 15)","FNG031009 (Container 6 of 15)"], poEta:"2026-09-03",
      last:"Jul 31 feeder discharged at Singapore · awaiting mother vessel" },
    { booking:"KULM72444200", vessel:"YM MODERATION", voyage:"0084E", svc:"PS5",
      feeder:"NZ SUZHOU 0015N", imo:9664897,
      polDep:"2026-08-02T12:00", tsArr:"2026-08-04T04:45", tsDep:"2026-08-19T15:30", eta:"2026-09-13T17:00",
      names:["PORT KLANG","SINGAPORE","BA RIA VUNG TAU","HAI PHONG","LOS ANGELES"],
      route:[[2.9372384,101.3007552],[1.2511247,103.7272898],[10.5372748,107.0315867],
             [20.796246,106.9065732],[33.76478926,-118.2680205]],
      idx:0, ratio:0,
      pos:["FNG031009 (Container 7 of 15)","FNG031009 (Container 8 of 15)","FNG031009 (Container 9 of 15)","FNG031009 (Container 10 of 15)","FNG031009 (Container 11 of 15)","FNG031009 (Container 12 of 15)","FNG031009 (Container 13 of 15)","FNG031009 (Container 14 of 15)","FNG031009 (Container 15 of 15)","FNG031010 (Container 1 of 15)","FNG031010 (Container 2 of 15)","FNG031010 (Container 3 of 15)","FNG031010 (Container 4 of 15)","FNG031010 (Container 5 of 15)"], poEta:"2026-09-06",
      poNote:"These 14 containers are split across 3 feeder/mother combinations (ONE PREMIUM 0093E ×2, YM MODERATION 0084E). The per-container split is not specified in the source.",
      last:"Aug 2 feeder loaded at Port Klang · Singapore ETA Aug 4" },
    { booking:"KULM92606700", vessel:"HYUNDAI TOKYO", voyage:"0164E", svc:"PS5",
      feeder:"HR RHEA 0109N", imo:null,
      polDep:"2026-07-03T12:00", tsArr:"2026-07-05T18:36", tsDep:"2026-07-18T21:45", eta:"2026-08-13T04:00",
      names:["PORT KLANG","SINGAPORE","SINGAPORE","BA RIA VUNG TAU","HAI PHONG","LOS ANGELES"],
      route:[[2.9372384,101.3007552],[1.2511247,103.7272898],[1.3115724,103.7188794],
             [10.5372748,107.0315867],[20.796246,106.9065732],[33.76478926,-118.2680205]],
      idx:4, ratio:0.4205,
      pos:["FNG031005 (Container 6 of 18)","FNG031005 (Container 7 of 18)","FNG031005 (Container 8 of 18)","FNG031005 (Container 9 of 18)","FNG031005 (Container 10 of 18)","FNG031005 (Container 11 of 18)","FNG031005 (Container 12 of 18)","FNG031005 (Container 13 of 18)","FNG031005 (Container 14 of 18)","FNG031005 (Container 15 of 18)","FNG031005 (Container 16 of 18)","FNG031005 (Container 17 of 18)","FNG031005 (Container 18 of 18)","FNG031006 (Container 1 of 18)"], poEta:"2026-08-02",
      last:"Jul 18 departed Singapore · Hai Phong → LA leg" }
  ]
};

/* ---------- 항구명 정규화 ---------- */
const shortPort = n => !n ? "" : String(n).split(",")[0].replace(/\s+/g," ").trim().toUpperCase();

function portNames(s){
  const raw  = Array.isArray(s.names) ? s.names : [];
  const need = Array.isArray(s.route) ? s.route.length : raw.length;
  const real = raw.filter(n=>n && !/^P\d+$/.test(n));
  if(real.length === need) return raw.map(shortPort);
  const legs = Array.isArray(s.legs) ? s.legs : [];
  const first = legs.length ? shortPort(legs[0].pol) : (raw[0] ? shortPort(raw[0]) : "");
  const lastN = legs.length ? shortPort(legs[legs.length-1].pod) : (raw[need-1] ? shortPort(raw[need-1]) : "");
  const out = [];
  for(let i=0;i<need;i++){
    if(i===0 && first) out.push(first);
    else if(i===need-1 && lastN) out.push(lastN);
    else out.push(raw[i] ? shortPort(raw[i]) : ("P"+(i+1)));
  }
  return out;
}
const dedupeLabels = names => names.map((n,i)=> i>0 && n===names[i-1] ? "" : n);

/* ---------- 정렬 · 만료 ---------- */
const TS = s => { const t = s ? new Date(String(s).replace(" ","T")+"Z").getTime() : NaN;
                  return Number.isFinite(t) ? t : null; };
const DAY = 86400000;

function prune(list){
  const now=Date.now();
  return list.filter(s=>{ const t=TS(s.eta); return t===null ? true : now < t + 7*DAY; });
}
function sortByETD(list){
  const key = s => TS(s.polDep) ?? TS(s.eta) ?? Infinity;
  return [...list].sort((a,b)=>{ const d = key(a) - key(b); return d || String(a.booking).localeCompare(String(b.booking)); });
}

/* ---------- 날짜 포맷 ---------- */
const MON3 = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const monAbbr = mm => MON3[parseInt(mm,10)-1] || mm;
const fmtDT = s => !s ? "—" : monAbbr(s.slice(5,7))+"/"+s.slice(8,10)+" "+s.slice(11,16);
const fmtD  = s => !s ? "—" : monAbbr(s.slice(5,7))+"/"+s.slice(8,10);

/* ---------- 시간대 변환 ---------- */
function ago(ts){
  const t = ts.trim().replace(" ","T");
  const iso = /Z$/i.test(t) ? t : t+"+09:00";
  const m=Math.round((Date.now()-new Date(iso).getTime())/60000);
  return m<60 ? m+"m ago" : m<1440 ? Math.round(m/60)+"h ago" : Math.round(m/1440)+"d ago";
}

/* "2026-08-03 23:13Z"(UTC) → "08-04 08:13 KST" */
function toKST(ts){
  if(!ts) return "—";
  const t = String(ts).trim().replace(" ","T");
  const d = new Date(/Z$/i.test(t) ? t : t+"+09:00");
  if(isNaN(d)) return ts;
  const k = new Date(d.getTime() + 9*3600000);
  const p = n => String(n).padStart(2,"0");
  return `${p(k.getUTCMonth()+1)}-${p(k.getUTCDate())} ${p(k.getUTCHours())}:${p(k.getUTCMinutes())} KST`;
}
/* SYSTEM 탭 시간: "Aug/11 09:01 (08:01)" — KST, 괄호는 MYT */
function fmtSysTime(ts){
  if(!ts) return "—";
  const t = String(ts).trim().replace(" ","T");
  const d = new Date(/Z$/i.test(t) ? t : t+"Z");
  if(isNaN(d)) return ts;
  const kst = new Date(d.getTime() + 9*3600000);
  const myt = new Date(d.getTime() + 8*3600000);
  const p = n => String(n).padStart(2,"0");
  return `${monAbbr(p(kst.getUTCMonth()+1))}/${p(kst.getUTCDate())} ${p(kst.getUTCHours())}:${p(kst.getUTCMinutes())} (${p(myt.getUTCHours())}:${p(myt.getUTCMinutes())})`;
}

/* ---------- Cron ---------- */
const CRON_KST = [0, 3, 6, 9, 12, 15, 18, 21];
const CRON_LABEL = "00:00 / 03:00 / 06:00 / 09:00 / 12:00 / 15:00 / 18:00 / 21:00 KST";
const hhmm = f => String(Math.floor(f)).padStart(2,"0")+":"+String(Math.round((f%1)*60)).padStart(2,"0");

function nextRun(){
  const now=new Date();
  const kst=new Date(now.getTime()+(now.getTimezoneOffset()*60000)+9*3600000);
  const h=kst.getHours()+kst.getMinutes()/60;
  let wait=null;
  for(const c of CRON_KST){ if(c>h){ wait=(c-h)*3600000; break; } }
  if(wait===null) wait=(24-h+CRON_KST[0])*3600000;
  const m=Math.round(wait/60000);
  return m<60 ? m+"m" : Math.floor(m/60)+"h "+(m%60?m%60+"m ":"")+"";
}

/* ---------- 테마 타일 ---------- */
const TILE = {
  dark : 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png?key=cb1_2f79_1_06b086bcb2b8a0b805a1b0d6',
  light: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png?key=cb1_2f79_1_06b086bcb2b8a0b805a1b0d6'
};

/* ---------- 항구 좌표 (글로벌 인덱스) ---------- */
const PORT_FALLBACK = {
  "PORT KLANG":[2.9372384,101.3007552], "SINGAPORE":[1.2511247,103.7272898],
  "LOS ANGELES":[33.76478926,-118.2680205], "BA RIA VUNG TAU":[10.5372748,107.0315867],
  "HAI PHONG":[20.796246,106.9065732], "YANTIAN":[22.5703753,114.2596394]
};
let PORTXY = {};
function buildPortIndex(list){
  PORTXY = {...PORT_FALLBACK};
  (list||[]).forEach(s=>{
    if(!Array.isArray(s.route) || !Array.isArray(s.names)) return;
    s.names.forEach((n,i)=>{
      const k = shortPort(n);
      if(k && !/^P\d+$/.test(k) && s.route[i]) PORTXY[k] = s.route[i];
    });
  });
}

/* ---------- CSS 변수 ---------- */
function cssVar(name, fb){
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fb;
}

