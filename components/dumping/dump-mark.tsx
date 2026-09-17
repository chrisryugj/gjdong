// 클린광진 상황실 마크. 액센트 사각(구 전체) 안에 종이색 칸 하나(적발 기록이 몰린 100m 칸)와 원 하나(과태료 원 오버레이).
// 선·격자 없이 두 도형만. 20px에서도 읽힌다. 광진구 공식 표장은 쓰지 않는다.
export default function DumpMark({ size = 36, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" className={className} aria-hidden="true">
      <rect width="36" height="36" rx="9" fill="#0c6155" />
      <rect x="8" y="8" width="10" height="10" rx="1.5" fill="var(--dump-paper-white, #fffdf9)" />
      <circle cx="23.5" cy="23.5" r="6" fill="none" stroke="var(--dump-paper-white, #fffdf9)" strokeWidth="2.4" />
    </svg>
  )
}
