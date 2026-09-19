// 클린광진 상황실 마크. 잉크 원(구 전체) 안에 액센트 칸 하나(적발 기록이 몰린 100m 칸)와 흰 원 하나(과태료 원 오버레이).
// 선·격자 없이 두 도형만. 20px에서도 읽힌다. 광진구 공식 표장은 쓰지 않는다.
export default function DumpMark({ size = 36, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" className={className} aria-hidden="true">
      <circle cx="18" cy="18" r="18" fill="var(--dump-ink, #14201c)" />
      <rect x="9" y="9" width="9" height="9" rx="1.5" fill="var(--dump-accent, #c0741a)" />
      <circle cx="23" cy="23" r="5.5" fill="none" stroke="#fff" strokeWidth="2.4" />
    </svg>
  )
}
