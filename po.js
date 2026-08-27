/* ===== po.js — PO 매핑 · 갤러리 · T/S 체류일 ===== */

const PO_KEY  = "oqc_po_map_v1";
const KEY_KEY = "oqc_refresh_key";
const PO_URL  = API.replace(/\/data$/,"") + "/po";
const HIST_URL = API.replace(/\/data$/,"") + "/history";
let HIST = {};
let PO = {}, POETA = {}, PHOTOS = {};

async function loadHistory(){
  try{
    const r = await fetch(HIST_URL,{cache:"no-store"});
    HIST = r.ok ? (await r.json() || {}) : {};
  }catch(_){ HIST = {}; }
  return HIST;
}

async function loadPO(){
  try{
    const r = await fetch(PO_URL, {cache:"no-store"});
    if(!r.ok) throw new Error(r.status);
    const j = await r.json() || {};
    PO     = j.po  || j;
    POETA  = j.eta || {};
    PHOTOS = j.photos || {};
    try{ localStorage.setItem(PO_KEY, JSON.stringify({po:PO,eta:POETA,photos:PHOTOS})); }catch(_){}
  }catch(_){
    try{
      const c = JSON.parse(localStorage.getItem(PO_KEY) || "{}") || {};
      PO = c.po || c; POETA = c.eta || {}; PHOTOS = c.photos || {};
    }catch(__){ PO = {}; POETA = {}; PHOTOS = {}; }
  }
  return PO;
}

async function getKey(){
  let k = "";
  try{ k = localStorage.getItem(KEY_KEY) || ""; }catch(_){}
  if(!k){
    k = (prompt("Enter the refresh key to save PO mapping to the server:")||"").trim();
    if(k){ try{ localStorage.setItem(KEY_KEY,k); }catch(_){} }
  }
  return k;
}
function forgetKey(){ try{ localStorage.removeItem(KEY_KEY); }catch(_){} }

async function savePO(patch, mode, etaPatch, photoPatch){
  const key = await getKey();
  if(!key) return {ok:false, msg:"No key entered — nothing was saved."};
  const r = await fetch(PO_URL, {
    method:"POST",
    headers:{"Content-Type":"application/json","X-Refresh-Key":key},
    body: JSON.stringify({po:patch, eta:etaPatch||{}, photos:photoPatch||{}, mode:mode||"merge"})
  });
  const res = await r.json().catch(()=>({}));
  if(!r.ok){
    if(r.status===401) forgetKey();
    return {ok:false, msg: res.error || ("Save failed ("+r.status+")")};
  }
  PO = res.po || {}; POETA = res.eta || {}; PHOTOS = res.photos || {};
  try{ localStorage.setItem(PO_KEY, JSON.stringify({po:PO,eta:POETA,photos:PHOTOS})); }catch(_){}
  return {ok:true, res};
}

function parsePO(text){
  const map = {}, eta = {}, photos = {}, bad = [];
  let cur = null, n = 0;
  const normDate = v => {
    const d = String(v||"").trim().replace(/[./]/g,"-");
    if(!/^\d{4}-\d{1,2}-\d{1,2}$/.test(d)) return null;
    const [y,m,dd] = d.split("-");
    return `${y}-${String(m).padStart(2,"0")}-${String(dd).padStart(2,"0")}`;
  };
  text.split(/\r?\n/).forEach((line,ln)=>{
    if(!line.trim()) return;
    const ph = line.trim().match(/^(\S+)[\s,\t]+(https?:\/\/\S*pcloud\S*)$/i);
    if(ph){
      const code = (ph[2].match(/[?&]code=([A-Za-z0-9_-]+)/)||[])[1];
      if(code) photos[ph[1].trim().toUpperCase()] = code;
      return;
    }
    const solo = line.trim().match(/^([A-Z]{4}\d{8})[\s,\t]+(\S+)?\s*$/i);
    if(solo){
      cur = solo[1].toUpperCase();
      const d = normDate(solo[2]);
      if(d) eta[cur] = d;
      if(!map[cur]) map[cur] = [];
      return;
    }
    const parts = line.includes("\t") ? line.split("\t") : line.split(/\s{2,}/);
    const left  = (parts[0]||"").trim();
    const right = (parts[1]||"").trim().toUpperCase();
    const third = (parts[2]||"").trim();
    if(right){
      if(!/^[A-Z]{4}\d{8}$/.test(right)){ bad.push(ln+1); return; }
      cur = right;
      const d = normDate(third);
      if(d) eta[cur] = d;
    }
    if(!left) return;
    if(!cur){ bad.push(ln+1); return; }
    (map[cur] = map[cur] || []).push(left);
    n++;
  });
  return { map, eta, photos, bad, n };
}

function poSummary(booking){
  const list = PO[booking];
  if(!list || !list.length) return "";
  const lots = {};
  list.forEach(v=>{ const m=v.match(/^(\S+)/); const k=m?m[1]:v; lots[k]=(lots[k]||0)+1; });
  const parts = Object.keys(lots).map(k=>`${k} ×${lots[k]}`);
  return `${parts.join(", ")} (${list.length})`;
}

function renderPOTable(){
  const el = document.getElementById("potable");
  if(!el) return;
  const etdOf = b => {
    const sh = CUR && (CUR.shipments||[]).find(x=>x.booking===b);
    return sh ? (TS(sh.polDep) ?? TS(sh.eta) ?? Infinity) : Infinity;
  };
  const keys = [...new Set([].concat(
    Object.keys(PO||{}), Object.keys(POETA||{}), Object.keys(PHOTOS||{})
  ))].sort((a,b)=>{ const d = etdOf(a) - etdOf(b); return d || String(a).localeCompare(String(b)); });
  if(!keys.length){ el.innerHTML=""; return; }
  el.innerHTML = `<table><thead><tr>
      <th>BOOKING</th><th>PKG ETD</th><th>LOTS</th><th>CNTR</th><th>PHOTOS</th><th>ORIGINAL ETA</th>
    </tr></thead><tbody>`
    + keys.map(k=>{
        const known  = CUR && CUR.shipments.some(s=>s.booking===k);
        const nCntr  = (PO[k]||[]).length;
        const hasPic = !!PHOTOS[k];
        const eta    = POETA[k] || null;
        return `<tr>
          <td class="b">${k}${known?"":'<span class="l">(not tracked)</span>'}</td>
          <td class="l">${(()=>{const sh=CUR&&(CUR.shipments||[]).find(x=>x.booking===k); return sh?fmtDT(sh.polDep):"—";})()}</td>
          <td class="l">${poSummary(k) || "—"}</td>
          <td>${nCntr || "—"}</td>
          <td class="${hasPic?"yes":"no"}">${hasPic?"O":"X"}</td>
          <td class="${eta?"":"no"}">${eta || "N/A"}</td>
        </tr>`;
      }).join("")
    + `</tbody></table>`;
}

async function applyPO(){
  const st = document.getElementById("postatus");
  const btn = document.getElementById("posave");
  const txt = document.getElementById("poin").value;
  if(!txt.trim()){ st.textContent="Nothing to apply."; return; }
  const { map, eta, photos, bad, n } = parsePO(txt);
  const keys = Object.keys(map);
  if(!keys.length && !Object.keys(photos).length){
    st.innerHTML = `No rows parsed. The first line must carry a booking number.`; return;
  }
  btn.disabled = true; st.textContent = "Saving to server…";
  const out = await savePO(map, "merge", eta, photos);
  btn.disabled = false;
  renderPOTable();
  if(CUR) render(CUR);
  const ph = Object.keys(photos);
  const parts = [];
  if(n) parts.push(`${n} PO row(s) → ${keys.length} booking(s)`);
  if(Object.keys(eta).length) parts.push(`${Object.keys(eta).length} original schedule date(s)`);
  if(ph.length) parts.push(`${ph.length} photo folder(s): ${ph.join(", ")}`);
  st.innerHTML = out.ok
    ? (parts.length ? parts.join(" · ") : "Nothing recognised") + ` — saved to server, visible on any device.`
      + (bad.length? ` Skipped line(s): ${bad.slice(0,8).join(", ")}${bad.length>8?"…":""}` : "")
    : `Not saved — ${out.msg}`;
}

async function clearPO(){
  const st = document.getElementById("postatus");
  const typed = prompt(
    "This deletes ALL mapping data on the server — PO/containers, original schedules and photo links.\n" +
    "It affects every device and cannot be undone.\n\nType  DELETE ALL  to continue:");
  if((typed||"").trim().toUpperCase() !== "DELETE ALL"){
    st.textContent = "Cancelled — nothing was deleted."; return;
  }
  st.textContent = "Clearing…";
  const out = await savePO({}, "replace", {}, {});
  renderPOTable();
  if(CUR) render(CUR);
  st.textContent = out.ok ? "Cleared on server." : ("Not cleared — " + out.msg);
}

/* ---------- T/S 체류일 ---------- */
function tsDwell(s){
  if(!s.tsArr || !s.tsDep) return null;
  const D = (a,b)=> (new Date(b+"Z") - new Date(a+"Z"))/86400000;
  const cur = D(s.tsArr, s.tsDep);
  if(!isFinite(cur)) return null;
  const first = (HIST[s.booking]||[]).find(e=>e.first);
  const plan = (first && first.tsArr && first.tsDep) ? D(first.tsArr, first.tsDep) : null;
  const departed = (s.events||[]).some(e=>{
    const m=(e.mode||"").toUpperCase(), st=(e.status||"").toUpperCase();
    return s.vessel && m.includes(s.vessel.toUpperCase()) && st.includes("DEPARTURE");
  });
  return { cur: Math.round(cur*10)/10, plan: plan===null ? null : Math.round(plan*10)/10,
    diff: plan===null ? null : Math.round((cur-plan)*10)/10, actual: departed };
}
function tsDwellHTML(s){
  const t = tsDwell(s);
  if(!t) return "";
  const lbl = t.actual ? "actual" : "scheduled";
  let extra = "";
  if(t.plan!==null && t.diff!==0){
    const cls = t.diff>0 ? "late" : "early";
    extra = ` <span class="dtag ${cls}">${t.diff>0?"+":""}${t.diff}d vs plan</span>`;
  }else if(t.plan!==null){ extra = ` <span class="dtag early">on plan</span>`; }
  const planTxt = t.plan!==null ? `plan ${t.plan}d → ` : "";
  return `<div class="tsdwell">T/S DWELL <b>${planTxt}${t.cur}d</b> <i>(${lbl})</i>${extra}
    <span class="dim">${fmtDT(s.tsArr)} → ${fmtDT(s.tsDep)}</span></div>`;
}

/* ---------- 로트 사진 (pCloud) ---------- */
const PC_API  = "https://api.pcloud.com";
const PC_PROXY = API.replace(/\/data$/,"") + "/pcloud";
const pcCache = {};

async function pcList(code, folderName){
  const key = code + "|" + (folderName||"");
  if(pcCache[key]) return pcCache[key];
  const u = `${PC_PROXY}?code=${encodeURIComponent(code)}`
          + (folderName?`&folder=${encodeURIComponent(folderName)}`:"");
  const r = await fetch(u,{cache:"no-store"});
  const j = await r.json();
  if(j.error) throw new Error(j.error);
  pcCache[key] = j;
  return j;
}
const pcThumb = (code,id,size) => `${PC_API}/getpubthumb?code=${encodeURIComponent(code)}&fileid=${id}&size=${size||"240x320"}&crop=1&type=jpg`;

function poFolderName(poText){
  const m = String(poText).match(/^([A-Z]+)(\d+)\s*\(\s*Container\s*(\d+)\s*of/i);
  if(!m) return null;
  const d = m[2];
  if(d.length < 6) return null;
  const n = String(m[3]).padStart(2,"0");
  return `${m[1].toUpperCase()}-${d.slice(0,4)}-${d.slice(4)}-${n}`;
}

const PAGE_N = 5;
function renderGallery(el, label, code, folderName){
  const head = txt => `<div class="gal-h"><b>${label}</b> ${txt}</div>`;
  if(!code){ el.innerHTML = head(`<span class="dim">no photo link for this booking</span>`); return; }
  el.innerHTML = head(`<span class="dim">loading…</span>`);
  pcList(code, folderName).then(data=>{
    const files = data.files||[];
    if(!files.length){ el.innerHTML = head(`<span class="dim">no images</span>`); return; }
    let page = 0;
    const pages = Math.ceil(files.length/PAGE_N);
    const draw = () => {
      const slice = files.slice(page*PAGE_N,(page+1)*PAGE_N);
      el.innerHTML = head(
          `<span class="dim">${folderName} · ${files.length} photos · ${page+1}/${pages}</span>
           <span class="gal-nav">
             <button class="gnav" data-d="-1" ${page===0?"disabled":""}>‹</button>
             <button class="gnav" data-d="1" ${page>=pages-1?"disabled":""}>›</button>
           </span>`)
        + `<div class="gal">${slice.map(f=>`
          <a class="gcell" href="${pcThumb(code,f.fileid,"1200x1600")}" target="_blank" rel="noopener"
             title="${(f.name||"").replace(/"/g,"")}">
            <img loading="lazy" src="${pcThumb(code,f.fileid,"240x320")}" alt="${(f.name||"").replace(/"/g,"")}">
            <span class="gname">${f.name||""}</span></a>`).join("")}</div>`;
      el.querySelectorAll(".gnav").forEach(b=>b.addEventListener("click",e=>{
        e.stopPropagation(); page = Math.max(0,Math.min(pages-1,page+ +b.dataset.d)); draw();
      }));
    };
    draw();
  }).catch(e=>{ el.innerHTML = head(`<span class="warn">photos unavailable — ${e.message||e}</span>`); });
}

/* ---------- PO 팝업 ---------- */
let poSelected = null;
function paintMarkers(){
  const on1 = cssVar('--sail','#3FD0A6'), off = cssVar('--buoy','#FF6B35');
  markers.forEach((m,k)=>{
    if(!m || !m.setStyle) return;
    const on = (k===poSelected);
    m.setStyle({color: on?on1:off, fillColor: on?on1:off});
    if(on) m.bringToFront();
  });
}
function showPO(s,i){
  poSelected = i; paintMarkers();
  const list = PO[s.booking] || s.pos || [];
  let cells;
  if(!list.length){
    cells = `<p class="hint" style="margin:0">No PO mapping for this booking yet — use "MAPPING" above to paste it in.</p>`;
  }else{
    const CELLS = Math.max(list.length, 1);
    let out = "";
    for(let k=0;k<CELLS;k++){
      const v = list[k];
      if(!v){ out += `<div class="pocell empty">—</div>`; continue; }
      const m = v.match(/^(\S+)\s*\(Container\s*(\d+)\s*of\s*(\d+)\)/i);
      const fn = poFolderName(v);
      const attr = fn ? ` data-folder="${fn}" data-k="${k}" title="Click to view photos — ${fn}"` : "";
      const cls = fn ? "pocell has-photo" : "pocell";
      out += m
        ? `<div class="${cls}"${attr}><span class="po">${m[1]}</span><span class="cn">${m[2]} / ${m[3]}</span></div>`
        : `<div class="${cls}"${attr}><span class="po">${v}</span></div>`;
    }
    cells = `<div class="pogrid">${out}</div>
      <div class="polegend">
        <span><i style="background:#7FD8FF"></i>PO No.</span>
        <span><i style="background:#F2C14E"></i>Container</span>
      </div>`;
  }
  const p=document.getElementById('popanel');
  let eta="";
  const orig = POETA[s.booking] || s.poEta;
  if(orig && s.eta){
    const gap=Math.round((new Date(s.eta.slice(0,10))-new Date(orig))/86400000);
    const tag = gap>0 ? `<b class="late">${gap}d BEHIND original plan</b>`
              : gap<0 ? `<b class="early">${-gap}d ahead of original plan</b>`
                      : `<b class="ontime">On original plan</b>`;
    eta=`<div class="poeta">
      <span>Original ETA <s>${orig}</s></span>
      <span>Current ETB <b class="cur">${s.eta.slice(0,10)}</b></span>
      ${tag}</div>`;
  }
  const note = s.poNote? `<p class="ponote">${s.poNote}</p>`:"";
  p.innerHTML = `<button class="close" id="poclose" title="Close">✕</button>
     <h3>${s.vessel} ${s.voyage}</h3>
     <div class="sb">${s.booking} · ${list.length} container(s)</div>
     ${tsDwellHTML(s)}${eta}${cells}${note}<div id="galwrap"></div>
     <p class="hintclose">TAP ANYWHERE TO CLOSE · ESC</p>`;
  p.hidden=false;
  document.querySelector('.tablerow').classList.add('open');
  document.getElementById('poclose').addEventListener('click',e=>{e.stopPropagation();closePO();});
  const gw = document.getElementById("galwrap");
  const code = PHOTOS[s.booking] || null;
  if(gw){
    gw.innerHTML = code
      ? `<div class="gal-title">Select a PO / container above to see its photos</div>`
      : `<div class="gal-title dim">No photo link registered for ${s.booking}</div>`;
    if(code){
      p.querySelectorAll(".pocell.has-photo").forEach(cell=>{
        cell.addEventListener("click", ev=>{
          ev.stopPropagation();
          p.querySelectorAll(".pocell").forEach(c=>c.classList.remove("sel"));
          cell.classList.add("sel");
          const label = (list[+cell.dataset.k]||"").replace(/\s*\(/," (");
          gw.innerHTML = `<div class="galbox"></div>`;
          renderGallery(gw.querySelector(".galbox"), label, code, cell.dataset.folder);
        });
      });
    }
  }
  p.onclick = e => { if(e.target.closest('.pocell') || e.target.closest('.galbox')) return; closePO(); };
}
document.addEventListener('keydown',e=>{ if(e.key==="Escape") closePO(); });
function closePO(){
  const pp=document.getElementById('popanel'); if(!pp||pp.hidden) return;
  poSelected=null; paintMarkers();
  const p=document.getElementById('popanel');
  p.hidden=true; p.innerHTML="";
  document.querySelector('.tablerow').classList.remove('open');
  document.querySelectorAll('#vtbody tr,#otbody tr').forEach(t=>t.classList.remove('on'));
}
