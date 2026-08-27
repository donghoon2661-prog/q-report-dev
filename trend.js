/* ===== trend.js — BETA 탭 (Admin only) ===== */

const TREND_API = "https://kossan-oqc.dhoqc.workers.dev/delayhistory";
let trendCache = null;
let betaMenu = 'trend';

async function loadTrendData() {
  if (trendCache) return trendCache;
  const res = await fetch(TREND_API, { cache: "no-store" }).then(r => r.ok ? r.json() : { months: [] });
  const months = res.months || [];
  const all = [];
  for (const m of months) {
    const d = await fetch(`${TREND_API}?month=${m}`, { cache: "no-store" }).then(r => r.ok ? r.json() : { records: [] });
    (d.records || []).forEach(r => all.push(r));
  }
  trendCache = all;
  return all;
}

/* ---------- BETA 탭 메인 ---------- */
function renderBetaTab() {
  const el = document.getElementById("beta");
  if (!el) return;
  el.innerHTML = `
    <div style="padding:24px 20px;max-width:900px;margin:0 auto">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:20px">
        <h2 style="margin:0;font-size:18px;letter-spacing:.05em">BETA</h2>
        <span style="font-size:11px;color:var(--buoy);background:rgba(255,160,0,.15);padding:2px 8px;border-radius:3px">ADMIN ONLY</span>
      </div>
      <div class="beta-nav">
        <button class="beta-nav-btn on" data-menu="trend">TREND</button>
        <button class="beta-nav-btn" data-menu="errorlog">ERROR LOG</button>
      </div>
      <div id="beta-content"></div>
    </div>`;

  el.querySelectorAll('.beta-nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      el.querySelectorAll('.beta-nav-btn').forEach(b => b.classList.remove('on'));
      btn.classList.add('on');
      betaMenu = btn.dataset.menu;
      renderBetaContent();
    });
  });
  renderBetaContent();
}

function renderBetaContent() {
  if (betaMenu === 'trend') renderTrendContent();
  if (betaMenu === 'errorlog') renderErrorLogContent();
}

/* ---------- TREND 콘텐츠 ---------- */
function renderTrendContent() {
  const el = document.getElementById("beta-content");
  if (!el) return;
  el.innerHTML = `
    <div style="margin-top:20px">
      <div id="trend-loading" style="color:var(--fog);font-size:13px">Loading…</div>
      <div id="trend-content" style="display:none">
        <div class="trend-section">
          <div class="trend-section-title">구간별 지연 분해 (평균, 일)</div>
          <div id="trend-leg-chart" class="trend-chart-wrap"></div>
        </div>
        <div class="trend-section">
          <div class="trend-section-title">월별 평균 지연 추이</div>
          <canvas id="trend-monthly-chart" height="220" style="width:100%"></canvas>
        </div>
        <div class="trend-section">
          <div class="trend-section-title">노선별 현황 (진행 중)</div>
          <div id="trend-route-table"></div>
        </div>
        <div class="trend-section">
          <div class="trend-section-title">선박별 평균 지연</div>
          <div id="trend-vessel-table"></div>
        </div>
      </div>
    </div>`;

  loadTrendData().then(data => {
    document.getElementById("trend-loading").style.display = "none";
    document.getElementById("trend-content").style.display = "block";
    renderLegBreakdown(data);
    renderMonthlyChart(data);
    renderVesselTable(data);
    renderRouteTable();
  }).catch(e => {
    document.getElementById("trend-loading").textContent = "Failed: " + (e.message || e);
  });
}

/* ---------- 구간별 지연 분해 ---------- */
function renderLegBreakdown(data) {
  const el = document.getElementById("trend-leg-chart");
  const recs = data.filter(r => Array.isArray(r.legBreakdown) && r.legBreakdown.length);
  if (!recs.length) { el.innerHTML = `<div style="color:var(--fog);font-size:12px">데이터 없음</div>`; return; }

  const labels = ["PKG ETD", "T/S Arrival", "T/S Departure", "POD Arrival"];
  const sums = [0,0,0,0], counts = [0,0,0,0];
  recs.forEach(r => {
    r.legBreakdown.forEach((leg, i) => {
      if (i < 4 && leg.days !== null && leg.days !== undefined) { sums[i] += leg.days; counts[i]++; }
    });
  });
  const avgs = sums.map((s, i) => counts[i] ? +(s / counts[i]).toFixed(1) : null);
  const maxVal = Math.max(...avgs.filter(v => v !== null).map(Math.abs), 1);

  el.innerHTML = avgs.map((v, i) => {
    if (v === null) return "";
    const pct = Math.abs(v) / maxVal * 100;
    const color = v > 0 ? "var(--warn)" : v < 0 ? "#4caf8a" : "var(--fog)";
    const sign = v > 0 ? "+" : "";
    return `<div class="trend-leg-row">
      <div class="trend-leg-label">${labels[i]}</div>
      <div class="trend-leg-bar-wrap">
        <div class="trend-leg-bar" style="width:${pct}%;background:${color}"></div>
      </div>
      <div class="trend-leg-val" style="color:${color}">${sign}${v}d</div>
    </div>`;
  }).join("");
}

/* ---------- 월별 평균 지연 추이 ---------- */
function renderMonthlyChart(data) {
  const byMonth = {};
  data.forEach(r => {
    const k = r.polDepMonth || r.planMonth || "unknown";
    if (k === "unknown") return;
    if (!byMonth[k]) byMonth[k] = [];
    if (r.delayDays !== null && r.delayDays !== undefined) byMonth[k].push(r.delayDays);
  });

  const keys = Object.keys(byMonth).filter(k => byMonth[k].length).sort();
  if (!keys.length) return;

  const avgs = keys.map(k => {
    const arr = byMonth[k];
    return +(arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1);
  });

  const canvas = document.getElementById("trend-monthly-chart");
  if (!canvas) return;
  const W = canvas.parentElement.offsetWidth || 800;
  canvas.width = W;
  canvas.height = 220;
  const ctx = canvas.getContext("2d");

  const pad = { top: 24, right: 20, bottom: 40, left: 40 };
  const cW = W - pad.left - pad.right;
  const cH = 220 - pad.top - pad.bottom;
  const maxV = Math.max(...avgs.map(Math.abs), 1);
  const minV = Math.min(...avgs, 0);
  const range = (maxV - minV) || 1;

  ctx.clearRect(0, 0, W, 220);

  const zeroY = pad.top + cH * (1 - (0 - minV) / range);
  ctx.strokeStyle = "rgba(255,255,255,0.1)";
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(pad.left, zeroY); ctx.lineTo(pad.left + cW, zeroY); ctx.stroke();

  const barW = Math.max(cW / keys.length - 6, 8);
  keys.forEach((k, i) => {
    const v = avgs[i];
    const x = pad.left + i * (cW / keys.length) + (cW / keys.length - barW) / 2;
    const barH = Math.abs(v) / range * cH;
    const y = v >= 0 ? zeroY - barH : zeroY;
    ctx.fillStyle = v > 0 ? "rgba(255,160,0,0.75)" : v < 0 ? "rgba(76,175,138,0.75)" : "rgba(255,255,255,0.15)";
    ctx.fillRect(x, y, barW, Math.max(barH, 2));

    const names = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const [, mo] = k.split("-");
    const label = (names[parseInt(mo,10)-1] || mo);
    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.font = "10px monospace";
    ctx.textAlign = "center";
    ctx.fillText(label, x + barW / 2, 220 - pad.bottom + 14);

    ctx.fillStyle = v > 0 ? "rgba(255,160,0,0.9)" : "#4caf8a";
    ctx.font = "10px monospace";
    ctx.fillText((v > 0 ? "+" : "") + v + "d", x + barW / 2, v >= 0 ? y - 5 : y + barH + 12);
  });
}

/* ---------- 선박별 평균 지연 ---------- */
function renderVesselTable(data) {
  const el = document.getElementById("trend-vessel-table");
  const byVessel = {};
  data.forEach(r => {
    const k = (r.vessel || "Unknown") + "_" + (r.voyage || "");
    if (!byVessel[k]) byVessel[k] = { vessel: r.vessel || "—", voyage: r.voyage || "—", delays: [], rollovers: 0 };
    if (r.delayDays !== null && r.delayDays !== undefined) byVessel[k].delays.push(r.delayDays);
    if (r.rollover) byVessel[k].rollovers++;
  });

  const rows = Object.values(byVessel)
    .filter(v => v.delays.length)
    .map(v => {
      const avg = +(v.delays.reduce((a, b) => a + b, 0) / v.delays.length).toFixed(1);
      return { ...v, avg, count: v.delays.length };
    })
    .sort((a, b) => b.avg - a.avg);

  if (!rows.length) { el.innerHTML = `<div style="color:var(--fog);font-size:12px">데이터 없음</div>`; return; }

  el.innerHTML = `<table style="width:100%;border-collapse:collapse;font-size:12px">
    <thead><tr style="color:var(--fog);border-bottom:1px solid rgba(255,255,255,0.08)">
      <th style="text-align:left;padding:6px 8px">VESSEL</th>
      <th style="text-align:left;padding:6px 8px">VOYAGE</th>
      <th style="text-align:right;padding:6px 8px">건수</th>
      <th style="text-align:right;padding:6px 8px">평균 지연</th>
      <th style="text-align:right;padding:6px 8px">롤오버</th>
    </tr></thead>
    <tbody>${rows.map(r => `<tr style="border-bottom:1px solid rgba(255,255,255,0.04)">
      <td style="padding:6px 8px">${r.vessel}</td>
      <td style="padding:6px 8px;color:var(--fog)">${r.voyage}</td>
      <td style="padding:6px 8px;text-align:right;color:var(--fog)">${r.count}</td>
      <td style="padding:6px 8px;text-align:right;color:${r.avg>0?'var(--warn)':r.avg<0?'#4caf8a':'var(--fog)'}">
        ${r.avg>0?"+":""}${r.avg}d
      </td>
      <td style="padding:6px 8px;text-align:right;color:${r.rollovers>0?'var(--warn)':'var(--fog)'}">
        ${r.rollovers||"—"}
      </td>
    </tr>`).join("")}</tbody>
  </table>`;
}

/* ---------- ERROR LOG ---------- */
async function renderErrorLogContent() {
  const el = document.getElementById("beta-content");
  if (!el) return;
  el.innerHTML = `
    <div style="margin-top:20px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
        <span style="font-size:11px;color:var(--fog);letter-spacing:.08em;text-transform:uppercase">SESSION LOG</span>
        <span id="errlog-stats" style="font-size:11px;color:var(--fog)"></span>
      </div>
      <div id="errlog-loading" style="color:var(--fog);font-size:12px">Loading…</div>
      <div id="errlog-table"></div>
    </div>`;

  try {
    const API_BASE = typeof API !== 'undefined' ? API.replace('/data','') : 'https://kossan-oqc.dhoqc.workers.dev';
    const key = typeof getKey === 'function' ? await getKey() : null;
    const headers = key ? {'X-Refresh-Key': key} : {};
    const r = await fetch(API_BASE + '/debug', {cache:'no-store', headers});
    const d = await r.json();
    const logs = (d.sessionLog ? JSON.parse(d.sessionLog) : []).reverse();

    document.getElementById("errlog-loading").style.display = "none";

    if (!logs.length) {
      document.getElementById("errlog-table").innerHTML =
        '<div style="color:var(--fog);font-size:12px">아직 로그 없음 — Cron 실행 후 쌓임</div>';
      return;
    }

    // 통계
    const total = logs.length;
    const ok = logs.filter(l => l.ok).length;
    const rate = total ? Math.round(ok/total*100) : 0;
    document.getElementById("errlog-stats").textContent =
      `성공 ${ok} / 전체 ${total} (${rate}%)`;

    // 부킹별 최신 성공까지 시도 횟수 요약 테이블
    const bookingMap = {};
    // 시간 역순(최신순)으로 순회하면서 각 부킹의 마지막 성공까지 누적
    const logsAsc = [...logs].reverse(); // 시간 오름차순
    for (const l of logsAsc) {
      if (!l.booking) continue;
      if (!bookingMap[l.booking]) bookingMap[l.booking] = { attempts: 0, success: false, lastOk: null };
      bookingMap[l.booking].attempts++;
      if (l.ok) {
        bookingMap[l.booking].success = true;
        bookingMap[l.booking].lastOk = l.time ? `${l.date} ${l.time}` : null;
        bookingMap[l.booking].attemptsToSuccess = bookingMap[l.booking].attempts;
        bookingMap[l.booking].successLoc = l.loc || null;
      }
    }

    const summaryRows = Object.entries(bookingMap)
      .sort((a, b) => (b[1].attemptsToSuccess||999) - (a[1].attemptsToSuccess||999));

    const summaryHtml = `
      <div style="margin-bottom:24px">
        <div style="font-size:11px;color:var(--fog);letter-spacing:.08em;text-transform:uppercase;margin-bottom:10px">부킹별 성공 시도 횟수</div>
        <table style="width:100%;border-collapse:collapse;font-size:12px;font-family:monospace">
          <thead><tr style="color:var(--fog);border-bottom:1px solid rgba(255,255,255,0.08)">
            <th style="text-align:left;padding:5px 8px">BOOKING</th>
            <th style="text-align:right;padding:5px 8px">총 시도</th>
            <th style="text-align:right;padding:5px 8px">성공까지</th>
            <th style="text-align:right;padding:5px 8px">성공 엣지</th>
            <th style="text-align:right;padding:5px 8px">마지막 성공</th>
          </tr></thead>
          <tbody>${summaryRows.map(([bkg, v]) => `
            <tr style="border-bottom:1px solid rgba(255,255,255,0.04)">
              <td style="padding:5px 8px">${bkg}</td>
              <td style="padding:5px 8px;text-align:right;color:var(--fog)">${v.attempts}</td>
              <td style="padding:5px 8px;text-align:right;color:${v.success ? '#4caf8a' : 'var(--buoy)'}">
                ${v.success ? v.attemptsToSuccess + '회' : '미성공'}
              </td>
              <td style="padding:5px 8px;text-align:right;color:var(--fog);font-size:10px">
                ${v.successLoc || '—'}
              </td>
              <td style="padding:5px 8px;text-align:right;color:var(--fog);font-size:10px">
                ${v.lastOk || '—'}
              </td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>`;

    document.getElementById("errlog-table").insertAdjacentHTML('beforebegin', summaryHtml);

    // 테이블
    document.getElementById("errlog-table").innerHTML = `
      <div style="font-size:11px;font-family:monospace;display:flex;flex-direction:column;gap:4px">
        ${logs.map(l => {
          const color = l.ok ? '#4caf8a' : 'var(--buoy)';
          const status = l.ok ? '✓' : '✗';
          const err = (!l.ok && (l.code || l.loc)) ? ` (${[l.code, l.loc].filter(Boolean).join(' · ')})` : (l.ok && l.loc ? ` (${l.loc})` : '');
          const tag = l.tag ? `[${l.tag}]` : '[cron]';
          return `<div style="display:flex;gap:8px;padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.04);align-items:center">
            <span style="color:${color};width:12px;flex-shrink:0">${status}</span>
            <span style="color:var(--fog);width:90px;flex-shrink:0">${l.date || ''} ${l.time || ''}</span>
            <span style="color:var(--fog);width:60px;flex-shrink:0;font-size:10px">${tag}</span>
            <span style="flex:1">${l.booking || '—'}</span>
            <span style="color:var(--fog);width:40px;text-align:right;flex-shrink:0">×${l.attempt||1}</span>
            <span style="color:${l.ok ? '#4caf8a' : 'var(--buoy)'};width:100px;text-align:right;flex-shrink:0;font-size:10px">${l.ok ? 'ok' : err}</span>
          </div>`;
        }).join('')}
      </div>`;
  } catch(e) {
    document.getElementById("errlog-loading").textContent = "Failed: " + (e.message || e);
  }
}

/* ---------- 노선별 현황 (진행 중 부킹 기준) ---------- */
async function renderRouteTable() {
  const el = document.getElementById("trend-route-table");
  if (!el) return;

  try {
    const r = await fetch(typeof source === 'function' ? source() : 'https://kossan-oqc.dhoqc.workers.dev/data', {cache:'no-store'});
    const d = await r.json();
    const ships = (d.shipments || []).filter(s => !s.etaActual);

    if (!ships.length) { el.innerHTML = '<div style="color:var(--fog);font-size:12px">진행 중인 부킹 없음</div>'; return; }

    // SVC별 그룹핑
    const byRoute = {};
    for (const s of ships) {
      const key = s.svc || 'UNKNOWN';
      if (!byRoute[key]) byRoute[key] = { svc: key, bookings: [], vessels: new Set() };
      byRoute[key].bookings.push(s);
      if (s.vessel) byRoute[key].vessels.add(s.vessel);
    }

    const rows = Object.values(byRoute).sort((a,b) => a.svc.localeCompare(b.svc));

    el.innerHTML = `<table style="width:100%;border-collapse:collapse;font-size:12px">
      <thead><tr style="color:var(--fog);border-bottom:1px solid rgba(255,255,255,0.08)">
        <th style="text-align:left;padding:6px 8px">노선</th>
        <th style="text-align:left;padding:6px 8px">T/S</th>
        <th style="text-align:right;padding:6px 8px">진행</th>
        <th style="text-align:right;padding:6px 8px">평균 지연</th>
        <th style="text-align:left;padding:6px 8px">운항 선박</th>
      </tr></thead>
      <tbody>${rows.map(r => {
        const delays = r.bookings.filter(s => typeof s.delayDays === 'number').map(s => s.delayDays);
        const avgDelay = delays.length ? (delays.reduce((a,b)=>a+b,0)/delays.length).toFixed(1) : null;
        const delayColor = avgDelay === null ? 'var(--fog)' : avgDelay > 7 ? '#ef4444' : avgDelay > 3 ? '#f97316' : avgDelay > 0 ? '#f6c90e' : '#4caf8a';
        const ts = r.bookings[0]?.ts || '—';
        return `<tr style="border-bottom:1px solid rgba(255,255,255,0.04)">
          <td style="padding:6px 8px;font-weight:600">${r.svc}</td>
          <td style="padding:6px 8px;color:var(--fog)">${ts}</td>
          <td style="padding:6px 8px;text-align:right;color:var(--fog)">${r.bookings.length}건</td>
          <td style="padding:6px 8px;text-align:right;color:${delayColor}">
            ${avgDelay !== null ? (avgDelay > 0 ? '+' : '') + avgDelay + 'd' : '—'}
          </td>
          <td style="padding:6px 8px;color:var(--fog);font-size:11px">${[...r.vessels].join(', ')}</td>
        </tr>`;
      }).join('')}</tbody>
    </table>`;
  } catch(e) {
    el.innerHTML = `<div style="color:var(--fog);font-size:12px">Failed: ${e.message}</div>`;
  }
}
