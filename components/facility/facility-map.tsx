"use client"

import { forwardRef, useEffect, useMemo, useRef, useState } from "react"
import type { LayerGroup, Map as LeafletMap } from "leaflet"
import { FALLBACK_COORDS } from "@/lib/constants"
import type { Facility } from "@/lib/facility-storage"
import { markerIcon, markerSvg, resolveStyle, type CategoryStyle } from "@/lib/facility-markers"

interface FacilityMapProps {
  facilities: Facility[]
  styles: Record<string, CategoryStyle>
  showLabels: boolean
  focus: { id: string; tick: number } | null
  fitSignal: number
}

function escapeHtml(text: string): string {
  const div = document.createElement("div")
  div.textContent = text
  return div.innerHTML
}

/** 시설관리 전용 지도 — 분류별 모양·색상 마커 + 항상 보이는 시설명 라벨. ref는 스크린샷 캡처용 래퍼 */
const FacilityMap = forwardRef<HTMLDivElement, FacilityMapProps>(function FacilityMap(
  { facilities, styles, showLabels, focus, fitSignal },
  ref,
) {
  const mapElRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<LeafletMap | null>(null)
  const layerRef = useRef<LayerGroup | null>(null)
  const leafletRef = useRef<typeof import("leaflet") | null>(null)
  // ref가 아닌 state: 지도 준비 완료 시 마커 effect가 "신선한" facilities 클로저로 재실행되도록
  const [mapReady, setMapReady] = useState(false)

  // 범례: 등장하는 분류 → 스타일(모양+색, 미분류 포함)
  const legend = useMemo(() => {
    const cats = new Set<string>()
    let hasUncategorized = false
    for (const f of facilities) {
      const c = f.category?.trim()
      if (c) cats.add(c)
      else hasUncategorized = true
    }
    const entries = Array.from(cats).map((label) => {
      const st = resolveStyle(label, styles)
      return { label, ...st }
    })
    if (hasUncategorized) {
      const st = resolveStyle(undefined, styles)
      entries.push({ label: "미분류", ...st })
    }
    return entries
  }, [facilities, styles])

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
      mapRef.current?.remove()
      mapRef.current = null
      layerRef.current = null
    }
  }, [])

  // 2) 시설/라벨 변경 시 마커 다시 그리기 + 전체 맞춤
  const renderMarkers = () => {
    const L = leafletRef.current
    const map = mapRef.current
    const layer = layerRef.current
    if (!L || !map || !layer) return

    layer.clearLayers()

    facilities.forEach((f) => {
      const st = resolveStyle(f.category, styles)
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
          <div style="font-weight:700;font-size:13px;color:${st.color};margin-bottom:3px">${escapeHtml(f.name)}</div>
          ${f.category ? `<div style="color:#6b7280;margin-bottom:3px">분류: ${escapeHtml(f.category)}</div>` : ""}
          <div>${escapeHtml(f.address || f.originalInput)}</div>
          ${f.memo ? `<div style="margin-top:3px;color:#6b7280">📝 ${escapeHtml(f.memo)}</div>` : ""}
        </div>`,
      )

      if (showLabels) {
        marker.bindTooltip(escapeHtml(f.name), {
          permanent: true,
          direction: "top",
          className: "facility-label",
          offset: st.shape === "pin" ? [0, -38] : [0, -16],
        })
        marker.openTooltip()
        const el = marker.getTooltip()?.getElement()
        if (el) el.style.setProperty("--facility-color", st.color)
      }
    })
  }

  // 마커 재그리기 (라벨 토글·스타일 변경 포함)
  useEffect(() => {
    if (!mapReady) return
    renderMarkers()
  }, [facilities, styles, showLabels, mapReady])

  // 전체 맞춤은 시설 집합이 바뀔 때만 (라벨 토글로는 뷰가 점프하지 않게 분리)
  useEffect(() => {
    if (!mapReady) return
    fitToAll()
  }, [facilities, mapReady])

  const fitToAll = () => {
    const L = leafletRef.current
    const map = mapRef.current
    if (!L || !map || facilities.length === 0) return
    if (facilities.length === 1) {
      map.setView([facilities[0].lat, facilities[0].lon], 16)
      return
    }
    const bounds = L.latLngBounds(facilities.map((f) => [f.lat, f.lon] as [number, number]))
    map.fitBounds(bounds, { padding: [60, 60], maxZoom: 17 })
  }

  // 3) "전체보기" 신호
  useEffect(() => {
    if (!mapReady || fitSignal === 0) return
    fitToAll()
  }, [fitSignal, mapReady])

  // 4) 특정 시설로 이동
  useEffect(() => {
    if (!mapReady || !focus) return
    const f = facilities.find((x) => x.id === focus.id)
    if (f) mapRef.current?.setView([f.lat, f.lon], 17, { animate: true })
  }, [focus, mapReady])

  return (
    <div ref={ref} className="relative h-full w-full">
      <div ref={mapElRef} className="h-full w-full" />

      {/* 시설 수 (좌상단) */}
      <div className="pointer-events-none absolute left-2 top-2 z-[1000] rounded-md border border-border bg-background/95 px-2.5 py-1 text-xs font-semibold text-gray-700 shadow-sm backdrop-blur-sm">
        총 {facilities.length}개 시설
      </div>

      {/* 범례 (좌하단) */}
      {legend.length > 0 && (
        <div className="pointer-events-none absolute bottom-2 left-2 z-[1000] max-w-[60%] rounded-md border border-border bg-background/95 px-2.5 py-1.5 shadow-sm backdrop-blur-sm">
          <div className="mb-1 text-[10px] font-semibold text-gray-400">분류</div>
          <div className="flex flex-wrap gap-x-2.5 gap-y-1">
            {legend.map((l) => (
              <span key={l.label} className="inline-flex items-center gap-1 text-[11px] text-gray-600">
                <span
                  className="inline-flex"
                  style={{ width: 13, height: 13, lineHeight: 0 }}
                  dangerouslySetInnerHTML={{ __html: markerSvg(l.shape, l.color, 13) }}
                />
                {l.label}
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
