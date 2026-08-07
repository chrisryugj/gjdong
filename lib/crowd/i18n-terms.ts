// 서울시 API 한국어 데이터 번역 테이블 — 등급·카테고리·해수욕·도로·사고·재난·연령 + 캔드 문장

import { IDX, pick, type Lang } from "./i18n-core"

// ── 혼잡도 4단계 (API: 여유·보통·약간 붐빔·붐빔)
const LEVEL_T: Record<string, [string, string, string]> = {
  여유: ["Quiet", "空いている", "舒适"],
  보통: ["Moderate", "普通", "一般"],
  "약간 붐빔": ["Busy", "やや混雑", "较拥挤"],
  붐빔: ["Crowded", "混雑", "拥挤"],
  // 등급 산출 원천이 그 지점에 없을 때 — 지어내지 않고 공백으로 둔다 (강원 강릉권 밖)
  "정보 없음": ["No data", "情報なし", "暂无数据"],
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

export const trLevel = (level: string, lang: Lang) => pick(LEVEL_T, level, lang)
export const trCategory = (cat: string, lang: Lang) => pick(CATEGORY_T, cat, lang)
export const trRoad = (idx: string, lang: Lang) => pick(ROAD_T, idx, lang)
export const trRoadMsg = (idx: string, msg: string, lang: Lang) =>
  lang === "ko" ? msg : (ROAD_MSG_T[idx]?.[IDX[lang]] ?? "")
export const trAlert = (type: string, lang: Lang) => pick(ALERT_T, type, lang)
export const trDisaster = (word: string, lang: Lang) => pick(DISASTER_T, word, lang)
export const trAge = (label: string, lang: Lang) => pick(AGE_T, label, lang)
export const trBeach = (word: string, lang: Lang) => pick(BEACH_T, word, lang)

/** API 한국어 안내문 대체 — 비한국어는 혼잡 단계별 캔드 문장 1개 */
export function trLevelMessages(messages: string[], levelNum: number, lang: Lang): string[] {
  if (lang === "ko") return messages
  const msg = LEVEL_MSG_T[levelNum]?.[IDX[lang]]
  return msg ? [msg] : []
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
