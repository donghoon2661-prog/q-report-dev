/* ── Kossan OQC · QUALITY ANALYSIS ─────────────────────────────────────────
   COA 원본 데이터는 이 파일에 없다. data/coa/index.json 에 나열된 JSON들을
   불러와 조립한다. 새 COA 추가 = JSON 파일 1개 + index.json 에 한 줄.
   이 파일(로직)은 건드릴 필요 없음.
   ───────────────────────────────────────────────────────────────────────── */

/* ── 스펙 상수 (v10.8) ── */
const WSPEC = {'Small':[80,90],'Medium':[90,100],'Large':[101,111],'Extra Large':[111,121]};
const ITEMS = [
  {id:'leak', name:'Leaking', dir:'hi', s1:15, s2:12, key:'leak', unit:'개/사이즈', specTxt:'사이즈당 Max 14'},
  {id:'maj',  name:'Visual Major', dir:'hi', s1:22, s2:18, key:'maj', unit:'개/사이즈', specTxt:'사이즈당 Max 21'},
  {id:'minr', name:'Visual Minor', dir:'hi', s1:22, s2:18, key:'minr', unit:'개/사이즈', specTxt:'사이즈당 Max 21'},
  {id:'ba_t', name:'BA Tensile Min', dir:'lo', s1:18, s2:20, key:'ba_t_min', unit:'MPa', specTxt:'≥ 18.0'},
  {id:'ba_e', name:'BA Elongation Min', dir:'lo', s1:500, s2:515, key:'ba_e_min', unit:'%', specTxt:'≥ 500'},
  {id:'aa_t', name:'AA Tensile Min', dir:'lo', s1:14, s2:18, key:'aa_t_min', unit:'MPa', specTxt:'≥ 14.0'},
  {id:'aa_e', name:'AA Elongation Min', dir:'lo', s1:400, s2:440, key:'aa_e_min', unit:'%', specTxt:'≥ 400'},
  {id:'powder', name:'Powder', dir:'hi', s1:1.5, s2:1.2, s1incl:true, key:'powder', unit:'', specTxt:'Max 1.50'},
  {id:'len', name:'Length Min', dir:'lo', s1:240, s2:243, key:'len_min', unit:'mm', specTxt:'≥ 240'},
  {id:'cuff', name:'Thk Cuff Min', dir:'lo', s1:0.05, s2:null, key:'cuff_min', unit:'mm', specTxt:'≥ 0.05 · 근접밴드 없음', specTxt_en:'≥ 0.05 · no near-limit band'},
  {id:'palm', name:'Thk Palm Min', dir:'lo', s1:0.05, s2:0.06, key:'palm_min', unit:'mm', specTxt:'≥ 0.06 (S2 근접) / 0.05 미만 S1', specTxt_en:'≥ 0.06 (S2 near) / <0.05 S1'},
  {id:'fin', name:'Thk Finger Min', dir:'lo', s1:0.08, s2:null, key:'fin_min', unit:'mm', specTxt:'≥ 0.08 · 근접밴드 없음', specTxt_en:'≥ 0.08 · no near-limit band'},
  {id:'width', name:'Width 경계 여유', name_en:'Width Boundary Margin', dir:'lo', s1:0, s2:1, key:null, unit:'mm', specTxt:'사이즈별 ±5, 0 = 스펙 경계', specTxt_en:'±5 per size, 0 = spec boundary', margin:true},
];
function itemName(it){ return LANG==='en' && it.name_en ? it.name_en : it.name; }
function itemSpecTxt(it){ return LANG==='en' && it.specTxt_en ? it.specTxt_en : it.specTxt; }

const COA_DIR = 'data/coa/';
let DATA = { sheets: [], detections: [] };

/* ── i18n ── UI 라벨만 관리. detection의 note/why는 파일 자체의 note_en/why_en을 사용 */
let LANG = 'en';
const I18N = {
  ko:{
    title:'품질 관제 대시보드', subtitle:'COA 검사 기준 v10.8 (실스펙·사이즈별)',
    detPanel:'워크시트별 DETECTION', detHint:'건수 클릭 → 상세',
    chartPanel:'스펙 관제 — Lot별 최악값 vs 허용 한계',
    datePanel:'제조일자 → 워크시트 → 백데이터',
    lot:'Lot', sector:'섹터', s1off:'S1 Off-spec', s2near:'S2 근접',
    resolvedTag:'해소됨', noDetect:'신 기준(v10.8) 탐지 없음 — 전 항목 스펙 이내',
    resolvedReasonPrefix:'해소 사유', resolvedDatePrefix:'해소일', resolvedReasonTypo:'오타 정정',
    off:'Off-spec 한계 (S1)', near:'근접 밴드 경계 (S2)', worstByLot:'Lot 최악값',
    mfgMonth:'제조월', sheetCount:'워크시트', clickForFiles:'개 · 클릭하여 파일 목록',
    openBackdata:'→ 백데이터 열기', sectors_:'섹터', cellHighlight:'셀 강조 = v10.8 기준 Off-spec(적) / 근접(황)',
    latestLot:'최신 Lot', marginToLimit:'허용 한계까지 여유', allTimeWorst:'전체 기간 최악값', status:'판정 상태',
    statusOff:'OFF-SPEC', statusNear:'근접', statusOk:'정상',
    mfgDate:'제조일', pages:'Pages', itemHeader:'항목',
    legendPrefix:'강조:', legendOff:'적색 = Off-spec(S1)', legendNear:'황색 = 근접 밴드(S2)', legendNote:'검사 기준 v10.8 (Thickness는 근접 밴드 없음)',
    unmapped:'미상', cell:'셀',
    tabDet:'탐지', tabChart:'스펙 차트', tabDate:'제조일자',
  },
  en:{
    title:'Quality Monitoring Dashboard', subtitle:'COA inspection criteria v10.8 (actual spec, per size)',
    detPanel:'DETECTION by Worksheet', detHint:'Click count → details',
    chartPanel:'Spec Monitoring — Worst value per Lot vs Limit',
    datePanel:'Mfg Date → Worksheet → Backdata',
    lot:'Lot', sector:'Sectors', s1off:'S1 Off-spec', s2near:'S2 Near-limit',
    resolvedTag:'Resolved', noDetect:'No detections under v10.8 criteria — all items within spec',
    resolvedReasonPrefix:'Resolved reason', resolvedDatePrefix:'Resolved on', resolvedReasonTypo:'Typo correction',
    off:'Off-spec limit (S1)', near:'Near-limit boundary (S2)', worstByLot:'Worst value by Lot',
    mfgMonth:'Mfg month', sheetCount:'worksheet(s)', clickForFiles:' · click for file list',
    openBackdata:'→ Open backdata', sectors_:'sectors', cellHighlight:'Highlighted cells = v10.8 Off-spec (red) / Near-limit (yellow)',
    latestLot:'Latest Lot', marginToLimit:'Margin to limit', allTimeWorst:'All-time worst', status:'Status',
    statusOff:'OFF-SPEC', statusNear:'Near-limit', statusOk:'Normal',
    mfgDate:'Mfg date', pages:'Pages', itemHeader:'Item',
    legendPrefix:'Legend:', legendOff:'Red = Off-spec (S1)', legendNear:'Yellow = Near-limit band (S2)', legendNote:'Criteria v10.8 (Thickness has no near-limit band)',
    unmapped:'Unknown', cell:'Cell',
    tabDet:'Detect', tabChart:'Spec Chart', tabDate:'Mfg Date',
  }
};
function t(key){ return I18N[LANG][key]; }
function noteOf(d){ return LANG==='en' && d.note_en ? d.note_en : d.note; }
function whyOf(d){ return LANG==='en' && d.why_en ? d.why_en : d.why; }
function resolvedReasonText(d){
  if(d.resolved_reason==='TYPO') return t('resolvedReasonTypo');
  return d.resolved_reason || '—';
}

/* index.json → 각 시트 JSON 병렬 로드 → DATA 형태로 조립 */
async function loadCOA(){
  const ir = await fetch(COA_DIR + 'index.json', {cache:'no-store'});
  if(!ir.ok) throw new Error('index.json ' + ir.status);
  const idx = await ir.json();
  const list = Array.isArray(idx.sheets) ? idx.sheets : [];
  const files = await Promise.all(list.map(async e => {
    const r = await fetch(COA_DIR + e.file, {cache:'no-store'});
    if(!r.ok) throw new Error(e.file + ' ' + r.status);
    const j = await r.json();
    return { name: j.name || e.name, sectors: j.sectors || [], detections: j.detections || [] };
  }));
  return {
    sheets: files.map(f => ({ name: f.name, sectors: f.sectors })),
    detections: files.flatMap(f => f.detections.map(d => ({ ...d, sheet: d.sheet || f.name })))
  };
}

function coaError(msg){
  const c = document.getElementById('chips');
  if(c) c.innerHTML = '<span class="chip alert">COA 데이터 로드 실패<b>!</b></span>';
  const l = document.getElementById('left');
  if(l) l.innerHTML = '<div class="empty-note">' + msg + '<br>data/coa/ 경로와 index.json을 확인하세요.</div>';
  console.error('[quality] COA load failed:', msg);
}

/* resolved 배지 + 언어 토글 스타일 — style.css 재배포 없이 바로 동작하도록 인라인 주입 */
(function injectResolvedStyle(){
  if(document.getElementById('qres-style')) return;
  const st = document.createElement('style');
  st.id = 'qres-style';
  st.textContent = '#qview .det-row.resolved{opacity:.55}'+
    '#qview .resolved-tag{font-family:var(--mono);font-size:9.5px;letter-spacing:.06em;'+
    'color:var(--ok,#3FCF8E);border:1px solid var(--ok,#3FCF8E);border-radius:10px;padding:1px 7px;margin-right:4px;cursor:pointer}'+
    '#qview .resolved-detail{font-family:var(--mono);font-size:10px;color:var(--ok,#3FCF8E);margin-top:4px}'+
    '#qview .lang-toggle{font-family:var(--mono);font-size:11px;color:var(--muted,#7E8AA0);'+
    'display:flex;align-items:center;gap:4px;user-select:none;margin-left:12px}'+
    '#qview .lang-toggle span{cursor:pointer;padding:3px 8px;border-radius:12px;border:1px solid transparent}'+
    '#qview .lang-toggle span.on{color:var(--blue,#4DA3FF);background:var(--blueDim,rgba(77,163,255,.12));'+
    'border-color:var(--blue,#4DA3FF);font-weight:600}'+
    '#qview .lang-toggle .sep{color:var(--line2,#2A3446)}';
  document.head.appendChild(st);
})();

/* header에 KOR/ENG 토글 삽입 (index.html 미수정) */
function injectLangToggle(){
  const chips = document.getElementById('chips');
  if(!chips || document.getElementById('langToggle')) return;
  const box = document.createElement('div');
  box.className = 'lang-toggle'; box.id = 'langToggle';
  box.innerHTML = '<span data-l="ko">KOR</span><span class="sep">|</span><span data-l="en" class="on">ENG</span>';
  box.querySelectorAll('span[data-l]').forEach(el=>{
    el.addEventListener('click', ()=>{
      const lang = el.dataset.l;
      if(lang===LANG) return;
      LANG = lang;
      box.querySelectorAll('span[data-l]').forEach(x=>x.classList.toggle('on', x.dataset.l===lang));
      renderStaticLabels();
      rebuildDynamic();
    });
  });
  chips.parentElement.insertBefore(box, chips.nextSibling);
}

/* index.html의 원래 부제 뒷부분(데이터 기준일 등)을 캡처해 두 언어로 변환 */
let SUBTITLE_SUFFIX_KO = '', SUBTITLE_SUFFIX_EN = '';
function captureSubtitleSuffix(){
  const small = document.querySelector('#qview header h1 small');
  if(!small) return;
  const full = small.textContent;
  const parenEnd = full.indexOf(')'); // '실스펙·사이즈별' 안의 가운뎃점을 피해 첫 괄호 닫힘 뒤부터 탐색
  const idx = parenEnd>=0 ? full.indexOf('·', parenEnd) : full.indexOf('·');
  SUBTITLE_SUFFIX_KO = idx>=0 ? full.slice(idx) : '';
  SUBTITLE_SUFFIX_EN = SUBTITLE_SUFFIX_KO
    .replace('데이터 기준일', 'Data as of')
    .replace('오타 정정 반영', 'typo corrections applied');
}

/* index.html에 박혀있는 고정 라벨(h1/h2)을 언어에 맞게 갱신 */
function renderStaticLabels(){
  const h1 = document.querySelector('#qview header h1');
  if(h1){
    h1.innerHTML = t('title') + '<small>' + t('subtitle') + ' ' + (LANG==='en'?SUBTITLE_SUFFIX_EN:SUBTITLE_SUFFIX_KO) + '</small>';
  }
  const detH2 = document.querySelector('#p-det h2');
  if(detH2) detH2.innerHTML = '<span class="dot" style="background:var(--gA)"></span>'+t('detPanel')+'<span style="margin-left:auto;font-weight:400">'+t('detHint')+'</span>';
  const chartH2 = document.querySelector('#p-chart h2');
  if(chartH2) chartH2.innerHTML = '<span class="dot"></span>'+t('chartPanel');
  const dateH2 = document.querySelector('#p-date h2');
  if(dateH2) dateH2.innerHTML = '<span class="dot" style="background:var(--ok)"></span>'+t('datePanel');
  const specInfo = document.querySelector('#p-chart .spec-line-info');
  if(specInfo){
    const spans = specInfo.querySelectorAll('.k');
    if(spans[0]) spans[0].innerHTML = '<span class="sw" style="background:var(--gA)"></span>'+t('off');
    if(spans[1]) spans[1].innerHTML = '<span class="sw" style="background:var(--gB)"></span>'+t('near');
    if(spans[2]) spans[2].innerHTML = '<span class="sw" style="background:var(--blue)"></span>'+t('worstByLot')+' (126050xxxx=5월 · 126060xxxx=6월)';
  }
  const tabDet = document.querySelector('.tabbar button[data-panel="p-det"]');
  if(tabDet){
    const badge = tabDet.querySelector('.tb-badge');
    const badgeHtml = badge ? badge.outerHTML : '<span class="tb-badge" id="tbBadge"></span>';
    tabDet.innerHTML = '<span class="ico">!</span>' + t('tabDet') + badgeHtml;
  }
  const tabChart = document.querySelector('.tabbar button[data-panel="p-chart"]');
  if(tabChart) tabChart.innerHTML = '<span class="ico">▥</span>' + t('tabChart');
  const tabDate = document.querySelector('.tabbar button[data-panel="p-date"]');
  if(tabDate) tabDate.innerHTML = '<span class="ico">▤</span>' + t('tabDate');
}

(async function boot(){
  /* eta 권한(SHIPMENT STATUS 전용)으로 접속한 경우 품질 데이터를 아예 받아오지 않는다.
     로그인 게이트가 사라진 뒤(app.js가 role을 localStorage에 이미 저장한 뒤)에 확인한다. */
  await new Promise(res=>{
    const check = ()=>{ document.getElementById('gate') ? setTimeout(check,150) : res(); };
    check();
  });
  let role = 'kossan';
  try{ role = localStorage.getItem('kossan_role') || 'kossan'; }catch(_){}
  if(role === 'eta') return;

  try {
    DATA = await loadCOA();
    if(!DATA.sheets.length) return coaError('COA 파일이 하나도 없습니다.');
    captureSubtitleSuffix();
    buildQuality();
    injectLangToggle();
    renderStaticLabels(); // 기본 언어가 'en'이므로 부팅 시에도 고정 라벨(h1/h2)을 한 번 갱신
  } catch(e) {
    coaError(String(e.message || e));
  }
})();

/* 언어 전환 시 동적 패널(좌/중/우)만 비우고 다시 그린다. 헤더/토글은 유지 */
function rebuildDynamic(){
  document.getElementById('left').innerHTML = '';
  document.getElementById('ichips').innerHTML = '';
  document.getElementById('right').innerHTML = '';
  buildQuality();
}

function buildQuality(){
  const lots = [...new Set(DATA.sheets.flatMap(s=>s.sectors.map(x=>x.lot)))].sort();
  const lotMonth = l => '20'+l.slice(1,3)+'-'+l.slice(3,5);
  function widthMargin(rows){
    let m = Infinity;
    for(const sz in rows){
      const b=WSPEC[sz]; if(!b) continue;
      const r=rows[sz];
      [r.w_min,r.w_med].forEach(v=>{ if(v!=null) m=Math.min(m, v-b[0], b[1]-v); });
    }
    return m===Infinity?null:m;
  }
  function lotWorst(item){
    return lots.map(l=>{
      let vals=[];
      DATA.sheets.forEach(s=>s.sectors.forEach(sec=>{
        if(sec.lot!==l) return;
        if(item.margin){ const m=widthMargin(sec.rows); if(m!=null) vals.push(m); return; }
        Object.values(sec.rows).forEach(r=>{ const v=r[item.key]; if(v!=null) vals.push(v); });
      }));
      if(!vals.length) return null;
      return item.dir==='hi'?Math.max(...vals):Math.min(...vals);
    });
  }
  const detBySheet = {};
  DATA.sheets.forEach(s=>detBySheet[s.name]=[]);
  DATA.detections.forEach(d=>detBySheet[d.sheet].push(d));

  /* ── 헤더 요약 ── */
  const openDets = DATA.detections.filter(d=>!d.resolved);
  const nS1 = openDets.filter(d=>d.tier==='S1').length;
  const nS2 = openDets.filter(d=>d.tier==='S2').length;
  document.getElementById('chips').innerHTML =
    '<span class="chip">'+t('lot')+'<b>'+lots.length+'</b></span>'+
    '<span class="chip">'+t('sector')+'<b>'+DATA.sheets.reduce((a,s)=>a+s.sectors.length,0)+'</b></span>'+
    '<span class="chip alert">'+t('s1off')+'<b>'+nS1+'</b></span>'+
    '<span class="chip">'+t('s2near')+'<b>'+nS2+'</b></span>';

  /* ── 좌측 ── */
  const left = document.getElementById('left');
  DATA.sheets.forEach(s=>{
    const dets = detBySheet[s.name];
    const openCount = dets.filter(d=>!d.resolved && d.grade==='A').length;
    const slots = [...new Set(s.sectors.map(x=>x.lot))].join(' · ');
    const btn = document.createElement('button');
    btn.className='sheet-item'; btn.setAttribute('aria-expanded','false');
    btn.innerHTML = '<span class="nm">'+s.name+'<span class="lots">'+t('lot')+' '+slots+'</span></span>'+
                    '<span class="badge '+(openCount?'hit':'zero')+'">'+openCount+'</span>';
    const dl = document.createElement('div');
    dl.className='det-list'; dl.style.display='none';
    dl.innerHTML = dets.length ? dets.map(d=>
      '<div class="det-row'+(d.resolved?' resolved':'')+'" style="border-left-color:var(--g'+d.grade+')">'+
        '<div class="top"><span class="grade '+d.grade+'">'+d.grade+'</span>'+
        (d.resolved ? '<span class="resolved-tag" data-toggle-reason>'+t('resolvedTag')+'</span>' : '')+
        '<span class="item">'+d.size+' / '+d.item+'</span><span class="val">'+d.gv+'</span></div>'+
        '<div class="note">'+noteOf(d)+'</div>'+
        (d.resolved ? '<div class="resolved-detail" style="display:none">'+
          t('resolvedReasonPrefix')+': '+resolvedReasonText(d)+
          (d.resolved_date ? ' · '+t('resolvedDatePrefix')+' '+d.resolved_date : '')+
          '</div>' : '')+
        '<div class="lot">'+t('lot')+' '+d.lot+' · p.'+d.pages+' · '+t('cell')+' '+d.cell+'</div></div>').join('')
      : '<div class="empty-note">'+t('noDetect')+'</div>';
    dl.querySelectorAll('[data-toggle-reason]').forEach(tag=>{
      tag.addEventListener('click', e=>{
        e.stopPropagation();
        const row = tag.closest('.det-row');
        const detail = row.querySelector('.resolved-detail');
        if(detail) detail.style.display = detail.style.display==='none' ? 'block' : 'none';
      });
    });
    btn.addEventListener('click',()=>{
      const open = dl.style.display!=='none';
      dl.style.display = open?'none':'block';
      btn.setAttribute('aria-expanded', String(!open));
    });
    left.appendChild(btn); left.appendChild(dl);
  });

  /* ── 중앙 차트 ── */
  /* 차트 섹션 전체를 try/catch로 감싼다 — 여기서 예외가 나도
     아래 우측 패널(제조일자→백데이터)과 모달 이벤트 바인딩은 반드시 실행되게 하기 위함.
     이전에 이 경계가 없어서 Chart.js 쪽 에러 하나가 우측 패널 전체를 날린 적이 있었다. */
  try {
  const ichips = document.getElementById('ichips');
  let curItem = ITEMS.find(i=>i.id==='fin');
  ITEMS.forEach(it=>{
    const b=document.createElement('button');
    b.className='ichip'+(it===curItem?' on':''); b.textContent=itemName(it);
    b.addEventListener('click',()=>{
      curItem=it;
      document.querySelectorAll('.ichip').forEach(x=>x.classList.remove('on'));
      b.classList.add('on'); draw();
    });
    ichips.appendChild(b);
  });

  /* 차트 색은 #qview의 CSS 변수에서 읽어 테마를 따라가게 한다 */
  function qvar(name, fb){
    const el = document.getElementById('qview');
    if(!el) return fb;
    const v = getComputedStyle(el).getPropertyValue('--'+name).trim();
    return v || fb;
  }
  Chart.defaults.color = qvar('muted','#7E8AA0');
  Chart.defaults.font.family="'IBM Plex Mono',monospace";
  Chart.defaults.font.size=10.5;
  let chart=null;
  function isOff(it,v){ return it.dir==='hi' ? (it.s1incl? v>it.s1 : v>=it.s1) : v<it.s1; }
  function isNear(it,v){ if(it.s2==null) return false; return it.dir==='hi' ? (v>=it.s2 && !isOff(it,v)) : (v<it.s2 && !isOff(it,v)); }
  window.repaintCharts = function(){
    try{ Chart.defaults.color = qvar('muted','#7E8AA0'); draw(); }catch(_){}
  };
  function draw(){
    const worst = lotWorst(curItem);
    if(chart) chart.destroy();
    const barColor = worst.map(v=> v==null?qvar('line2','#2A3446'): isOff(curItem,v)?qvar('gA','#FF6D5E'): isNear(curItem,v)?qvar('gB','#F5B84F'):qvar('blue','#4DA3FF'));
    const ds=[{type:'bar',label:'Lot 최악값',data:worst,backgroundColor:barColor,borderRadius:5,maxBarThickness:52},
      {type:'line',label:'S1 한계',data:lots.map(()=>curItem.s1),borderColor:qvar('gA','#FF6D5E'),borderWidth:1.6,borderDash:[6,4],pointRadius:0}];
    if(curItem.s2!=null) ds.push({type:'line',label:'S2 경계',data:lots.map(()=>curItem.s2),borderColor:qvar('gB','#F5B84F'),borderWidth:1.2,borderDash:[3,4],pointRadius:0});
    chart=new Chart(document.getElementById('chart'),{
      data:{labels:lots,datasets:ds},
      options:{responsive:true,maintainAspectRatio:false,
        plugins:{legend:{display:false},tooltip:{backgroundColor:qvar('panel','#12161E'),borderColor:qvar('line2','#2A3446'),borderWidth:1,
          callbacks:{title:c=>t('lot')+' '+lots[c[0].dataIndex]+' ('+lotMonth(lots[c[0].dataIndex])+(LANG==='en'?' mfg':' 제조')+')'}}},
        scales:{x:{grid:{color:qvar('line','#1A2130')}},
                y:{grid:{color:qvar('line','#1A2130')},title:{display:true,text:itemName(curItem)+(curItem.unit?' ('+curItem.unit+')':'')+(LANG==='en'?' — Spec: ':' — 스펙: ')+itemSpecTxt(curItem),color:'#7E8AA0',font:{size:11}}}}
      }});
    const last = worst[worst.length-1];
    let marginTxt='—', cls='ok';
    if(last!=null){
      const mm = curItem.dir==='hi' ? (curItem.s1incl? curItem.s1-last : (curItem.s1-1)-last) : last-curItem.s1;
      marginTxt=(mm>=0?'+':'')+(Math.round(mm*100)/100);
      cls = isOff(curItem,last)?'bad': isNear(curItem,last)?'warn':'ok';
    }
    const hist = worst.filter(v=>v!=null);
    const histWorst = hist.length? (curItem.dir==='hi'?Math.max(...hist):Math.min(...hist)) : '—';
    document.getElementById('mstrip').innerHTML =
      '<div class="mcard"><div class="l">'+t('latestLot')+' '+lots[lots.length-1]+'</div><div class="v '+cls+'">'+(last==null?'—':last)+'</div></div>'+
      '<div class="mcard"><div class="l">'+t('marginToLimit')+'</div><div class="v '+cls+'">'+marginTxt+'</div></div>'+
      '<div class="mcard"><div class="l">'+t('allTimeWorst')+'</div><div class="v">'+histWorst+'</div></div>'+
      '<div class="mcard"><div class="l">'+t('status')+'</div><div class="v '+cls+'">'+(cls==='bad'?t('statusOff'):cls==='warn'?t('statusNear'):t('statusOk'))+'</div></div>';
  }
  draw();
  } catch(chartErr) {
    console.error('[quality] chart section failed, continuing with other panels:', chartErr);
  }

  /* ── 우측: 제조일자 ── */
  const byDate={};
  DATA.sheets.forEach(s=>s.sectors.forEach(sec=>{
    const d=sec.mfg||t('unmapped');
    byDate[d]=byDate[d]||{};
    byDate[d][s.name]=byDate[d][s.name]||new Set();
    byDate[d][s.name].add(sec.lot);
  }));
  const right=document.getElementById('right');
  Object.keys(byDate).sort().reverse().forEach(d=>{
    const mh=document.createElement('div'); mh.className='month-h';
    mh.textContent=t('mfgMonth')+' '+d.slice(0,7); right.appendChild(mh);
    const db=document.createElement('button'); db.className='date-item'; db.setAttribute('aria-expanded','false');
    db.innerHTML='<div class="d">'+d+'</div><div class="c">'+t('sheetCount')+' '+Object.keys(byDate[d]).length+t('clickForFiles')+'</div>';
    const fl=document.createElement('div'); fl.className='file-list'; fl.style.display='none';
    Object.entries(byDate[d]).forEach(([nm,ls])=>{
      const fb=document.createElement('button'); fb.className='file-btn';
      fb.innerHTML=nm+'<span class="lotln">'+t('lot')+' '+[...ls].join(' · ')+' '+t('openBackdata')+'</span>';
      fb.addEventListener('click',()=>openBackdata(nm));
      fl.appendChild(fb);
    });
    db.addEventListener('click',()=>{
      const open=fl.style.display!=='none';
      fl.style.display=open?'none':'block';
      db.setAttribute('aria-expanded',String(!open));
    });
    right.appendChild(db); right.appendChild(fl);
  });

  /* ── 백데이터 모달 ── */
  const overlay=document.getElementById('overlay');
  document.getElementById('mClose').addEventListener('click',()=>{
    overlay.classList.remove('show');
    document.body.classList.remove('modal-open');
  });
  overlay.addEventListener('click',e=>{if(e.target===overlay){
    overlay.classList.remove('show');
    document.body.classList.remove('modal-open');
  }});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){
    overlay.classList.remove('show');
    document.body.classList.remove('modal-open');
  }});

  const GROUPS=[
   [{ko:'수량',en:'Quantity'},[['cartons','Cartons'],['qty_max','Qty Max'],['qty_min','Qty Min']]],
   [{ko:'외관 검사',en:'Visual Inspection'},[['leak','Leaking'],['maj','V.Major'],['minr','V.Minor']]],
   [{ko:'Before Aging',en:'Before Aging'},[['ba_t_max','Tensile Max'],['ba_t_min','Tensile Min'],['ba_t_avg','Tensile AVRG'],['ba_e_max','Elong Max'],['ba_e_min','Elong Min'],['ba_e_avg','Elong AVRG']]],
   [{ko:'After Aging',en:'After Aging'},[['aa_t_max','Tensile Max'],['aa_t_min','Tensile Min'],['aa_t_avg','Tensile AVRG'],['aa_e_max','Elong Max'],['aa_e_min','Elong Min'],['aa_e_avg','Elong AVRG']]],
   [{ko:'Powder · 치수',en:'Powder · Dimensions'},[['powder','Powder'],['len_min','Length Min'],['len_med','Length Med'],['w_min','Width Min'],['w_med','Width Med']]],
   [{ko:'Thickness',en:'Thickness'},[['cuff_min','Cuff Min'],['cuff_med','Cuff Med'],['palm_min','Palm Min'],['palm_med','Palm Med'],['fin_min','Finger Min'],['fin_med','Finger Med']]]
  ];
  function cellClass(k,v,sz){
    if(v==null) return '';
    if(k==='leak') return v>=15?'viol':v>=12?'near':'';
    if(k==='maj'||k==='minr') return v>=22?'viol':v>=18?'near':'';
    if(k==='ba_t_min') return v<18?'viol':v<20?'near':'';
    if(k==='ba_e_min') return v<500?'viol':v<515?'near':'';
    if(k==='aa_t_min') return v<14?'viol':v<18?'near':'';
    if(k==='aa_e_min') return v<400?'viol':v<440?'near':'';
    if(k==='powder') return v>1.5?'viol':v>=1.2?'near':'';
    if(k==='len_min') return v<240?'viol':v<243?'near':'';
    if(k==='cuff_min') return Math.round((v-0.05)*1e6)<0?'viol':'';
    if(k==='palm_min') return Math.round((v-0.05)*1e6)<0?'viol':Math.round((v-0.06)*1e6)<0?'near':'';
    if(k==='fin_min') return Math.round((v-0.08)*1e6)<0?'viol':'';
    if(k==='w_min'||k==='w_med'){const b=WSPEC[sz];if(!b)return '';return (v<b[0]||v>b[1])?'viol':(v<=b[0]+1||v>=b[1]-1)?'near':'';}
    return '';
  }
  function openBackdata(name){
    const sheet=DATA.sheets.find(s=>s.name===name);
    document.getElementById('mTitle').textContent=name;
    document.getElementById('mSub').textContent=t('sectors_')+' '+sheet.sectors.length+' · '+t('cellHighlight');
    const tabs=document.getElementById('mTabs'); tabs.innerHTML='';
    sheet.sectors.forEach((sec,i)=>{
      const b=document.createElement('button'); b.className='stab'+(i===0?' on':'');
      b.textContent='#'+(i+1)+' · Lot '+sec.lot+' · p.'+sec.pages;
      b.addEventListener('click',()=>{
        tabs.querySelectorAll('.stab').forEach(x=>x.classList.remove('on'));
        b.classList.add('on'); renderSector(sheet,i);
      });
      tabs.appendChild(b);
    });
    renderSector(sheet,0);
    overlay.classList.add('show');
    document.body.classList.add('modal-open');
    document.getElementById('mBody').scrollTop = 0;
  }
  function renderSector(sheet,idx){
    const sec=sheet.sectors[idx];
    const sizes=Object.keys(sec.rows);
    let h='<div class="meta-row"><span>'+t('lot')+' <b>'+sec.lot+'</b></span><span>'+t('mfgDate')+' <b>'+(sec.mfg||'—')+'</b></span><span>'+t('pages')+' <b>'+sec.pages+'</b></span></div>';
    h+='<table class="bd"><tr><th>'+t('itemHeader')+'</th>'+sizes.map(s=>'<th>'+s+'</th>').join('')+'</tr>';
    GROUPS.forEach(g=>{
      h+='<tr><td class="grp" colspan="'+(sizes.length+1)+'">'+g[0][LANG]+'</td></tr>';
      g[1].forEach(col=>{
        h+='<tr><td>'+col[1]+'</td>'+sizes.map(sz=>{
          const v=sec.rows[sz][col[0]];
          return '<td class="'+cellClass(col[0],v,sz)+'">'+(v==null?'—':v)+'</td>';
        }).join('')+'</tr>';
      });
    });
    h+='</table><div class="legend-bd">'+t('legendPrefix')+' <i class="r">'+t('legendOff')+'</i> · <i class="y">'+t('legendNear')+'</i> — '+t('legendNote')+'</div>';
    document.getElementById('mBody').innerHTML=h;
  }

  /* ── 모바일 탭 전환 ── */
  const mq = window.matchMedia('(max-width:900px)');
  const openTotal = DATA.detections.filter(d=>!d.resolved && d.grade==='A').length;
  document.getElementById('tbBadge').textContent = openTotal || '';
  if(!openTotal) document.getElementById('tbBadge').style.display='none';
  document.querySelectorAll('.tabbar button').forEach(b=>{
    b.addEventListener('click',()=>{
      document.querySelectorAll('.tabbar button').forEach(x=>x.classList.remove('on'));
      b.classList.add('on');
      document.querySelectorAll('.panel').forEach(p=>p.classList.remove('active'));
      document.getElementById(b.dataset.panel).classList.add('active');
      if(b.dataset.panel==='p-chart') requestAnimationFrame(()=>draw()); // 숨김 상태에서 초기화된 캔버스 재생성
      window.scrollTo({top:0});
    });
  });
  mq.addEventListener('change',()=>requestAnimationFrame(()=>draw()));
  window.addEventListener('orientationchange',()=>setTimeout(()=>draw(),250));

}
