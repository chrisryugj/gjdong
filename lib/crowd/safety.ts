// 전국 안전축 — 기상청 기상특보 + 행정안전부 긴급재난문자 (서버 전용)
// ── 데이터 계약 실측 (2026-08-09)
// 두 원천 모두 공공데이터포털(data.go.kr) 활용신청 필요 — DATA_GO_KR_KEY 계정 키 공용.
//   기상특보: apis.data.go.kr/1360000/WthrWrnInfoService/getPwnStatus?stnId= (발표관서별 발효 현황)
//     응답 item의 텍스트 필드에 "o 폭염경보 : 서울특별시, ..." 꼴 자유 텍스트 — 필드명이 문서와
//     다를 수 있어 item의 모든 문자열 필드를 이어붙여 정규식으로 긁는다(파서는 텍스트 앵커).
//   재난문자: www.safetydata.go.kr/V2/api/DSSP-IF-00247?crtDt=&rgnNm= (당일·시도 필터)
//     body[]: MSG_CN·RCPTN_RGN_NM·CRT_DT("2026/08/09 10:52:35")·EMRG_STEP_NM·DST_SE_NM
// 키 미신청/미승인이면 "등록되지 않은 서비스키"가 오는데, 이는 빈 배열로 조용히 강등 —
// 서울(RTD 자체 재난문자)만 있던 배너가 키 승인과 동시에 전국으로 켜지는 구조.
// 서울은 RTD 재난문자가 이미 당일 서울 재난문자라 행안부 원천을 겹쳐 부르지 않는다(중복).

import type { CrowdDisaster } from "@/lib/crowd/seoul-rtd"
import { createSnapshot } from "@/lib/crowd/adapter-kit"
import type { CityId } from "@/lib/crowd/cities"

const KEY = () => process.env.DATA_GO_KR_KEY ?? ""

/**
 * 도시 → 특보 지역 매처. 라이브 실측(2026-08-09): getPwnStatus는 stnId와 무관하게 전국 통보문
 * 동일 반환 → 관서 필터를 믿지 말고 지역 텍스트를 시도 세그먼트로 쪼개 도시를 골라낸다.
 * gangwon만 inner 필요 — "강원도(영월, 횡성, 원주)"처럼 영서만 열거되면 동해안 벨트는 무관하다.
 */
interface WarnMatcher {
  prefix: string
  /** 열거형 괄호("강원도(영월, 횡성)")일 때 이 중 하나는 있어야 통과. 생략 = 괄호 무시 */
  inner?: string[]
}

const WARN_REGION: Record<CityId, WarnMatcher> = {
  seoul: { prefix: "서울" },
  incheon: { prefix: "인천" },
  busan: { prefix: "부산" },
  gangwon: { prefix: "강원", inner: ["강릉", "속초", "동해", "삼척", "양양", "고성", "평창"] },
  jeju: { prefix: "제주" },
}

// 전 도시가 같은 전국 통보문을 쓰므로 원천 호출도 stnId 108(전국) 하나로 합친다
const WARN_STN_ID = "108"

/** 도시 → 재난문자 수신지역(rgnNm 파라미터·응답 재필터 키워드) */
const MSG_RGN: Record<CityId, { rgnNm: string; keywords: string[] }> = {
  seoul: { rgnNm: "서울특별시", keywords: ["서울특별시"] },
  busan: { rgnNm: "부산광역시", keywords: ["부산광역시"] },
  jeju: { rgnNm: "제주특별자치도", keywords: ["제주특별자치도"] },
  gangwon: { rgnNm: "강원특별자치도", keywords: ["강원특별자치도"] },
  // 공항은 인천 중구 — 시 전체 발송분과 중구 발송분만 (섬 반대편 옹진군 등은 소음)
  incheon: { rgnNm: "인천광역시", keywords: ["인천광역시 전체", "중구"] },
}

const WARN_TYPES = "폭염|호우|대설|강풍|태풍|한파|건조|풍랑|폭풍해일|지진해일|해일|황사|안개"

/** 괄호 깊이를 지키는 최상위 콤마 분리 — "강원도(영월, 횡성), 서울" → ["강원도(영월, 횡성)", "서울"] */
export function splitRegions(region: string): string[] {
  const out: string[] = []
  let depth = 0
  let cur = ""
  for (const ch of region) {
    if (ch === "(") depth++
    else if (ch === ")") depth = Math.max(0, depth - 1)
    if (ch === "," && depth === 0) {
      if (cur.trim()) out.push(cur.trim())
      cur = ""
    } else cur += ch
  }
  if (cur.trim()) out.push(cur.trim())
  return out
}

/**
 * 시도 세그먼트 1개가 이 도시에 해당하는가.
 * - "먼바다" 세그먼트는 제외 (연안 지점과 무관한 해상 특보 소음)
 * - 열거형 괄호("강원도(영월, 횡성)")는 inner 교집합 요구, "…제외" 괄호는 전역 발효로 본다
 */
export function matchRegion(segment: string, matcher: WarnMatcher): boolean {
  if (!segment.startsWith(matcher.prefix)) return false
  if (segment.includes("먼바다")) return false
  if (!matcher.inner) return true
  const paren = segment.match(/\(([^)]*)\)/)?.[1]
  if (!paren || paren.includes("제외")) return true
  return matcher.inner.some((k) => paren.includes(k))
}

/**
 * 특보현황 텍스트(전국 통보문)에서 "o 폭염경보 : 지역…" 줄을 긁어 도시 세그먼트만 남긴다.
 * 지역 텍스트가 아예 없는 줄은 판단 근거가 없으므로 버린다 — 전국 통보문에는 지역이 항상 붙는다.
 */
export function parseWarnings(
  text: string,
  matcher: WarnMatcher,
): Array<{ type: string; step: string; region: string }> {
  const out: Array<{ type: string; step: string; region: string }> = []
  const seen = new Set<string>()
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    const m = line.match(new RegExp(`(${WARN_TYPES})\\s*(경보|주의보)`))
    if (!m) continue
    // 해제·해제됨 안내 줄은 발효 중이 아니다
    if (/해제/.test(line)) continue
    const regionText = line.slice(line.indexOf(m[0]) + m[0].length).replace(/^[\s:：-]+/, "").trim()
    if (!regionText) continue
    const matched = splitRegions(regionText).filter((seg) => matchRegion(seg, matcher))
    if (matched.length === 0) continue
    const key = `${m[1]}${m[2]}`
    if (seen.has(key)) continue
    seen.add(key)
    // 배너는 한 줄 — 도시 세그먼트만 싣고 그래도 길면 말줄임
    const region = matched.join(", ")
    out.push({ type: m[1], step: m[2], region: region.length > 80 ? `${region.slice(0, 79)}…` : region })
  }
  return out
}

/** item 객체의 문자열 필드를 전부 이어붙인다 — 필드명(t2·t6 등) 편차에 파서가 흔들리지 않게 */
export function joinStringFields(item: unknown): string {
  if (item == null || typeof item !== "object") return ""
  return Object.values(item as Record<string, unknown>)
    .filter((v): v is string => typeof v === "string")
    .join("\n")
}

// 전국 통보문은 도시와 무관하게 동일 — 원천 호출 1개를 전 도시가 나눠 쓴다 (10분 스냅샷)
const pwnSnapshot = createSnapshot(600_000, async () => {
  const url =
    `https://apis.data.go.kr/1360000/WthrWrnInfoService/getPwnStatus` +
    `?serviceKey=${KEY()}&numOfRows=10&pageNo=1&dataType=JSON&stnId=${WARN_STN_ID}`
  const raw = (await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(10000) }).then((r) =>
    r.ok ? r.json() : null,
  )) as {
    response?: { header?: { resultCode?: string }; body?: { items?: { item?: unknown } } }
  } | null
  if (raw?.response?.header?.resultCode !== "00") throw new Error("kma warnings unavailable")
  const item = raw.response.body?.items?.item
  const rows = Array.isArray(item) ? item : item != null ? [item] : []
  return {
    text: rows.map(joinStringFields).join("\n"),
    at: String(((rows[0] as Record<string, unknown> | undefined)?.tmFc ?? "") as string | number),
  }
})

async function fetchKmaWarnings(city: CityId): Promise<CrowdDisaster[]> {
  const { text, at } = await pwnSnapshot.get()
  // type·step을 기본어(폭염)·단계(경보)로 쪼개 배너 머리말 번역 사전(DISASTER_T)을 그대로 태운다.
  // 배너·보고서가 [type step] content로 그리므로 content에 특보명을 반복하지 않는다.
  return parseWarnings(text, WARN_REGION[city]).map((w) => ({
    type: w.type,
    step: w.step,
    content: `발효 중${w.region ? ` — ${w.region}` : ""}`,
    at,
  }))
}

interface RawMsgBody {
  MSG_CN?: string
  RCPTN_RGN_NM?: string
  CRT_DT?: string
  EMRG_STEP_NM?: string
  DST_SE_NM?: string
}

export function parseEmergencyMsgs(body: unknown, keywords: string[]): CrowdDisaster[] {
  const rows = (Array.isArray(body) ? body : []) as RawMsgBody[]
  const out: CrowdDisaster[] = []
  const seen = new Set<string>()
  for (const r of rows) {
    const content = (r.MSG_CN ?? "").trim()
    if (!content || seen.has(content)) continue
    const region = r.RCPTN_RGN_NM ?? ""
    if (region && !keywords.some((k) => region.includes(k))) continue
    seen.add(content)
    out.push({
      type: r.DST_SE_NM ?? "",
      step: r.EMRG_STEP_NM ?? "",
      content,
      at: r.CRT_DT ?? "",
    })
  }
  // 원천은 과거→최근 순서가 일정치 않다 — 최근 발송이 배너 첫 줄에 오게 정렬
  return out.sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 10)
}

/** KST 오늘 YYYYMMDD */
function kstYmd(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10).replace(/-/g, "")
}

async function fetchEmergencyMsgs(city: CityId): Promise<CrowdDisaster[]> {
  const { rgnNm, keywords } = MSG_RGN[city]
  const url =
    `https://www.safetydata.go.kr/V2/api/DSSP-IF-00247` +
    `?serviceKey=${KEY()}&numOfRows=30&pageNo=1&crtDt=${kstYmd()}&rgnNm=${encodeURIComponent(rgnNm)}`
  const raw = (await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(10000) }).then((r) =>
    r.ok ? r.json() : null,
  )) as { header?: { resultCode?: string }; body?: unknown } | null
  if (!raw || (raw.header?.resultCode && raw.header.resultCode !== "00")) return []
  return parseEmergencyMsgs(raw.body, keywords)
}

// 특보·재난문자 모두 분 단위로 변하는 원천이 아니다 — 도시별 10분 스냅샷
const safetyCache = new Map<CityId, { get(): Promise<CrowdDisaster[]> }>()

/**
 * 도시의 안전 정보(기상특보 + 당일 재난문자) — 배너·보고서 공용 CrowdDisaster[].
 * 특보가 위라서 먼저, 실패 축은 각자 빈 배열(둘 다 죽어야 배너가 사라진다).
 */
export function fetchSafety(city: CityId, { withEmergency = true } = {}): Promise<CrowdDisaster[]> {
  const cacheKey = withEmergency ? city : (`${city}:warn-only` as CityId)
  let snap = safetyCache.get(cacheKey)
  if (!snap) {
    snap = createSnapshot(600_000, async () => {
      const [warnings, msgs] = await Promise.all([
        fetchKmaWarnings(city).catch(() => []),
        withEmergency ? fetchEmergencyMsgs(city).catch(() => []) : Promise.resolve([]),
      ])
      return [...warnings, ...msgs]
    })
    safetyCache.set(cacheKey, snap)
  }
  return snap.get()
}
