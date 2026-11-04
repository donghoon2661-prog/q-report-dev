/* ===== config.js — 상수 · 유틸 · 날짜 포맷 ===== */
const APP_VERSION = 'v1.3.0';
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

/* ---------- 로그인 토큰 (2026-11-04) ----------
   비밀번호는 Worker POST /login 이 확인하고 토큰을 준다(프런트에는 비밀번호가 없다).
   API_ROOT 로 가는 fetch 에는 토큰을 자동으로 붙인다. Worker 가 "Login required"(401)를 주면
   토큰이 만료·무효인 것이라 로그인 정보를 지우고 첫 화면(비밀번호 창)으로 돌아간다. */
const TOKEN_KEY = "kossan_token";
const TOKEN_EXP_KEY = "kossan_token_exp";
function authToken(){
  try{
    const t = localStorage.getItem(TOKEN_KEY), exp = +localStorage.getItem(TOKEN_EXP_KEY) || 0;
    return t && exp > Date.now() ? t : null;
  }catch(_){ return null; }
}
function clearAuth(){
  try{ ["kossan_auth_ts", "kossan_role", TOKEN_KEY, TOKEN_EXP_KEY].forEach(k => localStorage.removeItem(k)); }catch(_){}
}
function authHeaderObj(){ const t = authToken(); return t ? { Authorization: "Bearer " + t } : {}; }
(function(){
  const rawFetch = window.fetch.bind(window);
  let bounced = false;
  window.fetch = function(input, init){
    const url = typeof input === "string" ? input : (input && input.url) || "";
    if(url.indexOf(API_ROOT) !== 0 || url.split("?")[0] === API_ROOT + "/login") return rawFetch(input, init);
    const headers = new Headers((init && init.headers) || {});
    const t = authToken();
    if(t && !headers.has("Authorization")) headers.set("Authorization", "Bearer " + t);
    return rawFetch(input, Object.assign({}, init, { headers })).then(r => {
      if(r.status === 401 && t && !bounced){   // 토큰을 보냈는데 거절됐을 때만(로그인 전 요청은 그냥 401)
        r.clone().json().then(j => {
          if(j && j.error === "Login required" && !bounced){ bounced = true; clearAuth(); location.reload(); }
        }).catch(()=>{});
      }
      return r;
    });
  };
  /* COA 원문 PDF 새 탭 링크(/coa-pdf): 링크로는 토큰을 못 보내므로 받아서 blob 으로 연다 */
  document.addEventListener("click", e => {
    const a = e.target && e.target.closest && e.target.closest("a[href]");
    if(!a || a.href.indexOf(API_ROOT + "/coa-pdf") !== 0) return;
    e.preventDefault();
    const hash = a.href.indexOf("#") >= 0 ? a.href.slice(a.href.indexOf("#")) : "";
    const w = window.open("", "_blank");
    window.fetch(a.href.split("#")[0], { cache: "no-store" })
      .then(r => r.ok ? r.blob() : Promise.reject(new Error("HTTP " + r.status)))
      .then(b => { const u = URL.createObjectURL(b); if(w) w.location.href = u + hash; else location.href = u + hash; })
      .catch(err => { if(w) w.close(); alert("PDF open failed: " + err.message); });
  }, true);
})();

/* Worker와 프론트 공통 지연 기준 */
const DELAY_WATCH_D = 3;
const DELAY_ALERT_D = 7;

/* Live API 를 못 받을 때 보여 줄 값. 예전에는 실제 선적 6건을 넣어 두었으나 공개 저장소라 비웠다(2026-11-04). */
const FALLBACK = { updated: null, shipments: [] };

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

/* LA 하역 이후 반출·반납을 추적 중인 부킹은 ETB+7일이 지나도 숨기지 않는다.
   목록에서 빼는 시점은 worker가 정한다(반납+3일, 반납 미확인 시 하역+17일). */
function prune(list){
  const now=Date.now();
  const podDischarged = s => { const pod = String(s.pod||"").toUpperCase().trim();
    return !!pod && (s.events||[]).some(e => /DISCHARG/i.test(e.status||"") && String(e.loc||"").toUpperCase().trim() === pod); };
  return list.filter(s=>{ const t=TS(s.eta); return t===null || podDischarged(s) ? true : now < t + 7*DAY; });
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

