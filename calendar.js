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

/* ── 달력 셀 HTML ── */
function cellHTML(dateStr, dayNum, isOtherMonth, dateMap) {
  const holidays = (typeof getHolidays === 'function') ? getHolidays(dateStr) : [];
  const events   = dateMap[dateStr] || [];
  const isSel    = dateStr === calSelected;

  const flagsHTML = holidays.length
    ? '<span class="cal-flags">' + holidays.map(h => h.flag).join('') + '</span>'
    : '';

  const chipsHTML = events.map(ev => {
    const pal     = CAL_PALETTE[colorMap[ev.item.booking] ?? 0];
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
    return `<div class="cal-chip" style="background:${pal.bg};color:${pal.text}">` +
           `<span class="cal-chip-dot" style="background:${pal.dot}"></span>` +
           `<span class="cal-chip-type">${ev.type}</span>` +
           `<span class="cal-chip-name">${vname}</span></div>`;
  }).join('');

  const cls = ['cal-cell',
    isOtherMonth ? 'cal-other' : '',
    isSel        ? 'cal-sel'   : ''
  ].filter(Boolean).join(' ');

  return `<div class="${cls}" onclick="calSelectDate('${dateStr}')">` +
         `<div class="cal-date-row"><span class="cal-dn">${dayNum}</span>${flagsHTML}</div>` +
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
    const pal = CAL_PALETTE[colorMap[it.booking] ?? 0];
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
           `<div class="cal-detail-vessel">${it.vessel || ''}` +
           (it.voyage ? ` <span class="cal-detail-voy">${it.voyage}</span>` : '') +
           delayHTML + etaChangeBadge + etdChangeBadge + `</div>` +
           `<div class="cal-detail-bkg">${it.booking}</div>` +
           `<div class="cal-detail-dates">` +
           (it.firstSeenPolDep
             ? `<span><span class="cal-dt-lbl">ORIG ETD</span><s>${fmtCalDate(it.firstSeenPolDep)}</s></span>`
             : '') +
           `<span><span class="cal-dt-lbl">ETD PKG</span>${fmtCalDate(it.polDep)}</span>` +
           (it.firstSeenEta
             ? `<span><span class="cal-dt-lbl">ORIG ETA</span><s>${fmtCalDate(it.firstSeenEta)}</s></span>`
             : '') +
           `<span><span class="cal-dt-lbl">ETA LA</span>${fmtCalDate(it.calendarEta)}</span>` +
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
  calItems     = buildCalendarItems(calShipments);
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
    const wrap = document.getElementById('calendar');
    if (wrap) wrap.innerHTML = '<div class="cal-empty">Loading\u2026</div>';
  }
}
