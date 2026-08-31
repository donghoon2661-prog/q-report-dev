/* ===== history.js — HISTORY 탭 ===== */

const HIST_API = (typeof HISTORY_API !== "undefined")
  ? HISTORY_API
  : ((typeof API_ROOT !== "undefined" ? API_ROOT : "") + "/delayhistory");
let histCache = null;
let histCacheAt = 0;
const HIST_CACHE_TTL = 5 * 60 * 1000; /* 5분 */
let histChartInst = null;

function histBadgeClass(d){
  if(d===null||d===undefined) return "b-plain";
  if(d<=0) return "b-green";
  if(d>=7) return "b-red";
  if(d>=4) return "b-amber";
  return "b-plain";
}
function histBadgeLabel(d){
  if(d===null||d===undefined) return "N/A";
  if(d<=0){ const n=Math.abs(d); return n===0?"ON TIME":(n===1?"1 DAY EARLY":`${n} DAYS EARLY`); }
  return d===1?"1 DAY DELAY":`${d} DAYS DELAY`;
}
function histShortDate(s){ return s ? monAbbr(String(s).slice(5,7))+"/"+String(s).slice(8,10) : "—"; }

async function loadHistoryData(){
  if(histCache && (Date.now() - histCacheAt) < HIST_CACHE_TTL) return histCache;
  try {
    const monthsRes = await fetch(HIST_API,{cache:"no-store"}).then(r=>r.ok?r.json():{months:[]});
    const months = monthsRes.months||[];
    const results = await Promise.allSettled(months.map(m=>
      fetch(`${HIST_API}?month=${m}`,{cache:"no-store"}).then(r=>r.ok?r.json():Promise.reject(new Error("HTTP "+r.status)))
    ));
    const byEtdMonth = {};
    results.forEach((res,i)=>{
      if(res.status !== "fulfilled"){ console.warn("[history] month load failed:", months[i], res.reason); return; }
      (res.value.records||[]).forEach(rec=>{
        const key = rec.polDepMonth || "unknown";
        (byEtdMonth[key] = byEtdMonth[key]||[]).push(rec);
      });
    });
    histCache = byEtdMonth;
    histCacheAt = Date.now();
  } catch(e) {
    console.error("[history] loadHistoryData failed:", e);
    if(!histCache) histCache = {};
  }
  return histCache;
}

function histMonthLabel(ym){
  if(!ym||ym==="unknown") return {m:"UNKNOWN",y:""};
  const [y,mo] = ym.split("-");
  const names=["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
  return { m:names[parseInt(mo,10)-1]||mo, y };
}

async function renderHistoryMonths(){
  const wrap = document.getElementById("hist-months");
  document.getElementById("hist-detail").hidden = true;
  wrap.hidden = false;
  wrap.innerHTML = `<div class="hist-empty">Loading…</div>`;
  let data;
  try{ data = await loadHistoryData(); }
  catch(e){ wrap.innerHTML = `<div class="hist-empty">Failed to load history — ${e.message||e}</div>`; return; }

  const keys = Object.keys(data).filter(k=>k!=="unknown").sort().reverse();
  if(!keys.length){
    wrap.innerHTML = `<div class="hist-empty">No completed shipments yet.</div>`;
    document.getElementById("hist-summary").style.display = "none";
    return;
  }
  document.getElementById("hist-summary").style.display = "";
  renderHistorySummary(data, keys);

  wrap.innerHTML = keys.map(k=>{
    const {m,y} = histMonthLabel(k);
    const n = data[k].length;
    return `<button class="hist-mcard" data-month="${k}">
      <div class="m">${m}</div><div class="y">${y} &middot; ${n} shipment${n===1?"":"s"}</div>
    </button>`;
  }).join("");

  wrap.querySelectorAll(".hist-mcard").forEach(b=>
    b.addEventListener("click",()=>renderHistoryDetail(b.dataset.month)));
}

function monthStats(data, keys){
  return keys.slice().sort().map(k=>{
    const recs = data[k]||[];
    const delays = recs.map(r=>r.delayDays).filter(d=>d!==null&&d!==undefined);
    const avg = delays.length ? delays.reduce((a,b)=>a+b,0)/delays.length : null;
    const max = delays.length ? Math.max(...delays) : null;
    const {m,y} = histMonthLabel(k);

    /* AVG TRANSIT 계산
       startDate = polDepActualDate || polDep
       endDate   = podBerthingAt    || actualEta */
    const transits = recs.map(r => {
      const from = r.polDepActualDate || r.polDep || null;
      const to   = r.podBerthingAt    || r.actualEta || null;
      if (!from || !to) return null;
      const s = new Date(from), e = new Date(to);
      if (isNaN(s) || isNaN(e)) return null;
      const d = Math.round((e - s) / 86400000);
      return d >= 0 ? d : null;
    }).filter(d => d !== null);
    const avgTransit = transits.length ? transits.reduce((a,b)=>a+b,0)/transits.length : null;

    return { key:k, label:`${m} ${y}`, vessels:recs.length, avg, max, avgTransit };
  });
}

function renderHistorySummary(data, keys){
  const stats = monthStats(data, keys);
  const tbody = document.getElementById("hist-stats-tbody");
  tbody.innerHTML = stats.map((s,i)=>`<tr data-idx="${i}">
      <td>${s.label}</td><td>${s.vessels}</td>
      <td>${s.avgTransit===null?"—":s.avgTransit.toFixed(1)+"d"}</td>
      <td>${s.avg===null?"—":s.avg.toFixed(1)+"d"}</td>
      <td>${s.max===null?"—":s.max+"d"}</td>
    </tr>`).join("");

  const ctx = document.getElementById("hist-chart");
  if(histChartInst){ histChartInst.destroy(); histChartInst = null; }
  if(typeof Chart === "undefined"){ console.warn("[history] Chart.js not loaded"); return; }
  const barColor = cssVar('--sail','#3FD0A6');
  histChartInst = new Chart(ctx, {
    type: "bar",
    data: {
      labels: stats.map(s=>s.label),
      datasets: [{ label: "Avg delay (days)", data: stats.map(s=>s.avg===null?0:s.avg),
        backgroundColor: barColor, borderRadius: 4, maxBarThickness: 46 }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display:false },
        tooltip: { callbacks: {
          title: items => stats[items[0].dataIndex].label,
          label: item => {
            const s = stats[item.dataIndex];
            return [`Vessels: ${s.vessels}`,`Avg transit: ${s.avgTransit===null?"—":s.avgTransit.toFixed(1)+"d"}`,`Avg delay: ${s.avg===null?"—":s.avg.toFixed(1)+"d"}`,`Max delay: ${s.max===null?"—":s.max+"d"}`];
          }
        }}
      },
      onHover: (evt, elements) => {
        tbody.querySelectorAll("tr").forEach(tr=>tr.classList.remove("hi"));
        if(elements.length){ const row = tbody.querySelector(`tr[data-idx="${elements[0].index}"]`); if(row) row.classList.add("hi"); }
      },
      scales: {
        x: { ticks:{ color:cssVar('--fog','#8AA4B5') }, grid:{ display:false } },
        y: { beginAtZero:true, ticks:{ color:cssVar('--fog','#8AA4B5') }, grid:{ color:cssVar('--line-soft','#162C3B') } }
      }
    }
  });

  tbody.querySelectorAll("tr").forEach(tr=>{
    tr.addEventListener("mouseenter", ()=>{
      tbody.querySelectorAll("tr").forEach(t=>t.classList.remove("hi"));
      tr.classList.add("hi");
    });
  });
}

function renderHistoryDetail(monthKey){
  const data = histCache || {};
  const recs = (data[monthKey]||[]).slice().sort((a,b)=>(a.polDep||"").localeCompare(b.polDep||""));
  document.getElementById("hist-months").hidden = true;
  const detail = document.getElementById("hist-detail");
  detail.hidden = false;
  const {m,y} = histMonthLabel(monthKey);
  document.getElementById("hist-monthtitle").textContent = `${m} ${y}`;
  document.getElementById("hist-monthmeta").textContent = `ETD basis · ${recs.length} shipment${recs.length===1?"":"s"}`;

  /* TRANSIT 계산 헬퍼
     startDate = polDepActualDate(Actual Loading Port Departure) || polDep(계획)
     endDate   = podBerthingAt(Actual Discharging Port Arrival)  || actualEta(계획 fallback)
     음수 / NaN / 유효하지 않은 날짜 → "—" 표시 */
  const transitDays = (from, to) => {
    if (!from || !to) return null;
    const s = new Date(from), e = new Date(to);
    if (isNaN(s.getTime()) || isNaN(e.getTime())) return null;
    const d = Math.round((e - s) / 86400000);
    return d >= 0 ? d : null;  // 음수는 무효
  };

  const tbody = document.getElementById("hist-tbody");
  tbody.innerHTML = recs.map((r,i)=>{
    const dwell = (r.legBreakdown||[]).find(l=>l.label==="T/S Departure ETD");
    const dwellTxt = dwell && dwell.note ? dwell.note.split("d vs")[0]+"d" : "—";

    const startDate = r.polDepActualDate || r.polDep || null;
    const endDate   = r.podBerthingAt    || r.actualEta || null;
    const transit   = transitDays(startDate, endDate);
    const transitTxt = transit !== null ? `${transit}d` : "—";

    return `<tr>
      <td><span class="vname">${r.vessel||"—"}</span><span class="vbkg">${r.booking}</span></td>
      <td class="route">${(r.pol||"").split(",")[0]||"—"} &rarr; ${(r.pod||"").split(",")[0]||"—"}</td>
      <td>${histShortDate(r.polDep)} <span class="plandate">(${histShortDate(r.polDep)})</span></td>
      <td class="dwell">${dwellTxt}</td>
      <td>${histShortDate(r.actualEta)} <span class="plandate">(${histShortDate(r.planEta)})</span></td>
      <td class="transit-cell">${transitTxt}</td>
      <td><span class="hist-badge ${histBadgeClass(r.delayDays)}" data-idx="${i}">${histBadgeLabel(r.delayDays)}</span></td>
    </tr>`;
  }).join("");

  tbody.querySelectorAll(".hist-badge").forEach(b=>
    b.addEventListener("click",()=>openHistPopup(recs[parseInt(b.dataset.idx,10)])));

  document.getElementById("hist-back").onclick = ()=>{
    detail.hidden = true;
    document.getElementById("hist-months").hidden = false;
  };
}

function openHistPopup(rec){
  const popup = document.getElementById("hist-popup");
  document.getElementById("hist-popup-title").textContent = `${rec.vessel||"—"}${rec.voyage?" "+rec.voyage:""}`;
  document.getElementById("hist-popup-sub").textContent =
    `${rec.booking} · ${(rec.pol||"").split(",")[0]||"—"} → ${(rec.pod||"").split(",")[0]||"—"}`;

  const legs = rec.legBreakdown;
  const legsEl = document.getElementById("hist-popup-legs");
  if(!legs){
    legsEl.innerHTML = `<div class="hist-empty">This booking predates tracking start, so a leg-by-leg breakdown isn't available.</div>`;
  } else {
    legsEl.innerHTML = legs.map(l=>{
      const val = l.days===null ? "N/A" :
        (l.days===0 ? "ON TIME" : `${l.days>0?"+":""}${l.days} DAY${Math.abs(l.days)===1?"":"S"}`);
      const cls = (l.days===null||l.days<=0) ? "lv-plain" : "lv-red";
      const note = l.note ? `<span class="note">(${l.note})</span>` : "";
      return `<div class="hist-leg"><span>${l.label}</span><span class="${cls}">${val}${note}</span></div>`;
    }).join("");
  }
  document.getElementById("hist-popup-total").textContent = histBadgeLabel(rec.delayDays).replace(" DELAY","");
  popup.hidden = false;
}

document.getElementById("hist-popup-close").addEventListener("click",()=>{
  document.getElementById("hist-popup").hidden = true;
});
document.getElementById("hist-popup").addEventListener("click",e=>{
  if(e.target.id==="hist-popup") document.getElementById("hist-popup").hidden = true;
});
