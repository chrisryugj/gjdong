"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { CircleMarker, LayerGroup, Map as LeafletMap, Marker as LeafletMarker, Renderer } from "leaflet"
import { cctvPlayerUrl, cctvStreamUrl, supportsNativeHls, type CrowdCctv, type CrowdSpot } from "@/lib/crowd/seoul-rtd"
import { trLevel, trSpot, UI, type Lang } from "@/lib/crowd/i18n"
import { romanizeAddress } from "@/lib/crowd/romanize"

interface CrowdMapProps {
  spots: CrowdSpot[]
  lang: Lang
  selectedName: string | null
  addressPin: { label: string; lat: number; lng: number } | null
  nearestNames: string[]
  cctvItems: CrowdCctv[]
  onSelect: (name: string) => void
  /** 도시 전환 시 지도 초기 뷰 — 생략하면 서울 */
  center?: [number, number]
  zoom?: number
}

const SEOUL_CENTER: [number, number] = [37.5519, 126.9918]

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`)
}

export default function CrowdMap({ spots, lang, selectedName, addressPin, nearestNames, cctvItems, onSelect, center, zoom }: CrowdMapProps) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<LeafletMap | null>(null)
  const leafletRef = useRef<typeof import("leaflet") | null>(null)
  const spotLayerRef = useRef<LayerGroup | null>(null)
  const glowLayerRef = useRef<LayerGroup | null>(null)
  const glowRendererRef = useRef<Renderer | null>(null)
  const pinLayerRef = useRef<LayerGroup | null>(null)
  const cctvLayerRef = useRef<LayerGroup | null>(null)
  const markersRef = useRef<Map<string, { marker: CircleMarker; spot: CrowdSpot }>>(new Map())
  const [ready, setReady] = useState(false)
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect
  const selectedNameRef = useRef(selectedName)
  const centerRef = useRef(center)
  centerRef.current = center
  const zoomRef = useRef(zoom)
  zoomRef.current = zoom

  // 도시 전환 → 해당 도시 초기 뷰로 즉시 이동 (마운트 시엔 map 옵션이 처리,
  // center는 CITIES 모듈 상수 참조라 도시가 바뀔 때만 이펙트가 돈다)
  useEffect(() => {
    const map = mapInstanceRef.current
    if (!ready || !map || !center) return
    map.setView(center, zoom ?? map.getZoom())
  }, [ready, center, zoom])

  // 선택 스타일은 마커 재생성 없이 setStyle로만 반영 (121개 DOM 재생성 방지)
  const applySelection = useCallback((sel: string | null) => {
    for (const { marker, spot } of markersRef.current.values()) {
      const isSelected = spot.name === sel
      marker.setStyle({
        color: isSelected ? "#1e293b" : "#ffffff",
        weight: isSelected ? 2.5 : 1.2,
        fillOpacity: isSelected ? 0.95 : 0.85,
      })
      marker.setRadius(isSelected ? 11 : 5 + spot.levelNum * 1.5)
    }
  }, [])

  // 지도 초기화 (1회)
  useEffect(() => {
    let cancelled = false

    const init = async () => {
      const L = await import("leaflet")
      if (cancelled || !mapRef.current || mapInstanceRef.current) return
      leafletRef.current = L

      const map = L.map(mapRef.current, {
        center: centerRef.current ?? SEOUL_CENTER,
        zoom: zoomRef.current ?? 12,
        zoomControl: false,
        attributionControl: true,
      })
      L.control.zoom({ position: "bottomright" }).addTo(map)

      // 밝은 타일 (CARTO voyager — OSM 한글 라벨)
      L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> © <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: "abcd",
        maxZoom: 19,
      }).addTo(map)

      // 혼잡도 글로우 전용 pane — 마커(overlayPane, z=400) 아래, CSS blur는 globals.css에서
      const glowPane = map.createPane("crowdGlow")
      glowPane.style.zIndex = "350"
      glowPane.style.pointerEvents = "none"
      glowRendererRef.current = L.canvas({ pane: "crowdGlow" })
      glowLayerRef.current = L.layerGroup().addTo(map)

      spotLayerRef.current = L.layerGroup().addTo(map)
      pinLayerRef.current = L.layerGroup().addTo(map)
      cctvLayerRef.current = L.layerGroup().addTo(map)
      mapInstanceRef.current = map
      setReady(true)
    }

    void init()

    // 모바일에서 상세 열림/닫힘에 따라 지도 높이가 바뀌므로 크기 재계산
    const observer = new ResizeObserver(() => mapInstanceRef.current?.invalidateSize())
    if (mapRef.current) observer.observe(mapRef.current)

    return () => {
      cancelled = true
      observer.disconnect()
      mapInstanceRef.current?.remove()
      mapInstanceRef.current = null
      spotLayerRef.current = null
      glowLayerRef.current = null
      glowRendererRef.current = null
      pinLayerRef.current = null
      cctvLayerRef.current = null
      markersRef.current.clear()
    }
  }, [])

  // 명소 마커 갱신 (데이터가 바뀔 때만 재생성 — 선택 변경은 아래 setStyle 이펙트가 처리)
  useEffect(() => {
    const L = leafletRef.current
    const layer = spotLayerRef.current
    const glowLayer = glowLayerRef.current
    const glowRenderer = glowRendererRef.current
    if (!ready || !L || !layer) return
    layer.clearLayers()
    glowLayer?.clearLayers()
    markersRef.current.clear()

    for (const spot of spots) {
      // 혼잡도 글로우 — 보간 아님, 스팟 주변 분위기 표시 (혼잡할수록 넓고 진하게)
      if (glowLayer && glowRenderer) {
        L.circle([spot.lat, spot.lng], {
          radius: 200 + spot.levelNum * 80, // m
          stroke: false,
          fillColor: spot.color,
          fillOpacity: 0.13 + spot.levelNum * 0.05,
          interactive: false,
          renderer: glowRenderer,
        }).addTo(glowLayer)
      }
      const marker = L.circleMarker([spot.lat, spot.lng], {
        radius: 5 + spot.levelNum * 1.5,
        color: "#ffffff",
        weight: 1.2,
        fillColor: spot.color,
        fillOpacity: 0.85,
      })

      marker.bindTooltip(
        `<div class="crowd-tip"><b>${escapeHtml(trSpot(spot.name, lang))}</b><span style="color:${spot.color}">● ${escapeHtml(trLevel(spot.level, lang))}</span></div>`,
        { direction: "top", offset: [0, -8], opacity: 1 },
      )
      marker.on("click", () => onSelectRef.current(spot.name))
      marker.addTo(layer)
      markersRef.current.set(spot.name, { marker, spot })
    }
    applySelection(selectedNameRef.current)
  }, [ready, spots, lang, applySelection])

  // 선택 변경 반영
  useEffect(() => {
    selectedNameRef.current = selectedName
    if (!ready) return
    applySelection(selectedName)
  }, [ready, selectedName, applySelection])

  // 선택 시 지도 이동
  useEffect(() => {
    const map = mapInstanceRef.current
    if (!map || !selectedName) return
    const spot = spots.find((s) => s.name === selectedName)
    if (spot) map.flyTo([spot.lat, spot.lng], Math.max(map.getZoom(), 14), { duration: 0.6 })
  }, [ready, selectedName, spots])

  // 선택 명소의 주변 CCTV 마커
  useEffect(() => {
    const L = leafletRef.current
    const layer = cctvLayerRef.current
    if (!ready || !L || !layer) return
    layer.clearLayers()

    const cctvIcon = L.divIcon({
      className: "crowd-cctv-marker",
      html: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="background:#1e293b;border-radius:50%;padding:3px;box-shadow:0 1px 3px rgba(0,0,0,.4)">
        <path d="M16.75 12h3.632a1 1 0 0 1 .894 1.447l-2.034 4.069a1 1 0 0 1-1.708.134l-2.124-2.97"/>
        <path d="M17.106 9.053a1 1 0 0 1 .447 1.341l-3.106 6.211a1 1 0 0 1-1.342.447L3.61 12.3a2.92 2.92 0 0 1-1.3-3.91L3.69 5.6a2.92 2.92 0 0 1 3.92-1.3z"/>
        <path d="M2 19h3.76a2 2 0 0 0 1.8-1.1L9 15"/>
      </svg>`,
      iconSize: [20, 20],
      iconAnchor: [10, 10],
    })

    for (const c of cctvItems) {
      if (c.lat === 0) continue // 좌표 미제공 카메라(부산 큐레이션)는 목록 패널에서만
      const marker = L.marker([c.lat, c.lng], { icon: cctvIcon, zIndexOffset: 500 })
      if (c.src && c.kind === "hls") {
        // https·CORS 개방 스트림(TOPIS) — 네이티브 HLS는 src 직결, 그 외는 popupopen 때 hls.js 부착
        if (supportsNativeHls()) {
          marker.bindPopup(
            `<div class="crowd-cctv-pop"><p>${escapeHtml(c.name)}</p><video src="${c.src}" autoplay muted playsinline></video></div>`,
            { maxWidth: 320, minWidth: 280, closeButton: true },
          )
        } else {
          marker.bindPopup(
            `<div class="crowd-cctv-pop"><p>${escapeHtml(c.name)}</p><video data-hls-src="${c.src}" autoplay muted playsinline></video></div>`,
            { maxWidth: 320, minWidth: 280, closeButton: true },
          )
          marker.on("popupopen", (e) => {
            const video = e.popup.getElement()?.querySelector<HTMLVideoElement>("video[data-hls-src]")
            if (!video || video.dataset.hlsAttached) return
            video.dataset.hlsAttached = "1"
            void import("hls.js").then(({ default: Hls }) => {
              if (!Hls.isSupported()) return
              const hls = new Hls({ maxBufferLength: 15 })
              hls.loadSource(video.dataset.hlsSrc ?? "")
              hls.attachMedia(video)
              marker.once("popupclose", () => hls.destroy())
            })
          })
        }
      } else if (c.src) {
        // 팝업 DOM은 열 때 삽입되므로 플레이어도 그때 로드됨 (lazy)
        // Safari 계열은 서울시 iframe 플레이어가 깨져서 네이티브 <video>로 직접 재생
        const player = supportsNativeHls()
          ? `<video src="${cctvStreamUrl(c)}" autoplay muted playsinline></video>`
          : `<iframe src="${cctvPlayerUrl(c)}" title="CCTV ${escapeHtml(c.name)}" allow="autoplay"></iframe>`
        marker.bindPopup(
          `<div class="crowd-cctv-pop"><p>${escapeHtml(c.name)}</p>${player}</div>`,
          { maxWidth: 320, minWidth: 280, closeButton: true },
        )
      } else {
        marker.bindTooltip(
          `<div class="crowd-tip"><b>CCTV · ${escapeHtml(c.name)}</b><span>${escapeHtml(UI[lang].noVideo)}</span></div>`,
          { direction: "top", offset: [0, -12] },
        )
      }
      marker.addTo(layer)
    }
  }, [ready, cctvItems, lang])

  // 주소 핀 + 근처 명소 연결선
  useEffect(() => {
    const L = leafletRef.current
    const layer = pinLayerRef.current
    const map = mapInstanceRef.current
    if (!L || !layer || !map) return
    layer.clearLayers()
    if (!addressPin) return

    const pinIcon = L.divIcon({
      className: "crowd-address-pin",
      html: `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="42" viewBox="0 0 25 41">
        <path d="M12.5 0C5.6 0 0 5.6 0 12.5C0 21.9 12.5 41 12.5 41S25 21.9 25 12.5C25 5.6 19.4 0 12.5 0Z" fill="#1e293b"/>
        <circle cx="12.5" cy="12.5" r="5.5" fill="#ffffff"/>
      </svg>`,
      iconSize: [28, 42],
      iconAnchor: [14, 42],
    })

    const pin: LeafletMarker = L.marker([addressPin.lat, addressPin.lng], { icon: pinIcon, zIndexOffset: 1000 })
    pin.bindTooltip(`<div class="crowd-tip"><b>${escapeHtml(lang === "ko" ? addressPin.label : romanizeAddress(addressPin.label))}</b></div>`, {
      direction: "top",
      offset: [0, -40],
    })
    pin.addTo(layer)

    const bounds = L.latLngBounds([[addressPin.lat, addressPin.lng]])
    for (const name of nearestNames) {
      const spot = spots.find((s) => s.name === name)
      if (!spot) continue
      L.polyline(
        [
          [addressPin.lat, addressPin.lng],
          [spot.lat, spot.lng],
        ],
        { color: "#1e293b", weight: 1, opacity: 0.4, dashArray: "4 6" },
      ).addTo(layer)
      bounds.extend([spot.lat, spot.lng])
    }
    map.flyToBounds(bounds, { padding: [60, 60], duration: 0.8, maxZoom: 15 })
  }, [ready, addressPin, nearestNames, spots, lang])

  return <div ref={mapRef} className="crowd-map h-full w-full" />
}
