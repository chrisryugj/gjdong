"use client"

import { forwardRef, useEffect, useMemo, useRef, useState } from "react"
import type { LayerGroup, Map as LeafletMap, Marker as LeafletMarker } from "leaflet"
import { FALLBACK_COORDS } from "@/lib/constants"
import { facilityDisplayName, type Facility } from "@/lib/facility-storage"
import { markerIcon, markerSvg, resolveStyle, type CategoryStyle } from "@/lib/facility-markers"

interface FacilityMapProps {
  facilities: Facility[]
  styles: Record<string, CategoryStyle>
  categoryOrder?: string[]
  showLabels: boolean
  focus: { id: string; tick: number } | null
  resizeSignal: number
}

function escapeHtml(text: string): string {
  const div = document.createElement("div")
  div.textContent = text
  return div.innerHTML
}

/** 시설관리 전용 지도 — 분류별 모양·색상 마커 + 항상 보이는 시설명 라벨. ref는 스크린샷 캡처용 래퍼 */
const FacilityMap = forwardRef<HTMLDivElement, FacilityMapProps>(function FacilityMap(
  { facilities, styles, categoryOrder, showLabels, focus, resizeSignal },
  ref,
) {
  const mapElRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<LeafletMap | null>(null)
  const layerRef = useRef<LayerGroup | null>(null)
  const leafletRef = useRef<typeof import("leaflet") | null>(null)
  const fitFrameRef = useRef<number | null>(null)
  const fitTimeoutRef = useRef<number | null>(null)
  const facilitiesRef = useRef(facilities)
  facilitiesRef.current = facilities
  // 생성된 마커 + 색을 보관 — 라벨 토글 시 마커를 재생성하지 않고 tooltip만 open/close
  const markersRef = useRef<{ marker: LeafletMarker; color: string }[]>([])
  // showLabels를 ref로도 들고 있어 renderMarkers가 의존성에서 빠져도 최신값을 읽게 한다
  const showLabelsRef = useRef(showLabels)
  showLabelsRef.current = showLabels
  // ref가 아닌 state: 지도 준비 완료 시 마커 effect가 "신선한" facilities 클로저로 재실행되도록
  const [mapReady, setMapReady] = useState(false)

  // 범례: 등장하는 분류 → 스타일(모양+색, 미분류 포함). 좌측 칩과 동일 순서(categoryOrder) 적용.
  const legend = useMemo(() => {
    const cats = new Set<string>()
    let hasUncategorized = false
    for (const f of facilities) {
      const c = f.category?.trim()
      if (c) cats.add(c)
      else hasUncategorized = true
    }
    const rank = new Map((categoryOrder ?? []).map((c, i) => [c, i] as const))
    const sorted = Array.from(cats).sort((a, b) => (rank.get(a) ?? Infinity) - (rank.get(b) ?? Infinity))
    const entries = sorted.map((label) => ({ label, ...resolveStyle(label, styles) }))
    if (hasUncategorized) {
      entries.push({ label: "미분류", ...resolveStyle(undefined, styles) })
    }
    return entries
  }, [facilities, styles, categoryOrder])

  // 1) 지도 1회 초기화
  useEffect(() => {
    let cancelled = false
    const init = async () => {
      const L = await import("leaflet")
      if (cancelled || !mapElRef.current || mapRef.current) return
      leafletRef.current = L
      const map = L.map(mapElRef.current, { zoomControl: true }).setView(
        [FALLBACK_COORDS.lat, FALLBACK_COORDS.lon],
        13,
      )
      // crossOrigin: 스크린샷(canvas) 시 타일 CORS 오염 방지
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap contributors",
        crossOrigin: true,
      }).addTo(map)
      layerRef.current = L.layerGroup().addTo(map)
      mapRef.current = map
      setMapReady(true) // 준비 완료 → 아래 마커 effect가 현재 facilities로 재실행
    }
    void init()
    return () => {
      cancelled = true
      if (fitFrameRef.current != null) {
        cancelAnimationFrame(fitFrameRef.current)
        fitFrameRef.current = null
      }
      if (fitTimeoutRef.current != null) {
        window.clearTimeout(fitTimeoutRef.current)
        fitTimeoutRef.current = null
      }
      mapRef.current?.remove()
      mapRef.current = null
      layerRef.current = null
    }
  }, [])

  // 1-b) 컨테이너 크기 변화(패널 접기·창 리사이즈) 감지 → 타일 회색 방지
  useEffect(() => {
    if (!mapReady || !mapElRef.current) return
    const ro = new ResizeObserver(() => mapRef.current?.invalidateSize())
    ro.observe(mapElRef.current)
    return () => ro.disconnect()
  }, [mapReady])

  // 2) 시설/라벨 변경 시 마커 다시 그리기 + 전체 맞춤
  const renderMarkers = () => {
    const L = leafletRef.current
    const map = mapRef.current
    const layer = layerRef.current
    if (!L || !map || !layer) return

    layer.clearLayers()
    markersRef.current = []

    facilities.forEach((f) => {
      const st = resolveStyle(f.category, styles)
      const label = facilityDisplayName(f)
      const ic = markerIcon(st.shape, st.color)
      const icon = L.divIcon({
        className: "facility-marker",
        html: ic.html,
        iconSize: ic.size,
        iconAnchor: ic.anchor,
      })
      const marker = L.marker([f.lat, f.lon], { icon }).addTo(layer)

      // 클릭 시 상세 팝업
      marker.bindPopup(
        `<div style="font-size:12px;line-height:1.5;min-width:140px">
          <div style="font-weight:700;font-size:13px;color:${st.color};margin-bottom:3px">${escapeHtml(label)}</div>
          ${f.category ? `<div style="color:#6b7280;margin-bottom:3px">분류: ${escapeHtml(f.category)}</div>` : ""}
          <div>${escapeHtml(f.address || f.originalInput)}</div>
        </div>`,
      )

      // 라벨은 항상 bind하고 표시 여부는 toggleLabels가 open/close로 제어(토글 시 재생성 방지)
      marker.bindTooltip(escapeHtml(label), {
        permanent: true,
        direction: "top",
        className: "facility-label",
        offset: st.shape === "pin" ? [0, -38] : [0, -16],
      })
      markersRef.current.push({ marker, color: st.color })
      applyLabel(marker, st.color, showLabelsRef.current)
    })
  }

  // 마커 한 개의 라벨(tooltip) 표시/숨김 + 라벨 색 적용
  const applyLabel = (marker: LeafletMarker, color: string, show: boolean) => {
    if (show) {
      marker.openTooltip()
      const el = marker.getTooltip()?.getElement()
      if (el) el.style.setProperty("--facility-color", color)
    } else {
      marker.closeTooltip()
    }
  }

  // 마커 재그리기 (시설/스타일 변경 시에만 — 라벨 토글은 아래 별도 effect로 분리)
  useEffect(() => {
    if (!mapReady) return
    renderMarkers()
  }, [facilities, styles, mapReady])

  // 라벨 토글: 마커를 재생성하지 않고 기존 tooltip만 open/close (300개 재생성 비용 회피)
  useEffect(() => {
    if (!mapReady) return
    for (const { marker, color } of markersRef.current) applyLabel(marker, color, showLabels)
  }, [showLabels, mapReady])

  // 전체 맞춤은 시설 집합이 바뀔 때만 (라벨 토글로는 뷰가 점프하지 않게 분리)
  useEffect(() => {
    if (!mapReady) return
    scheduleFitToAll()
  }, [facilities, mapReady])

  const fitToAll = () => {
    const L = leafletRef.current
    const map = mapRef.current
    const currentFacilities = facilitiesRef.current
    if (!L || !map || currentFacilities.length === 0) return

    map.stop()
    map.invalidateSize({ pan: false })

    const validFacilities = currentFacilities.filter((f) => Number.isFinite(f.lat) && Number.isFinite(f.lon))
    if (validFacilities.length === 0) return

    // 변환 실패 폴백 좌표(광진구청)에 겹쳐 찍힌 마커는 뷰 계산에서 제외 — 한 점 수렴/엉뚱한 줌 방지
    const real = validFacilities.filter((f) => !(f.lat === FALLBACK_COORDS.lat && f.lon === FALLBACK_COORDS.lon))
    const pts = real.length > 0 ? real : validFacilities
    if (pts.length === 1) {
      map.setView([pts[0].lat, pts[0].lon], 16, { animate: false })
      return
    }
    const bounds = L.latLngBounds(pts.map((f) => [f.lat, f.lon] as [number, number]))
    if (!bounds.isValid()) return
    map.fitBounds(bounds, { padding: [60, 60], maxZoom: 17, animate: false })
  }

  const clearScheduledFit = () => {
    if (fitFrameRef.current != null) {
      cancelAnimationFrame(fitFrameRef.current)
      fitFrameRef.current = null
    }
    if (fitTimeoutRef.current != null) {
      window.clearTimeout(fitTimeoutRef.current)
      fitTimeoutRef.current = null
    }
  }

  const scheduleFitToAll = () => {
    clearScheduledFit()
    fitFrameRef.current = requestAnimationFrame(() => {
      mapRef.current?.invalidateSize({ pan: false })
      fitFrameRef.current = requestAnimationFrame(() => {
        fitFrameRef.current = null
        fitToAll()
        fitTimeoutRef.current = window.setTimeout(() => {
          fitTimeoutRef.current = null
          fitToAll()
        }, 120)
      })
    })
  }

  // 3) 레이아웃 변경 신호(전체화면 전환 등) — 현재 중심/줌은 유지하고 타일 크기만 재계산
  useEffect(() => {
    if (!mapReady || resizeSignal === 0) return
    mapRef.current?.invalidateSize({ pan: false })
    const t = window.setTimeout(() => mapRef.current?.invalidateSize({ pan: false }), 120)
    return () => window.clearTimeout(t)
  }, [resizeSignal, mapReady])

  // 4) 특정 시설로 이동
  useEffect(() => {
    if (!mapReady || !focus) return
    const f = facilitiesRef.current.find((x) => x.id === focus.id)
    if (f) mapRef.current?.setView([f.lat, f.lon], 17, { animate: true })
  }, [focus, mapReady])

  return (
    // isolate: leaflet 내부 z-index(200~1000)를 이 래퍼 안 stacking context에 가둬,
    // 모달(Dialog, z-50)이 지도 요소 뒤로 숨지 않게 한다.
    <div ref={ref} className="relative h-full w-full isolate">
      <div ref={mapElRef} className="h-full w-full" />

      {/* 시설 수 (좌상단) */}
      <div className="pointer-events-none absolute left-2 top-2 z-[1000] rounded-md border border-border bg-background/95 px-2.5 py-1 text-xs font-semibold text-gray-700 shadow-sm backdrop-blur-sm">
        총 {facilities.length}개 시설
      </div>

      {/* 범례 (좌하단) — 좌측 칩과 같은 순서, 2열 정렬 + 많을 때 스크롤 */}
      {legend.length > 0 && (
        <div className="absolute bottom-2 left-2 z-[1000] max-w-[280px] rounded-lg border border-border bg-background/95 px-3 py-2 shadow-md backdrop-blur-sm">
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400">분류</div>
          <div className="grid max-h-[34vh] grid-cols-2 gap-x-3 gap-y-1 overflow-y-auto">
            {legend.map((l) => (
              <span key={l.label} className="inline-flex min-w-0 items-center gap-1.5 text-[11px] text-gray-600">
                <span
                  className="inline-flex shrink-0"
                  style={{ width: 13, height: 13, lineHeight: 0 }}
                  dangerouslySetInnerHTML={{ __html: markerSvg(l.shape, l.color, 13) }}
                />
                <span className="truncate">{l.label}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {facilities.length === 0 && (
        <div className="pointer-events-none absolute inset-0 z-[1000] flex items-center justify-center">
          <div className="rounded-lg border border-dashed border-gray-300 bg-background/90 px-4 py-3 text-center text-sm text-muted-foreground">
            왼쪽에서 시설을 추가하면
            <br />
            지도에 표시됩니다
          </div>
        </div>
      )}
    </div>
  )
})

export default FacilityMap
