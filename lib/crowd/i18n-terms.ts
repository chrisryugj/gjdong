// 서울시 API 한국어 데이터 번역 테이블 — 등급·카테고리·해수욕·도로·사고·재난·연령 + 캔드 문장

import { IDX, pick, type Lang } from "./i18n-core"
import { romanizeAddress } from "./romanize"

// ── 혼잡도 4단계 (API: 여유·보통·약간 붐빔·붐빔)
const LEVEL_T: Record<string, [string, string, string]> = {
  여유: ["Quiet", "空いている", "舒适"],
  보통: ["Moderate", "普通", "一般"],
  "약간 붐빔": ["Busy", "やや混雑", "较拥挤"],
  붐빔: ["Crowded", "混雑", "拥挤"],
  // 등급 산출 원천이 그 지점에 없을 때 — 지어내지 않고 공백으로 둔다 (강원 강릉권 밖)
  "정보 없음": ["No data", "情報なし", "暂无数据"],
  // 인천공항 출국장이 지금 닫혀 있을 때 — "정보 없음"과 구분한다 (데이터 실패가 아니라 운영 상태)
  미운영: ["Closed", "営業時間外", "未开放"],
}

// ── 카테고리 (API 5종 + 전체 칩)
const CATEGORY_T: Record<string, [string, string, string]> = {
  전체: ["All", "すべて", "全部"],
  관광특구: ["Tourist Zones", "観光特区", "观光特区"],
  "고궁·문화유산": ["Palaces & Heritage", "古宮・文化遺産", "古宫·文化遗产"],
  인구밀집지역: ["Station Areas", "駅周辺", "车站周边"],
  발달상권: ["Shopping & Streets", "商業エリア", "商圈街区"],
  공원: ["Parks", "公園", "公园"],
  // 제주·부산·강원·인천공항 카테고리 (도시마다 분류 체계가 달라 서울 5종과 겹치지 않는다)
  "시장·거리": ["Markets & Streets", "市場・通り", "市场·街道"],
  "오름·자연": ["Oreum & Nature", "オルム・自然", "岳丘·自然"],
  해변: ["Beaches", "ビーチ", "海滩"],
  관광지: ["Attractions", "観光地", "景点"],
  교통: ["Transport", "交通", "交通"],
  "폭포·계곡": ["Falls & Valleys", "滝・渓谷", "瀑布·溪谷"],
  "섬·포구": ["Islands & Ports", "島・港", "岛屿·港口"],
  한라산: ["Hallasan", "漢拏山", "汉拿山"],
  문화마을: ["Culture Villages", "文化村", "文化村"],
  "전망·공원": ["Views & Parks", "展望・公園", "观景·公园"],
  "자연·전망": ["Nature & Views", "自然・展望", "自然·观景"],
  출국장: ["Departure Gates", "出発ゲート", "出境大厅"],
}

// ── 해수욕장 생활지수 (KHOA: 오전/오후 × 매우좋음~매우나쁨)
const BEACH_T: Record<string, [string, string, string]> = {
  오전: ["Morning", "午前", "上午"],
  오후: ["Afternoon", "午後", "下午"],
  매우좋음: ["Excellent", "非常に良い", "非常好"],
  좋음: ["Good", "良い", "好"],
  보통: ["Fair", "普通", "一般"],
  나쁨: ["Poor", "悪い", "较差"],
  매우나쁨: ["Very poor", "非常に悪い", "很差"],
  // 해수욕장 개장 기간 밖이면 지수 대신 이 문구가 온다 — 비한국어 화면에 한글이 새던 값 (2026-10-05 실측)
  "서비스기간 아님": ["Off-season", "期間外", "非开放期"],
}

// ── 도로 소통 지수 (API: 원활·서행·정체)
const ROAD_T: Record<string, [string, string, string]> = {
  원활: ["Smooth", "円滑", "畅通"],
  서행: ["Slow", "徐行", "缓行"],
  정체: ["Congested", "渋滞", "拥堵"],
}

// 도로 안내문(한국어 자유 텍스트) 대체 — 지수별 캔드 문장
const ROAD_MSG_T: Record<string, [string, string, string]> = {
  원활: [
    "Traffic around this area is flowing smoothly.",
    "周辺の道路はスムーズに流れています。",
    "周边道路通行顺畅。",
  ],
  서행: [
    "Traffic is moving slowly around this area.",
    "周辺の道路はやや流れが悪くなっています。",
    "周边道路车流缓慢。",
  ],
  정체: [
    "Roads around this area are congested — public transit is recommended.",
    "周辺の道路は渋滞しています。公共交通機関の利用がおすすめです。",
    "周边道路拥堵，建议乘坐公共交通。",
  ],
}

// 혼잡도 안내문(API 한국어 자유 텍스트) 대체 — 단계별 캔드 문장
const LEVEL_MSG_T: Record<number, [string, string, string]> = {
  // 0 = 등급을 낼 원천이 그 지점에 없음(강원 강릉권 밖·인천공항 미운영 출국장).
  // 이 항목이 없으면 비한국어에서 안내문이 통째로 사라져 화면이 빈 채로 남는다.
  0: [
    "No live congestion data for this spot — see the details below instead.",
    "この地点のリアルタイム混雑情報はありません。下の詳細をご確認ください。",
    "该地点暂无实时拥挤度数据，请参考下方详情。",
  ],
  1: [
    "Not crowded right now — a relaxed time to visit.",
    "今は空いていて、ゆったり過ごせます。",
    "现在人不多，可以悠闲地游览。",
  ],
  2: [
    "Somewhat lively, but still comfortable to walk around.",
    "ある程度にぎわっていますが、快適に歩けます。",
    "有些热闹，但走起来还算舒适。",
  ],
  3: [
    "Quite a few people — expect some congestion in narrow spots.",
    "人がかなり多く、狭い場所では混み合うことがあります。",
    "人比较多，狭窄处可能会拥挤。",
  ],
  4: [
    "Very crowded — moving around may be slow. Mind your belongings.",
    "非常に混雑しています。移動に時間がかかることがあります。持ち物にご注意ください。",
    "非常拥挤，通行可能缓慢，请保管好随身物品。",
  ],
}

// ── 사고·통제 유형 (API ACDNT_TYPE 주요값)
const ALERT_T: Record<string, [string, string, string]> = {
  교통사고: ["Traffic accident", "交通事故", "交通事故"],
  공사: ["Construction", "工事", "道路施工"],
  집회및시위: ["Rally / protest", "集会・デモ", "集会游行"],
  집회: ["Rally", "集会", "集会"],
  시위: ["Protest", "デモ", "游行"],
  행사: ["Event", "イベント", "活动"],
  재난: ["Disaster", "災害", "灾害"],
  기상: ["Weather", "気象", "天气"],
  낙하물: ["Fallen object", "落下物", "坠落物"],
  차량고장: ["Vehicle breakdown", "車両故障", "车辆故障"],
  통제: ["Road control", "通行規制", "交通管制"],
  // 세부 사유(detail) — 서울 TOPIS 실측 상위 값
  시설물보수: ["Facility repair", "施設補修", "设施维修"],
  도로보수: ["Road repair", "道路補修", "道路维修"],
  상수도공사: ["Waterworks", "上水道工事", "供水施工"],
  전기통신공사: ["Utility works", "電気通信工事", "电力通信施工"],
  포장공사: ["Repaving", "舗装工事", "路面铺装"],
}

// ── 재난문자 유형·단계 (배너 굵은 머리말만 번역, 본문은 원문 유지)
const DISASTER_T: Record<string, [string, string, string]> = {
  폭염: ["Heat wave", "猛暑", "高温"],
  호우: ["Heavy rain", "大雨", "暴雨"],
  대설: ["Heavy snow", "大雪", "大雪"],
  강풍: ["Strong wind", "強風", "大风"],
  태풍: ["Typhoon", "台風", "台风"],
  미세먼지: ["Fine dust", "PM2.5", "雾霾"],
  안전안내: ["Safety advisory", "安全のお知らせ", "安全提示"],
  위급재난: ["Emergency alert", "緊急災害", "紧急灾难"],
  긴급재난: ["Emergency alert", "緊急災害", "紧急灾难"],
  // 기상특보 유형·단계 (safety.ts가 기본어+단계로 쪼개 보낸다: "폭염"+"경보")
  한파: ["Cold wave", "寒波", "寒潮"],
  건조: ["Dry weather", "乾燥", "干燥"],
  풍랑: ["High seas", "波浪", "风浪"],
  폭풍해일: ["Storm surge", "高潮", "风暴潮"],
  지진해일: ["Tsunami", "津波", "海啸"],
  해일: ["Storm surge", "高潮", "海啸"],
  황사: ["Yellow dust", "黄砂", "沙尘"],
  안개: ["Dense fog", "濃霧", "大雾"],
  경보: ["warning", "警報", "警报"],
  주의보: ["advisory", "注意報", "预警"],
  지진: ["Earthquake", "地震", "地震"],
  산불: ["Wildfire", "山火事", "山火"],
  산사태: ["Landslide", "土砂災害", "山体滑坡"],
  교통통제: ["Road control", "交通規制", "交通管制"],
  // SSR 재난문자에 분류가 없을 때의 머리말 (본문에 재난어가 없으면 유형을 지어내지 않는다)
  재난문자: ["Emergency alert", "緊急速報", "应急短信"],
}

// ── 연령 라벨 (lib/crowd/seoul-rtd.ts의 한국어 라벨 기준)
const AGE_T: Record<string, [string, string, string]> = {
  "10대 이하": ["Teens & under", "10代以下", "20岁以下"],
  "20대": ["20s", "20代", "20多岁"],
  "30대": ["30s", "30代", "30多岁"],
  "40대": ["40s", "40代", "40多岁"],
  "50대": ["50s", "50代", "50多岁"],
  "60대 이상": ["60s & over", "60代以上", "60岁以上"],
}

// ── 인천공항 도착편 상태 (airport.kr stattxt: 도착·착륙·지연, 빈값=예정)
const ARRSTAT_T: Record<string, [string, string, string]> = {
  도착: ["Arrived", "到着", "已到达"],
  착륙: ["Landed", "着陸", "已降落"],
  지연: ["Delayed", "遅延", "延误"],
  결항: ["Cancelled", "欠航", "取消"],
  회항: ["Diverted", "回航", "备降"],
}

export const trArrStat = (word: string, lang: Lang) => pick(ARRSTAT_T, word, lang)
export const trLevel = (level: string, lang: Lang) => pick(LEVEL_T, level, lang)
export const trCategory = (cat: string, lang: Lang) => pick(CATEGORY_T, cat, lang)
export const trRoad = (idx: string, lang: Lang) => pick(ROAD_T, idx, lang)
export const trRoadMsg = (idx: string, msg: string, lang: Lang) =>
  lang === "ko" ? msg : (ROAD_MSG_T[idx]?.[IDX[lang]] ?? "")
export const trAlert = (type: string, lang: Lang) => pick(ALERT_T, type, lang)
export const trDisaster = (word: string, lang: Lang) => pick(DISASTER_T, word, lang)
export const trAge = (label: string, lang: Lang) => pick(AGE_T, label, lang)
export const trBeach = (word: string, lang: Lang) => pick(BEACH_T, word, lang)

// ── 인파 실측이 아닌 도시(부산·강원=접근·주차 / 인천공항=출국장 대기)의 안내문 번역
// 어댑터(busan.ts·gangwon.ts·incheon.ts)가 만드는 정형 문장만 패턴으로 옮긴다. 인파 캔드 문장으로
// 덮으면 부산 en이 "Somewhat lively…"(인파 묘사)로 바뀌어 등급 기준 고지가 거짓이 됐다 (2026-10-05 실측).
const BASIS_CITY_T: Record<string, [string, string, string]> = {
  부산: ["Busan", "釜山", "釜山"],
  강원: ["Gangwon", "江原", "江原"],
}
// 주차 등급은 "주차장이 얼마나 찼나" — 인파 등급어(Quiet·Crowded)를 그대로 쓰면 뜻이 어긋난다
const PARK_LV_T: Record<string, [string, string, string]> = {
  여유: ["plenty of space", "空きあり", "空位充足"],
  보통: ["moderately full", "やや埋まっている", "一般"],
  "약간 붐빔": ["filling up", "混み始め", "较紧张"],
  붐빔: ["nearly full", "ほぼ満車", "接近满位"],
}
const SIDE_T: Record<string, [string, string, string]> = {
  동편: ["East", "東側", "东侧"],
  서편: ["West", "西側", "西侧"],
}
// 문장 단위 번역이 안 될 때 대신 보여줄 등급 기준 설명 (어댑터 문안이 바뀌어도 기준 고지는 남는다)
const BASIS_FALLBACK_T: Record<"access" | "wait", [string, string, string]> = {
  access: [
    "This level reflects access-road and parking congestion, not a live crowd count.",
    "この混雑度は人出の実測ではなく、アクセス道路・駐車場の混雑を基準にしています。",
    "该等级依据周边道路与停车拥堵程度，并非实时人流计测。",
  ],
  wait: [
    "This level reflects the departure-gate waiting time.",
    "この混雑度は出国ゲートの待ち時間を基準にしています。",
    "该等级依据出境口的等候时间。",
  ],
}

/** 어댑터 정형 문장 1개 → 대상 언어. 패턴 밖이면 null */
function trBasisLine(m: string, lang: Exclude<Lang, "ko">): string | null {
  const i = IDX[lang]
  const L = (en: string, ja: string, zh: string) => [en, ja, zh][i]

  let r = m.match(/^(부산|강원)은 인파 계측 원천이 없어 접근 도로·주차 혼잡 기준으로 보여드려요\.$/)
  if (r) {
    const c = BASIS_CITY_T[r[1]][i]
    return L(
      `${c} has no live crowd count, so this level reflects access-road and parking congestion.`,
      `${c}には人出の実測データがないため、アクセス道路・駐車場の混雑度で表示しています。`,
      `${c}没有实时人流数据，因此按周边道路与停车拥堵程度显示等级。`,
    )
  }
  if (m.startsWith("이 지점은 주차·교차로 실시간 원천이 없어")) {
    return L(
      "No live parking or intersection data here, so no level is given — check the CCTV, sea and weather below.",
      "この地点には駐車場・交差点のリアルタイムデータがないため混雑度は出していません。下のCCTV・海・天気でご確認ください。",
      "该地点没有停车场与路口实时数据，不显示等级，请参考下方监控、海况与天气。",
    )
  }
  r = m.match(/^지금 (.+) 수준이에요\.$/)
  if (r) {
    const parts = r[1].split(" · ").map((b) => {
      const road = b.match(/^접근 도로 (원활|서행|정체)$/)
      if (road) return L(`access roads: ${pick(ROAD_T, road[1], lang).toLowerCase()}`, `アクセス道路 ${pick(ROAD_T, road[1], lang)}`, `周边道路${pick(ROAD_T, road[1], lang)}`)
      const park = b.match(/^주차 (.+)$/)
      if (park && PARK_LV_T[park[1]]) return L(`parking: ${PARK_LV_T[park[1]][i]}`, `駐車場 ${PARK_LV_T[park[1]][i]}`, `停车${PARK_LV_T[park[1]][i]}`)
      return null
    })
    if (parts.some((p) => p == null)) return null
    return L(`Right now — ${parts.join(" · ")}.`, `現在：${parts.join(" · ")}。`, `目前：${parts.join(" · ")}。`)
  }
  r = m.match(/^지금은 운영하지 않는 출국장이에요\.(?: 운영 시간은 (.+)입니다\.)?$/)
  if (r) {
    const h = r[1]
    return L(
      `This departure gate is closed right now.${h ? ` Hours: ${h}.` : ""}`,
      `この出国ゲートは現在運営していません。${h ? `運営時間は${h}です。` : ""}`,
      `该出境口目前未开放。${h ? `开放时间：${h}。` : ""}`,
    )
  }
  r = m.match(/^지금 대기 약 (\d+)분(?: · 줄 선 인원 ([\d,]+)명)?이에요\.$/)
  if (r) {
    const [, min, ppl] = r
    return L(
      `About ${min} min wait right now${ppl ? ` · ${ppl} people in line` : ""}.`,
      `現在の待ち時間は約${min}分${ppl ? ` · 列に${ppl}人` : ""}です。`,
      `目前等候约${min}分钟${ppl ? ` · 排队${ppl}人` : ""}。`,
    )
  }
  r = m.match(/^입구별로는 (.+) 수준이에요\.$/)
  if (r) {
    const parts = r[1].split(" · ").map((b) => {
      const g = b.match(/^(동편|서편|(\S+)입구) (\d+)분$/)
      if (!g) return null
      const side = g[2] ? L(`Entrance ${g[2]}`, `${g[2]}入口`, `${g[2]}入口`) : SIDE_T[g[1]][i]
      return L(`${side} ${g[3]} min`, `${side} ${g[3]}分`, `${side} ${g[3]}分钟`)
    })
    if (parts.some((p) => p == null)) return null
    return L(`By entrance: ${parts.join(" · ")}.`, `入口別：${parts.join(" · ")}。`, `各入口：${parts.join(" · ")}。`)
  }
  return null
}

/**
 * API 한국어 안내문 대체.
 * - 인파 도시(서울·제주): 비한국어는 혼잡 단계별 캔드 문장 1개
 * - 부산·강원·인천공항: 등급 기준 고지가 핵심이라 정형 문장을 번역하고, 못 옮긴 문장은 기준 설명으로 대체
 */
export function trLevelMessages(messages: string[], levelNum: number, lang: Lang, city?: string): string[] {
  if (lang === "ko") return messages
  if (city === "busan" || city === "gangwon" || city === "incheon") {
    const out = messages.map((m) => trBasisLine(m, lang))
    if (out.every((m) => m != null)) return out as string[]
    const fallback = BASIS_FALLBACK_T[city === "incheon" ? "wait" : "access"][IDX[lang]]
    return [fallback, ...out.filter((m): m is string => m != null && m !== fallback)]
  }
  const msg = LEVEL_MSG_T[levelNum]?.[IDX[lang]]
  return msg ? [msg] : []
}

/**
 * 서울 RTD 지하철 도착 안내(arvlMsg2) 현지화 — 통째 로마자로 두면 "3Bun 10Cho Hu (Seonjeongneung)"가 됐다
 * (2026-10-05 실측). 정형 4종만 옮기고 역명은 로마자, 그 밖은 기존처럼 통째 로마자.
 */
export function trArrival(msg: string, lang: Lang): string {
  if (lang === "ko") return msg
  const i = IDX[lang]
  const L = (en: string, ja: string, zh: string) => [en, ja, zh][i]
  const at = (st?: string) => (st ? ` (${romanizeAddress(st)})` : "")
  let r = msg.match(/^(?:(\d+)분\s*)?(?:(\d+)초\s*)?후\s*(?:\((.+)\))?$/)
  if (r && (r[1] || r[2])) {
    const [, m, sec, st] = r
    return L(
      `in ${m ? `${m}m` : ""}${m && sec ? " " : ""}${sec ? `${sec}s` : ""}${at(st)}`,
      `${m ? `${m}分` : ""}${sec ? `${sec}秒` : ""}後${at(st)}`,
      `${m ? `${m}分` : ""}${sec ? `${sec}秒` : ""}后${at(st)}`,
    )
  }
  r = msg.match(/^\[(\d+)\]번째 전역\s*(?:\((.+)\))?$/)
  if (r) return L(`${r[1]} stops away`, `${r[1]}駅前`, `前${r[1]}站`) + at(r[2])
  r = msg.match(/^(.+?) (도착|출발|진입)$/)
  if (r) {
    const place = r[1] === "전역" ? L("previous stn", "前の駅", "前一站") : romanizeAddress(r[1])
    const act = { 도착: L("Arriving", "到着", "到达"), 출발: L("Departed", "出発", "出发"), 진입: L("Approaching", "進入", "进站") }[r[2]]
    return lang === "en" ? `${act} · ${place}` : `${place} ${act}`
  }
  return romanizeAddress(msg)
}

/** "18시"·"현재" 시각 라벨 현지화 */
export function trHour(time: string, lang: Lang): string {
  if (lang === "ko") return time
  if (time === "현재") return lang === "en" ? "Now" : lang === "ja" ? "現在" : "现在"
  const m = time.match(/^(\d{1,2})시$/)
  if (!m) return time
  return lang === "en" ? `${m[1]}:00` : lang === "ja" ? `${m[1]}時` : `${m[1]}时`
}

/** "14,000~16,000명" 인원 범위 현지화 */
export function trRange(range: string, lang: Lang): string {
  if (lang === "ko" || !range) return range
  const nums = range.replace(/명/g, "").replace(/~/g, "–")
  return lang === "en" ? `${nums} people` : `${nums}人`
}
