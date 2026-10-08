/* ===== app.js — 렌더링 · 스케줄 · 표 · 카드 · 인증 · 라우팅 ===== */

/* ---------- 원 스케줄 병기 ---------- */
const ACTUAL_FLAG = { polDep:"polDepActual", tsArr:"tsArrActual", tsDep:"tsDepActual", eta:"etaActual" };

function origOf(bkg, field){
  const log = HIST[bkg] || [];
  for(const e of log){
    if(!Array.isArray(e.changes)) continue;
    const c = e.changes.find(x => x.field === field);
    if(c && c.from) return c.from;
  }
  const f = log.find(e => e.first);
  if(f && f[field]) return f[field];
  if(field === "eta" && POETA[bkg]) return POETA[bkg];
  return null;
}
const fmtAny = v => !v ? "\u2014"
  : /[T ]\d\d:/.test(String(v)) ? fmtDT(v) : monAbbr(String(v).slice(5,7))+"/"+String(v).slice(8,10);
const tsLoose = v => { const a = TS(v); return a !== null ? a : (v ? TS(v + "T00:00:00") : null); };

function dtCell(s, field){
  const cur = s[field], t = TS(cur);
  if(t === null) return fmtDT(cur);
  const flagKey = ACTUAL_FLAG[field];
  const done = flagKey ? !!s[flagKey] : false;
  const orig  = origOf(s.booking, field);
  const ot    = tsLoose(orig);
  const moved = ot !== null && ot !== t;
  const dd    = moved ? Math.round((t - ot) / DAY * 10) / 10 : 0;
  const ddStr = dd.toFixed(1);
  return `${fmtDT(cur)}<span class="sest">${done ? "actual" : "scheduled"}</span>`
       + (moved ? `<span class="sorig">(orig ${fmtAny(orig)}${
           dd ? ` <b class="${dd > 0 ? "warn" : ""}">${dd > 0 ? "+" : ""}${ddStr}d</b>` : ""})</span>` : "");
}

/* ---------- 사이드바 ---------- */
function showSide(s,L2){
  const nm = portNames(s);
  const geo = L2
    ? `<dt>STATUS</dt><dd>${L2.phase}</dd>
       <dt>SEGMENT</dt><dd>${L2.i+1} / ${s.route.length-1} · ${(L2.f*100).toFixed(1)}%</dd>
       <dt>POSITION</dt><dd>${L2.pos[0].toFixed(3)}° , ${unwrap(L2.pos[1]).toFixed(3)}°</dd>`
    : `<dt>STATUS</dt><dd class="warn">Position unavailable — HMM map lookup failed</dd>`;
  const synthNote = s.routeSynth
    ? `<dt>ROUTE SOURCE</dt><dd class="dim">Estimated from booked schedule (HMM map not issued yet)</dd>` : "";

  const po = poSummary(s.booking);
  const poRow = po ? `<dt>PO / LOT</dt><dd>${po}</dd>` : "";
  const d = poDelay(s);
  const dRow = d ? `<dt>VS PLAN</dt><dd>${delayHTML(s)} <span class="dim">(original ${d.orig})</span></dd>` : "";
  const rRow = s.rollover
    ? `<dt>ROLLOVER</dt><dd class="warn">Not loaded on ${s.vessel} ${s.voyage} — ${s.rolloverDays||0}d past ETD</dd>` : "";

  const log = (HIST[s.booking]||[]).slice().reverse();
  const FL = {vessel:"VESSEL", voyage:"VOYAGE", polDep:"PKG ETD", tsDep:"SIN ETD", eta:"LA ETB", destEta:"DEST ETA"};
  const shortV = v => /^\d{4}-\d\d-\d\dT/.test(v||"") ? fmtDT(v) : v;
  // 변경 횟수별 색상 로직
  // - 12h 이내 변경: 색상 유지
  // - 12h 초과 늦어짐: 단계 올라감 (노란→주황→빨간)
  // - 12h 초과 빨라짐: 첫 변경=초록, 이후 색상 변화 없음
  const TWELVE_H = 12 * 60 * 60 * 1000;
  const toMs = v => v && /^\d{4}-\d\d-\d\dT/.test(v) ? new Date(v).getTime() : null;
  const delayColor = n => n >= 3 ? '#ef4444' : n === 2 ? '#f97316' : n === 1 ? '#f6c90e' : null;

  // 값 배열로부터 색상 배열 계산
  // vals: [{v: isoString}] 순서대로
  function calcChainColors(vals) {
    const colors = []; // 각 값의 색상 (첫번째 최초값 제외)
    let delayCount = 0;
    let hasEarlied = false; // 빨라진 적 있는지
    for (let i = 1; i < vals.length; i++) {
      const prevMs = toMs(vals[i-1].v);
      const curMs = toMs(vals[i].v);
      if (prevMs === null || curMs === null) { colors.push(null); continue; }
      const diff = curMs - prevMs;
      if (Math.abs(diff) <= TWELVE_H) {
        // 12h 이내: 색상 유지 (이전 색상과 동일)
        colors.push(colors.length ? colors[colors.length-1] : null);
      } else if (diff > 0) {
        // 12h 초과 늦어짐
        delayCount++;
        colors.push(delayColor(delayCount));
      } else {
        // 12h 초과 빨라짐
        if (!hasEarlied && delayCount === 0) {
          hasEarlied = true;
          colors.push('#4caf8a'); // 첫 변경이고 늦어진 적 없으면 초록
        } else {
          // 빨라지더라도 색상 변화 없음 (이전 색상 유지)
          colors.push(colors.length ? colors[colors.length-1] : null);
        }
      }
    }
    return colors;
  }

  const changeLegend = `<div style="display:flex;gap:14px;font-size:10px;margin-bottom:10px;flex-wrap:wrap">
    <span style="color:#4caf8a">■ earlier (&gt;12h)</span>
    <span style="color:#f6c90e">■ 1 delay (&gt;12h)</span>
    <span style="color:#f97316">■ 2 delays</span>
    <span style="color:#ef4444">■ 3+ delays</span>
    <span style="color:var(--fog)">■ &lt;12h change</span>
  </div>`;
  const histHTML = log.length
    ? `<div class="schist"><div class="sh-h">SCHEDULE CHANGES</div>${changeLegend}` + log.map(e=>{
        if(e.first) return `<div class="sh"><span class="st">${toKST(e.at)}</span>`
          + `<span class="sc dim">first seen · SIN ETD ${fmtDT(e.tsDep)} · LA ETB ${fmtDT(e.eta)}</span></div>`;
        return `<div class="sh"><span class="st">${toKST(e.at)}</span><span class="sc">`
          + (e.changes||[]).map(c=>{
              const field = FL[c.field]||c.label;
              const eIdx = log.indexOf(e);
              const prevChanges = [];
              for(let pi = log.length-1; pi > eIdx; pi--){
                const prevE = log[pi];
                if(prevE.first) continue;
                const prevC = (prevE.changes||[]).find(x=>x.field===c.field);
                if(prevC) prevChanges.push(prevC);
              }
              // 전체 값 배열 구성 (시간순: 최초값 → ... → 현재값)
              const allVals = [];
              if(prevChanges.length){
                allVals.push({ v: prevChanges[prevChanges.length-1].from });
                for(let ci=prevChanges.length-1;ci>=0;ci--) allVals.push({ v: prevChanges[ci].to });
              } else {
                allVals.push({ v: c.from });
              }
              allVals.push({ v: c.to });

              const colors = calcChainColors(allVals);

              let chain = `<s style="color:var(--fog)">${shortV(allVals[0].v)}</s>`;
              for(let vi=1;vi<allVals.length;vi++){
                const col = colors[vi-1] || 'var(--fog)';
                const isLast = vi === allVals.length-1;
                const val = shortV(allVals[vi].v);
                chain += isLast
                  ? ` → <b style="color:${col}">${val}</b>`
                  : ` → <s style="color:${col}">${val}</s>`;
              }
              return `${field} ${chain}`;
            }).join("<br>")
          + `</span></div>`;
      }).join("") + `</div>`
    : `<div class="schist"><div class="sh-h">SCHEDULE CHANGES</div>
       <div class="sh"><span class="sc dim">No changes recorded yet — tracking started with this build.</span></div></div>`;

  const ev = Array.isArray(s.events) && s.events.length
    ? `<div class="evtl">${s.events.slice(0,6).map((e,k)=>
        `<div class="ev${k?"":" now"}"><span class="et">${fmtDT(e.at)}</span>
         <span class="es">${e.status}</span><span class="el">${shortPort(e.loc)}</span></div>`).join("")}</div>`
    : "";

  const chk = s.checkedAt
    ? `<dt>CHECKED</dt><dd>${toKST(s.checkedAt)} · ${ago(s.checkedAt)}${isStaleVisible(s)?' <b class="warn">(retry pending)</b>':''}</dd>` : "";

  document.getElementById('side').innerHTML=`
    <h3>${s.vessel} ${s.voyage}${phaseBadge(s,L2)}</h3>
    <div class="sb">${s.booking} · ${s.svc} · ${s.cntrQty||(s.containers&&s.containers.length)||"—"} CNTR${s.cntrType?" "+s.cntrType:""}</div>
    <dl>
      ${geo}
      <dt>ROUTE</dt><dd>${dedupeLabels(nm).filter(n=>n && !/^P\d+$/.test(n)).join(" → ")}</dd>
      <dt>PKG ETD</dt><dd>${dtCell(s,"polDep")}</dd>
      ${s.spDep ? `<dt>GATE IN</dt><dd><span class="dt">${fmtDT(s.spDep)}</span><span class="sest">actual</span></dd>` : ""}
      <dt>SIN ETA</dt><dd>${dtCell(s,"tsArr")}</dd>
      <dt>SIN ETD</dt><dd>${dtCell(s,"tsDep")}</dd>
      ${(()=>{const t=tsDwell(s);return t?`<dt>T/S DWELL</dt><dd>${t.plan!==null?`plan ${t.plan}d → `:""}<b>${t.cur}d</b> <span class="dim">(${t.actual?"actual":"scheduled"})</span>${t.diff!==null&&t.diff!==0?` <span class="${t.diff>0?"warn":""}">${t.diff>0?"+":""}${t.diff}d</span>`:""}</dd>`:"";})()}
      <dt>LA ETB</dt><dd>${dtCell(s,"eta")}</dd>
      <dt>DEST ETA</dt><dd>${dtCell(s,"destEta")}</dd>
      <dt>FEEDER</dt><dd>${s.feeder||"— (direct)"}</dd>
      ${synthNote}${poRow}${dRow}${rRow}${chk}
      <dt>LATEST</dt><dd>${s.last||"—"}</dd>
    </dl>${histHTML}${ev}`;
}
function select(s,i,pan){
  showSide(s,locate(s));
  document.querySelectorAll('#vtbody tr').forEach(t=>t.classList.toggle('on',+t.dataset.i===i));
  if(pan && markers[i] && markers[i].getLatLng) map.panTo(markers[i].getLatLng());
  if(markers[i] && markers[i].openTooltip) markers[i].openTooltip();
}

/* ---------- 변동 로그 ---------- */
const SIGNAL_DAYS = 5;

/* STALE 표시 여부 — scheduleCheckedAt 기준 12시간 이내면 숨김 */
function isStaleVisible(s) {
  if (!s.staleItem) return false;
  const at = s.scheduleCheckedAt || s.checkedAt;
  if (!at) return true;
  const age = Date.now() - new Date(at.replace(' ','T').replace(/Z$/,'')+'Z').getTime();
  return age >= 12 * 60 * 60 * 1000;
}
/* ---------- LA 이후(하역·반출·반납) ----------
   worker가 이미 저장하는 events에서 직접 읽는다 (worker의 podEventAt과 같은 기준: POD에서 난 이벤트만).
   HMM 이력은 부킹의 첫 번째 컨테이너 기준이다. 시각은 모두 LA 현지 시각. */
function podEvAt(s, kw) {
  const pod = String(s.pod || "").toUpperCase().trim();
  if (!pod) return null;
  const hit = (s.events || []).find(e =>
    String(e.status || "").toUpperCase().includes(kw) &&
    String(e.loc || "").toUpperCase().trim() === pod);
  return hit ? hit.at : null;
}
function postArrival(s) {
  const dis = podEvAt(s, "DISCHARG"), out = podEvAt(s, "GATE OUT"), rtn = podEvAt(s, "EMPTY CONTAINER RETURNED");
  const stage = rtn ? "returned" : out ? "out" : (dis || s.etaActual) ? "discharged"
              : s.podBerthingActual ? "berthed" : null;
  return { dis, out, rtn, stage };
}
/* 이벤트 시각(현지, 시간대 없음) 사이의 경과 — 둘 다 같은 기준으로 파싱해 차이만 쓴다 */
const evT = at => at ? new Date(at.replace(" ", "T").slice(0, 16)).getTime() : NaN;
function laNowT() {
  const t = new Date().toLocaleString("sv-SE", { timeZone: "America/Los_Angeles" });
  return new Date(t.replace(" ", "T").slice(0, 16)).getTime();
}
function spanTxt(a, b) {
  const h = (b - a) / 3.6e6;
  if (!Number.isFinite(h) || h < 0) return "";
  return h < 24 ? `${Math.max(1, Math.round(h))}h` : `${Math.floor(h / 24)}d`;
}
const PA_BADGE = { discharged: ["done", "DISCHARGED"], out: ["out", "GATED OUT"], returned: ["rtn", "RETURNED"] };

function phaseBadge(s, L2) {
  if (!s.spDep && !s.etaActual) return `<span class="ph book">BOOKED</span>`;
  const pa = postArrival(s);
  if (PA_BADGE[pa.stage]) return `<span class="ph ${PA_BADGE[pa.stage][0]}">${PA_BADGE[pa.stage][1]}</span>`;
  if (!L2) return "";
  if (L2.atPort) {
    const cur = L2.names[L2.i] || "";
    const ts  = (s.ts || "").toUpperCase();
    if (ts && cur.toUpperCase().includes(ts.slice(0,3)))
      return `<span class="ph dock">AT T/S PORT</span>`;
    return `<span class="ph dock">BERTHED</span>`;
  }
  return `<span class="ph sail">AT SEA</span>`;
}
const GAP_REMARK = `<p class="gapremark">The <b>!</b> mark appears when the LA ETB has moved
  against the original plan, and disappears automatically ${SIGNAL_DAYS} days after the change was
  detected. Click the number box at any time to see the full change log.</p>
<p class="gapremark">All dates and times are local dates and times.</p>
<p class="gapremark">OUT is the terminal gate out and RTN the empty container return in Los Angeles.
  The box next to each shows the time since the previous step (discharge → gate out → return).
  Both follow the first container of each booking.</p>`;

function etaChangeLog(booking){
  const plan = POETA[booking] || null;
  const log = (HIST[booking]||[]).filter(e => Array.isArray(e.changes) && e.changes.some(c => c.field === "eta"));
  const gapOf = v => { if(!plan || !v) return null; return Math.round((new Date(v.slice(0,10)) - new Date(plan))/86400000); };
  return log.map(e=>{
    const c = e.changes.find(x=>x.field==="eta");
    return { at:e.at, from:c.from, to:c.to, gapFrom:gapOf(c.from), gapTo:gapOf(c.to) };
  }).reverse();
}
function etaChangedRecently(booking){
  const log = etaChangeLog(booking);
  if(!log.length) return false;
  const t = Date.parse(String(log[0].at).replace(" ","T").replace("Z","")+"Z");
  if(!Number.isFinite(t)) return false;
  return (Date.now() - t) < SIGNAL_DAYS*86400000;
}
function vesselChangeLog(booking){
  const log = (HIST[booking]||[]).filter(e => Array.isArray(e.changes) && e.changes.some(c => c.field === "vessel"));
  return log.map(e=>{
    const v = e.changes.find(x=>x.field==="vessel");
    const y = e.changes.find(x=>x.field==="voyage");
    return { at:e.at, vFrom:v.from, vTo:v.to, yFrom:y?y.from:null, yTo:y?y.to:null };
  }).reverse();
}
function vesselChangedRecently(booking){
  const log = vesselChangeLog(booking);
  if(!log.length) return false;
  const t = Date.parse(String(log[0].at).replace(" ","T").replace("Z","")+"Z");
  if(!Number.isFinite(t)) return false;
  return (Date.now() - t) < SIGNAL_DAYS*86400000;
}
function showVesselLog(booking){
  const log = vesselChangeLog(booking);
  const box = document.getElementById("gaplog");
  if(!box) return;
  const rows = log.length
    ? log.map(e=>`<tr><td>${toKST(e.at)}</td>
        <td>${e.vFrom} → <b>${e.vTo}</b>${e.yTo?` (${e.yFrom||"—"} → ${e.yTo})`:""}</td></tr>`).join("")
    : `<tr><td colspan="2" class="dim">No vessel change recorded for this booking.</td></tr>`;
  box.innerHTML = `<div class="gl-in">
      <div class="gl-h"><b>${booking}</b> — Vessel change log<button class="gl-x" aria-label="close">✕</button></div>
      <table><thead><tr><th>DETECTED</th><th>VESSEL / VOYAGE</th></tr></thead><tbody>${rows}</tbody></table>
      <p class="gl-n">Detected at each scheduled collection.</p></div>`;
  box.hidden = false;
  box.querySelector(".gl-x").addEventListener("click",()=>{ box.hidden = true; });
  box.addEventListener("click",e=>{ if(e.target===box) box.hidden=true; },{once:true});
}
function showGapLog(booking){
  const log = etaChangeLog(booking);
  const box = document.getElementById("gaplog");
  if(!box) return;
  const rows = log.length
    ? log.map(e=>`<tr><td>${toKST(e.at)}</td>
        <td>${fmtDT(e.from)} → <b>${fmtDT(e.to)}</b></td>
        <td class="${(e.gapTo??0) > (e.gapFrom??0) ? "worse":"better"}">
          ${e.gapFrom===null?"—":(e.gapFrom>0?"+":"")+e.gapFrom+"d"} →
          ${e.gapTo===null?"—":(e.gapTo>0?"+":"")+e.gapTo+"d"}</td></tr>`).join("")
    : `<tr><td colspan="3" class="dim">No ETB change recorded for this booking.</td></tr>`;
  box.innerHTML = `<div class="gl-in">
      <div class="gl-h"><b>${booking}</b> — LA ETB change log<button class="gl-x" aria-label="close">✕</button></div>
      <table><thead><tr><th>DETECTED</th><th>LA ETB</th><th>VS PLAN</th></tr></thead><tbody>${rows}</tbody></table>
      <p class="gl-n">Original plan ${POETA[booking]||"—"} · detected at each scheduled collection.</p></div>`;
  box.hidden = false;
  box.querySelector(".gl-x").addEventListener("click",()=>{ box.hidden = true; });
  box.addEventListener("click",e=>{ if(e.target===box) box.hidden=true; },{once:true});
}

/* ---------- 배지 ---------- */
/* DELAY_WATCH_D / DELAY_ALERT_D 는 config.js에서 선언 (3 / 7) */
function poDelay(s){
  const orig = s.planEta || POETA[s.booking] || s.poEta;
  if(!orig || !s.eta) return null;
  const gap = (typeof s.delayDays === "number")
    ? s.delayDays
    : Math.round((new Date(s.eta.slice(0,10)) - new Date(orig))/86400000);
  const level = s.alert || (gap>=DELAY_ALERT_D ? "alert" : gap>=DELAY_WATCH_D ? "watch" : "ok");
  return {gap, orig, level};
}
function delayHTML(s){
  const d = poDelay(s);
  if(!d) return "";
  const cls = d.level==="alert" ? "late" : d.level==="watch" ? "watch" : "early";
  const txt = d.gap>0 ? `${d.gap}d behind` : d.gap<0 ? `${-d.gap}d ahead` : "on plan";
  return `<span class="dtag ${cls}" title="Original plan ${d.orig} · ${d.level.toUpperCase()}">${txt}</span>`;
}
function rolloverHTML(s){
  if(!s.rollover) return "";
  return `<span class="dtag roll" title="${s.rolloverNote||""}">ROLLOVER ${s.rolloverDays||0}d</span>`;
}
function changeHTML(s){
  if(!Array.isArray(s.justChanged) || !s.justChanged.length) return "";
  const t = s.justChanged.map(c=>`${c.label} ${c.from} → ${c.to}`).join(" / ");
  return `<p class="note warn">Schedule changed — ${t}</p>`;
}
function gapBox(s){
  const d = poDelay(s);
  if(!d) return "";
  const g = d.gap;
  const cls = g < 0 ? "g-early" : d.level==="alert" ? "g-bad" : d.level==="watch" ? "g-warn" : "g-ok";
  const txt = g > 0 ? "+" + g : String(g);
  const bell = etaChangedRecently(s.booking)
    ? `<span class="gapbang" data-b="${s.booking}" title="LA ETB changed within the last ${SIGNAL_DAYS} days — click for the log">!</span>` : "";
  const vbell = vesselChangedRecently(s.booking)
    ? `<span class="gapbang vsl-bang" data-b="${s.booking}" title="Vessel changed within the last ${SIGNAL_DAYS} days — click for the log">!</span>` : "";
  return `<span class="gapbox ${cls}" data-b="${s.booking}"
            title="Original plan ${d.orig} · click for the ETB change log">${txt}</span>${bell}${vbell}`;
}

/* ---------- 표 ---------- */
function rowsHTML(list){
  const actTag = (actual) => (actual ? "actual" : "scheduled");
  /* 모바일 카드에서 글자 대신 A/S 배지로 보이도록 상태 클래스를 붙인다(PC는 글자 그대로) */
  const est = (txt) => txt ? `<span class="est est-${txt === "actual" ? "a" : "s"}">${txt}</span>` : "";
  return list.map((s,i)=>{
    /* ETB는 POD 접안이 확인되면 actual (ETA/도착 완료는 하역 기준 etaActual 그대로) */
    const etaActTag  = actTag(!!s.etaActual || !!s.podBerthingActual);
    const destActTag = s.destEta ? actTag(!!s.etaActual) : "";
    const L2 = locate(s);
    return `
    <tr data-i="${i}">
      <td><span class="nm">${s.vessel}</span><span class="vy">${s.voyage}</span>${phaseBadge(s,L2)}
          <span class="bk">${s.booking} · ${s.cntrQty||"—"} CNTR${isStaleVisible(s)?" · STALE":""}</span></td>
      <td data-l="GATE IN / ETD · PKG">
        <div><span class="eta-lbl">IN</span>${s.spDep?`<span class="dt">${fmtDT(s.spDep)}</span>${est("actual")}`:`<span class="pa-na">—</span>`}</div>
        <div style="margin-top:3px"><span class="eta-lbl">ETD</span><span class="dt">${fmtDT(s.polDep)}</span>${est(actTag(!!s.polDepActual))}</div>
      </td>
      <td data-l="ETD · SIN"><span class="dt">${fmtDT(s.tsDep)}</span>${est(actTag(!!s.tsDepActual))}</td>
      <td data-l="LA ETB / ETA">
        <div><span class="eta-lbl">ETB</span><span class="dt">${fmtDT(s.eta)}</span>${gapBox(s)}${est(etaActTag)}</div>
        ${s.destEta?`<div style="margin-top:3px"><span class="eta-lbl">ETA</span><span class="dt">${fmtDT(s.destEta)}</span>${est(destActTag)}</div>`:""}
      </td>
      <td class="pa-td" data-l="LA OUT / RTN">${postArrivalCell(s)}</td>
    </tr>`;
  }).join("");
}

/* LA GATE OUT / EMPTY RETURN 칸 — 옆 숫자: 하역→반출(터미널 체류), 반출→반납(컨테이너 사용) */
function postArrivalCell(s) {
  const pa = postArrival(s);
  if (!pa.stage) return `<span class="pa-note">Not discharged</span>`;
  if (pa.stage === "berthed") return `<span class="pa-note">Berthed · awaiting discharge</span>`;
  const since = (at, what) => { const t = spanTxt(evT(at), laNowT()); return t ? `<span class="pa-note">${t} since ${what}</span>` : ""; };
  const outLine = pa.out
    ? `<span class="dt">${fmtDT(pa.out)}</span><span class="pa-span">+${spanTxt(evT(pa.dis), evT(pa.out)) || "?"}</span>`
    : `<span class="pa-na">—</span>${pa.dis ? since(pa.dis, "discharge") : ""}`;
  const rtnLine = pa.rtn
    ? `<span class="dt">${fmtDT(pa.rtn)}</span><span class="pa-span">+${spanTxt(evT(pa.out), evT(pa.rtn)) || "?"}</span>`
    : `<span class="pa-na">—</span>${pa.out ? since(pa.out, "gate out") : ""}`;
  return `<div><span class="eta-lbl">OUT</span>${outLine}</div>
        <div style="margin-top:3px"><span class="eta-lbl">RTN</span>${rtnLine}</div>`;
}

/* 상세 카드의 LA DELIVERY — 하역 → 반출 → 반납 */
function deliveryHTML(s) {
  const pa = postArrival(s);
  if (!pa.stage || pa.stage === "berthed") return "";
  const now = laNowT();
  const step = (lbl, at, prevAt, doneTxt, waitTxt, extra) => {
    const done = !!at;
    const sub = done ? (prevAt ? `${spanTxt(evT(prevAt), evT(at))} ${doneTxt}` : (extra || ""))
                     : (prevAt ? `${spanTxt(evT(prevAt), now)} ${waitTxt}` : "");
    return `<div class="dl-step${done ? " on" : ""}">
        <div class="dl-dot"></div>
        <div class="dl-lb">${lbl}</div>
        <div class="dl-at">${done ? fmtDT(at) : "—"}</div>
        <div class="dl-sub">${sub}</div></div>`;
  };
  const term = (s.terminals || [])[3] || "";
  const total = pa.rtn && pa.dis ? `<div class="dl-foot">Discharge → empty return ${spanTxt(evT(pa.dis), evT(pa.rtn))}` +
    ` · removed from the list 3 days after return</div>` : "";
  return `<div class="sch-wrap dl-wrap">
    <div class="sch-label">LA DELIVERY <span class="dl-cntr">· CNTR ${s.container || "—"}${s.cntrQty > 1 ? ` (1 of ${s.cntrQty})` : ""}</span></div>
    <div class="dl-steps">
      ${step("DISCHARGED", pa.dis, null, "", "", term)}
      ${step("GATE OUT", pa.out, pa.dis, "after discharge", "since discharge")}
      ${step("EMPTY RETURN", pa.rtn, pa.out, "after gate out", "since gate out")}
    </div>${total}</div>`;
}

function buildTable(data){
  document.getElementById('vtbody').innerHTML = rowsHTML(data.shipments);
  document.getElementById('otbody').innerHTML = rowsHTML(data.shipments);
  ["vremark","oremark"].forEach(id=>{ const el = document.getElementById(id); if(el) el.innerHTML = GAP_REMARK; });
  document.querySelectorAll('.gapbox,.gapbang:not(.vsl-bang)').forEach(el=>{
    el.addEventListener('click', ev=>{ ev.stopPropagation(); showGapLog(el.dataset.b); });
  });
  document.querySelectorAll('.gapbang.vsl-bang').forEach(el=>{
    el.addEventListener('click', ev=>{ ev.stopPropagation(); showVesselLog(el.dataset.b); });
  });
  const hook = (sel, jump) => document.querySelectorAll(sel).forEach(tr=>
    tr.addEventListener('click',()=>{
      const i=+tr.dataset.i, s=data.shipments[i];
      if(jump) setView('map');
      document.querySelectorAll('#vtbody tr,#otbody tr').forEach(t=>t.classList.toggle('on',+t.dataset.i===i));
      select(s,i,true); showPO(s,i);
    }));
  hook('#vtbody tr', false);
  hook('#otbody tr', true);
}

/* ---------- 카드 ---------- */
/* ---------- Shipment Schedule 테이블 ---------- */
function schTableHTML(s) {
  const hist = HIST[s.booking] || [];

  /* 필드별 변경 이력 추출 */
  function fieldHist(field) {
    const entries = [];
    for (const e of hist) {
      if (!Array.isArray(e.changes)) continue;
      const c = e.changes.find(x => x.field === field);
      if (c) entries.push({ at: e.at, from: c.from });
    }
    return entries.reverse(); /* 최신순 */
  }

  /* 이력 HTML — 취소선 + 감지일 */
  function histHTML(field, fmtFn) {
    const log = fieldHist(field);
    if (!log.length) return "";
    return `<div class="sch-hl">${log.map(e =>
      `<div class="sch-he"><div class="sch-hdot"></div><div>` +
      `<div class="sch-hv">${fmtFn(e.from)}</div>` +
      `<div class="sch-hw">${fmtDT(e.at)} detected</div></div></div>`
    ).join("")}</div>`;
  }

  /* 현재값 셀 */
  function cv(val, field, fmtFn, actualFlag) {
    if (!val) return `<div class="sch-na">—</div>`;
    const changed = fieldHist(field).length > 0;
    const actual  = actualFlag ? !!s[actualFlag] : false;
    const cls     = actual ? "" : (changed ? " sch-changed" : "");
    const actBadge = actual ? ` <span class="sch-act">ACT</span>` : "";
    return `<div class="sch-cv${cls}">${fmtFn(val)}${actBadge}</div>${histHTML(field, fmtFn)}`;
  }

  /* 터미널 — 이력 없음(신규 파싱), 단순 표시 */
  const terms = s.terminals || [];
  function term(idx) {
    return terms[idx] ? `<div class="sch-cv">${terms[idx]}</div>` : `<div class="sch-na">—</div>`;
  }

  /* 피더/모선 vessel 이력 */
  function vesselCV(field, voyField) {
    const cur = s[field];
    if (!cur) return `<div class="sch-na">—</div>`;
    const log = fieldHist(field);
    const changed = log.length > 0;
    const cls = changed ? " sch-changed" : "";
    const vlog = log.map(e => {
      return `<div class="sch-he"><div class="sch-hdot"></div><div>` +
             `<div class="sch-hv">${e.from}</div>` +
             `<div class="sch-hw">${fmtDT(e.at)} detected</div></div></div>`;
    }).join("");
    return `<div class="sch-cv${cls}">${cur}</div>${vlog ? `<div class="sch-hl">${vlog}</div>` : ""}`;
  }

  return `<div class="sch-wrap">
    <div class="sch-label">SHIPMENT SCHEDULE</div>
    <table class="sch-tbl">
      <thead><tr>
        <th></th><th>Origin</th><th>Loading Port</th><th>T/S Port</th><th>Discharging Port</th>
      </tr></thead>
      <tbody>
        <tr>
          <td>Location</td>
          <td><div class="sch-cv">${s.origin||"—"}</div></td>
          <td><div class="sch-cv">${s.pol||"—"}</div></td>
          <td><div class="sch-cv">${s.ts||"—"}</div></td>
          <td><div class="sch-cv">${s.pod||"—"}</div></td>
        </tr>
        <tr>
          <td>Terminal</td>
          <td>${term(0)}</td>
          <td>${term(1)}</td>
          <td>${term(2)}</td>
          <td>${term(3)}</td>
        </tr>
        <tr>
          <td>Vessel</td>
          <td><div class="sch-na">—</div></td>
          <td>${vesselCV("feeder","feeder")}</td>
          <td>${vesselCV("vessel","voyage")}</td>
          <td><div class="sch-na">—</div></td>
        </tr>
        <tr>
          <td>Arrival (ETB)</td>
          <td><div class="sch-na">—</div></td>
          <td>${cv(s.tsArr,"tsArr",fmtDT,"tsArrActual")}</td>
          <td>${cv(s.tsArr,"tsArr",fmtDT,"tsArrActual")}</td>
          <td>${cv(s.eta,"eta",fmtDT,"etaActual")}</td>
        </tr>
        <tr>
          <td>Departure</td>
          <td>${cv(s.polDep,"polDep",fmtDT,"polDepActual")}</td>
          <td>${cv(s.polDep,"polDep",fmtDT,"polDepActual")}</td>
          <td>${cv(s.tsDep,"tsDep",fmtDT,"tsDepActual")}</td>
          <td><div class="sch-na">—</div></td>
        </tr>
      </tbody>
    </table>
  </div>`;
}

function svcDisplay(s) {
  const svc = (s.svc || '').trim().toUpperCase();
  if (svc === 'PS3' || svc === 'PS5') return { cls: '', text: svc };
  const names = Array.isArray(s.names) ? s.names.join(',').toUpperCase() : '';
  if (names.includes('HAI PHONG')) return { cls: 'svc-inferred', text: 'PS5' };
  if (names.includes('YANTIAN'))   return { cls: 'svc-inferred', text: 'PS3' };
  return { cls: 'svc-unknown', text: 'UNKNOWN' };
}

function cardHTML(s){
  const L2 = locate(s);
  const pre = s.preShipment ? `<span class="dtag pre">NOT SHIPPED</span>` : "";
  const stale = isStaleVisible(s) ? `<span class="tag t-stale" title="This item's last lookup failed; the previous value is shown">STALE</span>` : "";
  let railHTML;
  if(!L2){
    railHTML = `<p class="note warn">Position unavailable — HMM map lookup failed. Schedule below is current.</p>`;
  }else{
    const nm = dedupeLabels(L2.names);
    const n = L2.names.length-1;
    let nodes="";
    nm.forEach((label,k)=>{
      const x = k/n*100;
      const c = k===n ? "node end" : (k <= L2.i ? "node on" : "node");
      nodes += `<div class="${c}" style="left:${x}%"></div>` + (label?`<div class="node-lb" style="left:${x}%">${label}</div>`:"");
    });
    const pos = (L2.pct*100).toFixed(1);
    railHTML = `<div class="rail"><div class="rail-line"></div><div class="rail-done" style="width:${pos}%"></div>
        ${nodes}<div class="ship-icon" style="left:${pos}%">▮</div>
        <div class="pct">${Math.round(L2.pct*100)}%</div></div>`;
  }
  const cls = !L2 ? "t-dock" : (L2.atPort ? "t-dock" : "t-sail");
  const paSt = PA_BADGE[postArrival(s).stage];
  const phase = paSt ? `${(s.pod || "").replace(/,.*$/, "")} — ${paSt[1].toLowerCase()}` : L2 ? L2.phase : "No position";
  const po = poSummary(s.booking);
  return `<article class="card${isStaleVisible(s)?" is-stale":""}">
    <div class="card-hd"><span class="bkg">${s.booking}</span>
      <span class="vsl">${s.vessel} ${s.voyage}</span>
      <span class="tag ${cls}">${phase}</span>${stale}${pre}${rolloverHTML(s)}${delayHTML(s)}</div>
    <div class="card-bd">
      ${railHTML}
      ${schTableHTML(s)}
      ${deliveryHTML(s)}
      <div class="grid">
        <div class="f"><label>PKG ETD</label><span>${fmtDT(s.polDep)}</span></div>
        <div class="f"><label>SIN ETA</label><span>${fmtDT(s.tsArr)}</span></div>
        <div class="f"><label>SIN ETD</label><span>${fmtDT(s.tsDep)}</span></div>
        <div class="f"><label>LA ETB</label><span>${fmtDT(s.eta)}</span></div>
        <div class="f"><label>SERVICE</label><span class="${svcDisplay(s).cls}">${svcDisplay(s).text}</span></div>
        <div class="f"><label>FEEDER</label><span>${s.feeder||"— (direct)"}</span></div>
        <div class="f"><label>CNTR</label><span>${s.cntrQty||"—"}</span></div>
        <div class="f"><label>PO / LOT</label><span>${po||"—"}</span></div>
      </div>
      ${changeHTML(s)}
      <p class="note">Latest event — ${s.last||"—"}</p>
      ${s.checkedAt?`<p class="note dim">Checked ${toKST(s.checkedAt)} · ${ago(s.checkedAt)}</p>`:""}
    </div></article>`;
}

/* ---------- 개요 ---------- */
/* 해상 구간은 0~OV_LA%, 그 뒤로 LA DELIVERY(하역·반출·반납) 구간.
   같은 자리의 선박은 한 줄기로 묶고(이름을 위아래로 쌓음), 같은 선박·항차의 부킹은 ×N으로 합친다.
   출항 전(BOOKED) 부킹은 선 위에 찍지 않고 오른쪽 위 상자에 이름만 나열한다. */
const OV_LA = 78, OV_OUT = 89, OV_RTN = 100;
const OV_STAGE = {                         /* 위치(%), 점 색 클래스, 표시 글자 */
  berthed:    [OV_LA,  "s-berth", "BERTHED"],
  discharged: [OV_LA,  "s-dis",   "DISCHARGED"],
  out:        [OV_OUT, "s-out",   "GATED OUT"],
  returned:   [OV_RTN, "s-rtn",   "RETURNED"]
};
function buildOverview(list){
  const booked = list.filter(s => !s.spDep && !s.etaActual);
  const marks0 = [];
  let noPos = 0;
  for (const s of list) {
    if (!s.spDep && !s.etaActual) continue;
    const pa = postArrival(s), L = locate(s);
    const st = OV_STAGE[pa.stage] || (L && L.pct >= 1 ? OV_STAGE.berthed : null);
    if (st) { marks0.push({ s, x: st[0], cls: st[1], sub: st[2], key: pa.stage || "berthed" }); continue; }
    if (!L) { noPos++; continue; }
    const pct = Math.round(L.pct * 100);
    marks0.push({ s, x: L.pct * OV_LA, cls: "", sub: pct + "%", key: "p" + pct });
  }
  /* 같은 선박·항차·위치 → ×N */
  const merged = [];
  for (const m of marks0) {
    const hit = merged.find(o => o.s.vessel === m.s.vessel && o.s.voyage === m.s.voyage && o.key === m.key);
    if (hit) hit.bkgs.push(m.s.booking); else merged.push({ ...m, bkgs: [m.s.booking] });
  }
  /* 가까운 자리 → 한 줄기. 해상 구간은 3% 이내, LA 이후는 같은 단계 지점끼리만
     (해상 96%와 LA 접안이 한 줄기로 합쳐지지 않게) */
  merged.sort((a, b) => a.x - b.x);
  const clusters = [];
  for (const m of merged) {
    const c = clusters[clusters.length - 1], sea = !m.cls;
    const same = c && (sea ? !c.items[0].cls && m.x - c.x < 3 : c.items[0].cls && c.x === m.x);
    if (same) c.items.push(m); else clusters.push({ x: m.x, items: [m] });
  }
  /* 층(높이)은 그린 뒤 layoutOverview()가 실제 글자 폭을 재서 정한다 */
  const LINE = 17, SHOW = 3;
  const marks = clusters.map(c => {
    const shown = c.items.slice(0, SHOW), more = c.items.length - shown.length;
    const lines = shown.map(m => `<div class="ol" data-b="${m.bkgs[0]}">${m.s.vessel}${m.bkgs.length > 1 ? ` ×${m.bkgs.length}` : ""}` +
      `<span class="pc ${m.cls}">${m.sub}</span></div>`).join("") +
      (more ? `<div class="ol-more">+${more} more</div>` : "");
    const n = shown.length + (more ? 1 : 0);
    const top = 0, stem = Math.max(8, OV_DOT_Y - n * LINE);
    const x = Math.max(0, Math.min(100, c.x));
    const edge = x < 8 ? " edge-l" : x > 92 ? " edge-r" : "";
    const cnt = c.items.reduce((a, m) => a + m.bkgs.length, 0);
    return `<div class="ov${edge}" style="left:${x}%;top:${top}px">${lines}
        <div class="stem" style="height:${stem}px"></div>
        <div class="dot ${c.items[0].cls}"></div>${c.items.length > 1 ? `<span class="ov-n">×${cnt}</span>` : ""}</div>`;
  }).join("");

  const count = k => marks0.filter(m => k(m)).length;
  const transit = count(m => !m.cls), atLA = count(m => ["s-berth", "s-dis", "s-out"].includes(m.cls)), rtn = count(m => m.cls === "s-rtn");
  const bkMerged = [];
  for (const s of booked) {
    const hit = bkMerged.find(o => o.vessel === s.vessel && o.voyage === s.voyage);
    if (hit) hit.n++; else bkMerged.push({ vessel: s.vessel, voyage: s.voyage, booking: s.booking, n: 1 });
  }
  const bookedBox = booked.length ? `<div class="obooked"><b>BOOKED · ${booked.length}</b>` +
    bkMerged.map(o => `<span class="ol" data-b="${o.booking}">${o.vessel}${o.n > 1 ? ` ×${o.n}` : ""}</span>`).join(" · ") + `</div>` : "";

  document.getElementById("overview").innerHTML=`
    <h2>ALL SHIPMENTS · PORT KLANG → LOS ANGELES → EMPTY RETURN</h2>
    <div class="sub">In transit ${transit} · At LA ${atLA} · Returned ${rtn}${booked.length ? ` · Booked ${booked.length}` : ""} · of ${list.length}${noPos ? ` · ${noPos} without position` : ""}</div>
    ${bookedBox}
    <div class="orail">
      <div class="ozone" style="left:${OV_LA}%"><span>LA DELIVERY</span></div>
      <div class="base" style="right:${100 - OV_LA}%"></div>
      <div class="base dash" style="left:${OV_LA}%"></div>
      <div class="cap" style="left:0"></div><div class="cap-lb l" style="left:0">PORT KLANG</div>
      <div class="cap" style="left:${OV_LA}%"></div><div class="cap-lb" style="left:${OV_LA}%"><span class="full">LOS ANGELES</span><span class="short">LA</span></div>
      <div class="cap" style="left:${OV_OUT}%"></div><div class="cap-lb" style="left:${OV_OUT}%"><span class="full">GATE OUT</span><span class="short">OUT</span></div>
      <div class="cap" style="left:${OV_RTN}%"></div><div class="cap-lb r" style="left:${OV_RTN}%"><span class="full">EMPTY RETURN</span><span class="short">RTN</span></div>
      ${marks}</div>`;
  document.querySelectorAll("#overview .ol[data-b]").forEach(el=>{
    el.addEventListener("click",()=>{ const i=list.findIndex(s=>s.booking===el.dataset.b); setView('map'); select(list[i],i,true); });
  });
  layoutOverview();
}

/* 이름 층 배치 — 실제 글자 폭을 재서, 앞 줄기와 겹치지 않는 가장 위층에 둔다.
   화면 폭이 바뀌면 다시 배치한다. */
const OV_TOPS = [0, 40, 80], OV_DOT_Y = 115;   /* 점 윗변 = 선(120px) 중앙에 점이 오도록 */
function layoutOverview() {
  const els = [...document.querySelectorAll("#overview .ov")];
  if (!els.length || !els[0].offsetParent) return;          /* 숨겨진 상태에서는 잴 수 없음 */
  const placed = OV_TOPS.map(() => []);
  for (const el of els) {
    const lines = [...el.querySelectorAll(".ol,.ol-more")];
    const labH = lines.reduce((a, l) => a + l.offsetHeight, 0);
    el.style.top = "0px";
    const r = el.getBoundingClientRect();
    const hits = t => placed[t].filter(p => r.left < p.right + 6 && p.left < r.right + 6).length;
    let best = 0, bestHits = Infinity;
    for (let t = 0; t < OV_TOPS.length; t++) {
      if (OV_TOPS[t] + labH > OV_DOT_Y - 8) break;          /* 점까지 줄기 자리가 없으면 그 층은 못 씀 */
      const h = hits(t);
      if (h < bestHits) { best = t; bestHits = h; }
      if (!h) break;
    }
    placed[best].push({ left: r.left, right: r.right });
    el.style.top = OV_TOPS[best] + "px";
    el.querySelector(".stem").style.height = Math.max(8, OV_DOT_Y - OV_TOPS[best] - labH) + "px";
  }
}
let _ovResizeT = null;
window.addEventListener("resize", () => { clearTimeout(_ovResizeT); _ovResizeT = setTimeout(layoutOverview, 150); });

/* ---------- 부킹 추가 ---------- */
const ADD_MAX_TRIES = 3;
function isFatalLookupError(msg){
  return /invalid booking number format|no lookup result|check the booking number|no schedule info|already/i.test(msg||"");
}
function addBooking(){
  const inp=document.getElementById("newbkg");
  const el=document.getElementById("rstatus");
  const bkg=inp.value.trim().toUpperCase();
  if(!/^[A-Z]{4}\d{8}$/.test(bkg)){ el.innerHTML="Invalid booking number format. Expected 4 letters + 8 digits."; return; }
  if(CUR && CUR.shipments.some(s=>s.booking===bkg)){ el.innerHTML=`<b>${bkg}</b> is already in the list.`; return; }
  if(!API){ el.innerHTML=`The browser cannot call HMM directly. Set <b>API</b> at the top of the script to enable this button.`; return; }
  const btn=document.getElementById("addbtn");
  inp.disabled=true; btn.disabled=true;
  const attempt = (n) => {
    el.innerHTML = n===1 ? `${bkg} Retrieving… (HMM responds in 5–10s)` : `${bkg} Retrying ${n} of ${ADD_MAX_TRIES}…`;
    return fetch(API.replace(/\/data$/,"")+"/lookup?bkg="+encodeURIComponent(bkg),{cache:"no-store"})
      .then(r=>r.json()).then(res=>{ if(res.error) throw new Error(res.error); return res; })
      .catch(e=>{
        const msg = e.message || "no response";
        if(n < ADD_MAX_TRIES && !isFatalLookupError(msg)){
          el.innerHTML = `${bkg} attempt ${n} failed — ${msg}<br>Retrying automatically…`;
          return new Promise(r=>setTimeout(r, 4000*n)).then(()=>attempt(n+1));
        }
        throw new Error(msg + (n>1 ? ` (after ${n} attempts)` : ""));
      });
  };
  attempt(1)
    .then(res=>{
      el.innerHTML=`<b>${bkg}</b> added — ${res.vessel||"?"} ${res.voyage||""}. Refreshing…`;
      inp.value="";
      return Promise.all([loadHistory(), fetch(source(),{cache:"no-store"}).then(r=>r.ok?r.json():Promise.reject())])
        .then(([,data])=>{
          if(!data.shipments.some(x=>x.booking===bkg)) data.shipments.push(res);
          render(data);
          el.innerHTML=`<b>${bkg}</b> added — ${res.vessel||"?"} ${res.voyage||""}.`
            + (res.preShipment? " Not shipped yet." : "")
            + (res.savedToData ? ` Saved — it stays on screen and refreshes on the next scheduled update.` : ` It will appear from the next scheduled update.`);
        })
        .catch(()=>{ if(CUR){ CUR.shipments.push(res); render(CUR); } el.innerHTML=`<b>${bkg}</b> added — shown from the lookup result.`; });
    })
    .catch(e=>{ el.innerHTML=`${bkg} lookup failed — ${e.message||"no response"}`; })
    .finally(()=>{ inp.disabled=false; btn.disabled=false; });
}

/* ---------- 스탬프 · 알림 ---------- */
function alertBanner(d){
  const el = document.getElementById("alertbar");
  if(!el) return;
  const list = (d.shipments||[]).filter(s=>s.rollover || s.alert==="alert");
  if(!list.length){ el.hidden = true; el.innerHTML=""; return; }
  el.hidden = false;
  el.innerHTML = `<b>${list.length} shipment(s) need action</b>` +
    list.map(s=>{
      const why = s.rollover
        ? `not loaded on ${s.vessel} ${s.voyage} (${s.rolloverDays||0}d past ETD)`
        : `${s.delayDays}d behind original plan${s.planEta?` (${s.planEta})`:""}`;
      return `<span class="ai" data-b="${s.booking}">${s.booking} · ${why}</span>`;
    }).join("");
  el.querySelectorAll(".ai").forEach(x=>x.addEventListener("click",()=>{
    const i=(CUR.shipments||[]).findIndex(v=>v.booking===x.dataset.b);
    if(i>=0){ setView('map'); select(CUR.shipments[i],i,true); showPO(CUR.shipments[i],i); }
  }));
}

function stampText(d){
  const lr = document.getElementById("lane-refresh");
  if(lr) lr.textContent = CRON_KST.length + "× / DAY";
  document.getElementById("stamp").innerHTML =
    `HMM retrieved ${toKST(d.updated)} · ${ago(d.updated)}` +
    (d.stale ? `<span class="warn"> · no new HMM events</span>` : "") +
    `<br><span class="dim2">next update in ${nextRun()} · ${CRON_KST.length}× daily</span>`;
}

/* ---------- 렌더링 ---------- */
let CUR=null;
/* KV 전파 지연 우회: /lookup·/collect 응답을 임시 캐시.
   render()가 /data 오래된 값으로 호출돼도 캐시의 신선한 값이 항상 이긴다. */
const _localLookupCache = {};

function render(data){
  /* 디버그: 호출 스택 + 데이터 상태 추적 */
  const _caller = new Error().stack.split('\n').slice(1,3).join(' | ');
  /* _localLookupCache 오버라이드: checkedAt 기준으로 더 최신 값으로 교체 */
  if(Object.keys(_localLookupCache).length){
    const tsOf = x => Date.parse(String(x.checkedAt||"").replace(" ","T").replace(/Z?$/,"Z"))||0;
    (data.shipments||[]).forEach((s,i)=>{
      const ov = _localLookupCache[s.booking];
      if(ov && tsOf(ov) > tsOf(s)) data.shipments[i] = ov;
    });
  }
  const seen = new Map();
  (data.shipments||[]).forEach(s=>{
    s.booking = String(s.booking||"").trim().toUpperCase();
    const old = seen.get(s.booking);
    if(!old) { seen.set(s.booking, s); return; }
    const t = x => Date.parse(String(x.checkedAt||"").replace(" ","T").replace("Z","")+"Z") || 0;
    if(t(s) >= t(old)) seen.set(s.booking, s);
  });
  data.shipments = [...seen.values()];
  buildPortIndex(data.shipments);
  data.shipments.forEach(s=>{ try{ synthRoute(s); }catch(_){} });
  const before = data.shipments.length;
  data.shipments = sortByETD(prune(data.shipments));
  const dropped = before - data.shipments.length;
  CUR=data; stampText(data);
  document.getElementById("n-bkg").textContent=data.shipments.length;
  document.getElementById("n-eta").textContent=fmtD(data.shipments.filter(s=>!s.etaActual).map(s=>s.eta).sort()[0]);
  document.getElementById("cardlist").innerHTML=data.shipments.map(cardHTML).join("");
  if(dropped) document.getElementById("rstatus").innerHTML=`Removed <b>${dropped}</b> shipment(s) that arrived over 7 days ago.`;
  const safe = (fn,label)=>{ try{ fn(); }catch(e){ console.error(label,e); const el=document.getElementById("rstatus"); if(el) el.innerHTML += `<div class="warn">${label} failed — ${e.message||e}</div>`; } };
  safe(()=>closePO(),"Close PO");
  safe(()=>alertBanner(data),"Alert banner");
  safe(()=>initMap(data),"Map");
  safe(()=>buildTable(data),"Table");
  safe(()=>buildOverview(data.shipments),"Overview");
  safe(()=>renderPOTable(),"PO table");
}

let refreshing = false;
function refreshData(){
  if(refreshing) return;
  refreshing = true;
  const t = document.getElementById("ship-title");
  if(t) t.classList.add("busy");
  const el = document.getElementById("rstatus");
  if(el) el.innerHTML = "Reloading…";
  const dataPromise = fetch(source(),{cache:"no-store"}).then(r=>r.ok?r.json():Promise.reject(new Error("HTTP "+r.status)));
  Promise.allSettled([loadPO(), loadHistory(), dataPromise])
    .then(([poRes, histRes, dataRes])=>{
      if(dataRes.status !== "fulfilled"){
        if(el) el.innerHTML = `Reload failed — ${dataRes.reason&&dataRes.reason.message||"no response"}`;
        return;
      }
      const data = dataRes.value;
      render(data);
      const warnings = [];
      if(poRes.status !== "fulfilled") warnings.push("PO");
      if(histRes.status !== "fulfilled") warnings.push("History");
      if(el) el.innerHTML = warnings.length
        ? `Reloaded (partial: ${warnings.join(", ")} unavailable) — ${toKST(data.updated)}`
        : `Reloaded — ${toKST(data.updated)}`;
    })
    .finally(()=>{ refreshing = false; if(t) t.classList.remove("busy"); });
}

/* ---------- 라우팅 ---------- */
function setView(v){
  document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('on',t.dataset.view===v));
  document.querySelectorAll('.ship-tabbar button').forEach(t=>t.classList.toggle('on',t.dataset.view===v));
  document.getElementById('mapwrap').style.display  = v==='map'?'grid':'none';
  document.getElementById('cards').style.display    = v==='list'?'block':'none';
  if(v==='list') requestAnimationFrame(layoutOverview);   /* 숨긴 채 그려졌으면 보일 때 다시 배치 */
  document.getElementById('history').style.display  = v==='history'?'block':'none';
  document.getElementById('system').style.display   = v==='system'?'block':'none';
  document.getElementById('beta').style.display     = v==='beta'?'block':'none';
  document.getElementById('calendar').style.display = v==='calendar'?'block':'none';
  const laneEl = document.querySelector('.lane');
  if(laneEl) laneEl.style.display = (v==='history'||v==='system'||v==='beta'||v==='calendar') ? 'none' : '';
  if(v==='map'&&map) {
    setTimeout(()=>map.invalidateSize(),60);
    /* MAP 첫 진입 시 ETA 가장 빠른 vessel 자동 표시 */
    setTimeout(()=>{
      const panel = document.getElementById('side');
      if(!panel) return;
      // h3 태그가 있으면 이미 vessel 선택된 것 — skip
      if(panel.querySelector('h3')) return;
      if(!CUR || !CUR.shipments) return;
      const active = CUR.shipments.filter(s => !s.etaActual && s.eta);
      if(!active.length) return;
      active.sort((a,b)=>new Date(a.eta)-new Date(b.eta));
      const s = active[0];
      const i = CUR.shipments.indexOf(s);
      if(i>=0) { select(s, i, true); if(typeof showPO==='function') showPO(s, i); }
    }, 200);
  }
  if(v==='history') renderHistoryMonths().catch(e=>console.error("History",e));
  if(v==='system') renderSystemTab();
  if(v==='beta') renderBetaTab();
  if(v==='calendar') renderCalendarTab();
}
function show(v){
  if(v==="ship" && ACCESS_ROLE==="qc") return;
  if(v==="quality" && ACCESS_ROLE==="eta") return;
  document.getElementById("menu").hidden = v!=="menu";
  document.getElementById("ship").style.display = v==="ship"?"block":"none";
  document.getElementById("ftr").style.display  = v==="ship"?"block":"none";
  const q=document.getElementById("qview");
  const qb=document.getElementById("qbar");
  if(q)  q.style.display  = v==="quality"?"block":"none";
  if(qb) qb.style.display = v==="quality"?"flex":"none";
  window.scrollTo(0,0);
}

/* ---------- 테마 ---------- */
const THEME_KEY = "oqc_theme";
let THEME = "dark";

function applyTheme(t){
  THEME = (t === "light") ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", THEME);
  const sw = document.getElementById("themesw");
  if(sw) sw.setAttribute("aria-checked", THEME === "light" ? "true" : "false");
  if(tileLayer) tileLayer.setUrl(TILE[THEME]);
  if(typeof repaintCharts === "function") repaintCharts();
  try{ localStorage.setItem(THEME_KEY, THEME); }catch(_){}
}
function initTheme(){
  let saved = null;
  try{ saved = localStorage.getItem(THEME_KEY); }catch(_){}
  applyTheme(saved || "dark");
}

/* ---------- 인증 ---------- */
const AUTH_KEY = "kossan_auth_ts";
const ROLE_KEY = "kossan_role";
const AUTH_TTL_MS = 5*60*1000;
let ACCESS_ROLE = "kossan";
const ROLE_PW = { kossan:"kossan", admin:"admin", eta:"eta", qc:"qc" };

function applyRoleRestrictions(){
  const shipTile  = document.querySelector('.tile[data-go="ship"]');
  const qualTile  = document.querySelector('.tile[data-go="quality"]');
  const updateBtn  = document.getElementById('update-btn');
  const restoreBtn = document.getElementById('restore-btn');
  const forceReloadBtn = document.getElementById('force-reload-btn');
  const backBtn    = document.getElementById('back');
  const qbackBtn   = document.getElementById('qback');
  const restricted = (ACCESS_ROLE === 'eta' || ACCESS_ROLE === 'qc');
  const isAdmin    = (ACCESS_ROLE === 'admin');
  if(ACCESS_ROLE === 'eta' && qualTile) qualTile.style.display = 'none';
  if(ACCESS_ROLE === 'qc'  && shipTile) shipTile.style.display = 'none';
  if(updateBtn)  updateBtn.style.display  = isAdmin ? '' : 'none';
  if(restoreBtn) restoreBtn.style.display = isAdmin ? '' : 'none';
  if(forceReloadBtn) forceReloadBtn.style.display = isAdmin ? '' : 'none';
  const sysTab = document.getElementById('tab-system');
  const mobileSysBtn = document.getElementById('mobile-system-btn');
  if(sysTab) sysTab.style.display = isAdmin ? '' : 'none';
  const betaTab = document.getElementById('tab-beta');
  if(betaTab) betaTab.style.display = isAdmin ? '' : 'none';
  const mobBetaTab = document.getElementById('tab-mob-beta');
  const mobSysTab  = document.getElementById('tab-mob-system');
  if(mobBetaTab) mobBetaTab.style.display = isAdmin ? '' : 'none';
  if(mobSysTab)  mobSysTab.style.display  = isAdmin ? '' : 'none';
  if(mobileSysBtn) mobileSysBtn.hidden = !isAdmin;
  if(backBtn)    backBtn.style.display    = restricted ? 'none' : '';
  if(qbackBtn)   qbackBtn.style.display   = restricted ? 'none' : '';
  const addbar = document.querySelector('.addbar');
  const pobox  = document.getElementById('pobox');
  const showOps = (ACCESS_ROLE === 'admin');
  if(addbar) addbar.style.display = showOps ? '' : 'none';
  if(pobox)  pobox.style.display  = showOps ? '' : 'none';
  const devLink  = document.getElementById('dev-site-link');
  const mainLink = document.getElementById('main-site-link');
  if(devLink)  devLink.style.display  = isAdmin ? '' : 'none';
  if(mainLink) mainLink.style.display = isAdmin ? '' : 'none';
}

function proceedAfterUnlock(){
  let role = "kossan";
  try{ role = localStorage.getItem(ROLE_KEY) || "kossan"; }catch(_){}
  ACCESS_ROLE = role;
  document.getElementById("gate").remove();
  applyRoleRestrictions();
  /* 방금 로그인한 역할을 호주 관리자 버튼(ADD/EDIT)에 즉시 반영 — country-form.js 가 이미 로드돼 있을 때만 */
  try{ if(window.CountryForm && typeof window.CountryForm.syncAdmin==="function") window.CountryForm.syncAdmin(); }catch(_){}
  const lo = document.getElementById("logout-btn");
  if(lo) lo.hidden = false;
  if(ACCESS_ROLE === "qc"){
    show("quality");
    setTimeout(()=>document.getElementById("qbar").scrollIntoView({block:"start"}),60);
    return;
  }
  if(ACCESS_ROLE === "eta"){
    show("ship");
    setTimeout(()=>{ map&&map.invalidateSize(); document.getElementById('ship').scrollIntoView({block:'start'}); },80);
  } else { show("menu"); }
  setView('map');
  Promise.all([loadPO(), loadHistory()]).catch(()=>{});
  fetchAndRender(0);
}
function fetchAndRender(attempt){
  fetch(source(),{cache:"no-store"})
    .then(r=>r.ok?r.json():Promise.reject(new Error('HTTP '+r.status)))
    .then(data=>{ render(data); })
    .catch(e=>{
      console.warn('[fetchAndRender] attempt='+attempt+' failed:',e&&(e.message||e));
      if(attempt<5){
        const delay = Math.min(10000*(attempt+1), 30000);
        console.log('[fetchAndRender] retry in '+delay+'ms');
        setTimeout(()=>fetchAndRender(attempt+1), delay);
      } else {
        console.error('[fetchAndRender] all retries failed, using FALLBACK');
        render(FALLBACK);
        const el = document.getElementById("rstatus");
        if(el) el.innerHTML = `⚠️ OFFLINE SAMPLE DATA — Live API unavailable`;
      }
    });
}

function unlock(){
  const val = document.getElementById("pw").value.trim();
  const role = Object.keys(ROLE_PW).find(k => ROLE_PW[k] === val);
  if(!role){ document.getElementById("gate-err").textContent="Incorrect password."; return; }
  try{ localStorage.setItem(AUTH_KEY, String(Date.now())); localStorage.setItem(ROLE_KEY, role); }catch(_){}
  proceedAfterUnlock();
}

/* ---------- 이벤트 리스너 ---------- */
document.querySelectorAll(".tile").forEach(t=>t.addEventListener("click",()=>{
  if(t.dataset.go==="quality"){show("quality");setTimeout(()=>document.getElementById("qbar").scrollIntoView({block:"start"}),60);return;}
  show("ship"); setTimeout(()=>{ map&&map.invalidateSize(); document.getElementById('ship').scrollIntoView({block:'start'}); },80);
}));
document.getElementById("back").addEventListener("click",()=>show("menu"));
document.getElementById("ship-title").addEventListener("click",refreshData);
document.getElementById("gate-go").addEventListener("click",unlock);
document.getElementById("pw").addEventListener("keydown",e=>{if(e.key==="Enter")unlock();});
document.getElementById("pw").focus();
document.getElementById("logout-btn").addEventListener("click",()=>{
  try{ localStorage.removeItem(AUTH_KEY); localStorage.removeItem(ROLE_KEY); }catch(_){}
  location.reload();
});
document.getElementById("mobile-system-btn").addEventListener("click",()=>setView('system'));
document.getElementById("posave").addEventListener("click",applyPO);
document.getElementById("poclear").addEventListener("click",clearPO);
document.getElementById("addbtn").addEventListener("click",addBooking);
document.getElementById("newbkg").addEventListener("keydown",e=>{if(e.key==="Enter")addBooking();});
document.querySelectorAll(".tab").forEach(t=>t.addEventListener("click",()=>setView(t.dataset.view)));
document.querySelectorAll(".ship-tabbar button").forEach(t=>t.addEventListener("click",()=>setView(t.dataset.view)));
document.getElementById("update-btn").addEventListener("click",showChangelog);
document.getElementById("restore-btn").addEventListener("click",showRestoreModal);
document.getElementById("force-reload-btn").addEventListener("click", function(){
  if('caches' in window){
    caches.keys().then(names => Promise.all(names.map(n => caches.delete(n)))).then(() => location.reload(true));
  } else {
    location.reload(true);
  }
});

document.addEventListener("DOMContentLoaded",()=>{
  document.title = `Kossan OQC-DEV ${APP_VERSION}`;
  initTheme();
  /* 모바일: #side 패널 터치 스크롤이 Leaflet 지도로 전파되지 않도록 차단 */
  const sideEl = document.getElementById("side");
  if(sideEl){
    sideEl.addEventListener("touchmove", e => { e.stopPropagation(); }, { passive: true });
    sideEl.addEventListener("wheel",     e => { e.stopPropagation(); }, { passive: true });
  }
  const sw = document.getElementById("themesw");
  if(sw) sw.addEventListener("click", ()=> applyTheme(THEME === "light" ? "dark" : "light"));
  const qb=document.getElementById("qback");
  if(qb) qb.addEventListener("click",()=>show("menu"));
  const qt=document.getElementById("q-title");
  if(qt) qt.addEventListener("click",()=>{ if(typeof repaintCharts==="function") repaintCharts(); window.scrollTo(0,0); });
});

(function tryAutoUnlock(){
  let ts = null;
  try{ ts = parseInt(localStorage.getItem(AUTH_KEY)||"0",10); }catch(_){}
  if(ts && (Date.now()-ts) < AUTH_TTL_MS){ proceedAfterUnlock(); }
})();

/* ===== 세계 시계 (전역) ===== */
const TZ_CLOCKS = [
  { key:'KR', id:'tz-time-KR', zone:'Asia/Seoul',          abbr:'KST' },
  { key:'MY', id:'tz-time-MY', zone:'Asia/Kuala_Lumpur',   abbr:'MYT' },
  { key:'US', id:'tz-time-US', zone:'UTC',                 abbr:'UTC' }
];
let _mobTz = 'KR';

function getTzTime(zone, abbr){
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-US',{
    timeZone:zone, hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false
  }).formatToParts(now);
  const get = t => parts.find(p=>p.type===t)?.value||'00';
  let hh = get('hour'); if(hh==='24') hh='00';
  const a = abbr || new Intl.DateTimeFormat('en-US',{
    timeZone:zone, timeZoneName:'short'
  }).formatToParts(now).find(p=>p.type==='timeZoneName')?.value||'';
  return { time:`${hh}:${get('minute')}:${get('second')}`, abbr:a };
}

function setTzMobile(key){
  _mobTz = key;
  document.querySelectorAll('.tz-mob-btn').forEach(b=>b.classList.remove('active'));
  const btn = document.getElementById('tzm-'+key);
  if(btn) btn.classList.add('active');
  const dispEl = document.getElementById('tz-mob-display');
  if(dispEl) dispEl.style.display = 'inline-block';
}

(function initWorldClocks(){
  function tick(){
    for(const c of TZ_CLOCKS){
      const el = document.getElementById(c.id);
      if(el){ const r=getTzTime(c.zone,c.abbr); el.textContent=r.time; }
      const lblEl = document.getElementById(c.id+'-abbr');
      if(lblEl){ const r=getTzTime(c.zone,c.abbr); lblEl.textContent=r.abbr; }
    }
    const mob = TZ_CLOCKS.find(c=>c.key===_mobTz);
    if(mob){
      const r = getTzTime(mob.zone, mob.abbr);
      const dispEl = document.getElementById('tz-mob-display');
      if(dispEl) dispEl.textContent = r.time + ' ' + r.abbr;
    }
  }
  tick();
  setInterval(tick, 1000);
})();

