"use client"

import { useEffect, useRef } from "react"
import { supportsNativeHls } from "@/lib/crowd/seoul-rtd"

/** https·CORS 개방 HLS 스트림 직접 재생 (TOPIS·부산 ITS) —
 * Safari 계열은 네이티브, 그 외는 hls.js 지연 로드로 붙인다 */
export default function HlsVideo({ src, className }: { src: string; className?: string }) {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    if (supportsNativeHls()) {
      video.src = src
      return
    }
    let disposed = false
    let hls: import("hls.js").default | null = null
    void import("hls.js").then(({ default: Hls }) => {
      if (disposed || !Hls.isSupported()) return
      hls = new Hls({ maxBufferLength: 15 })
      hls.loadSource(src)
      hls.attachMedia(video)
    })
    return () => {
      disposed = true
      hls?.destroy()
    }
  }, [src])

  return (
    <video
      ref={videoRef}
      className={className ?? "h-full w-full object-contain"}
      autoPlay
      muted
      playsInline
      controls={false}
    />
  )
}
