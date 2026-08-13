"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { CircleMarker, LayerGroup, Map as LeafletMap, Marker as LeafletMarker, Renderer } from "leaflet"
import { cctvPlayerUrl, cctvStreamUrl, supportsNativeHls, type CrowdCctv, type CrowdSpot } from "@/lib/crowd/seoul-rtd"
import { trLevel, trSpot, UI, type Lang } from "@/lib/crowd/i18n"
import { romanizeAddress } from "@/lib/crowd/romanize"
import type { LifePoi, MapFocus } from "@/components/gwangjin/use-gwangjin-life"
import type { TrafficLink } from "@/lib/gwangjin/traffic"
import { LIFE_ICON_SVG, LIFE_MARKER_SHAPE, LINE_COLOR_BY_NUM } from "@/components/gwangjin/life-icons"
import type { SubwayArrival } from "@/lib/gwangjin/subway"
import { BUS_TYPE_COLOR, type BusArrival } from "@/lib/gwangjin/bus"
import { KEY_GUIDES } from "@/lib/gwangjin/constants"

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
  /** 지정하면 도시별 1회, 데이터 도착 시 실좌표 bbox로 뷰를 맞춘다 (대시보드 전용 — 미니맵은 미지정) */
  fitCity?: string | null
  /** 목록 hover ↔ 지도 연동 — 해당 마커를 키우고 툴팁을 연다 */
  hoveredName?: string | null
  /** 명소 이름표 상시 표시 (기본 켬 — 토글로 끔). 켜면 hover 툴팁 대신 이름 pill이 붙는다 */
  showLabels?: boolean
  /** 겹치는 이름표 컬링 (대시보드 전용) — 보고서 배치도는 전 지점 이름이 실려야 해서 끔 */
  declutterLabels?: boolean
  /** 상황실 미니맵용 지점별 상시 레이블(HTML, 호출부가 이스케이프 책임) — 있으면 hover 툴팁 대신 permanent */
  opsLabels?: Map<string, string>
  /** 광진 생활 POI(따릉이·EV·쉼터·역·응급실·AED·도서관·주차) — 명소 마커와 별개 레이어. station은 탭 시 도착 팝업 */
  lifePois?: LifePoi[]
  /** 카드 → 지도 포커스: 해당 POI로 flyTo + 팝업. seq가 바뀔 때마다 재발동 (광진 전용) */
  focusPoi?: MapFocus | null
  /** 생활 POI 마커 탭 콜백 — 지도 → 카드 방향 연동 (역 탭 = 보드 전광판 역 전환) */
  onLifePoiTap?: (poi: LifePoi) => void
  /** 광진 도로 소통 폴리라인(원활/서행/정체 색) — 교통 칩 켠 동안만 내려온다 */
  trafficLinks?: TrafficLink[]
  /** 구 경계 오버레이 키 — 지정 시 해당 경계 모듈을 동적 로드해 경계선+바깥 딤을 그린다 (고정 서피스 전용) */
  boundaryKey?: "gwangjin"
  /** 다크 테마 타일(CARTO dark_all) — 대시보드가 테마와 함께 전환. 미지정=voyager 고정(보고서·미니맵) */
  darkTiles?: boolean
}

const SEOUL_CENTER: [number, number] = [37.5519, 126.9918]

const TILE_ATTR =
  '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> © <a href="https://carto.com/attributions">CARTO</a>'
const TILE_URL = {
  light: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
  dark: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
}

// 개수 많은 생활 레이어는 동네 줌부터 — 도시 줌에서 마커 수백 개는 신호가 아니라 소음이다.
// 정류소는 최다(광진 ~300)라 한 단계 더 늦게(15).
const LIFE_MIN_ZOOM: Partial<Record<LifePoi["kind"], number>> = { bike: 14, ev: 14, aed: 14, pharm: 14, bus: 15, senior: 14 }
const LIFE_KIND_LABEL: Partial<Record<LifePoi["kind"], string>> = {
  bike: "따릉이",
  ev: "충전소",
  aed: "AED",
  pharm: "약국",
  bus: "버스",
  senior: "경로당",
}

// 터치 기기는 지름 ~13px 점이 탭 표적으로 너무 작다 — 마커 반지름 가산 (모듈 로드 시 1회 판정)
const TOUCH_PAD =
  typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches ? 3 : 0

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`)
}

/** 생활 POI 클릭 팝업 — kind 도상 뱃지 헤더 + stat 타일 그리드 + 전화·길찾기 액션.
 *  마커와 같은 아이콘·색·형태(간판/원)를 헤더에 되풀이해 "무엇의 상세인지"가 먼저 읽힌다.
 *  길찾기 URL 3종은 DirectionsBar(명소 상세)와 동일 패턴 — 앱 관성 유지 */
const PHONE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>`

function lifePopupHtml(poi: LifePoi): string {
  const name = encodeURIComponent(poi.name)
  const dong = poi.dong ? `<em>${escapeHtml(poi.dong)}</em>` : ""
  // 헤더 도상 — station은 노선색 동그라미, 나머지는 마커와 같은 간판/원 뱃지 (집은 뱃지에선 원형)
  const badge =
    poi.kind === "station" && poi.lines?.length
      ? `<span class="crowd-life-lines klines">${poi.lines
          .map((l) => `<b style="background:${LINE_COLOR_BY_NUM[l] ?? "#475569"}">${escapeHtml(l)}</b>`)
          .join("")}</span>`
      : `<span class="k${LIFE_MARKER_SHAPE[poi.kind as Exclude<LifePoi["kind"], "station">] === "sign" ? " is-sign" : ""}" style="background:${poi.color}">${LIFE_ICON_SVG[poi.kind as Exclude<LifePoi["kind"], "station">]}</span>`
  const addr = poi.addr ? `<p class="a">${escapeHtml(poi.addr)}</p>` : ""
  const stats = poi.stats?.length
    ? `<div class="s">${poi.stats
        .map((s) => `<span><i>${escapeHtml(s.label)}</i><b class="${s.tone ? `gj-${s.tone}` : ""}">${escapeHtml(s.value)}</b></span>`)
        .join("")}</div>`
    : ""
  const arrivals =
    poi.kind === "station"
      ? `<div class="crowd-subway-pop" data-station="${escapeHtml(poi.station ?? "")}">…</div>`
      : poi.kind === "bus"
        ? `<div class="crowd-subway-pop" data-ars="${escapeHtml(poi.arsId ?? "")}">…</div>`
        : ""
  const tel = poi.tel ? `<a class="tel" href="tel:${escapeHtml(poi.tel)}">${PHONE_SVG}${escapeHtml(poi.tel)}</a>` : ""
  // 공식 홈페이지(도서관 등) — 길찾기보다 앞, 마커색 점으로 소속을 표시
  const home = poi.url
    ? `<a href="${escapeHtml(poi.url)}" target="_blank" rel="noopener noreferrer"><i style="background:${poi.color || "#64748b"}"></i>홈페이지</a>`
    : ""
  return `<div class="crowd-life-pop">
    <p class="t">${badge}<span class="tx">${escapeHtml(poi.name)}</span>${dong}</p>
    ${addr}${stats}${arrivals}
    <div class="acts">${tel}${home}
      <a href="https://map.kakao.com/link/to/${name},${poi.lat},${poi.lng}" target="_blank" rel="noopener noreferrer"><i style="background:#ffb100"></i>카카오맵</a>
      <a href="https://map.naver.com/p/directions/-/${poi.lng},${poi.lat},${name}/-/transit" target="_blank" rel="noopener noreferrer"><i style="background:#03c75a"></i>네이버</a>
      <a href="tmap://route?goalname=${name}&goaly=${poi.lat}&goalx=${poi.lng}" title="T맵 앱 필요"><i style="background:#4b2ea8"></i>T맵</a>
    </div>
  </div>`
}

export default function CrowdMap({ spots, lang, selectedName, addressPin, nearestNames, cctvItems, onSelect, center, zoom, fitCity, hoveredName, showLabels, declutterLabels, opsLabels, lifePois, focusPoi, onLifePoiTap, trafficLinks, boundaryKey, darkTiles }: CrowdMapProps) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<LeafletMap | null>(null)
  const leafletRef = useRef<typeof import("leaflet") | null>(null)
  const tileLayerRef = useRef<ReturnType<typeof import("leaflet")["tileLayer"]> | null>(null)
  const darkTilesRef = useRef(darkTiles)
  darkTilesRef.current = darkTiles
  const spotLayerRef = useRef<LayerGroup | null>(null)
  const glowLayerRef = useRef<LayerGroup | null>(null)
  const glowRendererRef = useRef<Renderer | null>(null)
  const pinLayerRef = useRef<LayerGroup | null>(null)
  const cctvLayerRef = useRef<LayerGroup | null>(null)
  const lifeLayerRef = useRef<LayerGroup | null>(null)
  // 생활 POI 마커 색인(kind:name) — 카드 포커스가 팝업을 열 대상. 재렌더마다 새로 채운다
  const lifeMarkersRef = useRef<Map<string, LeafletMarker>>(new Map())
  // 열 팝업의 포커스 대상 + 유효시한 — flyTo의 zoomend가 마커를 전부 재생성(clearLayers)하며
  // 방금 연 팝업을 부수므로, 시한 내 재렌더마다 다시 연다 (성공 시점에 지우면 레이스로 증발)
  const pendingFocusRef = useRef<{ focus: MapFocus; until: number } | null>(null)
  const onLifePoiTapRef = useRef(onLifePoiTap)
  onLifePoiTapRef.current = onLifePoiTap
  const trafficLayerRef = useRef<LayerGroup | null>(null)
  const trafficRendererRef = useRef<Renderer | null>(null)
  const boundaryLayerRef = useRef<LayerGroup | null>(null)
  const markersRef = useRef<Map<string, { marker: CircleMarker; spot: CrowdSpot }>>(new Map())
  const [ready, setReady] = useState(false)
  // 줌 게이트 재계산 트리거 + 현재 줌에서 숨겨진 레이어 라벨(힌트 pill)
  const [zoomTick, setZoomTick] = useState(0)
  const [gatedLabels, setGatedLabels] = useState<string[]>([])
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect
  const selectedNameRef = useRef(selectedName)
  const hoveredNameRef = useRef<string | null>(null)
  const lastFitCityRef = useRef<string | null>(null)
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

  // 이름표 겹침 컬링 — 겹치는 pill은 하나만 남긴다(선택 > 붐빔 순). 서울 121개가 도시 줌에서
  // 서로를 뒤덮어, interactive 이름표를 탭하면 엉뚱한 위 pill이 가로채던 문제의 근본 수정.
  // 숨김은 visibility(display 금지 — offsetWidth 측정이 0이 되어 다음 계산이 무너진다)
  const declutterRef = useRef(declutterLabels)
  declutterRef.current = declutterLabels
  const cullLabels = useCallback(() => {
    const map = mapInstanceRef.current
    if (!map || !declutterRef.current) return
    const kept: Array<{ x1: number; y1: number; x2: number; y2: number }> = []
    const sel = selectedNameRef.current
    const entries = [...markersRef.current.values()].sort(
      (a, b) => Number(b.spot.name === sel) - Number(a.spot.name === sel) || b.spot.levelNum - a.spot.levelNum,
    )
    for (const { marker, spot } of entries) {
      const el = marker.getTooltip()?.getElement()
      if (!el) continue
      const p = map.latLngToContainerPoint([spot.lat, spot.lng])
      const w = el.offsetWidth || 64
      const h = el.offsetHeight || 20
      const rect = { x1: p.x + 8, y1: p.y - h / 2, x2: p.x + 8 + w, y2: p.y + h / 2 }
      const overlaps = kept.some((r) => rect.x1 < r.x2 && rect.x2 > r.x1 && rect.y1 < r.y2 && rect.y2 > r.y1)
      if (overlaps) el.classList.add("crowd-label-culled")
      else {
        el.classList.remove("crowd-label-culled")
        kept.push(rect)
      }
    }
  }, [])
  const cullLabelsRef = useRef(cullLabels)
  cullLabelsRef.current = cullLabels

  // 선택·hover 스타일은 마커 재생성 없이 setStyle로만 반영 (121개 DOM 재생성 방지)
  const applyMarkerStates = useCallback(() => {
    const sel = selectedNameRef.current
    const hov = hoveredNameRef.current
    for (const { marker, spot } of markersRef.current.values()) {
      const isSelected = spot.name === sel
      const isHovered = !isSelected && spot.name === hov
      marker.setStyle({
        color: isSelected || isHovered ? "#1e293b" : "#ffffff",
        weight: isSelected ? 2.5 : isHovered ? 2 : 1.2,
        fillOpacity: isSelected || isHovered ? 0.95 : 0.85,
      })
      marker.setRadius(isSelected ? 11 + TOUCH_PAD : isHovered ? 9 : 5 + spot.levelNum * 1.5 + TOUCH_PAD)
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
        // 휠 줌 부드럽게 — 기본값(정수 스냅·틱당 1레벨)은 맥 휠에서 '퍽퍽' 점프.
        // 휠 줌량은 zoomSnap·wheelPxPerZoomLevel이 결정하고 zoomDelta는 휠에 안 쓰인다(버튼·더블클릭 전용) —
        // 버튼까지 반 칸으로 줄이면 +/-가 굼떠져서 기본 1을 유지한다
        zoomSnap: 0.25,
        wheelPxPerZoomLevel: 120,
        wheelDebounceTime: 20,
      })
      L.control.zoom({ position: "bottomright" }).addTo(map)

      // 타일 (CARTO — OSM 한글 라벨). 테마 전환은 아래 darkTiles 이펙트가 레이어를 갈아끼운다
      tileLayerRef.current = L.tileLayer(darkTilesRef.current ? TILE_URL.dark : TILE_URL.light, {
        attribution: TILE_ATTR,
        subdomains: "abcd",
        maxZoom: 19,
      }).addTo(map)

      // 혼잡도 글로우 전용 pane — 마커(overlayPane, z=400) 아래, CSS blur는 globals.css에서
      const glowPane = map.createPane("crowdGlow")
      glowPane.style.zIndex = "350"
      glowPane.style.pointerEvents = "none"
      glowRendererRef.current = L.canvas({ pane: "crowdGlow" })
      glowLayerRef.current = L.layerGroup().addTo(map)

      // 구 경계 전용 pane — 글로우(350)보다 아래, 타일 위. 클릭 통과
      const boundaryPane = map.createPane("gjBoundary")
      boundaryPane.style.zIndex = "330"
      boundaryPane.style.pointerEvents = "none"
      boundaryLayerRef.current = L.layerGroup().addTo(map)

      // 도로 소통 전용 pane — 경계(330)와 글로우(350) 사이. 선은 배경, 마커가 주인공.
      // 전체도로 모드(ITS)는 폴리라인 ~3천 개 — SVG 노드 폭발을 피해 캔버스로 그린다
      const trafficPane = map.createPane("gjTraffic")
      trafficPane.style.zIndex = "340"
      trafficRendererRef.current = L.canvas({ pane: "gjTraffic" })
      trafficLayerRef.current = L.layerGroup().addTo(map)

      spotLayerRef.current = L.layerGroup().addTo(map)
      pinLayerRef.current = L.layerGroup().addTo(map)
      cctvLayerRef.current = L.layerGroup().addTo(map)
      lifeLayerRef.current = L.layerGroup().addTo(map)
      // 줌·팬마다 이름표 겹침 재계산 (declutter 미사용 호출부에선 즉시 반환)
      map.on("zoomend moveend", () => cullLabelsRef.current())
      // 생활 레이어 줌 게이트 재계산 (광진 전용 — lifePois 없는 호출부에선 상태 변화 무해)
      map.on("zoomend", () => setZoomTick((t) => t + 1))
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
      tileLayerRef.current = null
      spotLayerRef.current = null
      glowLayerRef.current = null
      glowRendererRef.current = null
      pinLayerRef.current = null
      cctvLayerRef.current = null
      lifeLayerRef.current = null
      trafficLayerRef.current = null
      boundaryLayerRef.current = null
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
      // 붐빔은 링이 바깥으로 퍼지는 리플로 다른 등급과 확실히 구분 (색 차이만으론 약해서 모양으로도)
      if (spot.levelNum === 4) {
        L.marker([spot.lat, spot.lng], {
          icon: L.divIcon({ className: "crowd-ripple-anchor", html: `<span class="crowd-ripple"></span>`, iconSize: [22, 22] }),
          interactive: false,
          keyboard: false,
        }).addTo(layer)
      }
      const marker = L.circleMarker([spot.lat, spot.lng], {
        radius: 5 + spot.levelNum * 1.5 + TOUCH_PAD,
        color: "#ffffff",
        weight: 1.2,
        fillColor: spot.color,
        fillOpacity: 0.85,
      })

      // 등급이 인파 실측이 아닌 도시(access/wait)는 툴팁에도 근거 병기
      const basisLine =
        spot.basis === "access" || spot.basis === "wait"
          ? `<span style="opacity:.65">${escapeHtml(spot.basis === "access" ? UI[lang].basisAccess : UI[lang].basisWait)}</span>`
          : ""
      const opsLabel = opsLabels?.get(spot.name)
      if (opsLabel) {
        // 상황실 미니맵 — 지점명·등급·인원을 상시 노출 (호버 없이 한눈에)
        marker.bindTooltip(`<div class="crowd-tip">${opsLabel}</div>`, {
          permanent: true,
          direction: "top",
          offset: [0, -8],
          opacity: 1,
          className: "crowd-ops-label",
        })
      } else if (showLabels) {
        // 이름표 모드(기본) — 어느 점이 어디인지 호버 없이 보이게. 등급은 점 색이 이미 말한다.
        // interactive: 이름표 탭 = 마커 클릭으로 전달(Leaflet interactive 툴팁) — 모바일에서
        // 작은 점 대신 pill 전체가 탭 표적이 된다 (점만 남기면 레이블이 점 옆을 가려 오탭 유발)
        marker.bindTooltip(`<span>${escapeHtml(trSpot(spot.name, lang))}</span>`, {
          permanent: true,
          direction: "right",
          offset: [8, 0],
          opacity: 1,
          className: "crowd-name-label",
          interactive: true,
        })
      } else {
        marker.bindTooltip(
          `<div class="crowd-tip"><b>${escapeHtml(trSpot(spot.name, lang))}</b><span style="color:${spot.color}">● ${escapeHtml(trLevel(spot.level, lang))}</span>${basisLine}</div>`,
          { direction: "top", offset: [0, -8], opacity: 1 },
        )
      }
      marker.on("click", () => onSelectRef.current(spot.name))
      marker.addTo(layer)
      markersRef.current.set(spot.name, { marker, spot })
    }
    applyMarkerStates()
    // 툴팁 DOM은 addTo 직후 프레임에 붙는다 — 붙은 뒤 겹침 컬링
    requestAnimationFrame(() => cullLabelsRef.current())
  }, [ready, spots, lang, applyMarkerStates, opsLabels, showLabels])

  // 선택 변경 반영
  useEffect(() => {
    selectedNameRef.current = selectedName
    if (!ready) return
    applyMarkerStates()
    // 선택 지점 이름표는 컬링 최우선 생존 — 재계산
    cullLabelsRef.current()
  }, [ready, selectedName, applyMarkerStates])

  // 목록 hover ↔ 지도 연동 — 마커 강조 + 툴팁 열기 (permanent 라벨을 쓰는 미니맵에선 미동작)
  useEffect(() => {
    hoveredNameRef.current = hoveredName ?? null
    if (!ready || opsLabels) return
    applyMarkerStates()
    // 이름표 모드에선 툴팁이 전부 permanent라 여닫지 않는다 — 마커 확대만으로 짚어준다
    if (showLabels) return
    for (const [name, { marker }] of markersRef.current) {
      if (name === hoveredName) marker.openTooltip()
      else if (marker.isTooltipOpen()) marker.closeTooltip()
    }
  }, [ready, hoveredName, applyMarkerStates, opsLabels, showLabels])

  // 도시 전환·첫 로드 시 실좌표 bbox로 뷰 최적화 — 고정 줌은 화면 폭에 따라 낭비가 커서(강원 내륙 2/3)
  // 데이터가 도착한 시점에 도시당 1회만 맞춘다. 딥링크로 상세·주소핀이 열려 있으면 그쪽 flyTo가 우선.
  // 뷰는 등급이 있는 지점 위주 — "정보 없음" 외곽(강원 속초~삼척 8곳)까지 다 담으면 신호 밀도가 죽는다.
  useEffect(() => {
    const map = mapInstanceRef.current
    const L = leafletRef.current
    if (!ready || !map || !L || !fitCity || spots.length === 0) return
    if (lastFitCityRef.current === fitCity) return
    lastFitCityRef.current = fitCity
    if (selectedNameRef.current || addressPin) return
    const graded = spots.filter((s) => s.levelNum > 0)
    const target = graded.length >= 2 ? graded : spots
    const bounds = L.latLngBounds(target.map((s) => [s.lat, s.lng] as [number, number]))
    map.fitBounds(bounds, { padding: [32, 32], maxZoom: 15 })
  }, [ready, spots, fitCity, addressPin])

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
            `<div class="crowd-cctv-pop"><p>${escapeHtml(lang === "ko" ? c.name : romanizeAddress(c.name))}</p><video src="${c.src}" autoplay muted playsinline></video></div>`,
            { maxWidth: 320, minWidth: 280, closeButton: true },
          )
        } else {
          marker.bindPopup(
            `<div class="crowd-cctv-pop"><p>${escapeHtml(lang === "ko" ? c.name : romanizeAddress(c.name))}</p><video data-hls-src="${c.src}" autoplay muted playsinline></video></div>`,
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
          `<div class="crowd-cctv-pop"><p>${escapeHtml(lang === "ko" ? c.name : romanizeAddress(c.name))}</p>${player}</div>`,
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

  // 테마 타일 스왑 — 대시보드 다크/라이트 전환 시 dark_all ↔ voyager (미지정 호출부는 불변)
  useEffect(() => {
    const L = leafletRef.current
    const map = mapInstanceRef.current
    if (!ready || !L || !map || darkTiles === undefined) return
    tileLayerRef.current?.remove()
    tileLayerRef.current = L.tileLayer(darkTiles ? TILE_URL.dark : TILE_URL.light, {
      attribution: TILE_ATTR,
      subdomains: "abcd",
      maxZoom: 19,
    }).addTo(map)
  }, [ready, darkTiles])

  // 구 경계 오버레이 — 경계 모듈 동적 로드(타 도시 번들 0바이트): 바깥 딤 + 이중선(할로+점선)
  useEffect(() => {
    const L = leafletRef.current
    const layer = boundaryLayerRef.current
    if (!ready || !L || !layer) return
    layer.clearLayers()
    if (!boundaryKey) return
    let cancelled = false
    void import("@/lib/gwangjin/boundary").then(({ GWANGJIN_BOUNDARY }) => {
      if (cancelled || !boundaryLayerRef.current) return
      const ring = GWANGJIN_BOUNDARY
      const world: Array<[number, number]> = [
        [85, -180],
        [85, 180],
        [-85, 180],
        [-85, -180],
      ]
      // 다크 타일에선 진청 경계선이 묻힌다 — 밝은 스카이로 반전
      const line = darkTiles ? "#38bdf8" : "#0369a1"
      // 구 바깥을 은은하게 가라앉혀 "여기부터가 광진" — 링에 구멍(ring)을 낸 폴리곤
      L.polygon([world, ring], {
        pane: "gjBoundary",
        stroke: false,
        fillColor: darkTiles ? "#000000" : "#0f172a",
        fillOpacity: darkTiles ? 0.25 : 0.08,
        interactive: false,
      }).addTo(layer)
      const closed = [...ring, ring[0]]
      // 할로(넓고 옅게) 위에 점선(가늘고 또렷하게) — 지도 위 어떤 배경에서도 경계가 읽힌다
      L.polyline(closed, { pane: "gjBoundary", color: line, weight: 5, opacity: 0.14, lineCap: "round", interactive: false }).addTo(layer)
      L.polyline(closed, { pane: "gjBoundary", color: line, weight: 1.8, opacity: 0.65, dashArray: "1 6", lineCap: "round", interactive: false }).addTo(layer)
    })
    return () => {
      cancelled = true
    }
  }, [ready, boundaryKey, darkTiles])

  // 광진 도로 소통 — 링크별 폴리라인, 원활/서행/정체 색. 할로(어두운 밑선) 위에 상태색을 얹어
  // 라이트·다크 타일 어디서든 선이 뜨지 않고 도로 위에 앉아 보인다. 탭하면 도로명·속도 툴팁.
  useEffect(() => {
    const L = leafletRef.current
    const layer = trafficLayerRef.current
    if (!ready || !L || !layer) return
    layer.clearLayers()
    const renderer = trafficRendererRef.current ?? undefined
    for (const link of trafficLinks ?? []) {
      L.polyline(link.path, {
        pane: "gjTraffic",
        renderer,
        color: darkTiles ? "#000000" : "#ffffff",
        weight: 7,
        opacity: 0.5,
        lineCap: "round",
        interactive: false,
      }).addTo(layer)
      const line = L.polyline(link.path, {
        pane: "gjTraffic",
        renderer,
        color: link.color,
        weight: 4,
        opacity: 0.9,
        lineCap: "round",
      })
      line.bindTooltip(
        `<div class="crowd-tip"><b>${escapeHtml(link.road || "도로")}</b><span>${escapeHtml(link.idx)} · ${link.spd}km/h</span></div>`,
        { sticky: true, direction: "top", opacity: 1 },
      )
      line.addTo(layer)
    }
  }, [ready, trafficLinks, darkTiles])

  // 광진 생활 POI — 명소 마커와 독립 레이어. 클릭 = 상세 팝업(주소·행정동·상태·전화·길찾기 3종).
  // 역 팝업의 도착 정보는 popupopen 때 /api/gwangjin/subway를 조회 (열기 전 0콜).
  // 개수 많은 종류(LIFE_MIN_ZOOM)는 동네 줌부터 그리고, 숨긴 동안은 하단 힌트 pill이 알린다.
  // 대기 중인 카드 포커스의 팝업 열기 — 마커가 없거나(줌 게이트) 재생성으로 닫혔으면
  // 시한 내 재렌더에서 다시 연다. 이미 열려 있으면 openPopup은 무해.
  const openPendingFocus = useCallback(() => {
    const pending = pendingFocusRef.current
    if (!pending) return
    if (Date.now() > pending.until) {
      pendingFocusRef.current = null
      return
    }
    lifeMarkersRef.current.get(`${pending.focus.kind}:${pending.focus.name}`)?.openPopup()
  }, [])

  useEffect(() => {
    const L = leafletRef.current
    const layer = lifeLayerRef.current
    const map = mapInstanceRef.current
    if (!ready || !L || !layer || !map) return
    layer.clearLayers()
    lifeMarkersRef.current.clear()
    const z = map.getZoom()
    const hidden = new Set<string>()
    const visible: LifePoi[] = []
    for (const poi of lifePois ?? []) {
      const min = LIFE_MIN_ZOOM[poi.kind] ?? 0
      if (z < min) hidden.add(LIFE_KIND_LABEL[poi.kind] ?? poi.kind)
      else visible.push(poi)
    }
    // 내용이 같으면 이전 배열 유지 — 전 도시 공용 zoomend 틱마다 헛리렌더 방지
    setGatedLabels((prev) => (prev.length === hidden.size && prev.every((l) => hidden.has(l)) ? prev : [...hidden]))
    for (const poi of visible) {
      // 형태 = 정보의 특성: 지하철 노선색 동그라미 · 시설은 사각 간판(is-sign) · 쉼터는 집(is-house) ·
      // 탈것은 원. 응급실만 26px(2곳뿐 + 위급 시 눈에 먼저 들어와야 한다). 숫자 배지는 라이브 수치.
      let html: string
      let w = 24
      let h = 24
      if (poi.kind === "station" && poi.lines?.length) {
        w = 18 + (poi.lines.length - 1) * 14
        h = 18
        html = `<span class="crowd-life-lines">${poi.lines
          .map((l) => `<b style="background:${LINE_COLOR_BY_NUM[l] ?? "#475569"}">${escapeHtml(l)}</b>`)
          .join("")}</span>`
      } else {
        const kind = poi.kind as Exclude<LifePoi["kind"], "station">
        const shape = LIFE_MARKER_SHAPE[kind]
        w = h = shape === "sign" ? (kind === "er" ? 26 : 22) : 24
        const countBadge = poi.count != null ? `<i class="crowd-life-count">${poi.count}</i>` : ""
        html = `<span class="crowd-life-icon${shape === "sign" ? " is-sign" : shape === "house" ? " is-house" : ""}" style="background:${poi.color};width:${w}px;height:${h}px">${LIFE_ICON_SVG[kind]}${countBadge}</span>`
      }
      const marker = L.marker([poi.lat, poi.lng], {
        icon: L.divIcon({
          className: "crowd-life-marker",
          html,
          iconSize: [w, h],
          iconAnchor: [w / 2, h / 2],
        }),
        // 명소 마커(z=400대)보다 아래 — 혼잡도가 주인공, 생활 POI는 보조
        zIndexOffset: -100,
      })
      marker.bindTooltip(
        `<div class="crowd-tip"><b>${escapeHtml(poi.name)}</b><span>${escapeHtml(poi.sub)}</span></div>`,
        { direction: "top", offset: [0, -10], opacity: 1 },
      )
      marker.bindPopup(lifePopupHtml(poi), { minWidth: 230, maxWidth: 290 })
      if (poi.kind === "bus" && poi.arsId) {
        // 정류소 도착 — 열 때만 조회. 미신청(needKey)이면 팝업 안에서 신청 링크 안내
        marker.on("popupopen", (e) => {
          const el = e.popup.getElement()?.querySelector<HTMLElement>("[data-ars]")
          if (!el) return
          el.textContent = "도착 정보 불러오는 중…"
          fetch(`/api/gwangjin/bus?ars=${poi.arsId}`)
            .then((r) => (r.ok ? r.json() : null))
            .then((d: { needKey?: boolean; arrivals?: BusArrival[] } | null) => {
              if (d?.needKey) {
                el.innerHTML = `<a href="${KEY_GUIDES.bus.url}" target="_blank" rel="noopener noreferrer" style="text-decoration:underline">실시간 도착은 활용신청(자동승인) 후 표시돼요 ↗</a>`
                return
              }
              const rows = (d?.arrivals ?? []).slice(0, 8)
              if (rows.length === 0) {
                el.textContent = "도착 예정 버스가 없습니다"
                return
              }
              el.innerHTML = rows
                .map(
                  (a) =>
                    `<div class="crowd-subway-row"><b style="background:${BUS_TYPE_COLOR[a.routeType] ?? "#64748b"}">${escapeHtml(a.route)}</b><span>${escapeHtml(a.direction)} 방면</span><em>${escapeHtml(a.msg1.replace("[", " · ").replace("]", ""))}</em></div>`,
                )
                .join("")
            })
            .catch(() => {
              el.textContent = "도착 정보를 불러오지 못했습니다"
            })
        })
      }
      if (poi.kind === "station" && poi.station) {
        marker.on("popupopen", (e) => {
          const el = e.popup.getElement()?.querySelector<HTMLElement>("[data-station]")
          if (!el) return
          el.textContent = "도착 정보 불러오는 중…"
          fetch(`/api/gwangjin/subway?st=${encodeURIComponent(poi.station ?? "")}`)
            .then((r) => (r.ok ? r.json() : null))
            .then((d: { arrivals?: SubwayArrival[] } | null) => {
              const rows = (d?.arrivals ?? []).slice(0, 6)
              if (rows.length === 0) {
                el.textContent = "도착 예정 열차가 없습니다"
                return
              }
              el.innerHTML = rows
                .map(
                  (a) =>
                    `<div class="crowd-subway-row"><b style="background:${a.lineColor}">${escapeHtml(a.line.replace("호선", ""))}</b><span>${escapeHtml(a.dest.replace(/ - .*$/, ""))}</span><em>${a.sec > 0 ? `${Math.floor(a.sec / 60)}분 ${a.sec % 60}초` : escapeHtml(a.msg)}</em></div>`,
                )
                .join("")
            })
            .catch(() => {
              el.textContent = "도착 정보를 불러오지 못했습니다"
            })
        })
      }
      marker.on("click", () => onLifePoiTapRef.current?.(poi))
      marker.addTo(layer)
      lifeMarkersRef.current.set(`${poi.kind}:${poi.name}`, marker)
    }
    // 방금 켠 레이어·줌 게이트 통과로 마커가 이제 생겼을 수 있다 — 대기 포커스 재시도
    openPendingFocus()
  }, [ready, lifePois, zoomTick, openPendingFocus])

  // 카드 → 지도 포커스: 대상으로 날아가고 팝업을 연다. 줌 게이트 레이어(약국 14+ 등)는
  // flyTo가 끝나 zoomend → 마커 재렌더가 돈 뒤에야 마커가 생기므로 pending으로 이어받는다.
  useEffect(() => {
    const map = mapInstanceRef.current
    if (!ready || !map || !focusPoi) return
    // 2.5초 = flyTo 0.6s + zoomend 마커 재생성 + 팝업 autoPan까지 덮는 재개방 시한
    pendingFocusRef.current = { focus: focusPoi, until: Date.now() + 2500 }
    map.once("moveend", openPendingFocus)
    map.flyTo([focusPoi.lat, focusPoi.lng], Math.max(map.getZoom(), 16), { duration: 0.6 })
    return () => {
      map.off("moveend", openPendingFocus)
    }
  }, [ready, focusPoi, openPendingFocus])

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

  return (
    <>
      <div ref={mapRef} className="crowd-map h-full w-full" />
      {/* 줌 게이트 힌트 — 켜둔 레이어가 현재 줌에서 숨겨져 있을 때만. 부모 relative 컨테이너 기준,
          bottom-9 = 모바일 좌하 범례·우하 줌 버튼과 겹치지 않는 높이 */}
      {gatedLabels.length > 0 && (
        <div className="pointer-events-none absolute bottom-9 left-1/2 z-[1000] -translate-x-1/2 whitespace-nowrap rounded-full border border-[var(--cp-border)] bg-[var(--cp-overlay)] px-3 py-1 text-[11px] text-[var(--cp-text-muted)] backdrop-blur-sm">
          {gatedLabels.join("·")}는 지도를 확대하면 표시돼요
        </div>
      )}
    </>
  )
}
