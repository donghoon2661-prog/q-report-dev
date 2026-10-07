/* calendar.js — CALENDAR 탭 전용 로직
   - /data (assembleShipments) 결과를 READ ONLY로 소비
   - KV / shipments / Worker 구조 변경 없음
   - holidays.js 먼저 로드 필요 (getHolidays 함수 사용)
*/

/* ── 부킹별 고유 색상 팔레트 30개
   계열이 최대한 분산되도록 배치 (Red→Olive→Sky→Magenta→Forest 순)
   같은 부킹의 ETD/ETA에 동일 색상 적용 ── */
const CAL_PALETTE = [
  { bg:'#FFEBEE', text:'#6B0000', dot:'#C62828' }, /* 01 Red          */
  { bg:'#F9FBE7', text:'#4E4C0A', dot:'#9E9D24' }, /* 02 Olive        */
  { bg:'#E3F2FD', text:'#014670', dot:'#0288D1' }, /* 03 Sky          */
  { bg:'#FCE4EC', text:'#5E0030', dot:'#AD1457' }, /* 04 Magenta      */
  { bg:'#E8F5E9', text:'#003008', dot:'#00600F' }, /* 05 Forest       */
  { bg:'#FBE9E7', text:'#7C1E00', dot:'#D84315' }, /* 06 Deep Orange  */
  { bg:'#F1F8E9', text:'#2D4A16', dot:'#558B2F' }, /* 07 Lime         */
  { bg:'#E3F2FD', text:'#0D3B6E', dot:'#1565C0' }, /* 08 Blue         */
  { bg:'#FCE4EC', text:'#6B0033', dot:'#C2185B' }, /* 09 Pink         */
  { bg:'#E0F2F1', text:'#003D38', dot:'#00796B' }, /* 10 Jade         */
  { bg:'#FFF3E0', text:'#7C2D00', dot:'#E65100' }, /* 11 Orange       */
  { bg:'#E8F5E9', text:'#1B3E1D', dot:'#2E7D32' }, /* 12 Green        */
  { bg:'#E8EAF6', text:'#111A56', dot:'#283593' }, /* 13 Navy         */
  { bg:'#FFEBEE', text:'#7A0000', dot:'#E53935' }, /* 14 Coral Red    */
  { bg:'#E8EAF6', text:'#141C56', dot:'#303F9F' }, /* 15 Royal Blue   */
  { bg:'#FFF8E1', text:'#7C3F00', dot:'#FF8F00' }, /* 16 Amber        */
  { bg:'#E0F7FA', text:'#004B55', dot:'#00838F' }, /* 17 Cyan         */
  { bg:'#EDE7F6', text:'#210F5C', dot:'#4527A0' }, /* 18 Indigo       */
  { bg:'#FFF3E0', text:'#5D1400', dot:'#BF360C' }, /* 19 Rust         */
  { bg:'#EDE7F6', text:'#3D0A56', dot:'#7B1FA2' }, /* 20 Violet       */
  { bg:'#FFFDE7', text:'#7C5000', dot:'#F9A825' }, /* 21 Yellow       */
  { bg:'#E0F2F1', text:'#003D35', dot:'#00695C' }, /* 22 Teal         */
  { bg:'#F3E5F5', text:'#3D0A5C', dot:'#6A1B9A' }, /* 23 Purple       */
  { bg:'#FBE9E7', text:'#7C1D00', dot:'#E64A19' }, /* 24 Vermillion   */
  { bg:'#E8F5E9', text:'#1B4D1D', dot:'#43A047' }, /* 25 Sage         */
  { bg:'#E3F2FD', text:'#013E6A', dot:'#0277BD' }, /* 26 Steel Blue   */
  { bg:'#FCE4EC', text:'#730032', dot:'#D81B60' }, /* 27 Rose         */
  { bg:'#FFF9C4', text:'#565A0A', dot:'#AFB42B' }, /* 28 Yellow Green */
  { bg:'#F3E5F5', text:'#4A0059', dot:'#8E24AA' }, /* 29 Orchid       */
  { bg:'#FFF3E0', text:'#7C2D00', dot:'#FF6D00' }, /* 30 Bright Orange*/
];

/* ── 상태 ── */
let calShipments = [];
let calItems     = [];
let calYear      = 0;
let calMonth     = 0;
let calSelected  = null;
let colorMap     = {};

/* ── calendarEta: min(eta, destEta), 없으면 있는 쪽, 둘 다 없으면 null ── */
function calendarEta(s) {
  const a = typeof s.eta     === 'string' && /^\d{4}-\d{2}-\d{2}/.test(s.eta)
    ? s.eta.slice(0, 10) : null;
  const b = typeof s.destEta === 'string' && /^\d{4}-\d{2}-\d{2}/.test(s.destEta)
    ? s.destEta.slice(0, 10) : null;
  if (a && b) return a < b ? a : b;
  return a || b || null;
}

/* ── 부킹 목록 순서대로 팔레트 배정 ── */
function buildColorMap(items) {
  const map = {};
  let idx = 0;
  for (const it of items) {
    if (!(it.booking in map)) {
      map[it.booking] = idx % CAL_PALETTE.length;
      idx++;
    }
  }
  return map;
}

/* ── shipments → CALENDAR 전용 배열 ── */
function buildCalendarItems(shipments) {
  const items = [];
  for (const s of shipments) {
    if (s.etaActual) continue;
    const cEta = calendarEta(s);
    const etd  = s.polDep ? s.polDep.slice(0, 10) : null;
    if (!cEta && !etd) continue;
    const firstSeen = typeof s.firstSeenEta === 'string' && /^\d{4}-\d{2}-\d{2}/.test(s.firstSeenEta)
      ? s.firstSeenEta.slice(0, 10) : null;
    const firstPolDep = typeof s.firstSeenPolDep === 'string' && /^\d{4}-\d{2}-\d{2}/.test(s.firstSeenPolDep)
      ? s.firstSeenPolDep.slice(0, 10) : null;
    items.push({
      booking:         s.booking,
      vessel:          s.vessel     || '',
      voyage:          s.voyage     || null,
      polDep:          etd,
      firstSeenPolDep: (firstPolDep && firstPolDep !== etd) ? firstPolDep : null,
      calendarEta:     cEta,
      firstSeenEta:    (firstSeen && firstSeen !== cEta) ? firstSeen : null,
      eta:             s.eta        ? s.eta.slice(0, 10)     : null,
      destEta:         s.destEta    ? s.destEta.slice(0, 10) : null,
      alert:           s.alert      || 'ok',
      delayDays:       s.delayDays  ?? null,
      etaChangeCount:    s.etaChangeCount    || 0,
      polDepChangeCount: s.polDepChangeCount || 0
    });
  }
  return items;
}

/* ── [16차] 호주 선적(/ais 의 plans) → 달력 항목.
   buildCalendarItems 가 만드는 항목과 같은 모양 + country:'AU', po 만 추가.
   - pod 에 'SYDNEY' 가 들어 있는(대소문자 무시) 선적만, 그 외는 무시
   - entry 가 객체가 아니거나 비어 있으면 건너뜀
   - booking: plan.booking, 없으면 plan.mbl, 둘 다 없으면 건너뜀
   - polDep: traqo.atdUtc(자기 것·inherited 의 것) 가 유효한 ISO 면 그 시각을
     포트클랑 현지(UTC+8) 로 바꾼 YYYY-MM-DD, 아니면 plan.etd 앞 10자
     (년-월-일 10자 형식일 때만), 또 없으면 null
   - calendarEta/eta/destEta: plan.eta 앞 10자(형식 맞을 때만, 없으면 null)
   - traqo.ataUtc 가 유효한 ISO 면(자기 것·inherited 모두) 도착 완료 → 제외
   - polDep·calendarEta 둘 다 null 이면 제외
   - firstSeen·변경 카운트는 null/0, alert:'ok', delayDays:null
   - booking 오름차순 안정 정렬(예측 가능한 색 배정)
   순수 함수(DOM 접근 없음) — Node 테스트 대상 */
function auCalendarItems(plans) {
  const items = [];
  if (typeof plans !== 'object' || plans === null) return items;
  const entries = Object.entries(plans);
  for (const [, p] of entries) {
    if (!p || typeof p !== 'object') continue;
    if (Object.keys(p).length === 0) continue;
    const pod = typeof p.pod === 'string' ? p.pod.toUpperCase() : '';
    if (pod.indexOf('SYDNEY') === -1) continue;
    const tq = (p.traqo && typeof p.traqo === 'object') ? p.traqo : {};
    if (typeof tq.ataUtc === 'string' && isFinite(Date.parse(tq.ataUtc))) continue;
    const booking = (p.booking != null && p.booking !== '') ? p.booking
                  : (p.mbl     != null && p.mbl     !== '') ? p.mbl
                  : null;
    if (booking == null || booking === '') continue;
    /* atdUtc → 포트클랑 현지(UTC+8) 날짜. Date.parse 결과에 8시간을 더해
       UTC getter 로 읽으면 실행 환경의 시간대와 무관하게 고정된다. */
    const atd = (typeof tq.atdUtc === 'string' && isFinite(Date.parse(tq.atdUtc)))
      ? (() => {
          const d = new Date(Date.parse(tq.atdUtc) + 8 * 60 * 60 * 1000);
          return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') +
                 '-' + String(d.getUTCDate()).padStart(2, '0');
        })()
      : null;
    const polDep = atd ||
      (typeof p.etd === 'string' && /^\d{4}-\d{2}-\d{2}/.test(p.etd) ? p.etd.slice(0, 10) : null);
    const calEta = (typeof p.eta === 'string' && /^\d{4}-\d{2}-\d{2}/.test(p.eta))
      ? p.eta.slice(0, 10) : null;
    if (!polDep && !calEta) continue;
    items.push({
      booking:         booking,
      vessel:          (typeof p.vessel === 'string') ? p.vessel : '',
      voyage:          p.voyage || null,
      polDep:          polDep,
      firstSeenPolDep: null,
      calendarEta:     calEta,
      firstSeenEta:    null,
      eta:             calEta,
      destEta:         calEta,
      alert:           'ok',
      delayDays:       null,
      etaChangeCount:    0,
      polDepChangeCount: 0,
      country:         'AU',
      po:              Array.isArray(p.po) ? p.po.slice() : []
    });
  }
  return items.sort(function (a, b) {
    return a.booking < b.booking ? -1 : a.booking > b.booking ? 1 : 0;
  });
}

/* ── 날짜별 이벤트 맵
   { "YYYY-MM-DD": [ { item, type:"ETD"|"ETA" }, ... ] } ── */
function buildDateMap(items) {
  const map = {};
  const add = (date, item, type) => {
    if (!date) return;
    if (!map[date]) map[date] = [];
    map[date].push({ item, type });
  };
  for (const it of items) {
    add(it.polDep,       it, 'ETD');
    add(it.firstSeenPolDep, it, 'FIRST_ETD');
    add(it.calendarEta,  it, 'ETA');
    add(it.firstSeenEta, it, 'FIRST_ETA');
  }
  return map;
}

/* ── 월 이동 ── */
function calPrev() {
  calMonth--;
  if (calMonth < 0) { calMonth = 11; calYear--; }
  renderCalendar();
}
function calNext() {
  calMonth++;
  if (calMonth > 11) { calMonth = 0; calYear++; }
  renderCalendar();
}
function calGoToday() {
  const now = new Date();
  calYear   = now.getFullYear();
  calMonth  = now.getMonth();
  calSelected = null;
  renderCalendar();
}

/* ── 날짜 클릭 ── */
function calSelectDate(dateStr) {
  calSelected = calSelected === dateStr ? null : dateStr;
  renderCalendar();
}

/* ── 날짜 포맷 헬퍼 ── */
function fmtCalDate(dateStr) {
  if (!dateStr) return '-';
  const [, m, d] = dateStr.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun',
                  'Jul','Aug','Sep','Oct','Nov','Dec'];
  return months[parseInt(m, 10) - 1] + ' ' + parseInt(d, 10);
}

function fmtCalHeader(year, month) {
  const months = ['January','February','March','April','May','June',
                  'July','August','September','October','November','December'];
  return months[month] + ' ' + year;
}

/* ── [16차] 칩 색: 미국은 부킹별 팔레트, 호주는 흰색 칩 + 회청 띠, 미국은 팔레트 색 + 주황 띠 ── */
const CAL_AU_PAL = { bg:'#F4F8FA', text:'#14242E', dot:'#5A7183', stripe:'#8AA4B5' };
const CAL_US_STRIPE = '#FF6B35';   /* 미국 칩 왼쪽 띠(지도의 미국 주황과 맞춤) */
function calPal(item) {
  if (item && item.country === 'AU') return CAL_AU_PAL;
  return CAL_PALETTE[colorMap[item.booking] ?? 0];
}

/* ── [16차] 외부 데이터(선박명·항차·부킹·PO) HTML 이스케이프.
   호주 항목에만 쓴다 — 기존 미국 항목 출력은 바이트 단위로 불변 유지. ── */
function escCal(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ── 달력 셀 HTML ── */
function cellHTML(dateStr, dayNum, isOtherMonth, dateMap) {
  const holidays = (typeof getHolidays === 'function') ? getHolidays(dateStr) : [];
  const events   = dateMap[dateStr] || [];
  const isSel    = dateStr === calSelected;

  const flagsHTML = holidays.length
    ? '<span class="cal-flags">' + holidays.map(h => h.flag).join('') + '</span>'
    : '';

  const chipsHTML = events.map(ev => {
    const au    = ev.item.country === 'AU';
    const pal     = calPal(ev.item);
    const vname   = (ev.item.vessel || ev.item.booking).slice(0, 9);
    const isFirst = ev.type === 'FIRST_ETA' || ev.type === 'FIRST_ETD';
    const firstLabel = ev.type === 'FIRST_ETD' ? 'ETD' : 'ETA';
    if (isFirst) {
      return `<div class="cal-chip cal-chip-first" style="background:transparent;color:${pal.dot};border:1px dashed ${pal.dot};opacity:0.55">` +
             `<span class="cal-chip-dot" style="background:${pal.dot}"></span>` +
             `<span class="cal-chip-name" style="text-decoration:line-through">${firstLabel} ${vname}</span>` +
             `</div>` +
             `<div class="cal-chip-changed" style="color:${pal.dot};opacity:0.55">1ST CHANGE</div>`;
    }
    const ord = n => n===1?'1st':n===2?'2nd':n===3?'3rd':n+'th';
    const etaChg  = ev.type === 'ETA' && ev.item.etaChangeCount > 0
      ? ` <span class="cal-chip-chg">(${ord(ev.item.etaChangeCount)} change)</span>` : '';
    const etdChg  = ev.type === 'ETD' && ev.item.polDepChangeCount > 0
      ? ` <span class="cal-chip-chg">(${ord(ev.item.polDepChangeCount)} change)</span>` : '';
    return `<div class="cal-chip" style="background:${pal.bg};color:${pal.text};border-left:6px solid ${au ? CAL_AU_PAL.stripe : CAL_US_STRIPE}">` +
           `<span class="cal-chip-dot" style="background:${pal.dot}"></span>` +
           `<span class="cal-chip-type">${ev.type}</span>` +
           (au ? `<span class="cal-chip-cty" style="font-size:9px;opacity:.7;margin-right:3px">AU</span>` : '') +
           `<span class="cal-chip-name">${au ? escCal(vname) : vname}</span>${etaChg}${etdChg}</div>`;
  }).join('');

  const isSun = new Date(dateStr + 'T00:00:00').getDay() === 0;
  const cls = ['cal-cell',
    isOtherMonth ? 'cal-other' : '',
    isSel        ? 'cal-sel'   : '',
    isSun        ? 'cal-sun'   : ''
  ].filter(Boolean).join(' ');

  return `<div class="${cls}" onclick="calSelectDate('${dateStr}')">` +
         `<div class="cal-date-row"><span class="cal-dn${isSun ? ' cal-dn-sun' : ''}">${dayNum}</span>${flagsHTML}</div>` +
         chipsHTML + `</div>`;
}

/* ── 상세 패널 HTML ── */
function detailPanelHTML(dateStr, dateMap) {
  if (!dateStr) return '';
  const events   = dateMap[dateStr] || [];
  const holidays = (typeof getHolidays === 'function') ? getHolidays(dateStr) : [];
  if (!events.length && !holidays.length) return '';

  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const dow  = days[new Date(dateStr + 'T00:00:00').getDay()];

  const holHTML = holidays.length
    ? '<span class="cal-detail-hol">' +
      holidays.map(h => h.flag + '\u00a0' + h.name).join('\u2003·\u2003') +
      '</span>'
    : '';

  const rowsHTML = events.map(ev => {
    const it  = ev.item;
    const au  = it.country === 'AU';   /* [16차] 호주 항목 */
    const pal = calPal(it);
    const delayHTML = typeof it.delayDays === 'number' && it.delayDays !== 0
      ? `<span class="cal-delay${it.alert === 'alert' ? ' cal-delay-alert' : ''}">` +
        (it.delayDays > 0 ? '+' : '') + it.delayDays + 'd</span>'
      : '';
    const ordinal = n => {
      if (n === 1) return '1st';
      if (n === 2) return '2nd';
      if (n === 3) return '3rd';
      return n + 'th';
    };
    const etaChangeBadge = it.etaChangeCount > 0
      ? `<span class="cal-change-badge">${ordinal(it.etaChangeCount)} ETA change</span>` : '';
    const etdChangeBadge = it.polDepChangeCount > 0
      ? `<span class="cal-change-badge">${ordinal(it.polDepChangeCount)} ETD change</span>` : '';
    return `<div class="cal-detail-row">` +
           `<span class="cal-detail-dot" style="background:${pal.dot}"></span>` +
           `<div class="cal-detail-body">` +
           `<div class="cal-detail-vessel">${au ? escCal(it.vessel) : (it.vessel || '')}` +
           (it.voyage ? ` <span class="cal-detail-voy">${au ? escCal(it.voyage) : it.voyage}</span>` : '') +
           /* [16차] 호주 항목이고 PO 가 있으면 항차 뒤에 (AU-…, AU-…) 표시 */
           (au && Array.isArray(it.po) && it.po.length
             ? ` <span class="cal-detail-voy">(${escCal(it.po.join(', '))})</span>` : '') +
           delayHTML + etaChangeBadge + etdChangeBadge + `</div>` +
           `<div class="cal-detail-bkg">${au ? escCal(it.booking) : it.booking}</div>` +
           `<div class="cal-detail-dates">` +
           (it.firstSeenPolDep
             ? `<span><span class="cal-dt-lbl">ORIG ETD</span><s>${fmtCalDate(it.firstSeenPolDep)}</s></span>`
             : '') +
           `<span><span class="cal-dt-lbl">ETD PKG</span>${fmtCalDate(it.polDep)}</span>` +
           (it.firstSeenEta
             ? `<span><span class="cal-dt-lbl">ORIG ETA</span><s>${fmtCalDate(it.firstSeenEta)}</s></span>`
             : '') +
           `<span><span class="cal-dt-lbl">${au ? 'ETA SYD' : 'ETA LA'}</span>${fmtCalDate(it.calendarEta)}</span>` +
           `</div></div></div>`;
  }).join('');

  return `<div id="cal-detail">` +
         `<div class="cal-detail-title">${fmtCalDate(dateStr)} (${dow})${holHTML ? '&ensp;' + holHTML : ''}</div>` +
         (rowsHTML || '<div class="cal-detail-empty">No shipments on this date.</div>') +
         `</div>`;
}

/* ── 달력 전체 렌더링 ── */
function renderCalendar() {
  const wrap = document.getElementById('calendar');
  if (!wrap) return;

  const dateMap  = buildDateMap(calItems);
  const firstDay = new Date(calYear, calMonth, 1);
  const lastDay  = new Date(calYear, calMonth + 1, 0);

  /* SUN 시작 요일 보정 — getDay() 그대로 (0=Sun, 1=Mon ...) */
  let startDow = firstDay.getDay();

  /* 헤더 */
  let html =
    `<div class="cal-top">` +
    `<button class="cal-nav-btn" onclick="calPrev()">&#9664;</button>` +
    `<span class="cal-month-label">${fmtCalHeader(calYear, calMonth)}</span>` +
    `<button class="cal-nav-btn" onclick="calNext()">&#9654;</button>` +
    `<button class="cal-today-btn" onclick="calGoToday()">TODAY</button>` +
    `<button class="cal-today-btn" onclick="window.print()">PRINT</button>` +
    `</div>`;

  /* 요일 헤더 + 셀 */
  html += `<div class="cal-grid">`;
  for (const d of ['SUN','MON','TUE','WED','THU','FRI','SAT'])
    html += `<div class="cal-dow">${d}</div>`;

  /* 이전 달 빈 셀 */
  const prevLast = new Date(calYear, calMonth, 0);
  for (let i = startDow - 1; i >= 0; i--) {
    const d  = prevLast.getDate() - i;
    const m  = calMonth === 0 ? 11 : calMonth - 1;
    const y  = calMonth === 0 ? calYear - 1 : calYear;
    const ds = `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    html += cellHTML(ds, d, true, dateMap);
  }

  /* 이번 달 */
  for (let d = 1; d <= lastDay.getDate(); d++) {
    const ds = `${calYear}-${String(calMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    html += cellHTML(ds, d, false, dateMap);
  }

  /* 다음 달 빈 셀 */
  const total     = startDow + lastDay.getDate();
  const remainder = total % 7 === 0 ? 0 : 7 - (total % 7);
  for (let d = 1; d <= remainder; d++) {
    const m  = calMonth === 11 ? 0 : calMonth + 1;
    const y  = calMonth === 11 ? calYear + 1 : calYear;
    const ds = `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    html += cellHTML(ds, d, true, dateMap);
  }

  html += `</div>`;
  html += detailPanelHTML(calSelected, dateMap);
  wrap.innerHTML = html;
}

/* ── 외부에서 호출: shipments 데이터 주입 ── */
function initCalendar(shipments) {
  calShipments = shipments || [];
  /* [16차] 호주 선적 항목을 미국 항목 뒤에 이어 붙인다. 예외가 나도 호주만
     빼고 미국 달력은 계속 그려져야 하므로 try/catch 로 감싼다. */
  let au = [];
  try {
    au = auCalendarItems(
      typeof CountryUI !== 'undefined' && CountryUI &&
      typeof CountryUI.getPlans === 'function' ? CountryUI.getPlans() : null);
  } catch (e) {
    au = [];
  }
  calItems     = buildCalendarItems(calShipments).concat(au);
  colorMap     = buildColorMap(calItems);
  const now    = new Date();
  calYear      = now.getFullYear();
  calMonth     = now.getMonth();
  calSelected  = null;
  renderCalendar();
}

/* ── app.js setView() 연결용 ── */
function renderCalendarTab() {
  if (typeof CUR !== 'undefined' && CUR && CUR.shipments) {
    initCalendar(CUR.shipments);
  } else {
    /* [16차] CUR 이 없어도 호주 항목이 있으면 달력을 그린다.
       없고 호주도 없을 때만 Loading… */
    let au = [];
    try {
      au = auCalendarItems(
        typeof CountryUI !== 'undefined' && CountryUI &&
        typeof CountryUI.getPlans === 'function' ? CountryUI.getPlans() : null);
    } catch (e) {
      au = [];
    }
    if (au.length) {
      initCalendar([]);
    } else {
      const wrap = document.getElementById('calendar');
      if (wrap) wrap.innerHTML = '<div class="cal-empty">Loading\u2026</div>';
    }
  }
}
