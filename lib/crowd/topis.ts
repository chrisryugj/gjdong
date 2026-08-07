// 서울 TOPIS(교통정보센터) 전역 CCTV 보강 (서버 전용)
// 서울 RTD의 지점별 CCTV(/cctv?hotspotNm=)는 명소당 0~8대뿐 — TOPIS 전역 510대(무키)에서
// 근접 카메라를 찾아 채워 넣는다.
//
// 데이터 계약 (2026-08-04 실측):
// - GET  /map/cctvKml.do                     전역 목록 KML 510대 {name, code, coordinates}
// - POST /map/selectCctvInfo.do (camId=..&cctvSourceCd=HP)  → rows[0].hlsUrl (https m3u8)
// - 스트림 호스트(topiscctv*.eseoul.go.kr)는 Access-Control-Allow-Origin:* — 브라우저 직접 재생 가능

import type { CrowdCctv } from "@/lib/crowd/seoul-rtd"
import { createSnapshot } from "@/lib/crowd/adapter-kit"
import { haversineKmServer } from "@/lib/crowd/geo"
import { krgovFetch, krgovJson } from "@/lib/crowd/krgov-fetch"

const TOPIS_HEADERS: Record<string, string> = {
  Referer: "https://topis.seoul.go.kr/",
}

interface TopisCam {
  code: string
  name: string
  lat: number
  lng: number
}

// KML 목록은 준정적 — 인스턴스 생존 동안 6시간 캐시
const camListSnapshot = createSnapshot(6 * 3600_000, async (): Promise<TopisCam[]> => {
  const xml = await krgovFetch("https://topis.seoul.go.kr/map/cctvKml.do", { headers: TOPIS_HEADERS })
  const cams: TopisCam[] = []
  // KML Placemark 단위 파싱 — 외부 XML 파서 없이 정규식으로 충분한 고정 구조
  const placemarks = xml.split("<Placemark>").slice(1)
  for (const block of placemarks) {
    const name = block.match(/<name>([^<]*)<\/name>/)?.[1]?.trim()
    const code = block.match(/<Data name="code"><value>([^<]*)<\/value>/)?.[1]?.trim()
    const coords = block.match(/<coordinates>([^<]*)<\/coordinates>/)?.[1]?.trim()
    if (!name || !code || !coords) continue
    const [lngStr, latStr] = coords.split(",")
    const lat = Number.parseFloat(latStr)
    const lng = Number.parseFloat(lngStr)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue
    cams.push({ code, name, lat, lng })
  }
  if (cams.length === 0) throw new Error("TOPIS kml empty")
  return cams
})

const loadCamList = () => camListSnapshot.get()

// 스트림 URL은 카메라별 고정에 가까움 — 12시간 캐시 (실패는 30분 네거티브 캐시)
const streamCache = new Map<string, { url: string; at: number }>()
const STREAM_TTL = 12 * 3600_000
const STREAM_NEG_TTL = 30 * 60_000

async function resolveStream(code: string): Promise<string> {
  const cached = streamCache.get(code)
  if (cached && Date.now() - cached.at < (cached.url ? STREAM_TTL : STREAM_NEG_TTL)) return cached.url
  let url = ""
  try {
    const d = (await krgovJson("https://topis.seoul.go.kr/map/selectCctvInfo.do", {
      method: "POST",
      headers: {
        ...TOPIS_HEADERS,
        "Content-Type": "application/x-www-form-urlencoded",
        "X-Requested-With": "XMLHttpRequest",
      },
      body: `camId=${encodeURIComponent(code)}&cctvSourceCd=HP`,
      timeoutMs: 8000,
    })) as { rows?: Array<{ hlsUrl?: string }> }
    url = d.rows?.[0]?.hlsUrl ?? ""
  } catch {
    // 실패 = 네거티브 캐시로 잠시 스킵
  }
  streamCache.set(code, { url, at: Date.now() })
  return url
}

/**
 * 명소 좌표 기준 근접 TOPIS 카메라를 기존 CCTV 목록 뒤에 병합.
 * RTD 카메라와 60m 이내 중복은 제외, 반경 1.2km · 최대 6대 추가.
 */
export async function augmentWithTopis(
  origin: { lat: number; lng: number },
  existing: CrowdCctv[],
): Promise<CrowdCctv[]> {
  try {
    const cams = await loadCamList()
    const nearby = cams
      .map((c) => ({ cam: c, km: haversineKmServer(origin.lat, origin.lng, c.lat, c.lng) }))
      .filter(({ cam, km }) => {
        if (km > 1.2) return false
        return !existing.some((e) => haversineKmServer(e.lat, e.lng, cam.lat, cam.lng) < 0.06)
      })
      .sort((a, b) => a.km - b.km)
      .slice(0, 6)

    const resolved = await Promise.all(
      nearby.map(async ({ cam }) => {
        const url = await resolveStream(cam.code)
        if (!url) return null
        const item: CrowdCctv = {
          name: cam.name,
          lat: cam.lat,
          lng: cam.lng,
          streamId: `topis-${cam.code}`,
          src: url,
          kind: "hls",
        }
        return item
      }),
    )
    return [...existing, ...resolved.filter((c): c is CrowdCctv => c != null)]
  } catch {
    return existing // TOPIS 불통 = 기존 RTD 목록 그대로
  }
}
