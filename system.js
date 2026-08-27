/* ===== system.js — SYSTEM 탭 · Changelog · Restore ===== */

function renderSystemTab(){
  const el = document.getElementById('sys-content');
  if(!el) return;
  const d = CUR;
  /* 디버그 */ console.log('[renderSystemTab] CUR shipments checkedAt:');
  (d&&d.shipments||[]).forEach(s=>console.log(`  bkg=${s.booking} checkedAt=${s.checkedAt} scheduleCheckedAt=${s.scheduleCheckedAt} mapAt=${s.mapAt}`));
  if(!d || !d.shipments){ el.innerHTML = `<div class="sys-err">No data loaded yet.</div>`; return; }

  function nextCron(){
    const now = new Date();
    const kst = new Date(now.getTime() + 9*3600000);
    const hh = kst.getUTCHours(), mm = kst.getUTCMinutes();
    const times = [[0,0],[3,0],[6,0],[9,0],[12,0],[15,0],[18,0],[21,0]];
    for(const [h,m] of times){
      const diffM = (h*60+m) - (hh*60+mm);
      if(diffM > 0) return `${String(h).padStart(2,'0')}:00 KST · in ${Math.floor(diffM/60)}h ${diffM%60}m`;
    }
    const diffM = (24*60 - hh*60 - mm);
    return `00:00 KST (tomorrow) · in ${Math.floor(diffM/60)}h ${diffM%60}m`;
  }

  const failList = d.shipments.filter(s=>s.scheduleError);
  const okCount = d.shipments.filter(s=>!s.scheduleError).length;

  let html = `
  <div class="sys-card">
    <div class="sys-row"><span class="sys-lbl">LAST COLLECTION</span>
      <span class="sys-val sys-ok">${fmtSysTime(d.updated)}</span></div>
    <div class="sys-row"><span class="sys-lbl">SOURCE</span>
      <span class="sys-val">${d.source||'—'}</span></div>
    <div class="sys-row"><span class="sys-lbl">RESULT</span>
      <span class="sys-val"><span class="sys-ok">${okCount} ok</span>${failList.length?` · <span class="sys-warn">${failList.length} failed</span>`:''}</span></div>

    <div class="sys-row"><span class="sys-lbl">NEXT COLLECTION</span>
      <span class="sys-val sys-dim">${nextCron()}</span></div>
  </div>

  <div class="sys-sec">
    <span>BOOKING STATUS</span>
    ${failList.length ? `<button class="sys-retry-all" id="sys-retry-all">RETRY ALL FAILED</button>` : ''}
  </div>
  <div class="sys-legend">
    <span><span class="sys-ok">ok</span> 스케줄 조회 성공</span>
    <span style="margin-left:14px"><span class="sys-warn">failed</span> 조회 실패 — 직전 값 표시 중</span>
    <span style="margin-left:14px">REFRESH: 즉시 재조회 (ok 포함 강제 가능)</span>
    <span style="margin-left:14px">MAP: 항로 좌표만 재조회</span>
  </div>
  <div class="sys-card" style="padding:10px 14px">
    <div class="sys-bkg3" style="font-size:10px;color:var(--fog);margin-bottom:6px">
      <span>BOOKING</span>
      <span>SCHEDULE</span>
      <span>MAP</span>
    </div>
    ${d.shipments.map(s=>{
      const hasRoute = !!(s.route && s.route.length);
      const mapOk = hasRoute && !!s.mapAt;  // route + mapAt 둘 다 있어야 ok
      const schedAt = s.scheduleCheckedAt || s.checkedAt;
      const mapAt   = s.mapAt;

      /* cf-ray에서 지역 코드 추출: "a292ac7dfd4eb501-LAX" → "LAX" */
      const mapRegion = s.mapError
        ? (s.mapError.match(/cf-ray\s+[\w]+-([A-Z]{2,4})[,)]/i)||[])[1] || ''
        : '';

      const schedErrLoc = s.scheduleError
        ? (s.scheduleError.match(/-([A-Z]{3})\b/)||[])[1] || '' : '';
      /* scheduleCheckedAt 기준 12시간 이내면 stale이어도 ok로 표시 */
      const SCHED_OK_MS = 12 * 60 * 60 * 1000;
      const schedAge = schedAt ? (Date.now() - new Date(schedAt.replace(' ','T').replace(/Z$/,'')+'Z').getTime()) : Infinity;
      const schedFresh = schedAge < SCHED_OK_MS;
      const schedStatus = (s.scheduleError && !schedFresh)
        ? `<span class="sys-warn">failed</span>${schedErrLoc?` <span style="color:var(--buoy);font-size:10px" title="${(s.scheduleError||'').replace(/"/g,'&quot;')}">· ${schedErrLoc}</span>`:''}`
        : `<span class="sys-ok">ok</span>`;
      const MAP_OK_MS = 12 * 60 * 60 * 1000;
      const mapAge = mapAt ? (Date.now() - new Date(mapAt.replace(' ','T').replace(/Z$/,'')+'Z').getTime()) : Infinity;
      const mapFresh = mapAge < MAP_OK_MS;
      const mapStatus = mapOk
        ? `<span style="color:var(--sail)">ok</span>`
        : (s.mapError
          ? (()=>{
              const region = (s.mapError.match(/cf-ray\s+[\w]+-([A-Z]{2,4})[,)]/i)||[])[1]||'';
              const m = s.mapError.match(/^(\d{2}:\d{2}:\d{2})\s+(.*)/s);
              const t = m?m[1]:''; const msg = m?m[2]:s.mapError;
              return `<span style="color:var(--buoy)">ERR${region?' · '+region:''}</span>
                <div style="font-size:10px;color:var(--buoy);margin-top:2px;word-break:break-all">${t?t+' ':''}${msg.replace(/</g,'&lt;')}</div>`;
            })()
          : `<span style="color:var(--fog)">—</span>`);

      return `
    <div class="sys-bkg3" id="sysr-${s.booking}">
      <span style="font-size:11px;font-weight:600">${s.booking}<br>
        <span style="font-size:10px;font-weight:400;color:var(--fog)">${(s.vessel||'').slice(0,16)} ${s.voyage||''}</span>
      </span>
      <span>
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
          ${schedStatus}
          <span class="sys-dim" style="font-size:10px">${schedAt?fmtSysTime(schedAt):'—'}</span>
        </div>
        <div style="margin-top:4px">
          ${s.etaActual
            ? `<span style="font-size:10px;color:var(--fog)">도착 완료</span>`
            : `<button class="sys-retry" data-bkg="${s.booking}" style="font-size:10px;padding:2px 7px;border-color:#F2C14E;color:#F2C14E;background:none;border:1px solid #F2C14E">REFRESH</button>`}
        </div>
      </span>
      <span>
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
          ${mapStatus}
          <span class="sys-dim" style="font-size:10px">${mapAt?fmtSysTime(mapAt):'—'}</span>
        </div>
        <div style="margin-top:4px">
          ${s.etaActual
            ? `<span style="font-size:10px;color:var(--fog)">도착 완료</span>`
            : (mapFresh && mapOk
              ? ``
              : `<button class="sys-map-refresh" data-bkg="${s.booking}" style="font-size:10px;padding:2px 7px;border:1px solid #F2C14E;color:#F2C14E;background:none">REFRESH</button>`)}
        </div>
      </span>
    </div>`; }).join('')}
  </div>`;

  if(d.errors && d.errors.length){
    html += `<div class="sys-sec">LAST RUN ERRORS</div>
    <div class="sys-err" id="sys-err-now">${d.errors.map(e=>{
      const m = e.match(/^(\d{2}:\d{2}:\d{2})\s+(.*)/s);
      const t = m ? m[1] : '';
      const msg = m ? m[2] : e;
      return `<div class="err-row"><span class="err-msg">${msg.replace(/</g,'&lt;')}</span><span class="err-time">${t}</span></div>`;
    }).join('')}</div>`;
  }

  html += `<div class="sys-sec" style="margin-top:8px">
    <span>ERROR LOG</span>
    <button class="sys-retry" id="sys-err-toggle" style="font-size:10px;padding:2px 8px" onclick="toggleErrLog()">
      최근 50개 ▾
    </button>
  </div>
  <div id="sys-err-log" style="display:none"></div>`;

  el.innerHTML = html;

  /* DEVLOG 패널 (devlog.js 로드된 경우에만 — 임시 디버그) */
  if (typeof window.__renderDevlogPanel__ === 'function') window.__renderDevlogPanel__(el);

  /* 에러 로그 비동기 로드 */
  (async ()=>{
    try{
      const key = await getKey();
      if(!key) return;
      const r = await fetch(API.replace('/data','/errorlog'), { headers:{'X-Refresh-Key':key} });
      if(!r.ok) return;
      const res = await r.json();
      const logEl = document.getElementById('sys-err-log');
      if(!logEl) return;
      if(!res.log || !res.log.length){
        logEl.innerHTML = `<div style="font-size:11px;color:var(--fog);padding:6px 0">로그 없음</div>`;
        return;
      }
      const tagColor = tag => {
        if(tag==='cron') return '#e5484d';
        if(tag && tag.startsWith('retry')) return '#f59e0b';
        if(tag && tag.startsWith('map-retry')) return '#3b82f6';
        return 'var(--fog)';
      };
      logEl.innerHTML = `<div class="sys-err">${res.log.map(e=>`
        <div class="err-row">
          <span class="err-msg" style="color:${tagColor(e.tag)}">[${e.tag||'?'}] ${(e.msg||'').replace(/</g,'&lt;')}</span>
          <span class="err-time">${e.t||''}</span>
        </div>`).join('')}</div>`;
    }catch(_){}
  })();

  el.querySelectorAll('.sys-retry').forEach(btn=>{
    btn.addEventListener('click', ()=>sysRetry(btn.dataset.bkg, btn));
  });
  const retryAllBtn = document.getElementById('sys-retry-all');
  if(retryAllBtn) retryAllBtn.addEventListener('click', async ()=>{
    retryAllBtn.disabled = true;
    retryAllBtn.textContent = '조회중…';
    for(const s of failList){
      const row = document.getElementById(`sysr-${s.booking}`);
      const btn = row ? row.querySelector('.sys-retry') : null;
      await sysRetry(s.booking, btn);
    }
    retryAllBtn.textContent = '완료';
  });
  el.querySelectorAll('.sys-map-refresh').forEach(btn=>{
    btn.addEventListener('click', ()=>sysMapRefreshOne(btn.dataset.bkg, btn));
  });
}

function toggleErrLog(){
  const el = document.getElementById('sys-err-log');
  const btn = document.getElementById('sys-err-toggle');
  if(!el) return;
  const open = el.style.display === 'none';
  el.style.display = open ? 'block' : 'none';
  if(btn) btn.textContent = open ? '접기 ▴' : '최근 50개 ▾';
}

async function sysRetry(bkg, btn){
  if(btn){ btn.disabled=true; btn.textContent='↻…'; }
  const row = document.getElementById(`sysr-${bkg}`);
  try{
    const key = await getKey();
    if(!key){ if(btn){btn.disabled=false;btn.textContent='RETRY';} return; }
    const r = await fetch(`${API.replace('/data','/lookup')}?bkg=${bkg}`,
      { headers:{'X-Refresh-Key':key} });
    const res = await r.json();
    if(!r.ok) throw new Error(`${res.error||'error'} [${res.hint||''}] (${r.status})`);
    if(row){
      const cells = row.querySelectorAll('span');
      const now = new Date();
      cells[1].textContent = fmtDT(now.toISOString().slice(0,16));
      if(res.savedToData){
        cells[2].innerHTML = `<span class="sys-ok">ok</span>`;
        cells[3].innerHTML = '';
      } else {
        cells[2].innerHTML = `<span class="sys-warn">⚠ 조회 성공, KV 저장 실패</span>`;
        cells[3].innerHTML = res.saveWarn
          ? `<span class="sys-bad" style="font-size:10px">${res.saveWarn}</span>` : '';
      }
    }
    if(res.savedToData && CUR && CUR.shipments){
      // KV 전파 지연을 우회: /data 재fetch 없이 /lookup 응답값으로 직접 CUR 업데이트 후 render
      const idx = CUR.shipments.findIndex(s => s.booking === bkg);
      // 기존 map 필드(mapAt, route 등) 보존 후 /lookup 응답으로 덮어씌움
      const existing = idx >= 0 ? CUR.shipments[idx] : {};
      const fresh = Object.assign({}, existing, res);
      delete fresh.savedToData; delete fresh.saveWarn; delete fresh.added;
      delete fresh.staleItem; delete fresh.staleSince;
      /* 스케줄 리프레시는 맵에 영향 없음 — 기존 맵 데이터 보존 */
      fresh.route = existing.route;
      fresh.mapAt = existing.mapAt;
      fresh.mapError = existing.mapError;
      fresh.pos = existing.pos;
      console.log(`[sysRetry] bkg=${bkg} idx=${idx} fresh.checkedAt=${fresh.checkedAt} fresh.scheduleCheckedAt=${fresh.scheduleCheckedAt}`);
      if(idx >= 0) CUR.shipments[idx] = fresh;
      else CUR.shipments.push(fresh);
      try{ _localLookupCache[bkg] = fresh; console.log('[sysRetry] cache set ok'); }catch(ce){ console.error('[sysRetry] cache error:', ce); }
      render(CUR);
    }
  } catch(e){
    if(btn){ btn.disabled=false; btn.textContent='RETRY'; }
    if(row){
      const cells = row.querySelectorAll('span');
      const _m=e.message||"failed";
        const _hint=(_m.match(/\[([^\]]+)\]/)||[])[1]||"";
        const _c=(_hint.match(/response\s+(\d{3})/)||[])[1]||(_m.match(/(\d{3})/)||[])[1]||"";
        const _l=(_hint.match(/-([A-Z]{3})\b/)||[])[1]||"";
        const _lbl=_c||_l?`Failed to retry (${[_c,_l].filter(Boolean).join(" · ")})`:"Failed to retry";
        cells[3].innerHTML = `<span class="sys-bad" style="font-size:10px" title="${_hint||_m}">${_lbl}</span>`;
    }
  }
}

async function sysForceMap(btn){
  btn.disabled = true;
  const orig = btn.textContent;
  btn.textContent = '수집 중…';
  try{
    const key = await getKey();
    if(!key){ btn.disabled=false; btn.textContent=orig; return; }
    const r = await fetch(`${API.replace('/data','/collect')}?maps=1`,
      { method:'POST', headers:{'X-Refresh-Key':key} });
    const res = await r.json();
    if(!r.ok) throw new Error(`${res.error||'error'} [${res.hint||''}] (${r.status})`);
    btn.textContent = `완료 — ${res.mapOk||0}건 갱신`;
    setTimeout(()=>{ btn.disabled=false; btn.textContent=orig; }, 4000);
    fetch(source(),{cache:'no-store'}).then(r=>r.ok?r.json():null).then(d=>{ if(d) render(d); });
  } catch(e){
    btn.disabled=false;
    btn.textContent=orig;
    const el=document.getElementById('sys-content');
    if(el) el.insertAdjacentHTML('afterbegin',
      (()=>{const _m=e.message||"no response";const _c=(_m.match(/(\d{3})/)||[])[1]||"";const _l=(_m.match(/-([A-Z]{3})\b/)||[])[1]||"";const _lbl=_c||_l?`Failed to refresh (${[_c,_l].filter(Boolean).join(" · ")})`:"Failed to refresh";return `<div class="sys-err" style="margin-bottom:8px" title="${_m}">${_lbl}</div>`;})());
  }
}

async function sysMapRefreshOne(bkg, btn){
  btn.disabled = true;
  const orig = btn.textContent;
  btn.textContent = '…';
  const row = document.getElementById(`sysr-${bkg}`);
  try{
    const key = await getKey();
    if(!key){ btn.disabled=false; btn.textContent=orig; return; }
    /* bkg= 파라미터로 특정 부킹만 강제 재조회 (mapFresh 무시) */
    const r = await fetch(`${API.replace('/data','/collect')}?maps=1&bkg=${encodeURIComponent(bkg)}`,
      { method:'POST', headers:{'X-Refresh-Key':key} });
    const res = await r.json();
    if(!r.ok) throw new Error(res.error||r.status);

    /* 응답에서 해당 부킹의 실제 결과 확인 */
    const item = (res.shipments||[]).find(s=>s.booking===bkg);
    const mapOk = item && item.route;  // mapError 있어도 route 있으면 ok
    const mapAt  = item && item.mapAt ? fmtSysTime(item.mapAt) : '—';
    const errMsg = item && item.mapError ? item.mapError : (res.mapErrors||[]).find(e=>e.includes(bkg))||'';

    /* MAP 셀(3번째 컬럼) 직접 업데이트 */
    if(row){
      const cols = row.querySelectorAll(':scope > span');
      const mapCol = cols[2];
      if(mapCol){
        if(mapOk){
          mapCol.innerHTML = `
            <div style="display:flex;align-items:center;gap:6px">
              <span style="color:var(--sail)">ok</span>
              <span class="sys-dim" style="font-size:10px">${mapAt}</span>
            </div>
            <div style="margin-top:4px">
              <button class="sys-map-refresh" data-bkg="${bkg}" style="font-size:10px;padding:2px 7px;border:1px solid #F2C14E;color:#F2C14E;background:none">REFRESH</button>
            </div>`;
        } else {
          const region = (errMsg.match(/cf-ray\s+[\w]+-([A-Z]{2,4})[,)]/i)||[])[1] || '';
          const errParsed = errMsg.match(/^(\d{2}:\d{2}:\d{2})\s+(.*)/s);
          const errTime = errParsed ? errParsed[1] : '';
          const errText = errParsed ? errParsed[2] : errMsg;
          mapCol.innerHTML = `
            <div style="display:flex;align-items:center;gap:6px">
              <span style="color:var(--buoy)">ERR${region?' · '+region:''}</span>
              <span class="sys-dim" style="font-size:10px">${mapAt}</span>
            </div>
            <div style="font-size:10px;color:var(--buoy);margin-top:2px;word-break:break-all">${errTime ? errTime+' ' : ''}${errText.replace(/</g,'&lt;')}</div>
            <div style="margin-top:4px">
              <button class="sys-map-refresh" data-bkg="${bkg}" style="font-size:10px;padding:2px 7px;border:1px solid #F2C14E;color:#F2C14E;background:none">REFRESH</button>
            </div>`;
        }
        /* 새로 생성된 버튼에 이벤트 재등록 */
        mapCol.querySelector('.sys-map-refresh')
          ?.addEventListener('click', e=>{ e.stopPropagation(); sysMapRefreshOne(bkg, e.currentTarget); });
      }
    }

    /* KV 전파 지연 우회: item의 map 필드만 CUR에 병합 후 render (/data 재fetch 제거) */
    if(CUR && CUR.shipments && item){
      const idx2 = CUR.shipments.findIndex(s => s.booking === bkg);
      if(idx2 >= 0){
        const merged = Object.assign({}, CUR.shipments[idx2], {
          route: item.route,
          mapAt: item.mapAt,
          mapError: item.mapError || null,
          names: item.names,
          idx: item.idx,
          ratio: item.ratio,
          routeSynth: item.routeSynth,
        });
        CUR.shipments[idx2] = merged;
        _localLookupCache[bkg] = merged;
      }
      render(CUR);
    }
  } catch(e){
    btn.disabled=false;
    btn.textContent=orig;
    if(row){
      const cols = row.querySelectorAll(':scope > span');
      const mapCol = cols[2];
      if(mapCol){
        const errDiv = mapCol.querySelector('.map-err') || document.createElement('div');
        errDiv.className='map-err';
        errDiv.style.cssText='font-size:10px;color:var(--buoy);margin-top:2px';
        errDiv.textContent = e.message||'failed';
        if(!mapCol.contains(errDiv)) mapCol.appendChild(errDiv);
      }
    }
  }
}

/* ---------- Changelog ---------- */
const CHANGELOG = [
  { v:"1.1", date:"2026-08-08", notes:[
    "admin 계정 추가 — 업데이트 로그(변경 이력)는 이제 admin 계정에서만 볼 수 있음 (kossan 포함 다른 계정에서는 안 보임)",
    "eta / qc 계정으로 로그인하면 메뉴(01/02 선택 화면) 없이 바로 해당 화면으로 진입",
    "로그아웃 버튼 추가 — 화면 우측 상단에서 언제든 로그아웃하고 다른 계정으로 재접속 가능"
  ]},
  { v:"1.0", date:"2026-08-08", notes:[
    "역할별 로그인 — kossan(전체 접근), admin(전체 + 업데이트 로그), eta(SHIPMENT STATUS만), qc(QUALITY ANALYSIS만)",
    "로그인이 5분간 유지돼 새로고침해도 비밀번호를 다시 묻지 않음",
    "HISTORY 탭: 월별 요약(선박 수 / 평균 지연일 / 최대 지연일)을 표와 차트로 추가",
    "지연 배지: 빨간 \"!\"(ETB 변경)에 더해 노란 \"!\"(본선 변경) 추가",
    "사이트 전체 날짜 표기를 \"Mon/DD\"(예: Aug/08) 형식으로 변경",
    "SHIPMENT STATUS 전반 영문화"
  ]}
];
function renderChangelog(){
  return CHANGELOG.map(v=>`<div class="cl-v">
      <div class="vh">v${v.v}<span class="d">${v.date}</span></div>
      <ul>${v.notes.map(n=>`<li>${n}</li>`).join("")}</ul>
    </div>`).join("");
}
function showChangelog(){
  if(ACCESS_ROLE !== "admin") return;
  const box = document.getElementById("changelog");
  box.innerHTML = `<div class="gl-in" style="max-width:520px">
      <div class="gl-h"><b>업데이트 로그</b><button class="gl-x" id="changelog-x">✕</button></div>
      ${renderChangelog()}
    </div>`;
  box.hidden = false;
  document.getElementById("changelog-x").addEventListener("click",()=>{ box.hidden = true; });
  box.addEventListener("click",e=>{ if(e.target===box) box.hidden = true; },{once:true});
}

/* ---------- Restore ---------- */
const BACKUP_API = "https://api.github.com/repos/donghoon2661-prog/q-report/contents/backups";

async function showRestoreModal(){
  if(ACCESS_ROLE !== "admin") return;
  const modal = document.getElementById("restore-modal");
  modal.innerHTML = `<div class="rm-in">
    <div class="rm-h"><b>⚠ RESTORE</b> — 백업에서 KV 복원<button class="gl-x" id="rm-x">✕</button></div>
    <div class="rm-note">백업 날짜를 선택하고 RESTORE를 누르면 <b>bookings · pomap · poeta · pophoto · history</b>가 해당 시점으로 복원됩니다.<br>shipments는 복원 후 /collect로 재수집됩니다. 이 작업은 되돌릴 수 없습니다.</div>
    <div class="rm-list" id="rm-list"><div style="padding:14px;font-size:11px;color:var(--fog)">백업 목록 불러오는 중…</div></div>
    <div class="rm-actions">
      <button class="btn" id="rm-cancel">취소</button>
      <button class="btn danger" id="rm-confirm" disabled>RESTORE</button>
    </div>
  </div>`;
  modal.hidden = false;
  document.getElementById("rm-x").addEventListener("click",()=>{ modal.hidden=true; });
  document.getElementById("rm-cancel").addEventListener("click",()=>{ modal.hidden=true; });
  modal.addEventListener("click",e=>{ if(e.target===modal) modal.hidden=true; });

  let files;
  try{
    const r = await fetch(BACKUP_API);
    if(!r.ok) throw new Error("GitHub API " + r.status);
    files = await r.json();
  } catch(e){
    document.getElementById("rm-list").innerHTML =
      `<div style="padding:14px;font-size:11px;color:var(--buoy)">목록 불러오기 실패: ${e.message}</div>`;
    return;
  }

  const backups = files
    .filter(f => /^backup-\d{4}-\d{2}-\d{2}\.json$/.test(f.name))
    .sort((a,b) => b.name.localeCompare(a.name));

  if(!backups.length){
    document.getElementById("rm-list").innerHTML =
      `<div style="padding:14px;font-size:11px;color:var(--fog)">백업 파일 없음</div>`;
    return;
  }

  let selectedDate = null;
  document.getElementById("rm-list").innerHTML = backups.map(f=>{
    const date = f.name.replace("backup-","").replace(".json","");
    return `<button class="rm-item" data-date="${date}">${date}</button>`;
  }).join("");

  document.querySelectorAll(".rm-item").forEach(btn=>{
    btn.addEventListener("click",()=>{
      document.querySelectorAll(".rm-item").forEach(b=>b.classList.remove("sel"));
      btn.classList.add("sel");
      selectedDate = btn.dataset.date;
      document.getElementById("rm-confirm").disabled = false;
    });
  });

  document.getElementById("rm-confirm").addEventListener("click", async ()=>{
    if(!selectedDate) return;
    const confirmBtn = document.getElementById("rm-confirm");
    confirmBtn.disabled = true; confirmBtn.textContent = "복원 중…";
    const key = await getKey();
    if(!key){ confirmBtn.disabled=false; confirmBtn.textContent="RESTORE"; return; }
    try{
      const r = await fetch(`${API.replace("/data","/restore")}`, {
        method:"POST",
        headers:{"Content-Type":"application/json","X-Refresh-Key":key},
        body: JSON.stringify({ date: selectedDate })
      });
      const res = await r.json();
      if(!r.ok) throw new Error(res.error || r.status);
      modal.hidden = true;
      const box = document.getElementById("gaplog");
      box.innerHTML = `<div class="gl-in">
        <div class="gl-h"><b>${selectedDate} 복원 완료</b><button class="gl-x" id="rl-x">✕</button></div>
        <p style="font-size:12px;color:var(--paper);margin-bottom:8px">복원된 키: ${res.restored.join(", ")}</p>
        <p style="font-size:11px;color:var(--fog)">${res.note}</p>
      </div>`;
      box.hidden = false;
      document.getElementById("rl-x").addEventListener("click",()=>{ box.hidden=true; });
      fetch(source(),{cache:"no-store"}).then(r=>r.ok?r.json():FALLBACK).then(d=>render(d));
    } catch(e){
      confirmBtn.disabled = false; confirmBtn.textContent = "RESTORE";
      document.getElementById("rm-list").insertAdjacentHTML("afterend",
        `<p style="font-size:11px;color:var(--buoy);margin-bottom:8px">오류: ${e.message}</p>`);
    }
  });
}



