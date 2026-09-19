// /dumping UI 아이콘 한 벌(18라운드 후속, 2026-09-20). 흩어져 있던 인라인 SVG(크기·굵기·모서리가 제각각)를 한 곳으로.
// 규칙: 20 격자, 선 1.7, 둥근 끝·모서리, currentColor. 채움이 필요한 것(달)만 fill. 브라우저 탭 아이콘은 app/dumping/icon.svg(dump-mark와 같은 도형)
import type { SVGProps } from "react"

export type IconName =
  | "tilt" // 입체 보기(정육면체)
  | "orbit" // 자동 회전
  | "drone" // 드론 비행
  | "bars" // 동별 막대
  | "columns" // 격자 기둥
  | "truck" // 청소차 노선
  | "pin" // 재배치 후보
  | "ring" // 배치추천(빈 고리)
  | "monitor" // 시연
  | "mic"
  | "ear"
  | "speaker"
  | "speakerOff"
  | "search"
  | "sun"
  | "moon"
  | "drop" // 유리 강도
  | "arrow" // →
  | "close"
  | "layers"

const PATHS: Record<IconName, React.ReactNode> = {
  tilt: (
    <>
      <path d="M10 2.5 17 6.5v7l-7 4-7-4v-7z" />
      <path d="M10 10.5 17 6.5M10 10.5 3 6.5M10 10.5v7" />
    </>
  ),
  orbit: (
    <>
      <path d="M16.5 10A6.5 6.5 0 1 1 14 4.8" />
      <path d="M16.8 2.6v3.6h-3.6" />
    </>
  ),
  drone: (
    <>
      <circle cx="4.5" cy="4.5" r="2.2" />
      <circle cx="15.5" cy="4.5" r="2.2" />
      <circle cx="4.5" cy="15.5" r="2.2" />
      <circle cx="15.5" cy="15.5" r="2.2" />
      <path d="M6.2 6.2 10 10l3.8-3.8M6.2 13.8 10 10l3.8 3.8" />
    </>
  ),
  bars: <path d="M3.5 17V9.5M8 17V4M12.5 17v-6M17 17V7" />,
  columns: (
    <>
      <path d="M3 17V11h3v6M8.5 17V5h3v12M14 17V8.5h3V17" />
      <path d="M2 17h16" />
    </>
  ),
  truck: (
    <>
      <path d="M2.5 5.5h9v8h-9zM11.5 8.5h3.2l2.8 3v2h-6z" />
      <circle cx="6" cy="15" r="1.6" />
      <circle cx="14.5" cy="15" r="1.6" />
    </>
  ),
  pin: (
    <>
      <path d="M10 17.5s-5.5-5.2-5.5-9a5.5 5.5 0 0 1 11 0c0 3.8-5.5 9-5.5 9z" />
      <circle cx="10" cy="8.5" r="2" />
    </>
  ),
  ring: (
    <>
      <circle cx="10" cy="10" r="6.5" strokeDasharray="2.6 2.6" />
      <circle cx="10" cy="10" r="2.5" />
    </>
  ),
  monitor: (
    <>
      <rect x="2.5" y="3.5" width="15" height="10" rx="1.5" />
      <path d="M10 13.5v3M7 16.5h6" />
    </>
  ),
  mic: (
    <>
      <rect x="7" y="2.5" width="6" height="9" rx="3" />
      <path d="M4.5 9.5a5.5 5.5 0 0 0 11 0M10 15v2.5M7.5 17.5h5" />
    </>
  ),
  ear: (
    <>
      <path d="M5.5 8a4.5 4.5 0 0 1 9 0c0 2.2-1.6 3-2.3 4.2-.6 1-.5 2.8-2.4 3.3-1.6.4-2.6-.7-2.8-1.7" />
      <path d="M8.5 8a1.5 1.5 0 0 1 3 0c0 1-1 1.2-1 2.2" />
    </>
  ),
  speaker: (
    <>
      <path d="M3.5 7.5h3l4-3.5v12l-4-3.5h-3z" />
      <path d="M13 7a4 4 0 0 1 0 6M15.5 4.5a7.5 7.5 0 0 1 0 11" />
    </>
  ),
  speakerOff: (
    <>
      <path d="M3.5 7.5h3l4-3.5v12l-4-3.5h-3z" />
      <path d="m13.5 7.5 4 5m0-5-4 5" />
    </>
  ),
  search: (
    <>
      <circle cx="8.5" cy="8.5" r="5.5" />
      <path d="m13 13 4 4" />
    </>
  ),
  sun: (
    <>
      <circle cx="10" cy="10" r="3.4" />
      <path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.3 4.3l1.5 1.5M14.2 14.2l1.5 1.5M4.3 15.7l1.5-1.5M14.2 5.8l1.5-1.5" />
    </>
  ),
  moon: <path d="M12.8 2.5a7.7 7.7 0 1 0 4.7 13.6A6.6 6.6 0 0 1 12.8 2.5Z" fill="currentColor" stroke="none" />,
  drop: (
    <>
      <path d="M10 2.5s5 5.4 5 9.2a5 5 0 0 1-10 0c0-3.8 5-9.2 5-9.2Z" />
      <path d="M7.8 12.8a2.2 2.2 0 0 0 1.8 1.8" />
    </>
  ),
  arrow: <path d="M3.5 10h13M11 4.5 16.5 10 11 15.5" />,
  close: <path d="m5 5 10 10M15 5 5 15" />,
  layers: (
    <>
      <path d="m10 3 7.5 4L10 11 2.5 7z" />
      <path d="m2.5 11 7.5 4 7.5-4M2.5 14.5 10 18.5l7.5-4" />
    </>
  ),
}

export function Ico({ name, size = 16, className = "", ...rest }: { name: IconName; size?: number; className?: string } & Omit<SVGProps<SVGSVGElement>, "name">) {
  return (
    <svg
      viewBox="0 0 20 20"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
      aria-hidden
      {...rest}
    >
      {PATHS[name]}
    </svg>
  )
}
