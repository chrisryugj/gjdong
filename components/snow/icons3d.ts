// /snow 입체 정보 핀(3라운드 2026-09-20). /dumping icons3d.ts(18라운드 후속)를 복사해 모델만 바꿨다. dumping 파일 수정 0.
// maplibre 커스텀 레이어(renderingMode 3d) 위의 Three.js 장면. 입체 보기에서 평면 원 대신 모델이 선다:
//   제설함=각진 상자(경사 뚜껑) 청회 · 염화칼슘보관함=원통(뚜껑) 청빙 · 모래주머니=납작한 포대 2단(주민센터는 3단) 모래색 · 초등학교=깃대+흰 깃발(받침은 150m 안 열선 유무 색)
//   열선 위치=발광 구슬(줌 14.2 아래에서만, 구 전체에서 55곳이 보이게) · 선형 미확인 결빙구간 끝점=땅에 누운 진홍 고리 · 열선 없는 취약구간·결빙구간 번호=입체 숫자(진홍) · 동별 기둥 1~3위=입체 숫자(기둥 색)
// 크기는 화면 기준 최소 높이를 지킨다(마커처럼): 조망에서도 점이 아니라 모양이 보이고, 확대하면 실제 크기에 가까워진다. 빽빽한 자재는 확대 상한을 둔다(383개가 구를 덮지 않게).
// 모델 공간: x=동, y=위(m), z=남(getMatrixForModel 규약). 지형은 안 켜므로 y=0.
// 5라운드: 그리기 전에 깊이 버퍼를 비운다(render). 3라운드까지는 지도 깊이를 공유해 건물이 핀을 가렸는데, 드론 비행·회전처럼 카메라가 계속 움직이면 4~13px 핀이 건물 뒤로 들락거려 깜박였다(사용자 지적). 핀은 마커처럼 늘 위에, 핀끼리는 깊이 검사
// 툴팁은 같은 자리의 투명 fill-extrusion(snow-map S.posts)이 queryRenderedFeatures로 받는다(커스텀 레이어는 조회 불가).
// ★MeshPhysicalMaterial은 환경맵 없이 검게 나온다(dumping 실측) → Lambert+emissive
// 4라운드(2026-09-21): 경사 추정 구간 = 고도 단면대로 솟는 반투명 보라 경사면 + 윗선을 오르막으로 흐르는 화살(setSlopes) · 제설차가 상습결빙구간 선형을 왕복(setTrucks, 2단계부터) · 종류별 발광(setEmissive)
// 5라운드(2026-09-21 사용자 지적 "3D 아이콘 너무 커, dumping처럼 깔끔하게"): 핀 확대 상한을 dumping과 같은 세계 크기(44~46m)로. 조망 4~5px 점, 줌 15부터 제 크기. 구간 번호는 3D 숫자를 버리고 2D 배지(snow-map S.weakLabel)로
// 6라운드(2026-09-21 사용자 지적 "제설함·모래함이 안 보이고, 뭔지 마우스 대 보기 전엔 모른다"): 종류는 물건 실루엣이 아니라 물건 위에 서는 글자 표지판(badge: 종류색 바탕 + 제·염·모, 카메라를 향해 도는 빌보드)이 알린다. 물건은 자리표라 목표 9px로 줄이고, 라이트 몸통은 종이 섞기(58%)를 버리고 종류색 그대로(옅은 몸통은 베이지 지도에 묻혔다). 포대는 2단 십자 대신 3포 피라미드(십자 포대는 햄버거로 읽혔다)
// 표지판을 2D 심볼 층이 아니라 장면 안에 두는 이유: 기울인 조망에서 멀리 있는 것이 원근대로 작아져야 383개가 화면 위쪽에 쌓이지 않는다(심볼 층은 최소 절반 크기까지만 줄어 실측에서 "염염제제"로 쌓였다). 평면 보기는 심볼 층(snow-map S.matLabel)
import * as THREE from "three"
import { Font } from "three/examples/jsm/loaders/FontLoader.js"
import { TextGeometry } from "three/examples/jsm/geometries/TextGeometry.js"
import digitFont from "@/components/dumping/digit-font.json"
import maplibregl, { type CustomLayerInterface, type CustomRenderMethodInput, type Map as MlMap } from "maplibre-gl"
import { RESOURCES, RISK, RISK_STYLE } from "@/lib/snow/labels"

export type IconKind = "salt" | "cacl" | "sand" | "sandCenter" | "school" | "schoolGap" | "heat" | "iceEnd" | "dongRank"
export interface IconPoint {
  lng: number
  lat: number
  rank?: number // 배지 숫자(동별 순위)
  h?: number // 배지를 띄울 높이(m). 동별 기둥 꼭대기
  color?: string // 배지 색. 없으면 종류 기본색
}
// 경사 추정 구간(4라운드): 좌표는 오르막 방향([lat,lng]), hs는 낮은 끝 기준 고도(m). 지도 위에 보라 경사면(고도 단면 벽)을 세우고 그 위를 화살(chevron)이 오르막으로 흐른다
export interface SlopeRamp {
  coords: [number, number][]
  hs: number[]
  rise: number
  heat: boolean // 60m 안 열선 있음(흐리게)
}
// 제설 장비 노선(4라운드 시연): 상습결빙구간 선형 위를 제설차가 왕복한다. coords [lng,lat]
export interface TruckRoute {
  coords: [number, number][]
  meters: number
}
// 구간 벽(4라운드 냉독: 조망에서 취약구간 선·번호가 2D 낙서로 읽혔다): 선형을 따라 화면 기준 일정 높이(px)로 서는 얇은 벽. 열선 없는 취약·결빙구간(진홍), 법령 탭은 관리청별 색. coords [lat,lng]
export interface SegWall {
  coords: [number, number][]
  color: string
  h?: number // 높이 배율(기본 1. 결빙구간 0.55)
}

const ANCHOR: [number, number] = [127.085, 37.546] // 모델 원점(구 중심). 모든 인스턴스는 여기서의 미터 오프셋
const TARGET_PX = 44 // 아이콘 목표 화면 높이
// 빽빽한 자재의 확대 상한(배). 3라운드 6배 › 4라운드 20배(조망 15px)는 383개 상자·원통·포대가 구를 덮어 "너무 크다"(사용자 지적, 5라운드) → 10배: 세계 크기 46m = dumping 시설 핀(11m×4배)과 같다. 조망(줌 13.3) 7px, 줌 13.8부터 목표 DENSE_PX(px 수치는 6라운드 공식 수정 뒤 실제 값)
const DENSE_MAX = 10
const DENSE_PX = 10 // 자재 목표 화면 높이. 6라운드: 26(상수 13이 공식 2배 오류로 26px) → 10. 종류는 글자 표지판이 알리고 물건은 자리표(줌 15 물탱크만 한 원통 228개가 "아직 크다")
const APPEAR_MS = 650
const LAT0 = 37.546
// 줌당 m/px. ★maplibre 줌은 512px 타일 기준이라 256px 타일 공식(156543/2^z)의 절반. 6라운드까지 2배로 잡혀 있어 "목표 px" 상수가 전부 화면에서 2배로 나왔다(실측 z15.1 중심 1.77m/px). 공식을 고치고 기존 상수는 2배로 바꿔 화면은 그대로
const metersPerPixel = (z: number) => (78271.51696 * Math.cos((LAT0 * Math.PI) / 180)) / Math.pow(2, z)
const easeOutBack = (t: number) => 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2)

interface Part {
  geom: THREE.BufferGeometry
  mat: THREE.Material
  local: THREE.Matrix4
  base?: THREE.Color // 흐림 전 색(setDim이 바탕색 쪽으로 섞는다)
  shadowOpacity?: number // 접지 그림자 원반(흐림은 투명도로)
  billboard?: boolean // 글자 표지판: 카메라 방위·기울기를 따라 돌고, BADGE_FROM_ZOOM부터 나타난다(흐림은 투명도로)
}
interface KindDef {
  height: number // 모델 높이(m). 화면 크기 계산 기준
  maxScale: number // 화면 크기 유지를 위한 확대 상한(배)
  parts: Part[]
  hideAboveZoom?: number // 이 줌보다 확대하면 숨긴다(열선 구슬: 줌 14.2부터 선이 대신한다)
  targetPx?: number // 종류별 목표 화면 높이(기본 TARGET_PX). 열선 구슬은 작게(55개가 구를 덮지 않게)
}

// 5라운드 색 체계(사용자: "칙칙하고 낙서 같다, 고급스럽게"): 검은 윤곽선(만화 선)과 반투명 흐림(겹치면 탁해진다)을 버린다.
// 몸통은 종류색을 종이(라이트) 쪽으로 섞은 옅은 색, 뚜껑·마개·끈만 종류색 원색(다크는 종류색 몸통 + 어두운 뚜껑). 접지 그림자 원반이 입체와 자리를 말한다.
// 흐림(setDim)은 투명도가 아니라 바탕색(종이·밤) 쪽으로 섞기. 지도 범례 스와치는 종류색 원색 그대로(lib/snow/labels)
const GROUND = { dark: "#0b1622", light: "#e6e6df" } as const
const PAPER_TINT = "#f7f4ee"
const mix = (a: string, b: string, f: number) => `#${new THREE.Color(a).lerp(new THREE.Color(b), f).getHexString()}`
const lambert = (color: string, extra: Partial<THREE.MeshLambertMaterialParameters> = {}) => new THREE.MeshLambertMaterial({ color, ...extra })
const at = (x: number, y: number, z: number, rx = 0, rz = 0) => new THREE.Matrix4().makeTranslation(x, y, z).multiply(new THREE.Matrix4().makeRotationX(rx)).multiply(new THREE.Matrix4().makeRotationZ(rz))
const part = (geom: THREE.BufferGeometry, color: string, local: THREE.Matrix4, extra: Partial<THREE.MeshLambertMaterialParameters> = {}): Part => ({ geom, mat: lambert(color, extra), local, base: new THREE.Color(color) })
const glow = (color: string, k: number): Partial<THREE.MeshLambertMaterialParameters> => ({ emissive: new THREE.Color(color), emissiveIntensity: k })
// 접지 그림자: 바닥에 누운 검은 원반(depthWrite 없음). 몸통이 위에서 가리고 가장자리만 남아 "서 있다"가 읽힌다
const shadow = (r: number, dark: boolean): Part => {
  const opacity = dark ? 0.32 : 0.15
  return { geom: new THREE.CircleGeometry(r, 20).rotateX(-Math.PI / 2), mat: new THREE.MeshBasicMaterial({ color: "#000000", transparent: true, opacity, depthWrite: false }), local: at(0, 0.06, 0), shadowOpacity: opacity }
}
// 포대: 눕힌 캡슐(길이 방향 x)
const bag = (r: number, len: number) => new THREE.CapsuleGeometry(r, len, 4, 10).rotateZ(Math.PI / 2)
// 글자 표지판(6라운드): 물건 위 BADGE_GAP 띄워 서는 정사각 판. 물건 배율(k = DENSE_PX·mpp/높이)을 같이 타므로 한 변을 물건 높이에 비례시켜 화면에서는 종류와 무관하게 BADGE_PX(화면 중심 기준. 기울인 조망의 앞쪽은 원근으로 더 크다).
// 조망에서는 BADGE_FROM_ZOOM 아래로 접힌다(물건 점만 남는다)
const BADGE_PX = 14
const BADGE_GAP_PX = 1.5
const BADGE_FROM_ZOOM = 13.8 // 이 줌부터 0.5줌에 걸쳐 커지며 나타난다
const badgeTextures = new Map<string, THREE.CanvasTexture>()
function badgeTexture(glyph: string, fill: string, ink: string): THREE.CanvasTexture {
  const key = `${glyph}|${fill}|${ink}`
  const hit = badgeTextures.get(key)
  if (hit) return hit
  const S = 128
  const c = document.createElement("canvas")
  c.width = c.height = S
  const ctx = c.getContext("2d")!
  ctx.beginPath()
  ctx.roundRect(3, 3, S - 6, S - 6, S * 0.24)
  ctx.fillStyle = fill
  ctx.fill()
  // 화면 서체(SUIT, next/font 변수)로. 아직 안 실렸으면 시스템 한글 서체
  const family = getComputedStyle(document.documentElement).getPropertyValue("--font-suit").trim()
  ctx.font = `700 ${Math.round(S * 0.56)}px ${family ? `${family}, ` : ""}"Apple SD Gothic Neo", "Noto Sans KR", sans-serif`
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.fillStyle = ink
  ctx.fillText(glyph, S / 2, S / 2 + S * 0.035)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  badgeTextures.set(key, t)
  return t
}
// 표지판 판: 투명 배경은 alphaTest로 잘라 깊이를 쓴다(반투명 정렬 없이 표지판끼리 앞뒤가 맞는다). 한 변 = 물건 높이 × BADGE_PX/DENSE_PX
const badge = (glyph: string, fill: string, ink: string, objectHeight: number): Part => {
  const side = (objectHeight * BADGE_PX) / DENSE_PX
  const gap = (objectHeight * BADGE_GAP_PX) / DENSE_PX
  return {
    geom: new THREE.PlaneGeometry(side, side),
    mat: new THREE.MeshBasicMaterial({ map: badgeTexture(glyph, fill, ink), transparent: true, alphaTest: 0.4, side: THREE.DoubleSide }),
    local: at(0, objectHeight + gap + side / 2, 0),
    billboard: true,
  }
}
const INK = "#1c2228"
const PAPER = "#ece7dc"
const res = (id: (typeof RESOURCES)[number]["id"], dark: boolean) => {
  const r = RESOURCES.find((x) => x.id === id)!
  return dark ? r.color : r.colorLight
}

// 모델은 만들 때 한 번. 종류마다 높이 4~7m(실물 크기 언저리. 화면 크기 계산이 같은 기준을 쓰게)
function buildDefs(dark: boolean): Record<IconKind, KindDef> {
  const salt = res("salt", dark)
  const cacl = res("cacl", dark)
  const sand = res("sand", dark)
  const heat = res("heat", dark)
  const risk = dark ? RISK.weak.color : RISK.weak.colorLight
  // 몸통은 종류색 그대로(라이트 진한 색·다크 파스텔). 마감(뚜껑·마개·맨 위 포대)은 라이트에서 종이 쪽으로 밝게, 다크에서 어둡게: 위가 밝아야 "서 있다"가 읽힌다
  const body = (c: string) => c
  const trim = (c: string, darkVariant: string) => (dark ? darkVariant : mix(c, PAPER_TINT, 0.42))
  const lid = trim(salt, "#5c6d86")
  const cap = trim(cacl, "#4d8fb3")
  const tie = trim(sand, "#a98a4c")
  const pole = dark ? PAPER : "#5b6470"
  const flagNone = dark ? PAPER : "#7b8794"
  const badgeInk = dark ? "#0b1216" : "#ffffff" // 다크 종류색은 파스텔이라 잉크 글자, 라이트는 진한 색이라 흰 글자(범례 스와치·평면 배지와 같다)
  return {
    // 제설함: 각진 상자 + 앞으로 기운 뚜껑(도로변 상자와 같은 실루엣). 몸통 청회, 뚜껑 밝게, 투입구는 대비색
    salt: {
      height: 4.6,
      maxScale: DENSE_MAX,
      targetPx: DENSE_PX,
      parts: [shadow(3.2, dark), part(new THREE.BoxGeometry(4.4, 3.2, 3.2), body(salt), at(0, 1.6, 0)), part(new THREE.BoxGeometry(4.7, 0.5, 3.6), lid, at(0, 3.4, 0.25, -0.22)), part(new THREE.BoxGeometry(3.0, 0.35, 0.3), dark ? INK : PAPER_TINT, at(0, 2.3, -1.65)), badge("제", salt, badgeInk, 4.6)],
    },
    // 염화칼슘보관함: 원통 + 마개
    cacl: {
      height: 4.4,
      maxScale: DENSE_MAX,
      targetPx: DENSE_PX,
      parts: [shadow(2.6, dark), part(new THREE.CylinderGeometry(1.7, 1.6, 3.6, 16), body(cacl), at(0, 1.8, 0)), part(new THREE.CylinderGeometry(1.9, 1.9, 0.6, 16), cap, at(0, 3.9, 0)), badge("염", cacl, badgeInk, 4.4)],
    },
    // 모래주머니: 포대 3포 피라미드(아래 2포 앞뒤로 나란히, 위 1포 밝게). 포대는 동서로 눕힌 캡슐
    sand: {
      height: 3.3,
      maxScale: DENSE_MAX,
      targetPx: DENSE_PX,
      parts: [shadow(2.6, dark), part(bag(0.9, 2.6), body(sand), at(0, 0.9, -1.0)), part(bag(0.9, 2.6), body(sand), at(0, 0.9, 1.0)), part(bag(0.9, 2.6), tie, at(0, 2.4, 0)), badge("모", sand, badgeInk, 3.3)],
    },
    // 동주민센터 보관분: 6포 피라미드(3·2·1), 조금 크게
    sandCenter: {
      height: 4.9,
      maxScale: DENSE_MAX,
      targetPx: DENSE_PX,
      parts: [
        shadow(3.2, dark),
        part(bag(1.0, 3.2), body(sand), at(0, 1.0, -2.1)),
        part(bag(1.0, 3.2), body(sand), at(0, 1.0, 0)),
        part(bag(1.0, 3.2), body(sand), at(0, 1.0, 2.1)),
        part(bag(1.0, 3.2), body(sand), at(0, 2.5, -1.05)),
        part(bag(1.0, 3.2), body(sand), at(0, 2.5, 1.05)),
        part(bag(1.0, 3.2), tie, at(0, 4.0, 0)),
        badge("모", sand, badgeInk, 4.9),
      ],
    },
    // 초등학교: 깃대 + 깃발. 받침 원반이 150m 안 열선 유무(열선색·진홍). 열선 있는 학교는 깃발도 열선색(받침만으로는 조망에서 15 대 6이 구분되지 않았다)
    // 5라운드: 상한 24배(조망 44px 깃발이 지도를 덮었다) → 12배(조망 22px, 줌 14부터 36px). 깃대는 잉크 대신 슬레이트(라이트), 깃발은 조금 크게
    school: {
      height: 12,
      maxScale: 12,
      targetPx: 36,
      parts: [shadow(3.0, dark), part(new THREE.CylinderGeometry(2.4, 2.4, 0.5, 18), heat, at(0, 0.25, 0), glow(heat, 0.25)), part(new THREE.CylinderGeometry(0.22, 0.28, 11, 8), pole, at(0, 5.5, 0)), part(new THREE.BoxGeometry(4.6, 3.0, 0.18), heat, at(2.3, 9.5, 0), glow(heat, 0.3))],
    },
    // 열선 없는 학교 깃발은 무채색: 다크 종이색 · 라이트 슬레이트(베이지 바탕에서 흰 깃발이 안 보이던 냉독, 잉크는 낙서처럼 보였다)
    schoolGap: {
      height: 12,
      maxScale: 12,
      targetPx: 36,
      parts: [shadow(3.0, dark), part(new THREE.CylinderGeometry(2.4, 2.4, 0.5, 18), risk, at(0, 0.25, 0), glow(risk, 0.25)), part(new THREE.CylinderGeometry(0.22, 0.28, 11, 8), pole, at(0, 5.5, 0)), part(new THREE.BoxGeometry(4.6, 3.0, 0.18), flagNone, at(2.3, 9.5, 0), glow(flagNone, 0.12))],
    },
    // 열선 위치: 조망에서 55곳이 보이게. 줌 14.2부터는 선이 대신한다. 육각 동전(옆면 진한 호박 + 발광 윗면). 기준 치수는 지름(4.8m)
    // 5라운드: 30배·16px는 조망에서 노란 덩어리(장면 2) → 14배·12px(조망 10px)
    heat: {
      height: 4.8,
      maxScale: 14,
      targetPx: 12,
      hideAboveZoom: 14.2,
      parts: [shadow(3.0, dark), part(new THREE.CylinderGeometry(2.4, 2.4, 2.2, 6), dark ? "#b8860b" : "#b07a12", at(0, 1.1, 0)), part(new THREE.CylinderGeometry(2.45, 2.45, 0.6, 6), heat, at(0, 2.5, 0), glow(heat, dark ? 0.6 : 0.45))],
    },
    // 선형 미확인 결빙구간 끝점: 땅에 누운 진홍 고리(평면의 빈 원과 같은 뜻). 고리 관을 굵게·띄워 옆면이 보이게
    iceEnd: {
      height: 6,
      maxScale: 18,
      targetPx: 20,
      parts: [shadow(3.6, dark), part(new THREE.TorusGeometry(2.6, 0.8, 8, 24).rotateX(Math.PI / 2), risk, at(0, 0.9, 0), glow(risk, 0.3))],
    },
    // 입체 숫자만(모델 없음). 5라운드: 구간·결빙 번호는 2D 배지로 돌아갔다(진홍 벽 위 진홍 숫자가 겹쳐 안 읽혔다). 동별 순위만 기둥 위 입체 숫자
    dongRank: { height: 1, maxScale: 1, parts: [] },
  }
}

interface KindState {
  points: IconPoint[]
  pos: { x: number; z: number }[] // 원점 기준 미터
  meshes: THREE.InstancedMesh[]
  digits: THREE.Group[] // 입체 숫자(카메라 방위를 따라 선다)
  appearAt: number
}

// ─── 경사면·화살(4라운드). 라이트 지도에서 보라 점선이 안 읽히던 것(사용자 지적)을 입체로: 구간마다 고도 단면대로 솟는 반투명 벽 + 벽 윗선을 따라 오르막으로 흐르는 화살 ───
const CHEV_M = 6.4 // 화살 한 개 폭(m). 이면도로 폭 언저리
const CHEV_PX = 32 // 화살 목표 화면 폭. 조망에서도 모양이 보이게
const CHEV_MAX_SCALE = 14
const CHEV_GAP_M = 20 // 화살 간격(m, 실물 크기일 때). 확대 상한에서는 간격도 같이 늘린다
const CHEV_SPEED = 7 // 오르막으로 흐르는 속도(m/s)
const RAMP_MIN_PX = 28 // 경사면 최소 화면 높이(조망에서 납작해지지 않게 고도 단면을 늘린다)
const RAMP_MAX_EXAGGERATION = 5
// 화살: 오른쪽(+x)을 가리키는 ">" 띠. 밑면이 y=0
function chevronGeometry(): THREE.BufferGeometry {
  const s = new THREE.Shape()
  s.moveTo(-1.6, 3.2)
  s.lineTo(2.4, 0)
  s.lineTo(-1.6, -3.2)
  s.lineTo(-3.6, -3.2)
  s.lineTo(0.4, 0)
  s.lineTo(-3.6, 3.2)
  s.closePath()
  const g = new THREE.ExtrudeGeometry(s, { depth: 2.2, bevelEnabled: false }) // 두께 2.2m: 납작하면 기울인 시점에서 평면 글리프로 읽혔다(냉독 5차)
  g.rotateX(-Math.PI / 2) // 도형 평면(XY)을 땅(XZ)에 눕히고 두께가 위(+y)로
  return g
}
interface Ramp {
  pts: { x: number; z: number; h: number; s: number }[] // 모델 좌표(m)·고도(m)·누적 거리(m)
  len: number
  rise: number
  heat: boolean
  wall: THREE.Mesh
  first: number // 화살 인스턴스 시작 번호
  slots: number
}
const SEG_WALL_PX = 36 // 구간 벽 화면 높이(냉독 5차: 조망에서 자재 핀보다 먼저 보여야 한다)
const SNOW_MAX = 2400
const SNOW_RADIUS_PX = 1400 // 화면 중심에서 눈이 내리는 반경(px)
const SNOW_HEIGHT_PX = 840 // 눈이 시작하는 높이(px)
const SNOW_FALL_PX = 140 // 낙하 속도(px/s)
const SNOW_DRIFT_PX = 28 // 바람(px/s)
const RAIN_MAX = 1600
const RAIN_LEN_PX = 22 // 빗줄기 길이(px)
const RAMP_WALL_FROM_ZOOM = 14.3 // 경사면은 이 줌부터(조망에서는 보라 얼룩으로 읽혔다)
const RAMP_CHEV_FROM_ZOOM = 14.3 // 화살도 경사면과 같은 줌부터(중간 줌에서 파편으로 보였다). 조망은 굵은 보라 선만
interface Truck {
  cum: number[]
  pts: { x: number; z: number }[]
  dist: number
  dir: 1 | -1
}
// 제설차 모델(길이 7m, 앞이 +x): 청회 적재함 + 잉크 운전석 + 호박색 경광등 + 앞날(제설삽) + 바퀴
const TRUCK_LEN = 7
const TRUCK_PX = 40
const TRUCK_MAX_SCALE = 30 // 조망(13m/px)에서도 16px 정도로 보이게(dumping의 10배는 조망에서 5px 점이었다)
const TRUCK_SPEED = 9 // m/s(약 32km/h)
function truckParts(dark: boolean): Part[] {
  const body = dark ? "#8fa3c0" : "#3f4f66"
  const amber = dark ? "#ffb703" : "#c98a00"
  return [
    { geom: new THREE.BoxGeometry(4.4, 2.4, 2.3), mat: lambert(body), local: at(-1.1, 1.9, 0) },
    { geom: new THREE.BoxGeometry(2.0, 2.0, 2.3), mat: lambert(INK), local: at(2.2, 1.7, 0) },
    { geom: new THREE.BoxGeometry(0.8, 0.4, 1.2), mat: lambert(amber, { emissive: new THREE.Color(amber), emissiveIntensity: 0.8 }), local: at(2.2, 2.9, 0) },
    { geom: new THREE.BoxGeometry(0.5, 1.2, 3.2), mat: lambert(amber), local: at(3.5, 0.7, 0, 0, 0.35) },
    { geom: new THREE.CylinderGeometry(0.55, 0.55, 2.5, 10).rotateX(Math.PI / 2), mat: lambert("#262626"), local: at(2.0, 0.55, 0) },
    { geom: new THREE.CylinderGeometry(0.55, 0.55, 2.5, 10).rotateX(Math.PI / 2), mat: lambert("#262626"), local: at(-2.0, 0.55, 0) },
  ]
}

// 입체 숫자(dumping 18라운드 후속): SUIT Bold 윤곽 압출(digit-font.json, 0~9만). 카메라 방위를 따라 정면이 보인다
const DIGIT_FONT = new Font(digitFont as unknown as ConstructorParameters<typeof Font>[0])
const digitCache = new Map<string, THREE.BufferGeometry>()
function digitGeometry(text: string): THREE.BufferGeometry {
  const hit = digitCache.get(text)
  if (hit) return hit
  const g = new TextGeometry(text, { font: DIGIT_FONT, size: 1, depth: 0.22, curveSegments: 6, bevelEnabled: false })
  g.computeBoundingBox()
  const b = g.boundingBox!
  g.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2)
  digitCache.set(text, g)
  return g
}
function makeDigit(text: string, color: string, dark: boolean): THREE.Group {
  const g = new THREE.Group()
  // 숫자는 라벨: 깊이 검사 없이 벽·건물 위에(투명 목록 renderOrder 20 > 벽 10). 같은 진홍 벽 위에서 숫자가 묻히던 실측(라이트 z16 "31") → 어두운 겉껍질 윤곽선(뒷면만, 1.12배)
  const outline = new THREE.Mesh(digitGeometry(text).clone().scale(1.12, 1.12, 1.6), new THREE.MeshBasicMaterial({ color: dark ? "#07111a" : "#2b2622", side: THREE.BackSide, transparent: true, depthTest: false }))
  outline.renderOrder = 19
  const m = new THREE.Mesh(digitGeometry(text), new THREE.MeshLambertMaterial({ color, emissive: new THREE.Color(color), emissiveIntensity: 0.3, transparent: true, depthTest: false }))
  m.renderOrder = 20
  g.add(outline, m)
  return g
}
const DONG_DIGIT_M = 78 // 동별 기둥 숫자 높이(m). 기둥 한 변 120m 안
const DONG_DIGIT_MIN_PX = 40 // 조망에서 읽히는 최소 높이(px)

export class SnowIcons3DLayer implements CustomLayerInterface {
  id = "snow-icons3d"
  type = "custom" as const
  renderingMode = "3d" as const
  visible = true
  private map: MlMap | null = null
  private renderer: THREE.WebGLRenderer | null = null
  private scene = new THREE.Scene()
  private camera = new THREE.Camera()
  private defs: Record<IconKind, KindDef> | null = null
  private dark = true
  private kinds = new Map<IconKind, KindState>()
  private boost = new Map<IconKind, number>() // 종류별 확대 배율(2단계 제설함 1.6배)
  private dims = new Map<IconKind, number>() // 종류별 흐림(평시·보강 자재 대기 0.28)
  private badgeDims = new Map<IconKind, number>() // 표지판 흐림(단계 대기만. 공백 탭은 1)
  private lastZoom = -1
  private lastBearing = 0
  private lastPitch = 0
  private anchor = maplibregl.MercatorCoordinate.fromLngLat(ANCHOR, 0)
  private scale = this.anchor.meterInMercatorCoordinateUnits()
  // 경사면·화살(setSlopes)과 제설차(setTrucks). 화살·제설차는 매 프레임 움직인다
  private ramps: Ramp[] = []
  private rampData: SlopeRamp[] = []
  private segWalls: THREE.Mesh[] = []
  private segWallData: SegWall[] = []
  // 눈(4라운드 후속 wow): 시나리오 적설(cm)에 비례한 눈송이가 화면 중심 주변에 내린다. 화면 기준 크기·속도(mpp 배율)라 어느 줌에서든 같은 밀도
  private snow: THREE.Points | null = null
  private snowPos: Float32Array | null = null
  private snowLevel = 0 // 0~1
  private snowCenter = { x: 0, z: 0 }
  // 비(4라운드 후속, 지도 날씨): 짧은 세로 빗줄기(LineSegments). 눈과 같은 화면 기준 규칙, 3배 빠르고 바람 없음
  private rain: THREE.LineSegments | null = null
  private rainPos: Float32Array | null = null
  private rainLevel = 0
  private rainCenter = { x: 0, z: 0 }
  private chev: THREE.InstancedMesh | null = null
  private chevGeom = chevronGeometry()
  private emissive = new Map<IconKind, number>() // 종류별 발광(2단계 제설함 0.6)
  private trucks: Truck[] = []
  private truckRoutes: TruckRoute[] = []
  private truckMeshes: THREE.InstancedMesh[] = []
  private truckDefs: Part[] | null = null
  private lastTick = 0
  private toModel(lng: number, lat: number): { x: number; z: number } {
    const mc = maplibregl.MercatorCoordinate.fromLngLat([lng, lat], 0)
    return { x: (mc.x - this.anchor.x) / this.scale, z: (mc.y - this.anchor.y) / this.scale }
  }

  constructor() {
    // 부드러운 조명(5라운드): 하늘빛을 올리고 직사광을 낮춰 그늘이 검게 꺼지지 않게
    const hemi = new THREE.HemisphereLight(0xffffff, 0xd9d4c7, 1.25)
    const sun = new THREE.DirectionalLight(0xffffff, 0.95)
    sun.position.set(0.45, 1, 0.55)
    this.scene.add(hemi, sun)
  }

  onAdd(map: MlMap, gl: WebGLRenderingContext | WebGL2RenderingContext) {
    this.map = map
    if (!this.renderer) {
      this.renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl, antialias: true })
      this.renderer.autoClear = false
    }
    if (!this.defs) this.defs = buildDefs(this.dark)
    // 이미 받은 점이 있으면(스타일 교체 뒤 재추가) 다시 세운다
    for (const [kind, st] of this.kinds) this.rebuild(kind, st.points, false)
    if (this.rampData.length) this.buildRamps()
    if (this.segWallData.length) this.buildSegWalls()
    if (this.truckRoutes.length) this.buildTrucks()
  }

  onRemove() {
    // 스타일 교체 시 잠깐 떼었다 붙는다. 렌더러·모델은 유지
    this.map = null
  }

  /** 테마: 라이트는 종이 위라 자재색이 진한 쪽(colorLight). 모델을 다시 만든다 */
  setTheme(dark: boolean) {
    if (this.dark === dark && this.defs) return
    this.dark = dark
    this.defs = buildDefs(dark)
    this.applyDims()
    this.applyEmissive()
    for (const [kind, st] of this.kinds) this.rebuild(kind, st.points, false)
    this.truckDefs = null
    if (this.map) {
      this.buildRamps()
      this.buildSegWalls()
      this.buildTrucks()
    }
    this.map?.triggerRepaint()
  }

  /** 단계 문법: 종류 발광(2단계 제설함 0.6). 0이면 기본 재질로 */
  setEmissive(kind: IconKind, intensity: number) {
    if ((this.emissive.get(kind) ?? 0) === intensity) return
    this.emissive.set(kind, intensity)
    this.applyEmissive()
    this.map?.triggerRepaint()
  }
  private applyEmissive() {
    const defs = this.defs
    if (!defs) return
    for (const [k, v] of this.emissive)
      for (const part of defs[k].parts) {
        const m = part.mat as THREE.MeshLambertMaterial
        if (!(m instanceof THREE.MeshLambertMaterial) || !part.base) continue
        m.emissive = part.base.clone()
        m.emissiveIntensity = v
        m.needsUpdate = true
      }
  }

  // 선형을 따라 서는 벽: 점마다 바닥(y 0)·꼭대기(y h) 두 꼭짓점, 이웃끼리 사각형. 꼭짓점 색은 바닥 어둡게·꼭대기 제 색(위로 밝아져 "선다"가 읽힌다). 깊이 검사 없음(건물이 가리던 실측)
  private wallMesh(pts: { x: number; z: number; h: number }[], color: string, opacity: number, ridge: boolean): THREE.Mesh {
    const pos = new Float32Array(pts.length * 2 * 3)
    const col = new Float32Array(pts.length * 2 * 3)
    const base = new THREE.Color(color)
    const dim = base.clone().multiplyScalar(this.dark ? 0.55 : 0.78) // 5라운드: 밑동을 너무 어둡게 하면 탁한 띠로 읽혔다
    pts.forEach((p, i) => {
      pos.set([p.x, 0, p.z], i * 6)
      pos.set([p.x, p.h, p.z], i * 6 + 3)
      col.set([dim.r, dim.g, dim.b], i * 6)
      col.set([base.r, base.g, base.b], i * 6 + 3)
    })
    const idx: number[] = []
    for (let i = 0; i < pts.length - 1; i++) {
      const a = i * 2
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
    }
    const geom = new THREE.BufferGeometry()
    geom.setAttribute("position", new THREE.BufferAttribute(pos, 3))
    geom.setAttribute("color", new THREE.BufferAttribute(col, 3))
    geom.setIndex(idx)
    const wall = new THREE.Mesh(geom, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false, depthTest: false }))
    wall.renderOrder = 10
    if (ridge) {
      // 윗선(능선): 1px 밝은 선. 벽의 자식이라 y 배율을 같이 받는다
      const rg = new THREE.BufferGeometry()
      rg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(pts.flatMap((p) => [p.x, p.h, p.z])), 3))
      const edge = new THREE.Line(rg, new THREE.LineBasicMaterial({ color: mix(color, "#ffffff", this.dark ? 0.35 : 0.5), transparent: true, opacity: Math.min(1, opacity + 0.3), depthTest: false }))
      edge.renderOrder = 11
      wall.add(edge)
    }
    return wall
  }
  private disposeWall(w: THREE.Mesh) {
    this.scene.remove(w)
    w.geometry.dispose()
    ;(w.material as THREE.Material).dispose()
    for (const c of w.children) {
      ;(c as THREE.Line).geometry.dispose()
      ;((c as THREE.Line).material as THREE.Material).dispose()
    }
  }

  /** 구간 벽(열선 없는 취약·결빙구간, 법령 탭 관리청별). 높이는 화면 기준 SEG_WALL_PX. 빈 배열이면 치운다 */
  setSegWalls(walls: SegWall[]) {
    this.segWallData = walls
    if (this.map) this.buildSegWalls()
  }
  private buildSegWalls() {
    for (const w of this.segWalls) this.disposeWall(w)
    this.segWalls = []
    const map = this.map
    if (!map || !this.segWallData.length) {
      map?.triggerRepaint()
      return
    }
    for (const sw of this.segWallData) {
      const pts = sw.coords.map(([lat, lng]) => ({ ...this.toModel(lng, lat), h: sw.h ?? 1 }))
      const wall = this.wallMesh(pts, sw.color, 0.8, true)
      this.scene.add(wall)
      this.segWalls.push(wall)
    }
    this.lastZoom = -1
    map.triggerRepaint()
  }

  /** 경사 추정 구간(오르막 방향 좌표·고도 단면). 빈 배열이면 치운다 */
  setSlopes(ramps: SlopeRamp[]) {
    this.rampData = ramps
    if (this.map) this.buildRamps()
  }
  private buildRamps() {
    const map = this.map
    for (const r of this.ramps) this.disposeWall(r.wall)
    if (this.chev) {
      this.scene.remove(this.chev)
      ;(this.chev.material as THREE.Material).dispose()
      this.chev = null
    }
    this.ramps = []
    if (!map || !this.rampData.length) {
      map?.triggerRepaint()
      return
    }
    const color = this.dark ? RISK.slope.color : RISK.slope.colorLight
    const muted = this.dark ? "#6a5c86" : "#a89bc4"
    let first = 0
    for (const rd of this.rampData) {
      const pts: Ramp["pts"] = []
      let s = 0
      rd.coords.forEach(([lat, lng], i) => {
        const p = this.toModel(lng, lat)
        if (i > 0) s += Math.hypot(p.x - pts[i - 1].x, p.z - pts[i - 1].z)
        pts.push({ x: p.x, z: p.z, h: rd.hs[i] ?? 0, s })
      })
      // 경사면: 고도 단면대로 서는 벽(y 배율 = 과장, 프레임마다 scale.y). 경사면·화살은 깊이 검사를 끈다(데이터 덧그림): 이면도로 양옆 건물이 벽을 가려 확대해도 안 보이던 실측(z16)
      const wall = this.wallMesh(pts, rd.heat ? muted : color, rd.heat ? 0.22 : 0.6, true)
      this.scene.add(wall)
      const slots = Math.max(1, Math.ceil(s / CHEV_GAP_M))
      this.ramps.push({ pts, len: s, rise: Math.max(0.5, rd.rise), heat: rd.heat, wall, first, slots })
      first += slots
    }
    const chev = new THREE.InstancedMesh(this.chevGeom, new THREE.MeshLambertMaterial({ color, emissive: new THREE.Color(color), emissiveIntensity: this.dark ? 0.5 : 0.25, depthTest: false, transparent: true }), first)
    chev.frustumCulled = false
    chev.renderOrder = 12 // 투명 목록에서 벽(10) 뒤에 그려져 벽에 안 덮인다
    const c = new THREE.Color()
    for (const r of this.ramps) for (let k = 0; k < r.slots; k++) chev.setColorAt(r.first + k, c.set(r.heat ? muted : color))
    if (chev.instanceColor) chev.instanceColor.needsUpdate = true
    this.scene.add(chev)
    this.chev = chev
    this.lastZoom = -1
    map.triggerRepaint()
  }
  // 화살은 벽 윗선(고도 단면) 위를 오르막으로 흐른다. 조망에서는 화살을 키우고 간격도 같이 늘려 겹치지 않게, 경사면은 최소 화면 높이까지 과장한다
  private updateRamps(now: number, mpp: number) {
    const chev = this.chev
    if (!chev || !this.ramps.length) return
    const k = Math.min(CHEV_MAX_SCALE, Math.max(1, (CHEV_PX * mpp) / CHEV_M))
    const gap = CHEV_GAP_M * k
    const phase = ((now / 1000) * CHEV_SPEED * Math.sqrt(k)) % gap
    const tmp = new THREE.Matrix4()
    const rot = new THREE.Matrix4()
    const sc = new THREE.Matrix4().makeScale(k, k, k)
    const zero = new THREE.Matrix4().makeScale(0, 0, 0)
    const zoom = this.map?.getZoom() ?? 0
    for (const r of this.ramps) {
      const ex = Math.min(RAMP_MAX_EXAGGERATION, Math.max(1, (RAMP_MIN_PX * mpp) / r.rise))
      r.wall.scale.y = ex
      r.wall.visible = zoom >= RAMP_WALL_FROM_ZOOM
      let j = 1
      for (let q = 0; q < r.slots; q++) {
        const s = q * gap + phase
        if (s > r.len || zoom < RAMP_CHEV_FROM_ZOOM) {
          chev.setMatrixAt(r.first + q, zero)
          continue
        }
        while (j < r.pts.length - 1 && r.pts[j].s < s) j++
        const A = r.pts[j - 1]
        const B = r.pts[j]
        const f = (s - A.s) / Math.max(1e-6, B.s - A.s)
        const x = A.x + (B.x - A.x) * f
        const z = A.z + (B.z - A.z) * f
        const h = (A.h + (B.h - A.h) * f) * ex + 0.4
        rot.makeRotationY(-Math.atan2(B.z - A.z, B.x - A.x))
        tmp.makeTranslation(x, h, z).multiply(rot).multiply(sc)
        chev.setMatrixAt(r.first + q, tmp)
      }
    }
    chev.instanceMatrix.needsUpdate = true
  }

  /** 눈 강도 0~1(시나리오 적설 cm ÷ 10). 0이면 치운다 */
  setSnow(level: number) {
    const v = Math.max(0, Math.min(1, level))
    if (v === this.snowLevel && (v === 0) === !this.snow) return
    this.snowLevel = v
    if (v === 0) {
      if (this.snow) {
        this.scene.remove(this.snow)
        this.snow.geometry.dispose()
        ;(this.snow.material as THREE.Material).dispose()
        this.snow = null
        this.snowPos = null
      }
      this.map?.triggerRepaint()
      return
    }
    if (!this.snow) {
      const N = SNOW_MAX
      this.snowPos = new Float32Array(N * 3)
      const geom = new THREE.BufferGeometry()
      geom.setAttribute("position", new THREE.BufferAttribute(this.snowPos, 3))
      geom.setDrawRange(0, 0)
      const mat = new THREE.PointsMaterial({ color: "#ffffff", size: 2.6, sizeAttenuation: false, transparent: true, opacity: 0.85, depthTest: false })
      this.snow = new THREE.Points(geom, mat)
      this.snow.frustumCulled = false
      this.snow.renderOrder = 30
      this.scene.add(this.snow)
      this.snowCenter = { x: NaN, z: NaN }
    }
    this.map?.triggerRepaint()
  }
  /** 비 강도 0~1. 0이면 치운다 */
  setRain(level: number) {
    const v = Math.max(0, Math.min(1, level))
    if (v === this.rainLevel && (v === 0) === !this.rain) return
    this.rainLevel = v
    if (v === 0) {
      if (this.rain) {
        this.scene.remove(this.rain)
        this.rain.geometry.dispose()
        ;(this.rain.material as THREE.Material).dispose()
        this.rain = null
        this.rainPos = null
      }
      this.map?.triggerRepaint()
      return
    }
    if (!this.rain) {
      this.rainPos = new Float32Array(RAIN_MAX * 6)
      const geom = new THREE.BufferGeometry()
      geom.setAttribute("position", new THREE.BufferAttribute(this.rainPos, 3))
      geom.setDrawRange(0, 0)
      this.rain = new THREE.LineSegments(geom, new THREE.LineBasicMaterial({ color: "#b9cbe0", transparent: true, opacity: 0.55, depthTest: false }))
      this.rain.frustumCulled = false
      this.rain.renderOrder = 30
      this.scene.add(this.rain)
      this.rainCenter = { x: NaN, z: NaN }
    }
    this.map?.triggerRepaint()
  }
  private updateRain(now: number, mpp: number) {
    const map = this.map
    const rain = this.rain
    const pos = this.rainPos
    if (!map || !rain || !pos) return
    const dt = this.lastTick ? Math.min(0.1, (now - this.lastTick) / 1000) : 0.016
    const c = maplibregl.MercatorCoordinate.fromLngLat(map.getCenter(), 0)
    const cx = (c.x - this.anchor.x) / this.scale
    const cz = (c.y - this.anchor.y) / this.scale
    const R = SNOW_RADIUS_PX * mpp
    const H = SNOW_HEIGHT_PX * mpp
    const len = RAIN_LEN_PX * mpp
    const n = Math.round(RAIN_MAX * this.rainLevel)
    if (!Number.isFinite(this.rainCenter.x) || Math.hypot(cx - this.rainCenter.x, cz - this.rainCenter.z) > R * 0.5) {
      for (let i = 0; i < RAIN_MAX; i++) {
        const x = cx + (Math.random() * 2 - 1) * R
        const y = Math.random() * H
        const z = cz + (Math.random() * 2 - 1) * R
        pos.set([x, y, z, x, y + len, z], i * 6)
      }
      this.rainCenter = { x: cx, z: cz }
    }
    const fall = SNOW_FALL_PX * 3.2 * mpp * dt
    for (let i = 0; i < n; i++) {
      pos[i * 6 + 1] -= fall
      pos[i * 6 + 4] -= fall
      if (pos[i * 6 + 1] < 0) {
        const x = cx + (Math.random() * 2 - 1) * R
        const z = cz + (Math.random() * 2 - 1) * R
        pos.set([x, H, z, x, H + len, z], i * 6)
      }
    }
    rain.geometry.setDrawRange(0, n * 2)
    ;(rain.geometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true
  }
  private updateSnow(now: number, mpp: number) {
    const map = this.map
    const snow = this.snow
    const pos = this.snowPos
    if (!map || !snow || !pos) return
    const dt = this.lastTick ? Math.min(0.1, (now - this.lastTick) / 1000) : 0.016
    const c = maplibregl.MercatorCoordinate.fromLngLat(map.getCenter(), 0)
    const cx = (c.x - this.anchor.x) / this.scale
    const cz = (c.y - this.anchor.y) / this.scale
    const R = SNOW_RADIUS_PX * mpp
    const H = SNOW_HEIGHT_PX * mpp
    const n = Math.round(SNOW_MAX * this.snowLevel)
    const reseed = !Number.isFinite(this.snowCenter.x) || Math.hypot(cx - this.snowCenter.x, cz - this.snowCenter.z) > R * 0.5
    if (reseed) {
      for (let i = 0; i < SNOW_MAX; i++) {
        pos[i * 3] = cx + (Math.random() * 2 - 1) * R
        pos[i * 3 + 1] = Math.random() * H
        pos[i * 3 + 2] = cz + (Math.random() * 2 - 1) * R
      }
      this.snowCenter = { x: cx, z: cz }
    }
    const fall = SNOW_FALL_PX * mpp * dt
    const drift = SNOW_DRIFT_PX * mpp * dt
    for (let i = 0; i < n; i++) {
      pos[i * 3 + 1] -= fall * (0.7 + ((i * 7919) % 100) / 200)
      pos[i * 3] += drift * Math.sin(now / 1400 + i)
      if (pos[i * 3 + 1] < 0) {
        pos[i * 3] = cx + (Math.random() * 2 - 1) * R
        pos[i * 3 + 1] = H
        pos[i * 3 + 2] = cz + (Math.random() * 2 - 1) * R
      }
    }
    snow.geometry.setDrawRange(0, n)
    ;(snow.geometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true
  }

  /** 제설 장비 노선(상습결빙구간 선형). 노선마다 1대(2.5km 넘으면 2대)가 왕복한다. 빈 배열이면 치운다 */
  setTrucks(routes: TruckRoute[]) {
    this.truckRoutes = routes
    if (this.map) this.buildTrucks()
  }
  private buildTrucks() {
    const map = this.map
    for (const m of this.truckMeshes) this.scene.remove(m)
    this.truckMeshes = []
    this.trucks = []
    if (!map || !this.truckRoutes.length) {
      map?.triggerRepaint()
      return
    }
    for (const route of this.truckRoutes) {
      const pts = route.coords.map(([lng, lat]) => this.toModel(lng, lat))
      const cum = [0]
      for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z))
      const n = route.meters > 2500 ? 2 : 1
      for (let t = 0; t < n; t++) this.trucks.push({ cum, pts, dist: (cum[cum.length - 1] * (t + 0.35)) / n, dir: t % 2 ? -1 : 1 })
    }
    if (!this.truckDefs) this.truckDefs = truckParts(this.dark)
    this.truckMeshes = this.truckDefs.map((part) => {
      const mesh = new THREE.InstancedMesh(part.geom, part.mat, this.trucks.length)
      mesh.frustumCulled = false
      this.scene.add(mesh)
      return mesh
    })
    this.lastTick = 0
    map.triggerRepaint()
  }
  // 제설차: 노선 위를 등속 왕복. 방향은 진행 방향
  private updateTrucks(now: number, mpp: number) {
    if (!this.trucks.length || !this.truckMeshes.length || !this.truckDefs) return
    const dt = this.lastTick ? Math.min(0.1, (now - this.lastTick) / 1000) : 0
    const kt = Math.min(TRUCK_MAX_SCALE, Math.max(1, (TRUCK_PX * mpp) / TRUCK_LEN))
    const tmp = new THREE.Matrix4()
    const rot = new THREE.Matrix4()
    const sc = new THREE.Matrix4().makeScale(kt, kt, kt)
    this.trucks.forEach((t, i) => {
      const total = t.cum[t.cum.length - 1]
      t.dist += t.dir * TRUCK_SPEED * dt
      if (t.dist >= total) {
        t.dist = total
        t.dir = -1
      } else if (t.dist <= 0) {
        t.dist = 0
        t.dir = 1
      }
      let j = 1
      while (j < t.cum.length - 1 && t.cum[j] < t.dist) j++
      const f = (t.dist - t.cum[j - 1]) / Math.max(1e-6, t.cum[j] - t.cum[j - 1])
      const A = t.pts[j - 1]
      const B = t.pts[j]
      const x = A.x + (B.x - A.x) * f
      const z = A.z + (B.z - A.z) * f
      rot.makeRotationY(-Math.atan2((B.z - A.z) * t.dir, (B.x - A.x) * t.dir))
      this.truckMeshes.forEach((mesh, m) => {
        tmp.makeTranslation(x, 0, z).multiply(rot).multiply(sc).multiply(this.truckDefs![m].local)
        mesh.setMatrixAt(i, tmp)
      })
    })
    for (const mesh of this.truckMeshes) mesh.instanceMatrix.needsUpdate = true
  }

  setVisible(v: boolean) {
    this.visible = v
    this.map?.triggerRepaint()
  }

  /** 단계 문법: 자재 흐림(1=점등). 5라운드: 투명도 대신 바탕색(종이·밤) 쪽으로 섞는다(반투명 겹침이 탁했다). 그림자·표지판만 투명도. 표지판은 따로 받는다(공백 탭은 물건만 흐리고 표지판은 그대로: 흐린 표지판은 종류를 못 읽는다) */
  setDim(kinds: IconKind[], opacity: number, badgeOpacity = opacity) {
    for (const k of kinds) this.dims.set(k, opacity)
    for (const k of kinds) this.badgeDims.set(k, badgeOpacity)
    this.applyDims()
    this.map?.triggerRepaint()
  }
  private applyDims() {
    const defs = this.defs
    if (!defs) return
    const ground = new THREE.Color(this.dark ? GROUND.dark : GROUND.light)
    for (const [k, o] of this.dims)
      for (const part of defs[k].parts) {
        if (part.shadowOpacity != null) {
          ;(part.mat as THREE.MeshBasicMaterial).opacity = part.shadowOpacity * (0.5 + 0.5 * o)
          continue
        }
        if (part.billboard) {
          ;(part.mat as THREE.MeshBasicMaterial).opacity = this.badgeDims.get(k) ?? o
          continue
        }
        if (!part.base) continue
        const m = part.mat as THREE.MeshLambertMaterial
        m.color.copy(part.base).lerp(ground, (1 - o) * 0.7) // 0.4(공백 탭) → 바탕 쪽 42%: 옅어지되 종류색은 남는다
        m.needsUpdate = true
      }
  }
  /** 단계 문법: 종류 확대 배율(2단계 제설함 1.6배) */
  setBoost(kind: IconKind, f: number) {
    if ((this.boost.get(kind) ?? 1) === f) return
    this.boost.set(kind, f)
    this.lastZoom = -1
    this.map?.triggerRepaint()
  }

  /** 종류의 점 전체를 바꾼다. 빈 배열이면 치운다. 새로 놓인 아이콘은 솟아오르며 나타난다 */
  setPoints(kind: IconKind, points: IconPoint[]) {
    this.rebuild(kind, points, true)
  }

  private rebuild(kind: IconKind, points: IconPoint[], animate: boolean) {
    const defs = this.defs
    const map = this.map
    const prev = this.kinds.get(kind)
    if (prev) {
      for (const m of prev.meshes) this.scene.remove(m)
      for (const c of prev.digits) {
        this.scene.remove(c)
        for (const ch of c.children) ((ch as THREE.Mesh).material as THREE.Material).dispose()
      }
    }
    if (!defs || !map) {
      // 아직 지도에 안 붙었으면 점만 기억해 둔다
      this.kinds.set(kind, { points, pos: [], meshes: [], digits: [], appearAt: 0 })
      return
    }
    if (!points.length) {
      this.kinds.set(kind, { points: [], pos: [], meshes: [], digits: [], appearAt: 0 })
      map.triggerRepaint()
      return
    }
    const pos = points.map((p) => {
      const mc = maplibregl.MercatorCoordinate.fromLngLat([p.lng, p.lat], 0)
      return { x: (mc.x - this.anchor.x) / this.scale, z: (mc.y - this.anchor.y) / this.scale }
    })
    const def = defs[kind]
    const meshes = def.parts.map((part) => {
      const mesh = new THREE.InstancedMesh(part.geom, part.mat, points.length)
      mesh.frustumCulled = false
      this.scene.add(mesh)
      return mesh
    })
    const digits: THREE.Group[] = []
    if (kind === "dongRank") {
      const risk = this.dark ? "#ff8a8e" : RISK_STYLE.badge.light
      points.forEach((p, i) => {
        const d = makeDigit(String(p.rank ?? i + 1), p.color ?? risk, this.dark)
        digits.push(d)
        this.scene.add(d)
      })
    }
    this.kinds.set(kind, { points, pos, meshes, digits, appearAt: animate ? performance.now() : 0 })
    this.lastZoom = -1
    map.triggerRepaint()
  }

  // 줌(화면 크기)·등장 진행·방위에 맞춰 행렬을 다시 쓴다. 숫자가 있으면 매 프레임
  private updateMatrices(now: number): boolean {
    const map = this.map
    const defs = this.defs
    if (!map || !defs) return false
    const zoom = map.getZoom()
    const mpp = metersPerPixel(zoom)
    // 숫자·표지판은 카메라 방위를 따라 선다. 모델 행렬이 x를 뒤집어(getMatrixForModel scale -x) 부호가 반대: rotation.y = -bearing(dumping 실측)
    const bearing = map.getBearing()
    const pitch = map.getPitch()
    const face = (-bearing * Math.PI) / 180
    const zoomChanged0 = Math.abs(zoom - this.lastZoom) >= 0.01
    const cameraTurned = Math.abs(bearing - this.lastBearing) >= 0.05 || Math.abs(pitch - this.lastPitch) >= 0.05
    // 표지판은 방위로 돌고(Ry) 카메라 높이만큼 눕는다(Rx: 위에서 보면 눕고 옆에서 보면 선다). 조망(BADGE_FROM_ZOOM 아래)에서는 0으로 접힌다
    const billboard = new THREE.Matrix4().makeRotationY(face).multiply(new THREE.Matrix4().makeRotationX(((pitch - 90) * Math.PI) / 180))
    const badgeK = Math.min(1, Math.max(0, (zoom - BADGE_FROM_ZOOM) / 0.5))
    const badgeScale = new THREE.Matrix4().makeScale(badgeK, badgeK, badgeK)
    let animating = false
    const tmp = new THREE.Matrix4()
    const sc = new THREE.Matrix4()
    for (const [kind, st] of this.kinds) {
      if (!st.meshes.length && !st.digits.length) continue
      const def = defs[kind]
      const appearing = st.appearAt > 0 && now - st.appearAt < APPEAR_MS
      const zoomChanged = Math.abs(zoom - this.lastZoom) >= 0.01
      animating ||= appearing
      const hidden = def.hideAboveZoom != null && zoom > def.hideAboveZoom
      const k = hidden ? 0 : Math.min(def.maxScale, Math.max(1, ((def.targetPx ?? TARGET_PX) * mpp) / def.height)) * (this.boost.get(kind) ?? 1)
      const a = appearing ? easeOutBack(Math.min(1, (now - st.appearAt) / APPEAR_MS)) : 1
      const hasBillboard = def.parts.some((p) => p.billboard)
      if (st.meshes.length && (appearing || zoomChanged || (cameraTurned && hasBillboard))) {
        st.pos.forEach((p, i) => {
          sc.makeScale(k * a, k * a, k * a)
          st.meshes.forEach((mesh, j) => {
            const part = def.parts[j]
            tmp.makeTranslation(p.x, 0, p.z).multiply(sc).multiply(part.local)
            if (part.billboard) tmp.multiply(billboard).multiply(badgeScale)
            mesh.setMatrixAt(i, tmp)
          })
        })
        for (const mesh of st.meshes) mesh.instanceMatrix.needsUpdate = true
      }
      st.pos.forEach((p, i) => {
        const digit = st.digits[i]
        if (!digit) return
        const pt = st.points[i]
        // 높이: 기둥 폭 기준(78m). 조망에서 최소 px 아래로는 안 내려간다. 줌 범위 밖이면 0
        const hgt = hidden ? 0 : Math.max(DONG_DIGIT_MIN_PX * mpp, DONG_DIGIT_M) * a
        digit.position.set(p.x, pt.h ?? 4, p.z)
        digit.scale.set(hgt, hgt, hgt)
        digit.rotation.y = face
      })
      if (!appearing) st.appearAt = 0
    }
    // 구간 벽은 화면 기준 높이(줌이 바뀔 때만)
    if (this.segWalls.length && (zoomChanged0 || this.lastZoom < 0)) for (const w of this.segWalls) w.scale.y = SEG_WALL_PX * mpp
    // 경사 화살·제설차는 매 프레임 움직인다(있을 때만 다시 그린다)
    if (this.ramps.length) {
      this.updateRamps(now, mpp)
      animating = true
    }
    if (this.trucks.length) {
      this.updateTrucks(now, mpp)
      animating = true
    }
    if (this.snow) {
      this.updateSnow(now, mpp)
      animating = true
    }
    if (this.rain) {
      this.updateRain(now, mpp)
      animating = true
    }
    this.lastTick = now
    this.lastZoom = zoom
    this.lastBearing = bearing
    this.lastPitch = pitch
    return animating
  }

  render(_gl: WebGLRenderingContext | WebGL2RenderingContext, args: CustomRenderMethodInput) {
    const map = this.map
    if (!map || !this.renderer || !this.visible) return
    const animating = this.updateMatrices(performance.now())
    const model = (map as unknown as { transform: { getMatrixForModel: (l: [number, number], alt?: number) => Float64Array | number[] } }).transform.getMatrixForModel(ANCHOR, 0)
    const proj = new THREE.Matrix4().fromArray(Array.from(args.defaultProjectionData.mainMatrix as unknown as ArrayLike<number>))
    this.camera.projectionMatrix = proj.multiply(new THREE.Matrix4().fromArray(Array.from(model)))
    // 건물·기둥 깊이를 지우고 그린다(핀이 건물 뒤로 들락거리며 깜박이던 것). 이 층 뒤는 라벨(깊이 없음)뿐
    _gl.depthMask(true)
    _gl.clear(_gl.DEPTH_BUFFER_BIT)
    this.renderer.resetState()
    this.renderer.render(this.scene, this.camera)
    if (animating) map.triggerRepaint()
  }
}
