/**
 * Kossan OQC — HMM Track & Trace 수집 Worker  (rev.6)
 * [auto-deploy via GitHub Actions v3]
 *
 * GET  /data              KV의 최신 수집분. 없으면 lastrun과 함께 404.
 * GET  /lookup?bkg=       새 부킹번호 즉시 조회 + 추적 목록 자동 등록
 * GET  /bookings          추적 목록 조회
 * POST /bookings          목록 교체 (X-Refresh-Key)
 * POST /collect           일정 수집 (X-Refresh-Key)
 * POST /collect?maps=1    지도 좌표만 보충 (X-Refresh-Key)
 * GET  /po                PO/컨테이너 매핑 조회 (공개)
 * POST /po                PO 매핑 저장 (X-Refresh-Key)
 * GET  /pcloud?code=[&folder=] pCloud 공개 폴더 프록시 (CORS 우회, 하위 폴더 이름으로 탐색)
 * GET  /history[?bkg=]     스케줄 변경 이력
 * GET  /alertstate         마지막 통지 상태
 * POST /notify-test        알림 메일 테스트 발송 (X-Refresh-Key)
 * GET  /raw?bkg=          원본 응답 진단 (&full=1 → 평문 전체)
 * GET  /debug             접속 진단 (예산·lastrun 포함)
 *
 * rev.18 — pCloud showpublink 은 folderid 를 줘도 최상위 metadata 를 돌려주고
 *   하위 폴더 내용을 contents 안에 중첩해 담는다. 트리를 재귀로 훑도록 수정.
 * rev.17 — 사진 링크를 로트가 아니라 부킹 단위로 저장한다.
 *   pCloud 상위 폴더 1개 안에 컨테이너별 하위 폴더(FNG-0310-07-12 …)가 들어 있고,
 *   그 이름이 PO 순번(FNG031007 Container 12)과 1:1로 대응한다.
 * rev.16 — pCloud 폴더 목록 프록시(/pcloud). 브라우저에서 api.pcloud.com 을 직접
 *   호출하면 CORS로 막히므로 워커가 대신 받아 CORS 헤더를 붙여 전달한다.
 *   (썸네일은 <img> 로 직접 불러오므로 프록시 대상이 아니다)
 * rev.15 — 로트별 사진 링크(pCloud 공개 링크) 저장. /po 에 photos 맵을 함께 둔다.
 * rev.14 — 지연·롤오버 이메일 알림 (Resend HTTP API).
 *   같은 상태를 반복 통지하지 않도록 KV에 통지 이력을 두고, 등급이 올라가거나
 *   지연일이 더 나빠졌을 때만 보낸다.
 *   필요한 설정: secret RESEND_KEY / var ALERT_TO / (선택) ALERT_FROM
 * rev.13 — /lookup 성공 시 결과를 KV의 shipments에도 즉시 반영한다.
 *   그동안은 목록에만 등록되어 다음 Cron 전까지 화면에서 사라져 혼란을 줬다.
 * rev.12 — 선적 전(pre-shipment) 부킹 대응. 이벤트가 하나도 없는 부킹은 HMM이
 *   Shipment History/Current Location/Vessel Movement 대신
 *   Booking Information + Estimated Movement 만 담은 짧은 응답(약 5KB)을 준다.
 *   이 형식을 별도 파서로 처리해 스케줄 추적 대상에 포함시킨다.
 * rev.11 — 롤오버 감지와 스케줄 변경 이력.
 *   목적: 잦은 롤오버로 인한 지연을 조기에 알아채고 선사에 즉시 컴플레인하기 위함.
 *   · rollover: 본선 예정 출항이 지났는데 그 본선의 선적/출항 이벤트가 없으면 미선적으로 본다
 *   · history: 본선/항차/T-S 출항/ETB가 바뀔 때마다 KV에 누적 (소급 불가, 이후분부터 축적)
 *   · alert: 원 스케줄(/po의 eta) 대비 지연일 — 3일까지는 안전, 초과분은 경보
 * rev.10 — /po에 원 스케줄 ETA(eta)를 함께 저장. 응답을 {po,eta} 형태로 바꾸되
 *   구버전 클라이언트를 위해 부킹 키도 최상위에 유지한다.
 * rev.9 — 지도 좌표 강제 재조회. 컨테이너가 같으면 무한히 승계되어 항구명이
 *   P1..Pn 폴백으로 굳고 기항 스케줄 변경도 반영되지 않던 문제를 고친다.
 *   · MAP_TTL_H 경과분과 항구명이 없는 건은 승계하지 않고 다시 받는다
 * rev.8 — PO/컨테이너 매핑을 KV에 저장(/po). 브라우저 localStorage에만 있던 것을
 *   서버로 옮겨 기기에 상관없이 보이고 캐시 삭제에도 유실되지 않게 한다.
 * rev.7 — 520은 재시도 횟수가 아니라 '세션(엣지)'이 좌우한다는 것을 확인.
 *   같은 세션으로 6번 두드려도 실패하지만 새 세션을 열면 성공한다.
 *   · 건별 재시도 2회로 축소, 대신 세션을 최대 5회까지 새로 발급하며 실패분만 재시도
 *   · 부킹 수가 MAX_PER_RUN을 넘으면 커서로 나눠 여러 실행에 분산 (확장 대응)
 *   · 갱신이 뜸한 건은 건너뛰어 예산을 이동 중인 화물에 집중
 * rev.6 — Cloudflare Workers의 "한 실행당 subrequest 50개" 한도에 걸린 것을 확인.
 *   재시도를 늘리는 접근이 한도 안에서 성립하지 않았으므로 구조를 바꿨다.
 *   · 요청 예산(BUDGET)을 두고 남은 수에 따라 재시도 횟수를 동적으로 조절
 *   · 일정 수집과 지도 수집을 별도 실행으로 분리 (Cron 2종)
 *   · namesRaw 뒤에 붙는 쓰레기값('MM')을 잘라 실제 항구명 사용
 * rev.5 — 지도 재시도 3→6, 지도 전용 패스, mapOk, stale 오판 수정
 * rev.4 — 실패 건 2차 재시도(새 세션), 직전 값 carryover(staleItem), eventStamp
 * rev.3 — 실제 응답 구조 확인 후 파서 전면 교체
 *   · 'provided by HMM'은 서버 렌더링 HTML에 없음 → Current Location 사용
 *   · 일정은 Arrival(ETB) 표 대신 정규화된 Vessel Movement 블록에서 추출
 */

const BOOKINGS = [
  "KULM68088700",   // CONTI CONQUEST 0036E, PS3
  "KULM75953600",   // HYUNDAI PLUTO   0047E, PS3
  "KULM40326600",   // HANS SCHULTE    0001E, PS5
  "KULM85176300",   // HMM JAKARTA     0145E, PS5
  "KULM72444200",   // YM MODERATION   0084E, PS5
  "KULM92606700"    // HYUNDAI TOKYO   0164E, PS5
];

const BASE = "https://www.hmm21.com";
const PAGE = BASE + "/e-service/general/trackNTrace/TrackNTrace.do";
const API  = BASE + "/e-service/general/trackNTrace/selectTrackNTrace.do";
const MAP_URL = BASE + "/e-service/general/trackNTrace/trackMap.do";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
           "(KHTML, like Gecko) Chrome/126.0 Safari/537.36";

/* 검증된 헤더 조합 — Accept-Language만 있으면 520 */
const PAGE_HEADERS = {
  "User-Agent": UA,
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
  "Upgrade-Insecure-Requests": "1"
};

const sleep = ms => new Promise(r => setTimeout(r, ms));

/* 한 실행에서 처리할 최대 부킹 수. 초과분은 커서로 다음 실행에 넘긴다. */
const MAX_PER_RUN = 8;
/* 원 스케줄 대비 지연일 임계값.
   WATCH_D 미만은 정상, WATCH_D 이상은 주의, ALERT_D 이상은 경보. */
const DELAY_WATCH_D = 3;    // 3일 이상 지연 → notice 메일
const DELAY_ALERT_D = 7;    // 7일 이상 지연 → alert 메일
/* 본선 예정 출항 후 이 시간이 지나도록 선적 이벤트가 없으면 미선적으로 판정 */
const ROLLOVER_GRACE_H = 12;
/* 지도 좌표 유효기간(시간). 지나면 컨테이너가 같아도 다시 받는다. */
const MAP_TTL_H = 24;
/* 세션 발급 최대 횟수 (실패분 재시도용)
   520은 세션(엣지)이 좌우하므로 재시도보다 새 세션이 훨씬 효율적 */
const MAX_SESSIONS = 8;
/* 건별 재시도 — 같은 세션에서 재시도는 효과 없음, 새 세션으로 넘기는 게 낫다 */
const TRIES_PER_ITEM = 1;

/* ---------- 요청 예산 ----------
   Workers는 한 실행당 외부 요청 50개가 상한(KV 접근 포함). 40에서 시작해
   남은 수를 보고 재시도 횟수를 줄인다. 예산을 다 쓰면 조용히 실패시켜
   뒤쪽 부킹이 요청조차 못 보내는 상황을 막는다. */
function newBudget(n = 40) { return { left: n, used: 0 }; }

async function hmmFetch(budget, url, init, label, maxTries = 6) {
  let last;
  for (let i = 0; i < maxTries; i++) {
    if (budget.left <= 0) throw new Error(label + ": Request budget exhausted (Workers limit)");
    budget.left--; budget.used++;
    try {
      const r = await fetch(url, init);
      if (r.ok) { budget.lastCfRay = r.headers.get("cf-ray") || null; return r; }
      last = new Error(`${new Date(Date.now()+9*3600000).toISOString().slice(11,19)} ${label} response ${r.status} (cf-ray ${r.headers.get("cf-ray") || "-"}, attempt ${i + 1})`);
      if (r.status < 500 && r.status !== 429) throw last;
    } catch (e) {
      last = e;
    }
    if (i < maxTries - 1) await sleep(2500 + i * 2500 + Math.random() * 1500);
  }
  throw last;
}

/* ---------- 세션 ---------- */
async function openSession(budget) {
  const r = await hmmFetch(budget, PAGE, { headers: PAGE_HEADERS }, "세션 페이지", 1);
  const html = await r.text();

  const csrf = (html.match(/name="_csrf"\s+content="([^"]+)"/) ||
                html.match(/content="([^"]+)"\s+name="_csrf"/) || [])[1];
  if (!csrf) throw new Error("No CSRF token (len " + html.length + ")");

  const raw = typeof r.headers.getSetCookie === "function"
    ? r.headers.getSetCookie()
    : (r.headers.get("set-cookie") || "").split(/,(?=\s*[A-Za-z0-9_-]+=)/);
  const cookie = raw.map(c => c.split(";")[0].trim()).filter(Boolean).join("; ");
  if (!cookie) throw new Error("No session cookie");

  return { csrf, cookie };
}

/* ---------- 부킹 조회 ---------- */
async function queryBooking(budget, session, bkg, tries) {
  const r = await hmmFetch(budget, API, {
    method: "POST",
    headers: {
      "User-Agent": UA,
      "Accept": "*/*",
      "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
      "Content-Type": "application/json;charset=UTF-8",
      "X-CSRF-TOKEN": session.csrf,
      "X-Requested-With": "XMLHttpRequest",
      "Cookie": session.cookie,
      "Referer": PAGE,
      "Origin": BASE
    },
    body: JSON.stringify({ type: "bkg", listBl: [], listCntr: [], listBkg: [bkg], listPo: [] })
  }, bkg, tries);
  const html = await r.text();
  if (html.length < 1200) throw new Error(bkg + ": No lookup result — please check the booking number (" + html.length + "B)");
  return html;
}

/* ---------- 파싱 ---------- */
const strip = h => h
  .replace(/<script[\s\S]*?<\/script>/gi, " ")
  .replace(/<style[\s\S]*?<\/style>/gi, " ")
  .replace(/<[^>]*>/g, "\n")
  .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#39;/g, "'")
  .replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/[ \t]+/g, " ")
  .replace(/\n\s*\n+/g, "\n")
  .trim();

const iso = s => s ? s.trim().replace(" ", "T") : null;
const DT_RE = /\d{4}-\d\d-\d\d \d\d:\d\d/;

function section(t, start, end) {
  const i = t.search(new RegExp(start, "i"));
  if (i < 0) return null;
  const s = t.slice(i);
  if (!end) return s;
  const j = s.slice(start.length).search(new RegExp(end, "i"));
  return j > 0 ? s.slice(0, start.length + j) : s;
}

/* Vessel Movement: 6줄 1구간 (선박+항차 / 서비스 / POL / ETD / POD / ETA) */
const LEG_RE = /([A-Z][A-Z0-9 .\-]{2,28}\s\d{3,4}[NESW])\n([A-Z0-9]{2,5})\n([^\n]+)\n(\d{4}-\d\d-\d\d \d\d:\d\d)\n([^\n]+)\n(\d{4}-\d\d-\d\d \d\d:\d\d)/g;


/* Estimated Movement: 선적 전 부킹의 예정 구간
   (선박+항차 / 출발지 / 출발일시 / 도착지 / 도착일시) 5줄 반복 — 서비스 코드가 없다 */
const PRELEG_RE = /([A-Z][A-Z0-9 .\-]{2,28}\s\d{3,4}[NESW])\n([^\n]+)\n(\d{4}-\d\d-\d\d \d\d:\d\d)\n([^\n]+)\n(\d{4}-\d\d-\d\d \d\d:\d\d)/g;

function parsePreBooking(t, bkg) {
  const em = section(t, "Estimated Movement", "Go Back|Top\\n|© 2023");
  if (!em) return null;
  PRELEG_RE.lastIndex = 0;
  const legs = [...em.matchAll(PRELEG_RE)].map(m => ({
    vessel: m[1].replace(/\s+\d{3,4}[NESW]$/, "").replace(/\s+/g, " ").trim(),
    voyage: (m[1].match(/(\d{3,4}[NESW])$/) || [])[1] || null,
    svc: null,
    pol: m[2].trim(), etd: iso(m[3]),
    pod: m[4].trim(), eta: iso(m[5])
  }));
  if (!legs.length) return null;

  /* CNTR Type / Size / Qty 는 "DC4H:14" 형태이고 여러 규격이 나열될 수 있다.
     느슨한 정규식은 "12:00" 같은 시각까지 잡으므로 라벨 뒤 구간에서만 찾는다. */
  const bi = section(t, "Booking Info", "Estimated Movement") || "";
  const qseg = (bi.match(/Qty\n([\s\S]{0,120}?)\n(?:Place of|Booking Shipper|$)/i) || [])[1] || bi;
  const qAll = [...qseg.matchAll(/\b([A-Z]{2}[A-Z0-9]{1,4}):(\d+)\b/g)];
  const qty = qAll.length ? [null, qAll.map(m => m[1]).join(","),
                             String(qAll.reduce((a, m) => a + (+m[2] || 0), 0))] : [];
  const mother = legs[legs.length - 1];
  const feeder = legs.length > 1 ? legs[0] : null;

  return {
    booking: bkg,
    preShipment: true,                     // 아직 이벤트가 없는 단계
    vessel: mother.vessel, voyage: mother.voyage, svc: null,
    feeder: feeder ? feeder.vessel + " " + (feeder.voyage || "") : null,
    feederSvc: null,
    origin: legs[0].pol, pol: legs[0].pol,
    ts: feeder ? feeder.pod : null,
    pod: mother.pod, dest: mother.pod,
    polDep: legs[0].etd,
    tsArr: feeder ? feeder.eta : null,
    tsDep: feeder ? mother.etd : null,
    eta: mother.eta,
    destEta: null,
    status: "Booked — not yet shipped",
    statusLoc: legs[0].pol,
    stamp: null, eventStamp: null,
    lastEvent: null,
    last: "Booked — no movement yet",
    legs, events: [],
    containers: [], cntrQty: qty[2] ? +qty[2] : null, container: null,
    cntrType: qty[1] || null
  };
}

function parseBooking(html, bkg) {
  const t = strip(html);

  /* 검증 1 — 부킹번호 에코 (이전 결과 잔류 방지) */
  const echoes = [...new Set(t.match(/\bKULM\d{8}\b/g) || [])];
  if (!echoes.includes(bkg))
    throw new Error(bkg + ": Booking number missing from response (echo " + (echoes.join(",") || "none") + ")");
  if (echoes.length > 1)
    throw new Error(bkg + ": Different booking number mixed in " + echoes.join(","));

  /* 검증 2 — Current Location.
     없으면 선적 전 부킹(Estimated Movement만 존재)일 수 있으므로 그쪽 파서로 넘긴다. */
  const cl = section(t, "Current Location", "Blue :|The Status Description|Vessel Movement");
  const cm = cl && cl.match(/Status Description\n([^\n]+)\n(\d{4}-\d\d-\d\d \d\d:\d\d)\n([^\n]+)/);
  if (!cm) {
    const pre = parsePreBooking(t, bkg);
    if (pre) return pre;
    throw new Error(bkg + ": No schedule info — booking may have just been registered, or no result found");
  }
  const current = { loc: cm[1].trim(), at: iso(cm[2]), status: cm[3].trim() };

  /* 구간 */
  const vm = section(t, "Vessel Movement", "If your T/S|Customs Status|Estimated Date");
  LEG_RE.lastIndex = 0;
  const legs = vm ? [...vm.matchAll(LEG_RE)].map(m => ({
    vessel: m[1].replace(/\s+\d{3,4}[NESW]$/, "").replace(/\s+/g, " ").trim(),
    voyage: (m[1].match(/(\d{3,4}[NESW])$/) || [])[1] || null,
    svc:    m[2],
    pol:    m[3].trim(), etd: iso(m[4]),
    pod:    m[5].trim(), eta: iso(m[6])
  })) : [];
  if (!legs.length) throw new Error(bkg + ": Vessel Movement parsing failed");

  const mother = legs[legs.length - 1];
  const feeder = legs.length > 1 ? legs[0] : null;

  /* Shipment Schedule */
  const sch = section(t, "Shipment Schedule", "Container Information|The arrival date");
  const schArr = sch
    ? ((sch.match(/Arrival\(ETB\)\n([\s\S]*?)\n(?:Departure|[A-Za-z])/) || [])[1] || "")
        .split("\n").filter(s => DT_RE.test(s))
    : [];
  const locs = sch ? ((sch.match(/Location\n([\s\S]*?)\nTerminal/) || [])[1] || "").split("\n").filter(Boolean) : [];
  const terms = sch ? ((sch.match(/Terminal\n([\s\S]*?)\nVessel/) || [])[1] || "").split("\n").filter(Boolean) : [];
  const destEta = schArr.length ? iso(schArr[schArr.length - 1]) : null;

  /* 이벤트 — 나중에 delayHistory 구간별 분해(T/S 드웰링 등)에 쓰이므로 넉넉히 보존 */
  const hb = section(t, "Hide Previous Moves|Shipment History", "Excel|Rail ETD");
  const events = hb ? [...hb.matchAll(/(\d{4}-\d\d-\d\d)\n(\d\d:\d\d)\n([^\n]+)\n([^\n]+)\n([^\n]+)/g)]
    .slice(0, 30).map(m => ({ at: m[1] + "T" + m[2], loc: m[3].trim(), status: m[4].trim(), mode: m[5].trim() })) : [];

  const containers = [...new Set(html.match(/\b[A-Z]{4}\d{7}\b/g) || [])];

  /* Shipment Progress 섹션 — 이 섹션에는 actual 값만 표시됨.
     파란색(예정)이면 아예 안 뜨고, 빨간색(실제 발생)이면 날짜가 찍힌다.
     따라서 여기서 파싱한 날짜는 무조건 actual. */
  let spDep = null, spArr = null;
  try {
    const sp = section(t, "Shipment Progress", "Shipment History");
    if (sp) {
      const depM = sp.match(/Departure at Origin\s*\n\s*(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})/);
      const arrM = sp.match(/Arrival at Destination\s*\n\s*(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})/);
      if (depM) spDep = iso(depM[1]);
      if (arrM) spArr = iso(arrM[1]);
    }
  } catch(_) {}

  return {
    booking: bkg,
    vessel: mother.vessel, voyage: mother.voyage, svc: mother.svc,
    feeder: feeder ? feeder.vessel + " " + (feeder.voyage || "") : null,
    feederSvc: feeder ? feeder.svc : null,

    origin: locs[0] || null,
    pol:  feeder ? feeder.pol : mother.pol,
    ts:   feeder ? feeder.pod : null,
    pod:  mother.pod,
    dest: locs[locs.length - 1] || null,
    terminals: terms.length ? terms : null,

    polDep: feeder ? feeder.etd : mother.etd,
    tsArr:  feeder ? feeder.eta : null,
    tsDep:  feeder ? mother.etd : null,
    eta:    mother.eta,
    destEta,

    /* Current Location은 Shipment History보다 며칠 뒤처지는 경우가 있어
       갱신 판별에는 최신 이벤트 시각(eventStamp)을 쓴다 */
    status: current.status,
    statusLoc: current.loc,
    stamp: current.at,
    eventStamp: events.length ? events[0].at : current.at,
    lastEvent: events.length ? events[0].status + " @ " + events[0].loc : null,
    last: (events.length
            ? events[0].status + " @ " + events[0].loc + " (" + events[0].at.replace("T", " ") + ")"
            : current.status + " @ " + current.loc + " (" + current.at.replace("T", " ") + ")"),

    legs, events,
    containers: containers.slice(0, 20),
    cntrQty: containers.length,
    container: containers[0] || null,
    spDep, spArr  /* Shipment Progress 섹션에서 파싱한 출발/도착 시각 */
  };
}

/* ---------- 이벤트 기반 actual 플래그 계산 ----------
   각 날짜 필드가 실제 HMM 이벤트로 확인됐는지 여부를 boolean으로 반환.
   시간이 지났다는 이유만으로 actual 처리하지 않는다. */
function computeActualFlags(item) {
  const evs = (item.events || []).map(e => (e.status || "").toUpperCase());
  const hasEv = (...kw) => evs.some(st => kw.every(k => st.includes(k)));

  /* 폴백: events 파싱 실패 시 Current Location status 필드로 보완 */
  const cur = (item.status || "").toUpperCase();
  const hasCur = (...kw) => kw.every(k => cur.includes(k));

  /* 래칫(ratchet): 한 번 actual로 확인된 플래그는 520 에러·carried 등 어떤 상황에서도
     다시 false로 롤백하지 않는다. 기존 true를 OR로 보존. */
  return {
    polDepActual: !!item.polDepActual || hasEv("DEPARTURE", "POL") || hasEv("FEEDER LOADING", "POL") || hasEv("FEEDER DEPARTURE"),
    tsArrActual:  !!item.tsArrActual  || hasEv("ARRIVAL", "T/S") || hasEv("FEEDER ARRIVAL", "T/S"),
    tsDepActual:  !!item.tsDepActual  || hasEv("DEPARTURE", "T/S"),
    etaActual:    !!item.etaActual    || hasEv("DISCHARG", "POD")
                                      || hasCur("DISCHARG", "POD"),
  };
}

/* ---------- 지도 좌표 ---------- */
async function fetchMap(budget, session, blNo, cntrNo, tries) {
  const r = await hmmFetch(budget,
    `${MAP_URL}?blNo=${encodeURIComponent(blNo)}&cntrNo=${encodeURIComponent(cntrNo)}`, {
    headers: {
      "User-Agent": UA,
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
      "Cookie": session.cookie,
      "Referer": PAGE
    }
  }, "지도(" + blNo + ")", tries);
  const m = await r.text();

  const seg = (n, k) => { const i = m.indexOf(n); return i < 0 ? null : m.slice(i, i + (k || 1600)); };
  const rp = seg("routePoints =");
  const route = rp
    ? [...rp.matchAll(/\[\s*(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)\s*\]/g)].map(x => [+x[1], +x[2]])
    : null;
  const rawNames = [...((seg("routePointsName =", 800) || "").matchAll(/"([^"]{2,40})"/g))].map(x => x[1]);
  const idx   = +(((seg("currentRouteIndex =", 60) || "").match(/=\s*(-?\d+)/) || [])[1]);
  const ratio = +(((seg("currentRouteRatio =", 60) || "").match(/=\s*(-?[\d.]+)/) || [])[1]);

  if (!route || route.length < 2 || !Number.isFinite(idx) || !Number.isFinite(ratio))
    throw new Error("Map parsing failed (points " + (route ? route.length : 0) + ")");

  /* routePointsName은 좌표 개수만큼만 유효하고 뒤에 'MM' 같은 값이 붙는다 */
  const names = rawNames.length >= route.length
    ? rawNames.slice(0, route.length)
    : route.map((_, i) => "P" + (i + 1));

  return { route, names, namedPorts: rawNames.length >= route.length,
           idx, ratio, mapAt: new Date().toISOString().slice(0, 16).replace("T", " ") + "Z" };
}

/* 이전 지도 좌표를 그대로 써도 되는지 — 다음 경우엔 다시 받는다.
   (1) 받은 지 MAP_TTL_H 시간이 지났다  (2) 항구명을 못 받아 P1..Pn 폴백 상태다 */
function mapFresh(old) {
  if (!old || !old.route) return false;
  if (old.namedPorts === false) return false;
  if (!Array.isArray(old.names) || old.names.some(n => /^P\d+$/.test(n))) return false;
  const t = Date.parse(String(old.mapAt || "").replace(" ", "T").replace("Z", "") + "Z");
  if (!Number.isFinite(t)) return false;
  return (Date.now() - t) < MAP_TTL_H * 3600000;
}


/* ---------- 롤오버 / 지연 판정 ---------- */
const dayMs = 86400000;
const tsOf = v => { const t = Date.parse(String(v || "").replace(" ", "T") + "Z"); return Number.isFinite(t) ? t : null; };

/* 본선 예정 출항이 지났는데 그 본선의 선적·출항 이벤트가 없으면 미선적(롤오버)으로 본다.
   HMM은 롤오버를 별도로 알려주지 않으므로 이벤트 부재로 역산하는 수밖에 없다. */
function detectRollover(item) {
  if (item.preShipment) return null;      // 아직 선적 전이면 판정 대상이 아니다
  const legs = item.legs || [];
  if (!legs.length) return null;
  const mother = legs[legs.length - 1];
  const etd = tsOf(mother.etd);
  if (!etd) return null;

  const now = Date.now();
  const overdueH = (now - etd) / 3600000;
  const evs = item.events || [];
  const name = (mother.vessel || "").toUpperCase();

  /* 이벤트의 mode에 본선명이 들어가면 그 배에 실린 것 */
  const loaded = evs.some(e => {
    const m = (e.mode || "").toUpperCase(), st = (e.status || "").toUpperCase();
    return name && m.includes(name) && (st.includes("LOADING") || st.includes("DEPARTURE"));
  });
  if (loaded) return { rollover: false, loaded: true };
  if (overdueH < ROLLOVER_GRACE_H) return { rollover: false, loaded: false };

  return {
    rollover: true, loaded: false,
    overdueDays: Math.floor(overdueH / 24),
    vessel: mother.vessel, voyage: mother.voyage, plannedEtd: mother.etd
  };
}

/* 원 스케줄(/po의 eta, YYYY-MM-DD) 대비 지연일 */
function delayVsPlan(item, planEta) {
  if (!planEta || !item.eta) return null;
  const plan = Date.parse(planEta + "T00:00:00Z");
  const real = Date.parse(item.eta.slice(0, 10) + "T00:00:00Z");
  if (!Number.isFinite(plan) || !Number.isFinite(real)) return null;
  return Math.round((real - plan) / dayMs);
}

/* 경보 등급: ok(계획 이내) / watch(1~3일) / alert(3일 초과 또는 롤오버) */
function alertLevel(delay, ro) {
  if (ro && ro.rollover) return "alert";      // 롤오버는 일수와 무관하게 경보
  if (delay === null) return null;
  if (delay >= DELAY_ALERT_D) return "alert";
  if (delay >= DELAY_WATCH_D) return "watch";
  return "ok";
}

/* ---------- /lookup + collectSchedule 공통 normalize ----------
   delay/alert/rollover/actualFlags 판정을 한 곳에서 처리 */
async function normalizeOne(env, item) {
  const bkg = item.booking;
  const nowStr = new Date().toISOString().slice(0, 16).replace("T", " ") + "Z";
  item.checkedAt = item.checkedAt || nowStr;
  item.scheduleCheckedAt = item.scheduleCheckedAt || nowStr;

  /* actual 플래그 */
  Object.assign(item, computeActualFlags(item));

  /* planEta / delayDays / alert */
  try {
    const poetaMap = JSON.parse((await env.OQC.get("poeta")) || "{}") || {};
    const dv = delayVsPlan(item, poetaMap[bkg]);
    if (dv !== null) { item.planEta = poetaMap[bkg]; item.delayDays = dv; }
    const ro = detectRollover(item);
    if (ro) { item.rollover = !!ro.rollover; if (ro.rollover) item.rolloverDays = ro.overdueDays; }
    const lvl = alertLevel(dv, ro);
    if (lvl) item.alert = lvl;
  } catch (e) { console.error("[normalizeOne] delay/alert failed", bkg, String(e)); }

  /* delayHistory 스냅샷 */
  if (item.etaActual && !item.delaySnapshotDone) {
    try {
      let planEta = {}, hist = {};
      try { planEta = JSON.parse((await env.OQC.get("poeta")) || "{}") || {}; } catch (_) {}
      try { hist    = JSON.parse((await env.OQC.get("history")) || "{}") || {}; } catch (_) {}
      const snap = await recordDelaySnapshot(env, item, planEta, hist);
      if (snap && snap.done) {
        item.delaySnapshotDone = true;
        item.delayCompletedAt = snap.completedAt || null;
      }
    } catch (e) { console.error("[normalizeOne] delaySnapshot failed", bkg, String(e)); }
  }

  return item;
}

/* ---------- POD 하역완료 감지 + delayHistory 백데이터 수집 ----------
   목적: 완료된 부킹의 계획 대비 실제 지연일을 월별로 영구 누적 (통계용 원자재).
   지금은 저장만 한다 — 집계/화면은 차후 별도 작업.
   완료 판정: events[]에 "DISCHARGED"+"POD"가 동시에 들어간 status가 뜨는 순간.
   중복 저장 방지: shipments 저장분에 delaySnapshotDone 마커를 남겨 재수집 시 재저장 안 함. */
function findPodDischargeEvent(item) {
  const evs = item.events || [];
  return evs.find(e => {
    const st = (e.status || "").toUpperCase();
    return st.includes("DISCHARG") && st.includes("POD");
  }) || null;
}

function monthOf(dateStr) {
  if (!dateStr) return null;
  const m = String(dateStr).match(/^(\d{4}-\d{2})/);
  return m ? m[1] : null;
}

/* 실제 시각(YYYY-MM-DD 또는 YYYY-MM-DDTHH:MM) 두 개의 일수 차이. 반올림. */
function daysBetween(actualStr, planStr) {
  if (!actualStr || !planStr) return null;
  const norm = s => s.length <= 10 ? s + "T00:00:00Z" : s.replace(" ", "T") + (s.includes("Z") ? "" : "Z");
  const a = Date.parse(norm(actualStr));
  const p = Date.parse(norm(planStr));
  if (!Number.isFinite(a) || !Number.isFinite(p)) return null;
  return Math.round((a - p) / dayMs);
}

/* 구간별 지연 분해. plan(log[0] 첫 추적 시점 스냅샷) vs 실제(item 현재값 + POD 하역 실제일).
   각 구간이 "직전 구간 대비 추가로 늘어난 일수"가 되도록 누적 방식으로 계산하고,
   합계가 총 지연(actualEta - planEta)과 정확히 일치하도록 마지막 구간(해상구간)에서 잔차를 흡수한다. */
function buildLegBreakdown(item, firstLog, actualEta, totalDelay) {
  if (!firstLog) return null;   // 추적 시작 시점 스냅샷이 없으면 분해 불가

  const legs = [];
  let cum = 0;   // 누적 지연(일)

  const add = (label, actualVal, planVal, dwellNote) => {
    if (!actualVal || !planVal) { legs.push({ label, days: null, note: dwellNote || null }); return; }
    const total = daysBetween(actualVal, planVal);
    if (total === null) { legs.push({ label, days: null, note: dwellNote || null }); return; }
    const delta = total - cum;   // 이 구간에서 "새로" 늘어난 부분만
    cum = total;
    legs.push({ label, days: delta, note: dwellNote || null });
  };

  add("PKG ETD", item.polDep, firstLog.polDep);
  add("T/S Arrival ETA", item.tsArr, firstLog.tsArr);

  /* T/S 드웰링 — 실제 대기(T/S ETA~ETD)와 계획 대기 비교 (구간 자체가 아니라 참고용 note) */
  let dwellNote = null;
  if (item.tsArr && item.tsDep && firstLog.tsArr && firstLog.tsDep) {
    const actualDwell = daysBetween(item.tsDep, item.tsArr);
    const planDwell = daysBetween(firstLog.tsDep, firstLog.tsArr);
    if (actualDwell !== null && planDwell !== null) dwellNote = `${actualDwell}d vs ${planDwell}d plan`;
  }
  add("T/S Departure ETD", item.tsDep, firstLog.tsDep, dwellNote);

  /* 마지막 구간(POD 도착) — 잔차를 흡수해 합계를 총 지연과 정확히 맞춘다 */
  const lastDelta = totalDelay - cum;
  legs.push({ label: "POD Arrival (incl. ocean leg)", days: lastDelta, note: null });

  return legs;
}

/* 완료된 부킹 하나의 스냅샷을 delayHistory:{planMonth} KV에 append.
   기존 값을 절대 덮어쓰지 않고 항상 배열에 추가만 한다 (이력 보존). */
async function recordDelaySnapshot(env, item, planEtaMap, histMap) {
  if (item.delaySnapshotDone) return { done: false };             // 이미 저장됨
  const planEta = planEtaMap[item.booking];
  if (!planEta) return { done: false };                            // planEta 필수 — 없으면 수집 대상 아님

  const discEvt = findPodDischargeEvent(item);
  if (!discEvt) return { done: false };                             // 아직 하역 안 됨

  const actualEta = discEvt.at.slice(0, 10);
  const plan = Date.parse(planEta + "T00:00:00Z");
  const real = Date.parse(actualEta + "T00:00:00Z");
  if (!Number.isFinite(plan) || !Number.isFinite(real)) return { done: false };
  const delayDays = Math.round((real - plan) / dayMs);

  const planMonth = monthOf(planEta);
  const polDepMonth = monthOf(item.polDep);
  if (!planMonth) return { done: false };

  const firstLog = (histMap && histMap[item.booking] && histMap[item.booking][0]) || null;
  const legBreakdown = buildLegBreakdown(item, firstLog, actualEta, delayDays);

  const key = "delayHistory:" + planMonth;
  let arr = [];
  try { arr = JSON.parse((await env.OQC.get(key)) || "[]") || []; } catch (_) { arr = []; }

  /* 동일 booking 중복 방지 (재실행/경합 대비 이중 체크) */
  const dup = arr.find(r => r.booking === item.booking);
  if (dup) return { done: true, completedAt: dup.completedAt };

  arr.push({
    booking: item.booking,
    pol: item.pol || null,
    pod: item.pod || null,
    vessel: item.vessel || null,
    voyage: item.voyage || null,
    svc: item.svc || null,
    feederSvc: item.feederSvc || null,
    ts: item.ts || null,
    planEta,
    actualEta,
    delayDays,
    rollover: !!item.rollover,
    polDep: item.polDep || null,
    planMonth,
    polDepMonth,
    completedAt: discEvt.at,
    legBreakdown
  });

  await env.OQC.put(key, JSON.stringify(arr));
  return { done: true, completedAt: discEvt.at };
}

/* 본선/항차/T-S 출항/ETB 변경을 이력에 누적. 변경이 있으면 그 목록을 반환 */
function diffSchedule(prev, next) {
  if (!prev) return null;
  const f = [
    ["vessel", "Vessel"], ["voyage", "Voyage"],
    ["feeder", "Feeder"],
    ["polDep", "PKG ETD"],
    ["tsArr", "T/S ETA"], ["tsDep", "T/S ETD"], ["eta", "POD ETB"], ["destEta", "DEST ETA"]
  ];
  const ch = [];
  for (const [k, label] of f) {
    if (prev[k] && next[k] && prev[k] !== next[k]) ch.push({ field: k, label, from: prev[k], to: next[k] });
  }
  return ch.length ? ch : null;
}


/* ---------- 이메일 알림 ----------
   Cloudflare Workers는 자체 발송 기능이 없어 Resend HTTP API를 쓴다.
   설정: secret RESEND_KEY, var ALERT_TO(쉼표 구분 가능), var ALERT_FROM(선택) */
async function sendMail(env, subject, html) {
  if (!env.RESEND_KEY || !env.ALERT_TO) return { skipped: "RESEND_KEY 또는 ALERT_TO 미설정" };
  const to = String(env.ALERT_TO).split(",").map(x => x.trim()).filter(Boolean);
  const from = env.ALERT_FROM || "Kossan OQC <onboarding@resend.dev>";
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": "Bearer " + env.RESEND_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject, html })
  });
  if (!r.ok) return { error: "Mail send failed " + r.status + " " + (await r.text()).slice(0, 200) };
  return { ok: true };
}

const esc = v => String(v == null ? "" : v).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

/* 등급 순위 — 올라갈 때만 통지한다 */
const RANK = { ok: 0, watch: 1, alert: 2 };

/* 통지 대상 선별: 등급이 올라갔거나, 같은 등급이라도 지연이 더 커진 경우 */
function pickNotifications(shipments, state) {
  const out = [];
  for (const s of shipments) {
    if (s.staleItem) continue;
    const lvl = s.alert;
    if (!lvl || lvl === "ok") continue;
    const prev = state[s.booking] || {};
    const worse = RANK[lvl] > RANK[prev.level || "ok"];
    const deeper = lvl === prev.level && typeof s.delayDays === "number" &&
                   typeof prev.delayDays === "number" && s.delayDays > prev.delayDays;
    const newRoll = s.rollover && !prev.rollover;
    if (worse || deeper || newRoll) out.push(s);
  }
  return out;
}

function mailBody(list, updated) {
  const row = s => `
    <tr>
      <td style="padding:8px 10px;border-bottom:1px solid #ddd"><b>${esc(s.booking)}</b><br>
        <span style="color:#666;font-size:12px">${esc(s.vessel)} ${esc(s.voyage || "")}</span></td>
      <td style="padding:8px 10px;border-bottom:1px solid #ddd">${esc(s.planEta || "-")}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #ddd">${esc((s.eta || "").slice(0, 10))}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #ddd;color:${s.alert === "alert" ? "#C8402F" : "#9A6B12"};font-weight:600">
        ${typeof s.delayDays === "number" ? (s.delayDays > 0 ? "+" + s.delayDays : s.delayDays) + "d" : "-"}
        ${s.rollover ? "<br><span style='font-size:12px'>ROLLOVER " + esc(s.rolloverDays || 0) + "d</span>" : ""}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #ddd;font-size:12px;color:#555">
        ${esc(s.pol || "")} → ${esc(s.ts || "-")} → ${esc(s.pod || "")}<br>${esc(s.last || "")}</td>
    </tr>`;
  return `<div style="font-family:system-ui,sans-serif;color:#222">
    <h2 style="margin:0 0 4px">HMM Shipment Delay Alert</h2>
    <p style="margin:0 0 14px;color:#666;font-size:13px">Updated: ${esc(updated)} · Threshold: Notice ≥ ${DELAY_WATCH_D}d / Alert ≥ ${DELAY_ALERT_D}d</p>
    <table style="border-collapse:collapse;font-size:13px;width:100%">
      <tr style="background:#f2f5f7">
        <th style="padding:8px 10px;text-align:left">Booking / Vessel</th>
        <th style="padding:8px 10px;text-align:left">Original ETA</th>
        <th style="padding:8px 10px;text-align:left">Current ETB</th>
        <th style="padding:8px 10px;text-align:left">Variance</th>
        <th style="padding:8px 10px;text-align:left">Route / Latest Event</th>
      </tr>
      ${list.map(row).join("")}
    </table>
    <p style="margin:16px 0 0;font-size:12px;color:#888">Notifications are sent only when the alert level escalates or delay worsens. Repeated alerts for the same status are suppressed.</p>
  </div>`;
}

/* 수집 결과를 받아 필요한 경우에만 메일을 보낸다 */
async function notifyIfNeeded(env, payload) {
  let state = {};
  try { state = JSON.parse((await env.OQC.get("alertstate")) || "{}") || {}; } catch (_) {}

  const targets = pickNotifications(payload.shipments || [], state);
  /* 상태는 통지 여부와 무관하게 항상 갱신한다 (등급이 내려간 경우 포함) */
  for (const s of payload.shipments || []) {
    if (s.staleItem) continue;
    state[s.booking] = { level: s.alert || "ok", delayDays: s.delayDays ?? null,
                         rollover: !!s.rollover, at: payload.updated };
  }
  await env.OQC.put("alertstate", JSON.stringify(state));

  if (!targets.length) return { sent: 0 };
  const worst = targets.some(s => s.alert === "alert") ? "Alert" : "Notice";
  const subject = `[${worst}] HMM Shipment Delay — ${targets.length} booking(s): ${targets.map(s => s.booking).join(", ")}`;
  const res = await sendMail(env, subject, mailBody(targets, payload.updated));
  return { sent: res.ok ? targets.length : 0, bookings: targets.map(s => s.booking), ...res };
}

/* 도착 완료 메일 — etaActual이 처음 true가 된 부킹에 1회만 발송 */
function arrivalMailBody(list, updated) {
  const esc = v => String(v == null ? "" : v).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  const delayStr = s => {
    if (typeof s.delayDays !== "number") return "-";
    if (s.delayDays === 0) return "<span style='color:#2E7D32;font-weight:600'>On time</span>";
    return `<span style='color:${s.delayDays > 0 ? "#C8402F" : "#2E7D32"};font-weight:600'>${s.delayDays > 0 ? "+" : ""}${s.delayDays}d</span>`;
  };
  const row = s => `
    <tr>
      <td style="padding:8px 10px;border-bottom:1px solid #ddd"><b>${esc(s.booking)}</b><br>
        <span style="color:#666;font-size:12px">${esc(s.vessel)} ${esc(s.voyage || "")}</span></td>
      <td style="padding:8px 10px;border-bottom:1px solid #ddd">${esc(s.planEta || "-")}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #ddd">${esc((s.eta || "").slice(0, 10))}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #ddd">${delayStr(s)}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #ddd;font-size:12px;color:#555">
        ${esc(s.pol || "")} → ${esc(s.ts || "-")} → ${esc(s.pod || "")}</td>
    </tr>`;
  return `<div style="font-family:system-ui,'Malgun Gothic',sans-serif;color:#222">
    <h2 style="margin:0 0 4px">✅ HMM Shipment Arrived</h2>
    <p style="margin:0 0 14px;color:#666;font-size:13px">Detected at ${esc(updated)}</p>
    <table style="border-collapse:collapse;font-size:13px;width:100%">
      <tr style="background:#f2f5f7">
        <th style="padding:8px 10px;text-align:left">Booking / Vessel</th>
        <th style="padding:8px 10px;text-align:left">Plan ETA</th>
        <th style="padding:8px 10px;text-align:left">Actual ETA</th>
        <th style="padding:8px 10px;text-align:left">Delay</th>
        <th style="padding:8px 10px;text-align:left">Route</th>
      </tr>
      ${list.map(row).join("")}
    </table>
    <p style="margin:16px 0 0;font-size:12px;color:#888">This notification is sent once per booking upon arrival confirmation.</p>
  </div>`;
}

async function notifyArrivalIfNeeded(env, payload) {
  const shipments = payload.shipments || [];
  const targets = shipments.filter(s => !s.staleItem && s.etaActual && !s.arrivalMailSent);
  if (!targets.length) return { sent: 0 };

  const subject = `[Arrived] HMM Shipment Arrived — ${targets.length} booking(s): ${targets.map(s => s.booking).join(", ")}`;
  const res = await sendMail(env, subject, arrivalMailBody(targets, payload.updated));

  if (res.ok) {
    /* arrivalMailSent 플래그를 KV shipments에 반영 */
    try {
      const raw = await env.OQC.get("shipments");
      if (raw) {
        const saved = JSON.parse(raw);
        const sentSet = new Set(targets.map(s => s.booking));
        if (saved && saved.shipments) {
          saved.shipments.forEach(s => { if (sentSet.has(s.booking)) s.arrivalMailSent = true; });
          await env.OQC.put("shipments", JSON.stringify(saved));
        }
      }
    } catch (_) {}
  }

  return { sent: res.ok ? targets.length : 0, bookings: targets.map(s => s.booking), ...res };
}

/* ---------- 부킹 목록 ---------- */
async function getList(env) {
  try {
    const raw = await env.OQC.get("bookings");
    if (raw !== null) {
      const v = JSON.parse(raw);
      if (Array.isArray(v)) return v;
    }
  } catch (_) {}
  return BOOKINGS;
}
const getSaved = async env => {
  try { return JSON.parse((await env.OQC.get("shipments")) || "null"); } catch (_) { return null; }
};

/* ---------- bookings 기준 /data 조립 helper ---------- */
async function readJsonKV(env, key, fallback = null) {
  try {
    const raw = await env.OQC.get(key);
    if (raw === null) return fallback;
    return JSON.parse(raw);
  } catch (e) {
    console.error("[readJsonKV] parse failed", key, String(e));
    return fallback;
  }
}

async function assembleShipments(env) {
  const list = await getList(env);
  const saved = await getSaved(env);
  const savedMap = new Map(
    ((saved && Array.isArray(saved.shipments)) ? saved.shipments : [])
      .filter(s => s && s.booking)
      .map(s => [s.booking, s])
  );

  const shipments = await Promise.all(list.map(async bkg => {
    let schedule = null, map = null;
    try { schedule = await readJsonKV(env, "schedule:" + bkg, null); }
    catch (e) { console.error("[/data] schedule read failed", bkg, String(e)); }
    try { map = await readJsonKV(env, "map:" + bkg, null); }
    catch (e) { console.error("[/data] map read failed", bkg, String(e)); }

    const base = savedMap.get(bkg) || {};
    const merged = { ...base };

    /* schedule:{bkg} merge 시 actual 플래그 4개는 제외 */
    if (schedule && typeof schedule === "object") {
      const { etaActual: _e, polDepActual: _p, tsArrActual: _ta, tsDepActual: _td, ...scheduleClean } = schedule;
      Object.assign(merged, scheduleClean);
    }
    if (map && typeof map === "object") Object.assign(merged, map);
    if (!merged.booking) merged.booking = bkg;

    /* base(shipments 캐시)에도 오래된 actual:true가 남아있을 수 있으므로
       최종 조립 후 actual 4개를 전부 제거하고 events/status 기반으로 재계산 */
    const {
      etaActual: _oldEta,
      polDepActual: _oldPol,
      tsArrActual: _oldTsArr,
      tsDepActual: _oldTsDep,
      ...cleanMerged
    } = merged;
    Object.assign(cleanMerged, computeActualFlags(cleanMerged));
    return cleanMerged;
  }));

  return { saved, shipments: shipments.filter(Boolean) };
}

/* 커서로 이번 실행에서 처리할 구간을 정한다 (부킹이 MAX_PER_RUN을 넘을 때) */
async function pickSlice(env, list) {
  if (list.length <= MAX_PER_RUN) return { slice: list, cursor: 0, partial: false };
  let cur = 0;
  try { cur = parseInt(await env.OQC.get("cursor"), 10) || 0; } catch (_) {}
  cur = ((cur % list.length) + list.length) % list.length;
  const slice = [];
  for (let i = 0; i < MAX_PER_RUN; i++) slice.push(list[(cur + i) % list.length]);
  await env.OQC.put("cursor", String((cur + MAX_PER_RUN) % list.length));
  return { slice, cursor: cur, partial: true };
}

/* ---------- 1단계: 일정 수집 (지도 제외) ----------
   520은 재시도가 아니라 세션이 좌우한다. 실패분을 모아 새 세션으로 넘기는 것을
   최대 MAX_SESSIONS회 반복한다. */
async function collectSchedule(env, forceBkgs = null, sharedBudget = null) {
  const budget = sharedBudget || newBudget();
  const list = await getList(env);
  const prev = await getSaved(env);
  const prevMap = new Map((prev && prev.shipments || []).map(s => [s.booking, s]));
  const discharged = new Set(
    [...prevMap.values()].filter(s => s.etaActual).map(s => s.booking)
  );

  /* forceBkgs: stale 재시도 모드 — 지정 부킹만, cursor 이동 없음 */
  let slice, cursor, partial;
  if (forceBkgs) {
    slice = forceBkgs.filter(b => !discharged.has(b));
    cursor = null; partial = false;
  } else {
    // 크론 실행 시 전체 부킹 재수집
    slice = list; cursor = 0; partial = false;
  }

  const activeSlice = slice.filter(b => !discharged.has(b));
  const skippedDischarged = slice.filter(b => discharged.has(b));

  const out = new Map(), errors = [];
  let pending = [...activeSlice], sessionsUsed = 0;
  const errMap = new Map();
  const sessionLogs = [];

  for (let round = 0; round < MAX_SESSIONS && pending.length; round++) {
    /* 남은 예산이 이번 라운드를 감당 못 하면 중단 */
    if (budget.left < pending.length * TRIES_PER_ITEM + 3) break;
    if (round) await sleep(5000);

    let session;
    try {
      session = await openSession(budget);
      sessionsUsed++;
    } catch (e) {
      errors.push(`Session ${round + 1} failed: ` + String(e.message || e));
      continue;                       // 다음 라운드에서 다시 시도
    }

    const stillFailing = [];
    for (const bkg of pending) {
      if (budget.left < 3) { stillFailing.push(bkg); continue; }
      try {
        const _html = await queryBooking(budget, session, bkg, TRIES_PER_ITEM);
        const _item = parseBooking(_html, bkg);
        const _loc = budget.lastCfRay ? (budget.lastCfRay.match(/-([A-Z]{3})\b/) || [])[1] || null : null;
        if (_loc) _item.successEdge = _loc;
        out.set(bkg, _item);
        sessionLogs.push({ ok: true, booking: bkg, attempt: round + 1, loc: _loc });
      } catch (e) {
        stillFailing.push(bkg);
        errMap.set(bkg, String(e.message || e));
        const _code = (String(e.message||e).match(/response\s+(\d{3})/) || [])[1] || null;
        const _loc = (String(e.message||e).match(/-([A-Z]{3})\b/) || [])[1] || null;
        sessionLogs.push({ ok: false, booking: bkg, attempt: round + 1, code: _code, loc: _loc });
        if (round === MAX_SESSIONS - 1 || budget.left < 6)
          errors.push(String(e.message || e));
      }
      await sleep(2000);
    }
    pending = stillFailing;
  }
  if (pending.length) errors.push("Unresolved: " + pending.join(", "));

  /* 세션 로그 저장 */
  if (sessionLogs.length) {
    appendSessionLog(env, sessionLogs.map(l => ({ ...l, tag: forceBkgs ? "retry" : "cron" }))).catch(() => {});
  }

  /* 이전 수집분 승계 — 지도 좌표, 이번에 안 돈 부킹, 실패 건, 완료 건 */
  /* prevMap은 위에서 이미 로드함 */
  const nowStr = new Date().toISOString().slice(0, 16).replace("T", " ") + "Z";

  for (const [bkg, item] of out) {
    const old = prevMap.get(bkg);
    if (old && old.route && old.container === item.container && mapFresh(old)) {
      item.route = old.route; item.names = old.names; item.namedPorts = old.namedPorts;
      item.idx = old.idx; item.ratio = old.ratio; item.mapAt = old.mapAt;
    }
    item.checkedAt = nowStr;
    item.scheduleCheckedAt = nowStr;  // 스케줄 수집 전용 시각 (mapAt과 구분)
  }
  const carried = [];
  for (const bkg of pending) {                       // 조회 실패 → 직전 값 유지
    const old = prevMap.get(bkg);
    if (old) {
      /* schedule:{bkg} 개별 KV도 확인 — /lookup(REFRESH) 결과가 더 최신일 수 있음 */
      const indivRaw = await env.OQC.get("schedule:" + bkg).catch(() => null);
      const indiv = indivRaw ? (() => { try { return JSON.parse(indivRaw); } catch(_) { return null; } })() : null;
      const indivAt = indiv ? (indiv.scheduleCheckedAt || indiv.checkedAt || null) : null;
      const baseAt = old.scheduleCheckedAt || old.checkedAt || null;
      const useIndiv = indivAt && (!baseAt || indivAt > baseAt);
      const best = useIndiv ? { ...old, ...indiv } : old;
      const schedErr = errMap.get(bkg);
      const carriedItem = { ...best, ...(schedErr ? { staleItem: true } : { staleItem: false }), scheduleError: schedErr || null };
      /* 이전 이벤트 기반으로 actual 플래그 재계산 — status 폴백 덕분에 etaActual도 복원됨 */
      Object.assign(carriedItem, computeActualFlags(carriedItem));
      out.set(bkg, carriedItem);
      carried.push(bkg);
    }
  }
  /* 하역 완료로 조회 제외된 부킹 — 이전 값 그대로 승계 (staleItem 없음) */
  for (const bkg of skippedDischarged) {
    if (prevMap.has(bkg)) out.set(bkg, prevMap.get(bkg));
  }
  for (const bkg of list) {                          // 이번 실행 대상이 아닌 부킹
    if (!out.has(bkg) && prevMap.has(bkg)) out.set(bkg, prevMap.get(bkg));
  }
  if (!out.size) throw new Error("All failed: " + errors.join(" | "));

  /* ---- 롤오버 · 지연 판정 + 스케줄 변경 이력 ---- */
  let planEta = {}, hist = {};
  try { planEta = JSON.parse((await env.OQC.get("poeta")) || "{}") || {}; } catch (_) {}
  try { hist    = JSON.parse((await env.OQC.get("history")) || "{}") || {}; } catch (_) {}
  let histDirty = false;

  for (const [bkg, item] of out) {
    if (item.staleItem) continue;
    const prevSnap = prevMap.get(bkg);
    if (prevSnap && prevSnap.delaySnapshotDone) {
      item.delaySnapshotDone = true;             // 저장 완료 여부 승계
      item.delayCompletedAt = prevSnap.delayCompletedAt || null;  // 완료 시각도 같이 승계
    }
    if (prevSnap && prevSnap.arrivalMailSent) {
      item.arrivalMailSent = true;               // 도착 메일 발송 여부 승계 (ratchet)
    }
    const ro = detectRollover(item);
    if (ro) {
      item.rollover = !!ro.rollover;
      if (ro.rollover) {
        item.rolloverDays = ro.overdueDays;
        item.rolloverNote = `${ro.vessel} ${ro.voyage || ""} ETD ${ro.plannedEtd} 경과, 선적 이벤트 없음`;
      }
    }
    const dv = delayVsPlan(item, planEta[bkg]);
    if (dv !== null) { item.planEta = planEta[bkg]; item.delayDays = dv; }
    const lvl = alertLevel(dv, ro);
    if (lvl) item.alert = lvl;

    /* 변경 이력 */
    const prevItem = prevMap.get(bkg);
    const ch = diffSchedule(prevItem, item);
    const log = hist[bkg] || (hist[bkg] = []);
    if (!log.length) {
      log.push({ at: nowStr, first: true, vessel: item.vessel, voyage: item.voyage,
                 polDep: item.polDep, tsArr: item.tsArr, tsDep: item.tsDep, eta: item.eta });
      histDirty = true;
    } else if (ch) {
      log.push({ at: nowStr, changes: ch });
      if (log.length > 40) log.splice(0, log.length - 40);
      histDirty = true;
      item.justChanged = ch;                     // 이번 수집에서 바뀐 항목
    }
    item.firstSeenEta = log[0] && log[0].eta ? log[0].eta : null;

    /* 이벤트 기반 actual 플래그 — 시간 경과가 아닌 HMM 이벤트 존재 여부로 판단 */
    Object.assign(item, computeActualFlags(item));

    /* delayHistory 백데이터 수집 — POD 하역완료 감지 시 1회만 저장 */
    if (!item.delaySnapshotDone) {
      try {
        const res = await recordDelaySnapshot(env, item, planEta, hist);
        if (res && res.done) {
          item.delaySnapshotDone = true;
          item.delayCompletedAt = res.completedAt || null;
        }
      } catch (e) { /* 백데이터 수집 실패가 본 기능을 막지 않도록 무시 */ }
    }
  }
  if (histDirty) await env.OQC.put("history", JSON.stringify(hist));

  /* ---- 완료 후 3일 유예 지난 부킹은 추적 목록에서 제거 (HMM 재조회 중단 + LIST/MAP 노출 종료) ----
     delayHistory에는 이미 영구 저장돼 있으므로 데이터 손실 없음. */
  const GRACE_MS = 3 * 24 * 3600 * 1000;
  const expired = new Set();
  for (const [bkg, item] of out) {
    if (!item.delayCompletedAt) continue;
    const norm = item.delayCompletedAt.length <= 10
      ? item.delayCompletedAt + "T00:00:00Z"
      : item.delayCompletedAt.replace(" ", "T") + (item.delayCompletedAt.includes("Z") ? "" : "Z");
    const t = Date.parse(norm);
    if (Number.isFinite(t) && (Date.now() - t) >= GRACE_MS) expired.add(bkg);
  }
  if (expired.size) {
    const trimmedList = list.filter(b => !expired.has(b));
    await env.OQC.put("bookings", JSON.stringify(trimmedList));
  }

  const shipments = list.map(b => out.get(b)).filter(Boolean).filter(s => !expired.has(s.booking));
  const fresh = slice.map(b => out.get(b)).filter(s => s && !s.staleItem);

  /* stale — 직전 수집이 6시간 이내면 판정하지 않는다 (수동 연속 실행 오판 방지) */
  let stale = false;
  if (prev && fresh.length) {
    const prevAt = Date.parse((prev.updated || "").replace(" ", "T").replace("Z", "") + "Z");
    const elapsedH = Number.isFinite(prevAt) ? (Date.now() - prevAt) / 3.6e6 : 99;
    if (elapsedH >= 6) {
      const key = s => s.map(x => x.booking + "|" + (x.eventStamp || x.stamp)).sort().join(",");
      const pf = (prev.shipments || []).filter(s => fresh.some(f => f.booking === s.booking));
      stale = pf.length === fresh.length && key(pf) === key(fresh);
    }
  }

  const payload = {
    updated: nowStr,
    source: "hmm21.com Track & Trace",
    tracked: list.length,
    requested: slice.length,
    ok: fresh.length,
    carried: carried,  // stale 부킹 목록
    missing: slice.filter(b => !out.has(b)),
    mapOk: shipments.filter(s => s.route).length,
    rollovers: shipments.filter(s => s.rollover).length,
    alerts: shipments.filter(s => s.alert === "alert").length,
    changed: shipments.filter(s => s.justChanged).map(s => s.booking),
    sessionsUsed,
    budgetUsed: budget.used,
    partial,                       // 부킹이 많아 이번 실행이 일부만 돌았는지
    cursor,
    stale,
    shipments,
    errors,
    budget
  };
  const MAP_KEYS = new Set(["route","names","mapAt","idx","ratio","namedPorts","mapError"]);
  const ACTUAL_KEYS = new Set(["etaActual","polDepActual","tsArrActual","tsDepActual"]);
  /* schedule:{bkg} 먼저 저장 — 원본 KV 우선
     actual 플래그 4개는 제외: assembleShipments에서 항상 재계산하므로 KV에 캐시하지 않음 */
  const scheduleResults = await Promise.allSettled(shipments.map(async s => {
    const schedData = Object.fromEntries(Object.entries(s).filter(([k]) => !MAP_KEYS.has(k) && !ACTUAL_KEYS.has(k)));
    await env.OQC.put("schedule:" + s.booking, JSON.stringify(schedData));
  }));
  scheduleResults.forEach((r, i) => {
    if (r.status === "rejected") {
      console.error("[collectSchedule] schedule save failed", shipments[i].booking, String(r.reason));
      errors.push("schedule save " + shipments[i].booking + ": " + String(r.reason && (r.reason.message || r.reason)));
    }
  });

  /* shipments 캐시 저장 — schedule 저장 후 */
  await env.OQC.put("shipments", JSON.stringify(payload));
  return payload;
}


/* ---------- 2단계: 지도 좌표 보충 ----------
   일정 수집과 동일하게 세션 중심으로 실패분을 넘긴다.
   forceBkg: 특정 부킹번호 배열 → mapFresh 무시하고 강제 재조회 */
async function collectMaps(env, forceBkg = []) {
  /* assembled.shipments 기준 — bookings + schedule:{bkg} + map:{bkg} 조립 결과 사용
     collectMaps()는 shipments KV를 읽지도, 쓰지도 않는다.
     지도 수집 결과는 map:{bkg}에만 저장한다. */
  const assembled = await assembleShipments(env);
  const shipments = assembled.shipments;
  if (!shipments.length)
    throw new Error("No schedule data collected yet. Run /collect first.");

  const budget = newBudget();
  const errors = [];
  const forceSet = new Set(forceBkg.map(b => b.trim().toUpperCase()));
  const byBkg = new Map(shipments.map(s => [s.booking, s]));
  const MAP_FIELDS = new Set(["route","names","mapAt","idx","ratio","namedPorts"]);
  const MAP_FIELDS_SAVE = new Set(["route","names","mapAt","idx","ratio","namedPorts","mapError"]);

  /* 수집 대상: etaActual 아닌 것 중 강제 대상이거나 지도 미보유/만료된 것
     spDep(Gate In) 없는 부킹은 아직 출발 전이므로 지도 수집 제외 */
  let pending = shipments
    .filter(s => !s.etaActual && !!s.spDep && (forceSet.size ? forceSet.has(s.booking) : (!s.route || s.mapError || !mapFresh(s))))
    .map(s => s.booking)
    .slice(0, MAX_PER_RUN);
  if (!pending.length) return {
    mapNote: "보충할 지도 없음",
    mapOk: shipments.filter(s => s.route).length,
    mapErrors: [],
    sessionsUsedMaps: 0,
    budgetUsedMaps: 0
  };

  let sessionsUsed = 0;
  for (let round = 0; round < MAX_SESSIONS && pending.length; round++) {
    if (budget.left < pending.length * TRIES_PER_ITEM + 3) break;
    if (round) await sleep(5000);

    let session;
    try { session = await openSession(budget); sessionsUsed++; }
    catch (e) { errors.push(`Session ${round + 1} failed: ` + String(e.message || e)); continue; }

    const stillFailing = [];
    for (const bkg of pending) {
      const item = byBkg.get(bkg);
      if (!item || budget.left < 3) { stillFailing.push(bkg); continue; }
      try {
        /* 지도 결과만 item에 반영 — 스케줄/stale 필드는 건드리지 않는다 */
        const mapResult = await fetchMap(budget, session, bkg, item.container, TRIES_PER_ITEM);
        for (const key of MAP_FIELDS) {
          if (Object.prototype.hasOwnProperty.call(mapResult, key)) {
            item[key] = mapResult[key];
          }
        }
        delete item.mapError;
      } catch (e) {
        stillFailing.push(bkg);
        /* 기존 route가 있으면 mapError 쓰지 않음 — ok 상태 유지 */
        if (!item.route) {
          item.mapError = String(e.message || e);
        }
        if (round === MAX_SESSIONS - 1) errors.push(String(e.message || e));
      }
      await sleep(2000);
    }
    pending = stillFailing;
  }

  /* map:{bkg}만 저장 — shipments KV는 절대 PUT하지 않는다 */
  const mapWriteTargets = shipments.filter(s => !s.etaActual && (s.route || s.mapError));
  const mapWriteResults = await Promise.allSettled(
    mapWriteTargets.map(async s => {
      const mapData = Object.fromEntries(
        Object.entries(s).filter(([k]) => MAP_FIELDS_SAVE.has(k) || k === "booking")
      );
      await env.OQC.put("map:" + s.booking, JSON.stringify(mapData));
    })
  );
  mapWriteResults.forEach((r, i) => {
    const bkg = mapWriteTargets[i]?.booking;
    if (r.status === "rejected") {
      console.error("[collectMaps] map save failed", bkg, String(r.reason));
      errors.push("map save " + (bkg||"?") + ": " + String(r.reason && (r.reason.message || r.reason)));
    }
  });

  return {
    mapOk: shipments.filter(s => s.route).length,
    mapErrors: errors,
    sessionsUsedMaps: sessionsUsed,
    budgetUsedMaps: budget.used,
    mapUpdated: new Date().toISOString().slice(0, 16).replace("T", " ") + "Z"
  };
}

/* ---------- 라우팅 ---------- */
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, X-Refresh-Key",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
};
const JH = { "Content-Type": "application/json; charset=utf-8", ...CORS };
const json = (o, s = 200) => new Response(JSON.stringify(o, null, 1), { status: s, headers: JH });
const auth = (req, env) => req.headers.get("X-Refresh-Key") === env.REFRESH_KEY;
const BKG_RE = /^[A-Z]{4}\d{8}$/;
const stampNow = () => new Date().toISOString();

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

    if (url.pathname === "/data") {
      const assembled = await assembleShipments(env);
      const saved = assembled.saved;

      if (!saved && !assembled.shipments.length) {
        let lastrun = null;
        try { lastrun = await readJsonKV(env, "lastrun", null); } catch (_) {}
        return json({ error: "No data collected yet.", lastrun,
          hint: lastrun ? "check lastrun.error" : "Cron has not run yet." }, 404);
      }

      const data = {
        ...(saved || {}),
        shipments: assembled.shipments,
        tracked: assembled.shipments.length
      };
      return new Response(JSON.stringify(data), { headers: JH });
    }

    if (url.pathname === "/lookup") {
      const bkg = (url.searchParams.get("bkg") || "").trim().toUpperCase();
      if (!BKG_RE.test(bkg)) return json({ error: "Invalid booking number format (e.g. KULM68088700)" }, 400);
      try {
        const budget = newBudget();
let one = null, lastErr = null;
/* 세션 10번 × 조회 1번 — 다른 엣지를 만날 확률 최대화 */
for (let s = 0; s < 10 && !one; s++) {
  let session;
  try { session = await openSession(budget); } catch (e) { lastErr = String(e.message||e); continue; }
  try { const _h = await queryBooking(budget, session, bkg, 1); one = parseBooking(_h, bkg); if (budget.lastCfRay) one.successEdge = (budget.lastCfRay.match(/-([A-Z]{3})\b/) || [])[1] || null; } catch (e) { lastErr = String(e.message||e); continue; }
}
if (!one) return json({ error: "Failed to fetch booking after 10 session attempts", hint: lastErr }, 502);
        /* /lookup은 스케줄만 조회 — 맵 fetch 제거 (맵은 MAP REFRESH 버튼으로만) */

        const known = await getList(env);
        const isNew = !known.includes(bkg);

        /* 다음 Cron을 기다리지 않고 저장분에도 바로 반영한다 */
        const nowStr = new Date().toISOString().slice(0, 16).replace("T", " ") + "Z";
        one.checkedAt = nowStr;
        one.scheduleCheckedAt = nowStr;
        /* collectSchedule과 동일한 normalize 경로로 처리 */
        one = await normalizeOne(env, one);
        try {
          /* schedule:{bkg}에 스케줄 필드만 저장 — 지도 필드 제외 */
          const _MAP_KEYS = new Set(["route","names","mapAt","idx","ratio","namedPorts","mapError"]);
          const _ACTUAL_KEYS = new Set(["etaActual","polDepActual","tsArrActual","tsDepActual"]);
          const schedOnly = Object.fromEntries(Object.entries(one).filter(([k]) => !_MAP_KEYS.has(k) && !_ACTUAL_KEYS.has(k)));
          await env.OQC.put("schedule:" + bkg, JSON.stringify(schedOnly));
          one.savedToData = true;

          /* 스케줄 이력에도 첫 관측을 남긴다 */
          let hist = {};
          try { hist = JSON.parse((await env.OQC.get("history")) || "{}") || {}; } catch (_) {}
          if (!hist[bkg] || !hist[bkg].length) {
            hist[bkg] = [{ at: one.checkedAt, first: true, vessel: one.vessel, voyage: one.voyage,
                           polDep: one.polDep, tsArr: one.tsArr, tsDep: one.tsDep, eta: one.eta }];
            await env.OQC.put("history", JSON.stringify(hist));
          }

          /* schedule 저장 성공 후 bookings 목록에 등록 */
          if (isNew) {
            known.push(bkg);
            await env.OQC.put("bookings", JSON.stringify(known));
            one.added = true;
          }
        } catch (e) {
          console.error("[/lookup] schedule save failed", bkg, String(e.message || e));
          one.saveWarn = String(e.message || e);   // 조회 결과 자체는 살려서 반환
        }
        return json(one);
      } catch (e) {
        return json({ error: String(e.message || e), booking: bkg }, 502);
      }
    }

    if (url.pathname === "/bookings") {
      if (req.method === "GET") return json({ bookings: await getList(env) });
      if (req.method === "POST") {
        if (!auth(req, env)) return json({ error: "Authentication failed" }, 401);
        let body;
        try { body = await req.json(); } catch (_) { return json({ error: "JSON parse failed" }, 400); }
        const list = (body.bookings || []).map(b => String(b).trim().toUpperCase());
        const bad = list.filter(b => !BKG_RE.test(b));
        if (bad.length) return json({ error: "Format error: " + bad.join(",") }, 400);
        const uniq = [...new Set(list)];
        await env.OQC.put("bookings", JSON.stringify(uniq));
        return json({ bookings: uniq });
      }
    }

    /* --- PO / 컨테이너 매핑 --- */
    if (url.pathname === "/po") {
      if (req.method === "GET") {
        let po = {}, eta = {}, photos = {};
        try { po     = JSON.parse((await env.OQC.get("pomap"))   || "{}") || {}; } catch (_) {}
        try { eta    = JSON.parse((await env.OQC.get("poeta"))   || "{}") || {}; } catch (_) {}
        try { photos = JSON.parse((await env.OQC.get("pophoto")) || "{}") || {}; } catch (_) {}
        /* 최상위에 부킹 키를 그대로 두어 구버전 클라이언트와 호환 */
        return json({ ...po, po, eta, photos });
      }
      if (req.method === "POST") {
        if (!auth(req, env)) return json({ error: "Authentication failed" }, 401);
        let body;
        try { body = await req.json(); } catch (_) { return json({ error: "JSON parse failed" }, 400); }
        const inPo  = body && body.po;
        const inEta = (body && body.eta) || {};
        if (!inPo || typeof inPo !== "object" || Array.isArray(inPo))
          return json({ error: "po object is required" }, 400);

        const inPhotos = (body && body.photos) || {};
        let po = {}, eta = {}, photos = {};
        if (body.mode !== "replace") {
          try { po     = JSON.parse((await env.OQC.get("pomap"))   || "{}") || {}; } catch (_) {}
          try { eta    = JSON.parse((await env.OQC.get("poeta"))   || "{}") || {}; } catch (_) {}
          try { photos = JSON.parse((await env.OQC.get("pophoto")) || "{}") || {}; } catch (_) {}
        }
        const bad = [];
        for (const k of Object.keys(inPo)) {
          const key = String(k).trim().toUpperCase();
          if (!BKG_RE.test(key)) { bad.push(key); continue; }
          const list = Array.isArray(inPo[k]) ? inPo[k].map(String).slice(0, 500) : null;
          /* 빈 배열은 "PO 없이 원 스케줄만 등록"하는 경우다 — 기존 PO와 eta를 지우지 않는다.
             실제 삭제는 mode:"replace"로 처리한다. */
          if (!list || !list.length) continue;
          po[key] = list;
        }
        for (const k of Object.keys(inEta)) {
          const key = String(k).trim().toUpperCase();
          if (!BKG_RE.test(key)) continue;
          const d = String(inEta[k]).trim();
          if (/^\d{4}-\d{2}-\d{2}$/.test(d)) eta[key] = d; else if (!d) delete eta[key];
        }
        /* 로트별 사진 링크: 로트코드 → pCloud 공개 코드 */
        for (const k of Object.keys(inPhotos)) {
          const lot = String(k).trim().toUpperCase();
          const code = String(inPhotos[k] || "").trim();
          if (!lot) continue;
          if (!code) { delete photos[lot]; continue; }
          if (/^[A-Za-z0-9_-]{10,80}$/.test(code)) photos[lot] = code;
        }

        if (bad.length) return json({ error: "Invalid booking number format: " + bad.join(",") }, 400);

        const size = JSON.stringify(po).length + JSON.stringify(eta).length + JSON.stringify(photos).length;
        if (size > 900000) return json({ error: "Mapping payload too large (" + size + "B)" }, 413);
        await env.OQC.put("pomap", JSON.stringify(po));
        await env.OQC.put("poeta", JSON.stringify(eta));
        await env.OQC.put("pophoto", JSON.stringify(photos));
        return json({ ok: true, bookings: Object.keys(po).length, bytes: size, po, eta, photos });
      }
    }

    /* --- 스케줄 변경 이력 --- */
    if (url.pathname === "/history") {
      const v = await env.OQC.get("history");
      const all = v ? JSON.parse(v) : {};
      const bkg = (url.searchParams.get("bkg") || "").trim().toUpperCase();
      return json(bkg ? { booking: bkg, log: all[bkg] || [] } : all);
    }

    /* --- 지연 백데이터 조회 (진단/확인용, 화면 미연동) --- */
    if (url.pathname === "/delayhistory") {
      const month = (url.searchParams.get("month") || "").trim();  // YYYY-MM
      if (month) {
        let arr = [];
        try { arr = JSON.parse((await env.OQC.get("delayHistory:" + month)) || "[]") || []; } catch (_) {}
        return json({ month, count: arr.length, records: arr });
      }
      /* 월 지정 없으면 존재하는 월 키 목록만 (list 비용 절약) */
      /* cursor pagination — 키가 많아져도 전체 목록 수집 */
      const allDHKeys = [];
      let dhCursor = undefined, dhComplete = false;
      while (!dhComplete) {
        const dhRes = await env.OQC.list({ prefix: "delayHistory:", ...(dhCursor ? { cursor: dhCursor } : {}) });
        allDHKeys.push(...dhRes.keys);
        if (dhRes.list_complete) { dhComplete = true; }
        else { dhCursor = dhRes.cursor; }
      }
      return json({ months: allDHKeys.map(k => k.name.replace("delayHistory:", "")) });
    }

    /* --- 지연 백데이터 수동 입력 (사이트 추적 이전에 진행됐던 과거 건 소급 등록용) ---
       POST body: { records: [{ booking, pol, pod, vessel, voyage, planEta, actualEta, rollover, polDep }, ...] }
       delayDays/planMonth/polDepMonth/completedAt은 서버가 자동 계산. 중복 booking은 skip. */
    if (url.pathname === "/delayhistory/manual" && req.method === "POST") {
      if (!auth(req, env)) return json({ error: "Authentication failed" }, 401);
      let body;
      try { body = await req.json(); } catch (_) { return json({ error: "JSON parse failed" }, 400); }
      const records = Array.isArray(body.records) ? body.records : [];
      const results = [];
      for (const r of records) {
        const booking = String(r.booking || "").trim().toUpperCase();
        if (!booking || !r.planEta || !r.actualEta) {
          results.push({ booking, saved: false, reason: "필수값 누락(booking/planEta/actualEta)" });
          continue;
        }
        const plan = Date.parse(r.planEta + "T00:00:00Z");
        const real = Date.parse(r.actualEta + "T00:00:00Z");
        if (!Number.isFinite(plan) || !Number.isFinite(real)) {
          results.push({ booking, saved: false, reason: "날짜 형식 오류" });
          continue;
        }
        const delayDays = Math.round((real - plan) / dayMs);
        const planMonth = monthOf(r.planEta);
        const polDepMonth = monthOf(r.polDep);
        const key = "delayHistory:" + planMonth;
        let arr = [];
        try { arr = JSON.parse((await env.OQC.get(key)) || "[]") || []; } catch (_) { arr = []; }
        if (arr.some(x => x.booking === booking)) {
          results.push({ booking, saved: false, reason: "이미 존재" });
          continue;
        }
        arr.push({
          booking, pol: r.pol || null, pod: r.pod || null,
          vessel: r.vessel || null, voyage: r.voyage || null,
          planEta: r.planEta, actualEta: r.actualEta, delayDays,
          rollover: !!r.rollover, polDep: r.polDep || null,
          planMonth, polDepMonth,
          completedAt: r.actualEta + "T00:00", manual: true,
          legBreakdown: Array.isArray(r.legBreakdown) ? r.legBreakdown : null
        });
        await env.OQC.put(key, JSON.stringify(arr));
        results.push({ booking, saved: true, delayDays, planMonth });
      }
      return json({ results });
    }

    /* --- 알림 테스트 / 상태 확인 --- */
    if (url.pathname === "/notify-test") {
      if (!auth(req, env)) return json({ error: "Authentication failed" }, 401);
      const saved = await getSaved(env);
      const list = (saved && saved.shipments || []).filter(s => s.alert && s.alert !== "ok");
      const res = await sendMail(env, "[TEST] HMM 선적 지연 알림 테스트",
        mailBody(list.length ? list : (saved && saved.shipments || []).slice(0, 2),
                 (saved && saved.updated) || "-"));
      return json({ to: env.ALERT_TO || null, from: env.ALERT_FROM || "default",
                    candidates: list.map(s => s.booking), ...res });
    }
    if (url.pathname === "/alertstate") {
      const v = await env.OQC.get("alertstate");
      return new Response(v || "{}", { headers: JH });
    }

    /* --- pCloud 공개 폴더 프록시 ---
       ?code=      공개 링크 코드
       ?folder=    하위 폴더 이름 (컨테이너 폴더). 없으면 최상위 목록
       showpublink 는 폴더 트리를 통째로 주므로 재귀로 찾는다. */
    if (url.pathname === "/pcloud") {
      const code = (url.searchParams.get("code") || "").trim();
      if (!/^[A-Za-z0-9_-]{10,80}$/.test(code)) return json({ error: "Invalid code format" }, 400);
      const want = (url.searchParams.get("folder") || "").trim().toUpperCase();
      try {
        const r = await fetch("https://api.pcloud.com/showpublink?code=" + encodeURIComponent(code),
          { headers: { "User-Agent": UA, "Accept": "application/json" } });
        if (!r.ok) return json({ error: "pCloud response " + r.status }, 502);
        const j = await r.json();
        if (j.result !== 0) return json({ error: "pCloud error " + j.result + " " + (j.error || "") }, 502);

        const root = j.metadata || {};
        /* 이름으로 폴더를 재귀 탐색 */
        const findFolder = (node, name) => {
          for (const c of (node.contents || [])) {
            if (!c.isfolder) continue;
            if (String(c.name).trim().toUpperCase() === name) return c;
            const deep = findFolder(c, name);
            if (deep) return deep;
          }
          return null;
        };

        const target = want ? findFolder(root, want) : root;
        if (!target) return json({ error: 'Folder "' + want + '" not found', folder: root.name || null }, 404);

        const byName = (a, b) => String(a.name).localeCompare(String(b.name), undefined, { numeric: true });
        const kids = target.contents || [];
        const folders = kids.filter(f => f.isfolder)
          .map(f => ({ folderid: f.folderid, name: f.name })).sort(byName);
        const files = kids.filter(f => !f.isfolder && /^image\//i.test(f.contenttype || ""))
          .map(f => ({ fileid: f.fileid, name: f.name, width: f.width, height: f.height })).sort(byName);

        return new Response(JSON.stringify({
          folder: target.name || null, folderid: target.folderid || null,
          folders, folderCount: folders.length, count: files.length, files
        }), { headers: { ...JH, "Cache-Control": "public, max-age=600" } });
      } catch (e) {
        return json({ error: String(e.message || e) }, 502);
      }
    }

    if (url.pathname === "/raw") {
      const bkg = (url.searchParams.get("bkg") || BOOKINGS[0]).trim().toUpperCase();
      if (!BKG_RE.test(bkg)) return json({ error: "Invalid booking number format" }, 400);
      try {
        const budget = newBudget();
        const session = await openSession(budget);
        const html = await queryBooking(budget, session, bkg, 5);
        const t = strip(html);
        if (url.searchParams.get("full"))
          return new Response(t, { headers: { "Content-Type": "text/plain; charset=utf-8", ...CORS } });
        let parsed = null, perr = null;
        try { parsed = parseBooking(html, bkg); } catch (e) { perr = String(e.message || e); }
        return json({ booking: bkg, htmlLen: html.length, textLen: t.length,
          budgetUsed: budget.used, parseError: perr, parsed });
      } catch (e) {
        return json({ error: String(e.message || e), booking: bkg }, 502);
      }
    }

    if (url.pathname === "/debug") {
      const out = { at: stampNow() };
      const budget = newBudget(10);
      try {
        const r = await fetch(PAGE, { headers: PAGE_HEADERS });
        const body = await r.text();
        Object.assign(out, {
          status: r.status,
          cfRay: r.headers.get("cf-ray"),
          colo: (r.headers.get("cf-ray") || "").split("-")[1] || null,
          length: body.length,
          hasCsrf: /name="_csrf"/.test(body)
        });
      } catch (e) { out.fetchError = String(e.message || e); }
      try { const sess = await openSession(budget); out.session = !!sess.csrf; out.sessionCookie = sess.cookie; }
      catch (e) { out.sessionError = String(e.message || e); }
      out.budgetUsed = budget.used;
      try { out.lastrun = JSON.parse((await env.OQC.get("lastrun")) || "null"); } catch (_) {}
      try { out.sessionLog = await env.OQC.get("sessionLog"); } catch (_) {}
      return json(out);
    }

    if (url.pathname === "/collect" && req.method === "POST") {
      if (!auth(req, env)) return json({ error: "Authentication failed" }, 401);
      const maps = url.searchParams.get("maps") === "1";
      /* bkg 파라미터: 쉼표 구분 또는 단일 부킹번호 → forceBkg로 mapFresh 무시 강제 재조회 */
      const bkgParam = url.searchParams.get("bkg") || "";
      const forceBkg = bkgParam ? bkgParam.split(",").map(b => b.trim()).filter(Boolean) : [];
      const trigger = maps ? (forceBkg.length ? "manual-maps-force" : "manual-maps") : "manual";
      try {
        const p = maps ? await collectMaps(env, forceBkg) : await collectSchedule(env);
        await env.OQC.put("lastrun", JSON.stringify({
          at: stampNow(), trigger, ok: true,
          count: p.ok, mapOk: p.mapOk, carried: p.carried,
          budgetUsed: maps ? p.budgetUsedMaps : p.budgetUsed,
          errors: maps ? p.mapErrors : p.errors
        }));
        return json(p);
      } catch (e) {
        await env.OQC.put("lastrun", JSON.stringify({
          at: stampNow(), trigger, ok: false, error: String(e.message || e)
        }));
        return json({ error: String(e.message || e) }, 502);
      }
    }

    if (url.pathname === "/errorlog") {
      if (!auth(req, env)) return json({ error: "Authentication failed" }, 401);
      const raw = await env.OQC.get("errorLog");
      const log = raw ? JSON.parse(raw) : [];
      return json({ count: log.length, log: [...log].reverse() });
    }

    /* ── /backup : KV 전체 스냅샷 반환 (GitHub Actions 주간 백업용, X-Refresh-Key 인증) ── */
    if (url.pathname === "/backup") {
      if (!auth(req, env)) return json({ error: "Authentication failed" }, 401);
      const keys = ["shipments","bookings","pomap","poeta","pophoto","history","alertstate","lastrun","cursor","sessionLog"];
      const kv = {};
      for (const k of keys) {
        const v = await env.OQC.get(k, "text");
        if (v !== null) try { kv[k] = JSON.parse(v); } catch { kv[k] = v; }
      }
      /* delayHistory:YYYY-MM, schedule:{bkg}, map:{bkg} 키도 수집 — cursor pagination */
      for (const prefix of ["delayHistory:", "schedule:", "map:"]) {
        let bCursor = undefined, bComplete = false;
        while (!bComplete) {
          const bRes = await env.OQC.list({ prefix, ...(bCursor ? { cursor: bCursor } : {}) });
          for (const item of bRes.keys) {
            const v = await env.OQC.get(item.name, "text");
            if (v !== null) try { kv[item.name] = JSON.parse(v); } catch { kv[item.name] = v; }
          }
          if (bRes.list_complete) { bComplete = true; }
          else { bCursor = bRes.cursor; }
        }
      }
      return json({ backupAt: stampNow(), kv });
    }

    /* ── /restore : 날짜 지정 → GitHub에서 백업 fetch → KV 복원 (X-Refresh-Key 인증) ── */
    if (url.pathname === "/restore" && req.method === "POST") {
      if (!auth(req, env)) return json({ error: "Authentication failed" }, 401);
      let body;
      try { body = await req.json(); } catch { return json({ error: "JSON parse failed" }, 400); }
      const date = (body.date || "").trim(); // "YYYY-MM-DD" 형식
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ error: "date must be YYYY-MM-DD" }, 400);

      /* GitHub raw URL — public 리포이므로 토큰 불필요 */
      const rawUrl = `https://raw.githubusercontent.com/donghoon2661-prog/q-report/main/backups/backup-${date}.json`;
      const ghRes = await fetch(rawUrl);
      if (!ghRes.ok) return json({ error: `Backup file not found for ${date} (HTTP ${ghRes.status})` }, 404);

      let backup;
      try { backup = await ghRes.json(); } catch { return json({ error: "Backup file is not valid JSON" }, 502); }
      const kv = backup.kv || backup; // backupAt 래퍼 있을 수도 없을 수도

      /* 복원 대상 키 (shipments는 /collect로 재수집하므로 제외) */
      const RESTORE_KEYS = ["bookings","pomap","poeta","pophoto","history","alertstate","cursor"];
      const restored = [], skipped = [];
      for (const k of RESTORE_KEYS) {
        if (kv[k] !== undefined) {
          await env.OQC.put(k, JSON.stringify(kv[k]));
          restored.push(k);
        } else { skipped.push(k); }
      }
      /* delayHistory:YYYY-MM, schedule:{bkg}, map:{bkg} 키 복원 */
      for (const [k, v] of Object.entries(kv)) {
        if (k.startsWith("delayHistory:") || k.startsWith("schedule:") || k.startsWith("map:")) {
          await env.OQC.put(k, JSON.stringify(v));
          restored.push(k);
        }
      }
      return json({ ok: true, restoredFrom: date, restored, skipped,
        note: "shipments not restored — run POST /collect to rebuild shipments cache",
        postRestoreAction: "Run POST /collect after restore to rebuild shipments cache" });
    }

    return json({ error: "Not found",
      paths: ["/data", "/lookup?bkg=", "/bookings", "/po", "/pcloud?code=", "/history", "/alertstate", "/notify-test", "/collect", "/collect?maps=1", "/backup", "/restore", "/raw?bkg=", "/debug"] }, 404);
  },

  /* Cron — 분(minute)으로 종류를 구분한다.
     일정 수집:   0 *\/3 * * *      (3시간마다 정각, 하루 8회)
     지도 수집:  10 *\/3 * * *      (3시간마다 10분, 하루 8회)
     stale retry: 15,45 * * * *   (매 시 15분·45분, 하루 40회) */
  async scheduled(evt, env, ctx) {
    const cron = evt.cron || "";
    const cronMin = parseInt((cron.match(/^\s*(\d+)/) || [])[1] ?? "99", 10);
    const isMaps = cronMin === 10;
    const isStaleRetry = cronMin === 15 || cronMin === 45;
    const trigger = isMaps ? "cron-maps" : isStaleRetry ? "cron-stale" : "cron";

    ctx.waitUntil((async () => {

      /* ── stale retry ── */
      if (isStaleRetry) {
        /* 최근 15분 이내 전체 수집이 있었으면 skip */
        const lastrunRaw = await env.OQC.get("lastrun").catch(() => null);
        const lastrun = lastrunRaw ? (() => { try { return JSON.parse(lastrunRaw); } catch(_) { return {}; } })() : {};
        if (lastrun.trigger === "cron" && lastrun.at && (Date.now() - new Date(lastrun.at).getTime()) < 15 * 60 * 1000) {
          return;
        }
        const saved = await getSaved(env);
        if (!saved || !Array.isArray(saved.shipments) || !saved.shipments.length) return;

        const shipments = saved.shipments;

        /* 스케줄 실패 부킹 재시도 */
        const schedFail = shipments.filter(s => s.staleItem).map(s => s.booking);
        if (schedFail.length) {
          try {
            const r = await collectSchedule(env, schedFail);
            const errs = (r.errors || []).map(msg => ({ tag: "cron-stale", msg }));
            if (errs.length) await appendErrorLog(env, errs);
          } catch (_) {}
        }

        /* 지도 실패 부킹 재시도 */
        const mapFail = shipments.filter(s => !s.etaActual && (s.mapError || !s.route || !s.route.length));
        if (mapFail.length) {
          try {
            const forceBkg = mapFail.map(s => s.booking);
            await collectMaps(env, forceBkg);
          } catch (_) {}
        }

        await env.OQC.put("lastrun", JSON.stringify({
          at: stampNow(), trigger, cron,
          schedRetry: schedFail.length, mapRetry: mapFail.length
        }));
        return;
      }

      /* ── 일정 수집 또는 지도 수집 ── */
      const p = await (isMaps ? collectMaps(env) : collectSchedule(env));
      if (!isMaps) {
        const cronErrs = (p.errors || []).map(msg => ({ tag: "cron", msg }));
        if (cronErrs.length) await appendErrorLog(env, cronErrs);
        /* 알림 메일 */
        const saved = await getSaved(env);
        if (saved) await notifyIfNeeded(env, saved).catch(() => {});
        if (saved) await notifyArrivalIfNeeded(env, saved).catch(() => {});
      }
      await env.OQC.put("lastrun", JSON.stringify({
        at: stampNow(), trigger, cron, ok: true,
        count: p.ok, mapOk: p.mapOk,
        carried: Array.isArray(p.carried) ? p.carried.length : (p.carried || 0),
        budgetUsed: isMaps ? p.budgetUsedMaps : p.budgetUsed,
        errors: isMaps ? p.mapErrors : p.errors
      }));

    })().catch(e => env.OQC.put("lastrun", JSON.stringify({
      at: stampNow(), trigger, cron, ok: false, error: String(e.message || e)
    }))));
  }
};

/* ---------- 에러 로그 누적 ----------
   [cron] / [retry-N] 태그만 저장. [manual] REFRESH는 저장 안 함.
   KV "errorLog" 에 최대 50개 유지 (7일 TTL). */
async function appendErrorLog(env, entries) {
  if (!entries || !entries.length) return;
  const kst = t => {
    const d = new Date(typeof t === "number" ? t : Date.now());
    return new Date(d.getTime() + 9 * 3600 * 1000).toISOString().slice(11, 19);
  };
  const newRows = entries.map(e => ({ t: kst(), tag: e.tag, msg: e.msg }));
  let existing = [];
  try { existing = JSON.parse(await env.OQC.get("errorLog") || "[]"); } catch (_) {}
  const combined = [...existing, ...newRows].slice(-50);
  await env.OQC.put("errorLog", JSON.stringify(combined), { expirationTtl: 7 * 24 * 3600 }).catch(() => {});
}

/* ---------- 세션 로그 (성공/실패 모두 기록) ----------
   KV "sessionLog" 에 최대 200개 유지 (14일 TTL)
   { t, date, ok, tag, booking, attempt, code, loc } */
async function appendSessionLog(env, entries) {
  if (!entries || !entries.length) return;
  const now = new Date(Date.now() + 9 * 3600 * 1000);
  const date = now.toISOString().slice(5, 10).replace('-', '/'); // MM/DD
  const time = now.toISOString().slice(11, 16);                  // HH:MM
  const newRows = entries.map(e => ({
    t: Date.now(), date, time,
    ok: e.ok,
    tag: e.tag || 'cron',
    booking: e.booking,
    attempt: e.attempt || 1,
    code: e.code || null,
    loc: e.loc || null
  }));
  let existing = [];
  try { existing = JSON.parse(await env.OQC.get("sessionLog") || "[]"); } catch (_) {}
  const combined = [...existing, ...newRows].slice(-200);
  await env.OQC.put("sessionLog", JSON.stringify(combined), { expirationTtl: 14 * 24 * 3600 }).catch(() => {});
}


