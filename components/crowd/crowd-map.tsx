"use client"

import { useEffect, useRef, useState } from "react"
import type { CircleMarker, LayerGroup, Map as LeafletMap, Marker as LeafletMarker } from "leaflet"
import type { CrowdSpot } from "@/lib/crowd/seoul-rtd"

interface CrowdMapProps {
  spots: CrowdSpot[]
  selectedName: string | null
  addressPin: { label: string; lat: number; lng: number } | null
  nearestNames: string[]
  onSelect: (name: string) => void
}

const SEOUL_CENTER: [number, number] = [37.5519, 126.9918]

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`)
}

export default function CrowdMap({ spots, selectedName, addressPin, nearestNames, onSelect }: CrowdMapProps) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<LeafletMap | null>(null)
  const leafletRef = useRef<typeof import("leaflet") | null>(null)
  const spotLayerRef = useRef<LayerGroup | null>(null)
  const pinLayerRef = useRef<LayerGroup | null>(null)
  const markersRef = useRef<Map<string, CircleMarker>>(new Map())
  const [ready, setReady] = useState(false)
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect

  // 지도 초기화 (1회)
  useEffect(() => {
    let cancelled = false

    const init = async () => {
      const L = await import("leaflet")
      if (cancelled || !mapRef.current || mapInstanceRef.current) return
      leafletRef.current = L

      const map = L.map(mapRef.current, {
        center: SEOUL_CENTER,
        zoom: 12,
        zoomControl: false,
        attributionControl: true,
      })
      L.control.zoom({ position: "bottomright" }).addTo(map)

      // 다크 타일 (CARTO dark_matter)
      L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> © <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: "abcd",
        maxZoom: 19,
      }).addTo(map)

      spotLayerRef.current = L.layerGroup().addTo(map)
      pinLayerRef.current = L.layerGroup().addTo(map)
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
      pinLayerRef.current = null
      markersRef.current.clear()
    }
  }, [])

  // 명소 마커 갱신
  useEffect(() => {
    const L = leafletRef.current
    const layer = spotLayerRef.current
    if (!ready || !L || !layer) return
    layer.clearLayers()
    markersRef.current.clear()

    for (const spot of spots) {
      const isSelected = spot.name === selectedName
      const marker = L.circleMarker([spot.lat, spot.lng], {
        radius: isSelected ? 11 : 5 + spot.levelNum * 1.5,
        color: isSelected ? "#ffffff" : spot.color,
        weight: isSelected ? 2.5 : 1.5,
        fillColor: spot.color,
        fillOpacity: isSelected ? 0.95 : 0.75,
      })

      marker.bindTooltip(
        `<div class="crowd-tip"><b>${escapeHtml(spot.name)}</b><span style="color:${spot.color}">● ${escapeHtml(spot.level)}</span></div>`,
        { direction: "top", offset: [0, -8], opacity: 1 },
      )
      marker.on("click", () => onSelectRef.current(spot.name))
      marker.addTo(layer)
      markersRef.current.set(spot.name, marker)
    }
  }, [ready, spots, selectedName])

  // 선택 시 지도 이동
  useEffect(() => {
    const map = mapInstanceRef.current
    if (!map || !selectedName) return
    const spot = spots.find((s) => s.name === selectedName)
    if (spot) map.flyTo([spot.lat, spot.lng], Math.max(map.getZoom(), 14), { duration: 0.6 })
  }, [ready, selectedName, spots])

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
        <path d="M12.5 0C5.6 0 0 5.6 0 12.5C0 21.9 12.5 41 12.5 41S25 21.9 25 12.5C25 5.6 19.4 0 12.5 0Z" fill="#ffffff"/>
        <circle cx="12.5" cy="12.5" r="5.5" fill="#0b0f14"/>
      </svg>`,
      iconSize: [28, 42],
      iconAnchor: [14, 42],
    })

    const pin: LeafletMarker = L.marker([addressPin.lat, addressPin.lng], { icon: pinIcon, zIndexOffset: 1000 })
    pin.bindTooltip(`<div class="crowd-tip"><b>${escapeHtml(addressPin.label)}</b></div>`, {
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
        { color: "#ffffff", weight: 1, opacity: 0.35, dashArray: "4 6" },
      ).addTo(layer)
      bounds.extend([spot.lat, spot.lng])
    }
    map.flyToBounds(bounds, { padding: [60, 60], duration: 0.8, maxZoom: 15 })
  }, [ready, addressPin, nearestNames, spots])

  return <div ref={mapRef} className="crowd-map h-full w-full" />
}
