/* holidays.js — 공휴일 정적 데이터
   CALENDAR 표시 전용. KV / shipments / Worker 무관.

   출처:
   KR: law.go.kr (관보 기준), publicholidays.co.kr
   MY: 말레이시아 총리부 공식 자료 HKA-2026.pdf / HKA-2027 (연방 공휴일만)
   US: OPM (Office of Personnel Management) 공식 스케줄

   * 표시: 이슬람력 기반, 날짜 변동 가능
   매년 연초에 해당 연도 데이터 추가.

   getHolidays(dateStr) → 해당 날짜 공휴일 배열 반환
   예: getHolidays("2026-08-25")
       → [{ country: "MY", flag: "🇲🇾", name: "Maulidur Rasul" }]
*/

const HOLIDAYS = {

  /* ── 한국 국경일 / 공휴일 ──
     대체공휴일 포함 (관보 기준)                    */
  KR: {
    /* 2026 */
    "2026-01-01": "신정",
    "2026-02-16": "설날 연휴",
    "2026-02-17": "설날",
    "2026-02-18": "설날 연휴",
    "2026-03-01": "삼일절",
    "2026-03-02": "삼일절 대체공휴일",
    "2026-05-05": "어린이날",
    "2026-05-24": "부처님오신날",
    "2026-05-25": "부처님오신날 대체공휴일",
    "2026-06-03": "지방선거일",
    "2026-06-06": "현충일",
    "2026-08-15": "광복절",
    "2026-08-17": "광복절 대체공휴일",
    "2026-09-24": "추석 연휴",
    "2026-09-25": "추석",
    "2026-09-26": "추석 연휴",
    "2026-10-03": "개천절",
    "2026-10-05": "개천절 대체공휴일",
    "2026-10-09": "한글날",
    "2026-12-25": "크리스마스",

    /* 2027 */
    "2027-01-01": "신정",
    "2027-02-06": "설날 연휴",
    "2027-02-07": "설날",
    "2027-02-08": "설날 연휴",
    "2027-03-01": "삼일절",
    "2027-05-05": "어린이날",
    "2027-05-20": "부처님오신날",
    "2027-06-06": "현충일",
    "2027-08-15": "광복절",
    "2027-10-02": "추석 연휴",
    "2027-10-03": "개천절 / 추석",
    "2027-10-04": "추석 연휴",
    "2027-10-09": "한글날",
    "2027-12-25": "크리스마스"
  },

  /* ── 말레이시아 연방 공휴일 (Federal Holidays)
     출처: 말레이시아 총리부 공식 자료
     2026: HKA-2026.pdf 확정본
     2027: 총리부 공식 발표 (2026년 8월 게시)
     * 이슬람력 기반 항목은 날짜 변동 가능           */
  MY: {
    /* 2026 */
    "2026-02-17": "Chinese New Year",
    "2026-02-18": "Chinese New Year (Day 2)",
    "2026-03-21": "Hari Raya Puasa",        /* * */
    "2026-03-22": "Hari Raya Puasa (Day 2)",/* * */
    "2026-05-01": "Labour Day",
    "2026-05-27": "Hari Raya Qurban",       /* * */
    "2026-05-31": "Wesak Day",
    "2026-06-01": "Yang di-Pertuan Agong Birthday",
    "2026-06-17": "Awal Muharram",          /* * */
    "2026-08-25": "Maulidur Rasul",         /* * */
    "2026-08-31": "National Day",
    "2026-09-16": "Malaysia Day",
    "2026-11-08": "Deepavali",              /* * */
    "2026-12-25": "Christmas Day",

    /* 2027 */
    "2027-02-06": "Chinese New Year",
    "2027-02-07": "Chinese New Year (Day 2)",
    "2027-03-10": "Hari Raya Puasa",        /* * */
    "2027-03-11": "Hari Raya Puasa (Day 2)",/* * */
    "2027-05-01": "Labour Day",
    "2027-05-17": "Hari Raya Qurban",       /* * */
    "2027-05-20": "Wesak Day",
    "2027-06-06": "Awal Muharram",          /* * */
    "2027-06-07": "Yang di-Pertuan Agong Birthday",
    "2027-08-31": "National Day",
    "2027-09-16": "Malaysia Day",
    "2027-12-25": "Christmas Day"
  },

  /* ── 미국 연방 공휴일 (Federal Holidays)
     출처: OPM (Office of Personnel Management) 공식 스케줄
     https://www.opm.gov/Operating_Status_Schedules/fedhol   */
  US: {
    /* 2026 */
    "2026-01-01": "New Year's Day",
    "2026-01-19": "Martin Luther King Jr. Day",
    "2026-02-16": "Washington's Birthday",
    "2026-05-25": "Memorial Day",
    "2026-06-19": "Juneteenth",
    "2026-07-03": "Independence Day (observed)",
    "2026-09-07": "Labor Day",
    "2026-10-12": "Columbus Day",
    "2026-11-11": "Veterans Day",
    "2026-11-26": "Thanksgiving Day",
    "2026-12-25": "Christmas Day",

    /* 2027 */
    "2027-01-01": "New Year's Day",
    "2027-01-18": "Martin Luther King Jr. Day",
    "2027-02-15": "Washington's Birthday",
    "2027-05-31": "Memorial Day",
    "2027-06-18": "Juneteenth (observed)",
    "2027-07-05": "Independence Day (observed)",
    "2027-09-06": "Labor Day",
    "2027-10-11": "Columbus Day",
    "2027-11-11": "Veterans Day",
    "2027-11-25": "Thanksgiving Day",
    "2027-12-24": "Christmas Day (observed)"
  }
};

const HOLIDAY_META = {
  KR: { flag: "<img src='https://flagcdn.com/16x12/kr.png' width='16' height='12' alt='KR' style='vertical-align:middle;margin-right:1px'>", label: "Korea" },
  MY: { flag: "<img src='https://flagcdn.com/16x12/my.png' width='16' height='12' alt='MY' style='vertical-align:middle;margin-right:1px'>", label: "Malaysia" },
  US: { flag: "<img src='https://flagcdn.com/16x12/us.png' width='16' height='12' alt='US' style='vertical-align:middle;margin-right:1px'>", label: "USA" }
};

/* getHolidays("2026-09-07")
   → [{ country:"US", flag:"🇺🇸", name:"Labor Day" }] */
function getHolidays(dateStr) {
  const d = dateStr.slice(0, 10);
  const result = [];
  for (const [country, dates] of Object.entries(HOLIDAYS)) {
    if (dates[d]) {
      result.push({
        country,
        flag: HOLIDAY_META[country].flag,
        name: dates[d]
      });
    }
  }
  return result;
}
