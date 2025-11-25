"use client"

import { useEffect, useRef } from "react"
import { Maximize2 } from "lucide-react"
import { Button } from "@/components/ui/button"

interface MapViewProps {
  lat: number
  lon: number
  address: string
  markers?: Array<{
    lat: number
    lon: number
    address: string
    title?: string // Added title field for facility name
    roadName?: string
    jibunAddress?: string
    adminDong?: string
  }>
}

declare global {
  interface Window {
    L: any
  }
}

export default function MapView({ lat, lon, address, markers }: MapViewProps) {
  const mapRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<any>(null)
  const leafletLoadedRef = useRef(false)

  const handleFullscreen = async () => {
    if (!containerRef.current) return

    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen()
      } else {
        await containerRef.current.requestFullscreen()
        setTimeout(() => {
          if (mapInstanceRef.current) {
            mapInstanceRef.current.invalidateSize()
          }
        }, 100)
      }
    } catch (err) {
      console.error("Fullscreen error:", err)
    }
  }

  useEffect(() => {
    const loadLeaflet = () => {
      if (leafletLoadedRef.current || window.L) {
        leafletLoadedRef.current = true
        return Promise.resolve()
      }

      return new Promise<void>((resolve) => {
        const link = document.createElement("link")
        link.rel = "stylesheet"
        link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
        document.head.appendChild(link)

        const script = document.createElement("script")
        script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
        script.async = true
        document.head.appendChild(script)

        script.onload = () => {
          leafletLoadedRef.current = true
          resolve()
        }
      })
    }

    const initMap = async () => {
      await loadLeaflet()

      if (!mapRef.current || !window.L) return

      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove()
        mapInstanceRef.current = null
      }

      const map = window.L.map(mapRef.current).setView([lat, lon], markers && markers.length > 1 ? 13 : 15)
      mapInstanceRef.current = map

      window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap contributors",
      }).addTo(map)

      if (markers && markers.length > 0) {
        const bounds = window.L.latLngBounds()

        markers.forEach((marker, index) => {
          const markerIcon = window.L.divIcon({
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

          const leafletMarker = window.L.marker([marker.lat, marker.lon], { icon: markerIcon }).addTo(map)

          const tooltipContent = `
            <div style="font-size: 12px; line-height: 1.4;">
              ${marker.title ? `<div style="font-weight: bold; font-size: 14px; margin-bottom: 6px; color: #2563eb;">${marker.title}</div>` : ""}
              <div style="font-weight: bold; margin-bottom: 4px;">위치 ${index + 1}</div>
              ${marker.roadName ? `<div>도로명: ${marker.roadName}</div>` : ""}
              ${marker.jibunAddress ? `<div>지번: ${marker.jibunAddress}</div>` : ""}
              ${marker.adminDong ? `<div>행정동: ${marker.adminDong}</div>` : ""}
            </div>
          `
          leafletMarker.bindTooltip(tooltipContent, { direction: "top", offset: [0, -10] })

          bounds.extend([marker.lat, marker.lon])
        })

        map.fitBounds(bounds, { padding: [50, 50] })
      } else {
        const markerIcon = window.L.icon({
          iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
          iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
          shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
          iconSize: [25, 41],
          iconAnchor: [12, 41],
        })
        window.L.marker([lat, lon], { icon: markerIcon }).addTo(map)
      }
    }

    initMap()

    const handleFullscreenChange = () => {
      setTimeout(() => {
        if (mapInstanceRef.current) {
          mapInstanceRef.current.invalidateSize()
        }
      }, 100)
    }

    document.addEventListener("fullscreenchange", handleFullscreenChange)

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove()
        mapInstanceRef.current = null
      }
      document.removeEventListener("fullscreenchange", handleFullscreenChange)
    }
  }, [lat, lon, markers])

  return (
    <div ref={containerRef} className="relative w-full rounded-lg border border-border overflow-hidden h-[300px]">
      <div ref={mapRef} className="w-full h-full" />

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
