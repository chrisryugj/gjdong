"use client"

import { useEffect, useRef, useState } from "react"
import { Maximize2 } from "lucide-react"
import type { DivIcon, Map as LeafletMap } from "leaflet"
import { Button } from "@/components/ui/button"

interface MapViewProps {
  lat: number
  lon: number
  address: string
  markers?: Array<{
    lat: number
    lon: number
    address: string
    title?: string
    roadName?: string
    jibunAddress?: string
    adminDong?: string
  }>
}

export default function MapView({ lat, lon, address, markers }: MapViewProps) {
  const [mapError, setMapError] = useState<string | null>(null)
  const mapRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<LeafletMap | null>(null)

  const handleFullscreen = async () => {
    if (!containerRef.current) return

    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen()
      } else {
        await containerRef.current.requestFullscreen()
        setTimeout(() => {
          mapInstanceRef.current?.invalidateSize()
        }, 100)
      }
    } catch (err) {
      console.error("Fullscreen error:", err)
    }
  }

  useEffect(() => {
    let cancelled = false

    const initMap = async () => {
      try {
        const L = await import("leaflet")

        if (cancelled || !mapRef.current) return
        setMapError(null)

        if (mapInstanceRef.current) {
          mapInstanceRef.current.remove()
          mapInstanceRef.current = null
        }

        const createSingleMarkerIcon = (): DivIcon =>
          L.divIcon({
            className: "custom-marker",
            html: `<svg xmlns="http://www.w3.org/2000/svg" width="25" height="41" viewBox="0 0 25 41">
              <path d="M12.5 0C5.6 0 0 5.6 0 12.5C0 21.9 12.5 41 12.5 41S25 21.9 25 12.5C25 5.6 19.4 0 12.5 0Z" fill="#2563eb"/>
              <circle cx="12.5" cy="12.5" r="6" fill="white"/>
            </svg>`,
            iconSize: [25, 41],
            iconAnchor: [12, 41],
          })

        const createNumberedMarkerIcon = (index: number): DivIcon =>
          L.divIcon({
            className: "custom-marker",
            html: `<div style="
              background: #3b82f6;
              color: white;
              width: 32px;
              height: 32px;
              border-radius: 50%;
              display: flex;
              align-items: center;
              justify-content: center;
              font-weight: bold;
              font-size: 14px;
              border: 3px solid white;
              box-shadow: 0 2px 6px rgba(0,0,0,0.3);
            ">${index + 1}</div>`,
            iconSize: [32, 32],
            iconAnchor: [16, 16],
          })

        const map = L.map(mapRef.current).setView([lat, lon], markers && markers.length > 1 ? 13 : 15)
        mapInstanceRef.current = map

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: "© OpenStreetMap contributors",
        }).addTo(map)

        if (markers && markers.length > 0) {
          const bounds = L.latLngBounds(markers.map((marker) => [marker.lat, marker.lon] as [number, number]))

          const escapeHtml = (text: string) => {
            const div = document.createElement("div")
            div.textContent = text
            return div.innerHTML
          }

          markers.forEach((marker, index) => {
            const leafletMarker = L.marker([marker.lat, marker.lon], {
              icon: createNumberedMarkerIcon(index),
            }).addTo(map)

            const tooltipContent = `
              <div style="font-size: 12px; line-height: 1.4;">
                ${marker.title ? `<div style="font-weight: bold; font-size: 14px; margin-bottom: 6px; color: #2563eb;">${escapeHtml(marker.title)}</div>` : ""}
                <div style="font-weight: bold; margin-bottom: 4px;">위치 ${index + 1}</div>
                ${marker.roadName ? `<div>도로명 ${escapeHtml(marker.roadName)}</div>` : ""}
                ${marker.jibunAddress ? `<div>지번 ${escapeHtml(marker.jibunAddress)}</div>` : ""}
                ${marker.adminDong ? `<div>행정동 ${escapeHtml(marker.adminDong)}</div>` : ""}
              </div>
            `
            leafletMarker.bindTooltip(tooltipContent, { direction: "top", offset: [0, -10] })

            bounds.extend([marker.lat, marker.lon])
          })

          map.fitBounds(bounds, { padding: [50, 50] })
        } else {
          L.marker([lat, lon], { icon: createSingleMarkerIcon() }).addTo(map)
        }
      } catch (error) {
        console.error("Map initialization error:", error)
        if (!cancelled) {
          setMapError("지도를 불러오지 못했습니다.")
        }
      }
    }

    void initMap()

    const handleFullscreenChange = () => {
      setTimeout(() => {
        mapInstanceRef.current?.invalidateSize()
      }, 100)
    }

    document.addEventListener("fullscreenchange", handleFullscreenChange)

    return () => {
      cancelled = true
      mapInstanceRef.current?.remove()
      mapInstanceRef.current = null
      document.removeEventListener("fullscreenchange", handleFullscreenChange)
    }
  }, [lat, lon, markers])

  return (
    <div ref={containerRef} className="relative w-full rounded-lg border border-border overflow-hidden h-[300px]">
      <div ref={mapRef} className="w-full h-full" />
      {mapError && (
        <div className="absolute inset-0 z-[1002] flex items-center justify-center bg-background/95 px-4 text-center text-sm text-muted-foreground">
          {mapError}
        </div>
      )}

      <Button
        onClick={handleFullscreen}
        size="icon"
        variant="secondary"
        className="hidden md:flex absolute top-2 right-2 z-[1001] bg-background/95 backdrop-blur-sm hover:bg-background"
        title="크게보기"
      >
        <Maximize2 className="h-4 w-4" />
      </Button>

      {!markers && (
        <div className="absolute bottom-2 left-2 bg-background/95 backdrop-blur-sm px-2 py-1 rounded text-xs text-muted-foreground border border-border z-[1000]">
          {address}
        </div>
      )}
      {markers && markers.length > 1 && (
        <div className="absolute top-12 right-2 bg-background/95 backdrop-blur-sm px-2 py-1 rounded text-xs text-muted-foreground border border-border z-[1000]">
          총 {markers.length}개 위치
        </div>
      )}
    </div>
  )
}
